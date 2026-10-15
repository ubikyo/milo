// What goes out when a followed item changes — or an item one is an actor
// of: an on-screen notification, and an e-mail.
//
// Two principles hold the file together.
//
//   1. One is not notified of one's own actions — unless one asked to be
//      (Préférences › Notifications), on screen, by e-mail or both: then of
//      all of them, whether or not one follows what they touch. Otherwise it
//      is the repository that excludes the author (repositories/follows.ts),
//      not the display: nothing goes out, so there is nothing to filter.
//
//   2. The on-screen notification is immediate, the e-mail is not. Ten edits
//      to a title in two minutes make ten notifications — they pile up and
//      disappear — but a single e-mail, which sums them up. Without this
//      grouping, following an active project would amount to signing up for
//      a burst.

import crypto from "node:crypto";
import type {
  FollowKind,
  Id,
  Notification,
  NotificationKind,
  NotificationScope,
} from "@milo/shared";
import { accessIncludes, can, itemLink, supportStatusLabel, supportTicketRef } from "@milo/shared";
import type { Area } from "@milo/shared";
import type { SupportRequestRow, UserRow } from "../db/rows.js";
import { selection } from "../db/query.js";
import { follows } from "../repositories/follows.js";
import { taskCards } from "../repositories/tasks.js";
import { sendingAddress } from "./entra.js";
import { miloUrl } from "./milo-url.js";
import { sendMail, mailboxConfigured } from "./mail.js";
import { notificationSettings } from "./notification-settings.js";
import { assignedView, placesView, template, updatesView } from "./mail-template.js";
import type { ElementView, PlacedElement, Row, RequesterView, TicketView } from "./mail-template.js";
import { accountPerson, senderPerson } from "./support-variables.js";
import { notifications } from "../repositories/notifications.js";
import { companyRights, notificationRights, users, widgetRights } from "../repositories/users.js";
import { now } from "./time.js";

// --- Settings (each person's preferences › Notifications) -----------------

/**
 * How long occurrences accumulate before going out as a single e-mail to
 * this person. Zero when they want e-mails on every event: the timer fires
 * on the next tick, and only the occurrences of a single action end up
 * together.
 */
const window = (person: UserRow): number => {
  const r = notificationSettings(person);
  return r.emailMode === "immediate" ? 0 : r.emailDelayMinutes * 60 * 1000;
};

/**
 * The mailbox that notification e-mails go out from, or nothing: the mailer
 * is not configured.
 */
const sendingMailbox = (): string => (mailboxConfigured() ? sendingAddress() : "");

/**
 * Whether this person receives notification e-mails: they have the right to
 * them in their workspace (Accès), an address, and have not turned them off.
 */
const wantsEmail = (person: UserRow): boolean =>
  Boolean(person.email) && notificationRights(person).email && notificationSettings(person).email;

/** The channels a notification goes out on to one person. */
interface Channels {
  screen: boolean;
  email: boolean;
}

const EVERY_CHANNEL: Channels = { screen: true, email: true };

const NO_CHANNEL: Channels = { screen: false, email: false };

/**
 * The channels open to this person for an action of `authorId`: none for a
 * kind of notification they did not tick (Préférences › Notifications); all
 * of them for someone else's action; for their own, those they chose — none
 * unless they asked to be notified of their own actions. The screen only with
 * the right to it in their workspace (Accès); the e-mail's right is checked
 * when it is sent (wantsEmail).
 */
const channels = (person: UserRow, authorId: Id, scope: NotificationScope = "production"): Channels => {
  const open = chosenChannels(person, authorId, scope);
  return { ...open, screen: open.screen && notificationRights(person).screen };
};

const chosenChannels = (person: UserRow, authorId: Id, scope: NotificationScope): Channels => {
  const r = notificationSettings(person);
  if (!r.scopes.includes(scope)) return NO_CHANNEL;
  if (person.id !== authorId) return EVERY_CHANNEL;
  if (!r.ownActions) return NO_CHANNEL;
  return { screen: r.ownActionsChannel !== "email", email: r.ownActionsChannel !== "screen" };
};

/**
 * The account the recipient queries leave out: the author, unless they want
 * to be notified of their own actions — 0 then leaves out nobody.
 */
const leftOut = (author: Author): Id => {
  const person = author.id ? users.byId.get(author.id) : undefined;
  return person && notificationSettings(person).ownActions ? 0 : author.id;
};

/**
 * Who acted. An account most often; the sender of an e-mail received on a
 * ticket does not always have one — their id is then 0, which excludes
 * nobody.
 */
export type Author = Pick<UserRow, "id" | "name" | "email">;

export interface Occurrence {
  /**
   * The followed item: a project, a card, a ticket. An Access-mode item is
   * not followed.
   */
  kind: Exclude<NotificationKind, "access" | "board" | "settings">;
  targetId: Id;
  /** The item's name, as displayed. */
  title: string;
  /** What changed, in the third person: "a modifié la fiche". */
  message: string;
  /**
   * Who acted. This is also the person who is not notified — unless they
   * asked to be notified of their own actions.
   */
  author: Author;
  /**
   * The list the card comes from, when it changes lists. Those who followed
   * that list are notified too: a card leaving is a modification of what it
   * contains, just like a card arriving.
   */
  sourceList?: Id;
  /**
   * Accounts not to notify this time: those that another notification has
   * just notified of the same action — the actors just assigned to a request
   * already have theirs.
   */
  except?: Id[];
  /**
   * The root of the app, as we were reached: "https://milo.exemple.fr".
   * Empty when unknown — a mailbox poll has no request: the notification
   * then stays on screen, with no e-mail carrying a broken link.
   */
  base: string;
}

// --- Pending e-mails -------------------------------------------------------

/**
 * What one line of an e-mail is about: a change of an item, its deletion, or
 * a change of a board's structure ("board").
 */
interface Entry {
  kind: Exclude<NotificationKind, "access">;
  /** Which of the kinds the person ticks it belongs to; "production" by default. */
  scope?: NotificationScope;
  targetId: Id;
  title: string;
  message: string;
  author: Author;
}

/**
 * A queued occurrence is one line of the template: the text, and the number
 * of times it repeated in a row. Correcting a title three times in a row
 * gives the same sentence three times, and the e-mail says "(3 fois)" rather
 * than copying it out.
 */
type QueuedOccurrence = Row;

/** An element in a pending e-mail, and what happened to it. */
interface PendingElement {
  kind: Entry["kind"];
  targetId: Id;
  title: string;
  link: string;
  /** The accumulated occurrences, in the order they arrived. */
  occurrences: QueuedOccurrence[];
}

interface Pending {
  /** The support mailbox of the item's company. */
  sender: string;
  recipient: string;
  /** The elements, in the order of their first modification. */
  elements: Map<string, PendingElement>;
  timeout: NodeJS.Timeout;
}

/**
 * The pending sends. In memory, like the version counters: a restart loses
 * what has not gone out yet. What is lost then is a summary of a few
 * minutes, and the on-screen notification has already happened.
 *
 * Immediate, one per (person, element) pair: an e-mail per element changed.
 * Grouped, one per person: everything changed in the application during the
 * delay — whatever its workspace, view, board or widget — in a single e-mail.
 */
const pending = new Map<string, Pending>();

const elementKey = (kind: NotificationKind, targetId: Id): string => `${kind}:${targetId}`;

const sendKeyOf = (person: UserRow, kind: NotificationKind, targetId: Id): string =>
  window(person) > 0 ? `${person.id}` : `${person.id}:${elementKey(kind, targetId)}`;

const count = (n: number, one: string, many: string): string => (n === 1 ? one : `${n} ${many}`);

/** One modification per line listed: a repeat is "(2 fois)" on its line. */
const totalOf = (occurrences: QueuedOccurrence[]): number => occurrences.length;

/**
 * What the e-mail says of all it carries: "3 modifications" for a single
 * element, "5 modifications sur 2 éléments" for several.
 */
const summaryOf = (elements: PendingElement[]): string => {
  const total = elements.reduce((sum, e) => sum + totalOf(e.occurrences), 0);
  const modifications = count(total, "Une modification", "modifications");
  return elements.length === 1 ? modifications : `${modifications} sur ${elements.length} éléments`;
};

const FOOTER = "Vous recevez ce message parce que vous suivez ces éléments dans Milo, ou que vous en êtes acteur.";

/**
 * The text version: each element, its modifications and its link — the
 * template, which lays out the HTML, does not write it.
 */
const textOf = (summary: string, elements: PendingElement[]): string =>
  [
    `${summary}.`,
    "",
    ...elements.flatMap((e) => [
      e.title,
      ...e.occurrences.map((o) => `  — ${o.repetitions > 1 ? `${o.text} (${o.repetitions} fois)` : o.text}`),
      `  Ouvrir dans Milo : ${e.link}`,
      "",
    ]),
    FOOTER,
    "",
  ].join("\n");

const body = (sending: Pending) => {
  const elements = [...sending.elements.values()];
  const summary = summaryOf(elements);
  // Each element with its modifications: the template repeats them
  // ({{#elements.items}}), and inside, {{element.…}} and {{updates.…}} are
  // that element's.
  const placed = elements.map((e): PlacedElement => {
    const { names, keys } = locate(e.kind, e.targetId);
    const total = totalOf(e.occurrences);
    return {
      item: {
        element: { name: e.title, updates: { count: total }, url: e.link, ...names },
        updates: updatesView(e.occurrences),
      },
      total,
      keys,
    };
  });
  const items = placed.map((e) => e.item);
  return template(
    "changes",
    { title: summary, intro: summary, footer: FOOTER, text: textOf(summary, elements) },
    {
      // The same, level by level: {{#workspaces.items}} down to
      // {{#widgets.items}}, whose {{#elements.items}} are theirs.
      ...placesView(placed),
      elements: { activity: summary, items },
      // A single element is also there by itself: a template written
      // without the list still reads it.
      ...(items.length === 1 && items[0]),
    },
  );
};

const dispatch = (sendKey: string): void => {
  const sending = pending.get(sendKey);
  if (!sending) return;
  pending.delete(sendKey);
  const elements = [...sending.elements.values()];

  body(sending)
    .then((content) =>
      sendMail({
        from: sending.sender,
        to: sending.recipient,
        // The element's name when there is one; otherwise what they sum up to.
        subject: `Milo — ${elements.length === 1 ? elements[0]!.title : summaryOf(elements)}`,
        ...content,
      }),
    )
    .catch((error: unknown) => {
    // Nobody is waiting for this answer: the write that triggered it left
    // long ago. We log it, and that is all — a lost notification must not
    // make a successful modification fail.
    console.error("E-mail notification not delivered:", error);
  });
};

/**
 * Adds an occurrence to the send in progress for this person — and this
 * element, when they want an e-mail per element.
 */
const enqueue = (recipient: UserRow, occurrence: Entry, link: string, sender: string): void => {
  if (!recipient.email) return;

  const sendKey = sendKeyOf(recipient, occurrence.kind, occurrence.targetId);
  const row = `${occurrence.author.name || occurrence.author.email} ${occurrence.message}`;
  let sending = pending.get(sendKey);
  if (!sending) {
    sending = {
      sender,
      recipient: recipient.email,
      elements: new Map(),
      // `unref` lets the process terminate without waiting for the window.
      timeout: setTimeout(() => dispatch(sendKey), window(recipient)).unref(),
    };
    pending.set(sendKey, sending);
  }

  const id = elementKey(occurrence.kind, occurrence.targetId);
  const element = sending.elements.get(id);
  if (!element) {
    sending.elements.set(id, {
      kind: occurrence.kind,
      targetId: occurrence.targetId,
      title: occurrence.title,
      link,
      occurrences: [{ text: row, repetitions: 1 }],
    });
    return;
  }

  // The title follows the item: if it has just been renamed, it is the new
  // name we want to read in the e-mail.
  element.title = occurrence.title;
  const last = element.occurrences[element.occurrences.length - 1];
  if (last && last.text === row) last.repetitions += 1;
  else element.occurrences.push({ text: row, repetitions: 1 });
};

// --- Where the e-mail comes from -------------------------------------------

// --- Who is notified -------------------------------------------------------

/** The mode the followed item belongs to. */
const domains: Record<Exclude<Occurrence["kind"], "order">, Area> = {
  project: "projects",
  card: "tasks",
  support: "support",
};

/**
 * Whether a person still sees an item of this kind: an area's right; an
 * order, its widget type's — "Logistique".
 */
const sees = (person: UserRow, kind: Occurrence["kind"]): boolean =>
  kind === "order"
    ? accessIncludes(widgetRights(person).logistics, "view")
    : can(companyRights(person), domains[kind], "view");

/**
 * The actors of an item, except the one who has just acted: those of a
 * project, the members of a card, the actors of a request. A ticket's
 * author — the sender of the e-mail, when they have an account, becomes an
 * actor — is not on the team: they are not notified of the team's actions.
 */
const actors: Record<Occurrence["kind"], ReturnType<typeof selection<UserRow>>> = {
  project: selection(
    `SELECT users.* FROM project_actors a JOIN users ON users.id = a.user_id
     WHERE a.project_id = ? AND a.user_id != ?`,
  ),
  card: selection(
    `SELECT users.* FROM card_members m JOIN users ON users.id = m.user_id
     WHERE m.card_id = ? AND m.user_id != ?`,
  ),
  support: selection(
    `SELECT users.* FROM support_request_actors a
     JOIN users ON users.id = a.user_id
     JOIN support_requests r ON r.id = a.request_id
     WHERE a.request_id = ? AND a.user_id != ?
       AND (r.sender_email = '' OR lower(users.email) != lower(r.sender_email))`,
  ),
  order: selection(
    `SELECT users.* FROM order_actors a JOIN users ON users.id = a.user_id
     WHERE a.order_id = ? AND a.user_id != ?`,
  ),
};

/**
 * The accounts to notify: those who follow the item, and its actors. A card
 * has two sources of followers: those who follow the card, and those who
 * follow the list it is in — following a list means following its cards. The
 * same person may be there in several capacities: they are notified only
 * once.
 */
const toNotify = (occurrence: Occurrence): UserRow[] => {
  const kinds: [FollowKind, Id][] = [[occurrence.kind, occurrence.targetId]];

  if (occurrence.kind === "card") {
    const card = taskCards.byId.get(occurrence.targetId);
    if (card) kinds.push(["list", card.list_id]);
    if (occurrence.sourceList !== undefined) kinds.push(["list", occurrence.sourceList]);
  }

  const except = leftOut(occurrence.author);
  const byId = new Map<Id, UserRow>();
  for (const [kind, id] of kinds) {
    for (const person of follows.watchers(kind, id, except)) {
      byId.set(person.id, person);
    }
  }
  for (const person of actors[occurrence.kind].all(occurrence.targetId, except)) {
    byId.set(person.id, person);
  }
  // Whoever asked to be notified of their own actions is, whatever they act
  // on: they need not follow it for their own action to reach them.
  const author = occurrence.author.id ? users.byId.get(occurrence.author.id) : undefined;
  if (author && !author.system && notificationSettings(author).ownActions) byId.set(author.id, author);
  for (const id of occurrence.except ?? []) byId.delete(id);
  // Whoever can no longer see the item — their permissions changed since they
  // started following it — is no longer notified of it.
  return [...byId.values()].filter((p) => sees(p, occurrence.kind));
};

/**
 * The entry point: a modification has just taken place, we draw from it what
 * is needed. Never throws — a notification that fails must not make the
 * write that triggered it fail, already saved at this stage.
 */
export const notify = (occurrence: Occurrence): void => {
  try {
    const recipients = toNotify(occurrence);
    if (recipients.length === 0) return;

    const link = `${occurrence.base}/${itemLink(occurrence.kind, occurrence.targetId)}`;
    const whenLabel = now();
    const sender = occurrence.base ? sendingMailbox() : "";
    // A ticket's assigned actors receive its own e-mail ("Mise à jour d'un
    // ticket"), right away; its followers, the changes' summary.
    const assigned =
      occurrence.kind === "support"
        ? new Set(actors.support.all(occurrence.targetId, 0).map((p) => p.id))
        : new Set<Id>();

    for (const person of recipients) {
      const open = channels(person, occurrence.author.id);
      if (open.screen)
        notifications.emit(person.id, {
          id: crypto.randomBytes(8).toString("hex"),
          kind: occurrence.kind,
          target_id: occurrence.targetId,
          title: occurrence.title,
          message: occurrence.message,
          author: occurrence.author.name || occurrence.author.email,
          deleted: false,
          created_at: whenLabel,
        } satisfies Notification);

      // By e-mail only for whoever has the right to it, and wants it.
      if (!open.email || !sender || !wantsEmail(person)) continue;
      if (assigned.has(person.id)) sendTicketUpdate(person, occurrence, link, sender);
      else enqueue(person, occurrence, link, sender);
    }
  } catch (error) {
    console.error("Follow-up notification abandoned:", error);
  }
};

/** A ticket's change, to one of its assigned actors: its own e-mail, sent at once. */
const sendTicketUpdate = (person: UserRow, occurrence: Occurrence, link: string, sender: string): void => {
  const request = ticketById.get(occurrence.targetId);
  (request ? requesterView(request) : Promise.resolve(undefined))
    .then((requester) => template("support_ticket_update", {
    title: occurrence.title,
    intro: "Le ticket a été mis à jour :",
    rows: [{ text: `${occurrence.author.name || occurrence.author.email} ${occurrence.message}`, repetitions: 1 }],
    action: { url: link, label: "Ouvrir dans Milo" },
    footer: "Vous recevez ce message parce que vous êtes acteur de ce ticket dans Milo.",
  }, request ? { ticket: ticketView(request, occurrence.base), requester } : {},
  // The template of the ticket's own widget.
  request ? { board: request.board_id, list: request.list_key } : undefined))
    .then((content) =>
      sendMail({ from: sender, to: person.email, subject: `Milo — ${occurrence.title}`, ...content }),
    )
    .catch((error: unknown) => {
      console.error("Ticket update not delivered:", error);
    });
};

/**
 * The root of a link that opens: Milo's address when the Settings or the
 * server give one, otherwise the one through which we were reached — the
 * one the person has in their browser.
 */
export const root = (req: { protocol: string; get(name: string): string | undefined }): string =>
  miloUrl() || `${req.protocol}://${req.get("host") ?? ""}`;

// --- Attaching an actor ---------------------------------------------------

export interface Linkage {
  /** The item the person arrives at: a project, a card. */
  kind: "project" | "card";
  targetId: Id;
  /** The item's name, as displayed. */
  title: string;
  /**
   * What has just happened, addressed to the person: "vous a ajouté comme
   * acteur", "vous a ajouté à l'élément « … » d'une checklist".
   */
  message: string;
  /** The accounts that have just arrived. */
  recipients: Id[];
  author: Author;
  base: string;
}

/**
 * A person attached to an item — actor of a project or a card, person on a
 * checklist item —: an on-screen notification, and an e-mail right away,
 * without waiting for the modification window: one wants to know at once
 * that a share of the work falls to us. One does not notify oneself —
 * unless one asked to (`channels`) —, nor whoever cannot see the item. Never throws: the attachment is already
 * saved.
 *
 * Returns the accounts notified: the modification notification of the same
 * action leaves them out (`Occurrence.except`), so as not to notify them
 * twice.
 */
/** Where a project or a card sits: its workspace, view and board, and its list's key. */
interface Place {
  workspace: string | null;
  workspace_id: Id | null;
  view: string;
  view_id: Id;
  board: string;
  board_id: Id;
  list_key: string;
}

const placeOf = (from: string, where: string) =>
  selection<Place>(`
    SELECT ws.name AS workspace, ws.id AS workspace_id, v.name AS view, v.id AS view_id,
           b.name AS board, b.id AS board_id, item.list_key
    FROM ${from}
    JOIN boards b ON b.id = item.board_id
    JOIN views v ON v.id = b.view_id
    LEFT JOIN workspaces ws ON ws.id = v.workspace_id
    WHERE ${where}`);
/** An item that sits in a list widget: a project, a card, a request. */
type PlacedKind = "project" | "card" | "support" | "order";

/** Where a board sits: its workspace and its view. */
const boardPlace = selection<Place>(`
  SELECT ws.name AS workspace, ws.id AS workspace_id, v.name AS view, v.id AS view_id,
         b.name AS board, b.id AS board_id, '' AS list_key
  FROM boards b
  JOIN views v ON v.id = b.view_id
  LEFT JOIN workspaces ws ON ws.id = v.workspace_id
  WHERE b.id = ?`);

const places: Record<PlacedKind, ReturnType<typeof placeOf>> = {
  project: placeOf("projects item", "item.id = ?"),
  card: placeOf("task_cards c JOIN task_lists item ON item.id = c.list_id", "c.id = ?"),
  support: placeOf("support_requests item", "item.id = ?"),
  order: placeOf("orders item", "item.id = ?"),
};

/** A board's list widgets of a type: shared ones before personal copies. */
const listWidgets = selection<{ id: Id; name: string | null; list_key: string | null }>(`
  SELECT w.id, json_extract(w.config, '$.name') AS name, json_extract(w.config, '$.list_key') AS list_key
  FROM board_widgets w
  JOIN board_sections s ON s.id = w.section_id
  WHERE s.board_id = ? AND w.type = ?
  ORDER BY s.owner_id IS NOT NULL, s.position, w.position`);

/** Each item's list widget: its type, and its name as the interface shows it. */
const WIDGETS: Record<PlacedKind, { type: string; label: string }> = {
  project: { type: "project.list", label: "Projets" },
  card: { type: "task.list", label: "Tâches" },
  support: { type: "support.list", label: "Tickets" },
  order: { type: "order.list", label: "Commandes" },
};

/**
 * Where the element sits — its workspace, its view, its board, its widget —,
 * as the templates' {{element.…}} name them, and each level's key, which the
 * changes' e-mail groups by.
 */
const locate = (kind: Entry["kind"], id: Id) => {
  const placed = kind !== "board" && kind !== "settings";
  const place = placed ? places[kind].get(id) : kind === "board" ? boardPlace.get(id) : undefined;
  // The widget whose key the item carries; failing that, the board's first
  // of its type. A board's structure sits in no widget, a setting nowhere.
  const widgets = place && placed ? listWidgets.all(place.board_id, WIDGETS[kind].type) : [];
  const widget = widgets.find((w) => w.list_key === place?.list_key) ?? widgets[0];
  const label = placed ? WIDGETS[kind].label : kind === "board" ? "Tableau" : "Paramétrage";
  const names = {
    workspace: place?.workspace ?? "",
    view: place?.view ?? "",
    board: place?.board ?? "",
    widgetType: label,
    widget: widget?.name?.trim() || label,
  };
  const board = String(place?.board_id ?? "");
  return {
    // The way to it, the names it has: "Les manufactures › Projets › IT".
    names: { ...names, path: [names.workspace, names.view, names.board].filter(Boolean).join(" › ") },
    keys: {
      workspace: String(place?.workspace_id ?? ""),
      view: String(place?.view_id ?? ""),
      board,
      widgetType: kind,
      widget: widget ? String(widget.id) : `${board}:${kind}`,
    },
  };
};

const placeNames = (kind: PlacedKind, id: Id) => locate(kind, id).names;

export const notifyLinked = (r: Linkage): Id[] => {
  const notified: Id[] = [];
  try {
    const whenLabel = now();
    const link = `${r.base}/${itemLink(r.kind, r.targetId)}`;
    const mailbox = r.base ? sendingMailbox() : "";
    const who = r.author.name || r.author.email;
    const place = mailbox ? placeNames(r.kind, r.targetId) : null;

    for (const id of new Set(r.recipients)) {
      const person = users.byId.get(id);
      if (!person || person.system) continue;
      const open = channels(person, r.author.id);
      if (!open.screen && !open.email) continue;
      if (!sees(person, r.kind)) continue;

      if (open.screen)
        notifications.emit(person.id, {
          id: crypto.randomBytes(8).toString("hex"),
          kind: r.kind,
          target_id: r.targetId,
          title: r.title,
          message: r.message,
          author: who,
          deleted: false,
          created_at: whenLabel,
        } satisfies Notification);
      notified.push(person.id);

      if (!open.email || !mailbox || !wantsEmail(person)) continue;
      template(
        "linked",
        {
          title: r.title,
          intro: `${who} ${r.message}.`,
          action: { url: link, label: "Ouvrir dans Milo" },
          footer: "Vous recevez ce message parce que vous avez été ajouté à cet élément dans Milo.",
        },
        {
          element: { name: r.title, activity: `${who} ${r.message}.`, url: link, ...place! } satisfies ElementView,
        },
      )
        .then((content) =>
          sendMail({ from: mailbox, to: person.email, subject: `Milo — ${r.title}`, ...content }),
        )
        .catch((error: unknown) => {
        console.error("Attachment notification not delivered:", error);
      });
    }
  } catch (error) {
    console.error("Attachment notification abandoned:", error);
  }
  return notified;
};

// --- Due-date reminder ----------------------------------------------------

export interface DueReminder {
  card: { id: Id; text: string };
  /** What the reminder says: "vous rappelle l'échéance du 5 octobre à 17:00". */
  message: string;
  recipients: Id[];
  /** Milo's address (lib/milo-url.ts); empty, the e-mail is not sent. */
  base: string;
}

/**
 * A due-date reminder: it comes from Milo, not from a person. An on-screen
 * notification and an e-mail to each actor of the card who still sees it.
 * Never throws.
 */
export const notifyReminder = (r: DueReminder): void => {
  try {
    const whenLabel = now();
    const link = `${r.base}/${itemLink("card", r.card.id)}`;
    const mailbox = r.base ? sendingMailbox() : "";
    const place = mailbox ? placeNames("card", r.card.id) : null;

    for (const id of new Set(r.recipients)) {
      const person = users.byId.get(id);
      if (!person || person.system) continue;
      if (!can(companyRights(person), "tasks", "view")) continue;
      // A reminder is one of production: whoever does not want those does not
      // get it.
      if (!notificationSettings(person).scopes.includes("production")) continue;

      notifications.emit(person.id, {
        id: crypto.randomBytes(8).toString("hex"),
        kind: "card",
        target_id: r.card.id,
        title: r.card.text,
        message: r.message,
        author: "Milo",
        deleted: false,
        created_at: whenLabel,
      } satisfies Notification);

      if (!mailbox || !wantsEmail(person)) continue;
      template(
        "reminder",
        {
          title: r.card.text,
          intro: `Milo ${r.message}.`,
          action: { url: link, label: "Ouvrir dans Milo" },
          footer: "Vous recevez ce message parce que vous êtes acteur de cette tâche dans Milo.",
        },
        {
          element: { name: r.card.text, activity: `Milo ${r.message}.`, url: link, ...place! } satisfies ElementView,
        },
      )
        .then((content) =>
          sendMail({ from: mailbox, to: person.email, subject: `Milo — ${r.card.text}`, ...content }),
        )
        .catch((error: unknown) => {
        console.error("Due-date reminder not delivered:", error);
      });
    }
  } catch (error) {
    console.error("Due-date reminder abandoned:", error);
  }
};

// --- Tickets' e-mails -------------------------------------------------------

type TicketFields = Pick<SupportRequestRow, "id" | "number" | "subject" | "status" | "board_id" | "list_key">;

/** A ticket as its e-mails cite it ({{ticket.…}}). */
const ticketView = (request: TicketFields, base: string): TicketView => ({
  number: supportTicketRef(request.number),
  subject: request.subject,
  status: supportStatusLabel(request.status as Parameters<typeof supportStatusLabel>[0]),
  url: base ? `${base}/${itemLink("support", request.id)}` : "",
});

/** A ticket's requester as its e-mails cite it ({{requester.…}}): empty when it has none. */
const requesterView = async (request: Pick<SupportRequestRow, "sender_name" | "sender_email">): Promise<RequesterView> => {
  const person = await senderPerson(request);
  return {
    first_name: person?.first_name ?? "",
    last_name: person?.last_name ?? "",
    full_name: person?.full_name ?? "",
    email: person?.email ?? "",
  };
};

const ticketById = selection<TicketFields & Pick<SupportRequestRow, "sender_name" | "sender_email">>(
  "SELECT id, number, subject, status, sender_name, sender_email, board_id, list_key FROM support_requests WHERE id = ?",
);

// --- Ticket assignment ------------------------------------------------------

export interface Assignment {
  /** The request: its number, subject, status and sender. */
  request: TicketFields & Pick<SupportRequestRow, "sender_name" | "sender_email">;
  /** The accounts that have just been assigned to it. */
  recipients: UserRow[];
  author: UserRow;
  base: string;
}

/**
 * A person assigned to requests: one on-screen notification per request,
 * right away, and a single e-mail per person listing them all — assigning
 * ten tickets at once does not send ten e-mails. One does not notify
 * oneself, unless one asked to (`channels`). Never throws: the assignment is already saved.
 */
export const notifyAssignments = (assignments: Assignment[]): void => {
  try {
    const whenLabel = now();
    const mails = new Map<
      string,
      { person: UserRow; mailbox: string; rows: Row[]; requests: Assignment["request"][]; link: string; base: string; author: UserRow }
    >();

    for (const { request, recipients, author, base } of assignments) {
      const title = requestTitle(request);
      const link = `${base}/${itemLink("support", request.id)}`;
      const mailbox = sendingMailbox();

      for (const person of recipients) {
        const open = channels(person, author.id);
        if (open.screen)
          notifications.emit(person.id, {
            id: crypto.randomBytes(8).toString("hex"),
            kind: "support",
            target_id: request.id,
            title: title,
            message: "vous a assigné cette demande",
            author: author.name || author.email,
            deleted: false,
            created_at: whenLabel,
          } satisfies Notification);

        if (!open.email || !mailbox || !wantsEmail(person)) continue;
        const sendKey = String(person.id);
        const current = mails.get(sendKey);
        if (current) {
          current.rows.push({ text: title, repetitions: 1 });
          current.requests.push(request);
        } else {
          mails.set(sendKey, {
            person,
            mailbox,
            rows: [{ text: title, repetitions: 1 }],
            requests: [request],
            link,
            base,
            author,
          });
        }
      }
    }

    for (const { person, mailbox, rows, requests, link, base, author } of mails.values()) {
      const who = author.name || author.email;
      const nounPhrase = rows.length === 1;
      Promise.all([
        accountPerson(author),
        Promise.all(requests.map(async (r) => ({ ticket: ticketView(r, base), requester: await requesterView(r) }))),
      ])
        .then(([user, items]) => template("assignment", {
        title: nounPhrase ? "Demande assignée" : "Demandes assignées",
        intro: nounPhrase
          ? `${who} vous a assigné cette demande :`
          : `${who} vous a assigné ces ${rows.length} demandes :`,
        rows,
        // A single request: the link opens it. Several: it opens Milo,
        // where they wait in Support mode.
        action: { url: nounPhrase ? link : base, label: "Ouvrir dans Milo" },
        footer: "Vous recevez ce message parce qu'un ticket vous a été assigné dans Milo.",
      }, assignedView(user, items),
      // The template of the first ticket's widget.
      { board: requests[0]!.board_id, list: requests[0]!.list_key }))
        .then((content) =>
          sendMail({
            from: mailbox,
            to: person.email,
            subject: nounPhrase ? `Milo — ${rows[0]!.text}` : `Milo — ${rows.length} demandes vous sont assignées`,
            ...content,
          }),
        )
        .catch((error: unknown) => {
        console.error("Assignment notification not delivered:", error);
      });
    }
  } catch (error) {
    console.error("Assignment notification abandoned:", error);
  }
};

// --- A new ticket ----------------------------------------------------------

export interface NewTicket {
  request: TicketFields & Pick<SupportRequestRow, "sender_name" | "sender_email" | "mailbox">;
  /** The accounts the list names (NEW_TICKET_ACTORS). */
  recipients: Id[];
  /** Who entered it in Milo; none when it arrived by e-mail. */
  author?: UserRow;
  base: string;
}

/**
 * A ticket arrives in a list: the actors the list names receive "Réception
 * d'un nouveau ticket" — an on-screen notification, and the e-mail right
 * away. Whoever entered it is not told. Never throws: the ticket is already
 * saved.
 */
export const notifyNewTicket = ({ request, recipients, author, base }: NewTicket): void => {
  try {
    if (recipients.length === 0) return;
    const title = requestTitle(request);
    const link = `${base}/${itemLink("support", request.id)}`;
    const mailbox = base ? sendingMailbox() : "";
    const from = request.sender_email
      ? `${request.sender_name || request.sender_email} <${request.sender_email}>`
      : "";
    const rows: Row[] = [
      ...(from ? [{ text: `De ${from}`, repetitions: 1 }] : []),
      ...(author ? [{ text: `Saisi par ${author.name || author.email}`, repetitions: 1 }] : []),
      ...(request.mailbox ? [{ text: `Boîte ${request.mailbox}`, repetitions: 1 }] : []),
    ];
    const whenLabel = now();
    // Its requester, read once for every recipient.
    const extra = requesterView(request).then((requester) => ({ ticket: ticketView(request, base), requester }));

    for (const id of new Set(recipients)) {
      if (id === author?.id) continue;
      const person = users.byId.get(id);
      if (!person || person.system) continue;

      if (sees(person, "support") && notificationRights(person).screen)
        notifications.emit(person.id, {
          id: crypto.randomBytes(8).toString("hex"),
          kind: "support",
          target_id: request.id,
          title,
          message: "a ouvert un nouveau ticket",
          author: author ? author.name || author.email : request.sender_name || request.sender_email || "Milo",
          deleted: false,
          created_at: whenLabel,
        } satisfies Notification);

      if (!mailbox || !wantsEmail(person)) continue;
      extra.then((view) => template("support_new_ticket", {
        title,
        intro: "Un nouveau ticket est arrivé dans Support :",
        rows,
        action: { url: link, label: "Ouvrir dans Milo" },
        footer: "Vous recevez ce message parce que vous êtes désigné comme acteur des nouveaux tickets de cette liste.",
      }, view, { board: request.board_id, list: request.list_key }))
        .then((content) =>
          sendMail({ from: mailbox, to: person.email, subject: `Milo — Nouveau ticket ${title}`, ...content }),
        )
        .catch((error: unknown) => {
          console.error("New ticket notification not delivered:", error);
        });
    }
  } catch (error) {
    console.error("New ticket notification abandoned:", error);
  }
};

// --- Deletions -------------------------------------------------------------
//
// Deleting an item notifies those who were involved in it: the other actors
// of a project or a ticket, and those who follow them; in Tasks mode, those
// who follow the card, the list or the board. On screen and by e-mail, like
// any change; what has vanished opens nothing on screen, and its e-mail
// leads to Milo.
//
// Recipients are read BEFORE the deletion: afterwards, the actors and the
// cards are gone with the item.

/** A query on a single item, named "@id" as many times as needed. */
const idsOf = (sql: string) => {
  const query = selection<{ user_id: Id }>(sql);
  return (id: Id): Id[] => query.all({ id }).map((l) => l.user_id);
};

/** Who is concerned by an item, to announce its deletion to them. */
export const concerned = {
  /** The project's actors and those who follow it. */
  project: idsOf(
    `SELECT user_id FROM project_actors WHERE project_id = @id
     UNION SELECT user_id FROM follows WHERE kind = 'project' AND target_id = @id`,
  ),
  /** The request's actors and those who follow it. */
  request: idsOf(
    `SELECT user_id FROM support_request_actors WHERE request_id = @id
     UNION SELECT user_id FROM follows WHERE kind = 'support' AND target_id = @id`,
  ),
  /** Those who follow the card, and those who follow its list. */
  card: idsOf(
    `SELECT user_id FROM follows WHERE kind = 'card' AND target_id = @id
     UNION SELECT user_id FROM follows
      WHERE kind = 'list' AND target_id = (SELECT list_id FROM task_cards WHERE id = @id)`,
  ),
  /** Those who follow the list, and those who follow one of its cards. */
  list: idsOf(
    `SELECT user_id FROM follows WHERE kind = 'list' AND target_id = @id
     UNION SELECT user_id FROM follows
      WHERE kind = 'card' AND target_id IN (SELECT id FROM task_cards WHERE list_id = @id)`,
  ),
  /** Those who follow one of the board's lists, or one of its cards. */
  board: idsOf(
    `SELECT user_id FROM follows
      WHERE kind = 'list' AND target_id IN (SELECT id FROM task_lists WHERE board_id = @id)
     UNION SELECT user_id FROM follows
      WHERE kind = 'card' AND target_id IN (
        SELECT t.id FROM task_cards t JOIN task_lists l ON l.id = t.list_id WHERE l.board_id = @id
      )`,
  ),
  /** The order's actors and those who follow it. */
  order: idsOf(
    `SELECT user_id FROM order_actors WHERE order_id = @id
     UNION SELECT user_id FROM follows WHERE kind = 'order' AND target_id = @id`,
  ),
  /** The actors of the board's projects, and those who follow one. */
  projectBoard: idsOf(
    `SELECT a.user_id FROM project_actors a JOIN projects p ON p.id = a.project_id WHERE p.board_id = @id
     UNION SELECT f.user_id FROM follows f JOIN projects p ON p.id = f.target_id
      WHERE f.kind = 'project' AND p.board_id = @id`,
  ),
  /** The actors of the board's requests, and those who follow one. */
  supportBoard: idsOf(
    `SELECT a.user_id FROM support_request_actors a JOIN support_requests r ON r.id = a.request_id
      WHERE r.board_id = @id
     UNION SELECT f.user_id FROM follows f JOIN support_requests r ON r.id = f.target_id
      WHERE f.kind = 'support' AND r.board_id = @id`,
  ),
};

export interface Deletion {
  /** The item's family: "card" stands for the whole Tasks mode. */
  kind: NotificationKind;
  targetId: Id;
  /** The name of the affected item. */
  title: string;
  /** What was deleted, in the third person: "a supprimé le projet". */
  message: string;
  author: Author;
  /** The accounts to notify, read before the deletion (see `concerned`). */
  recipients: Id[];
  /**
   * True when the item itself disappears. False when it is a part of it — a
   * comment, an attachment —: it still opens.
   */
  vanished: boolean;
  /** The root of the app (`Occurrence.base`); empty, no e-mail goes out. */
  base: string;
  /** "production" unless said otherwise: a board deleted is an edit. */
  scope?: NotificationScope;
}

/**
 * One notification, to each recipient on the channels open to them: on
 * screen, and in their pending e-mail. Never throws.
 */
const emit = (entry: Entry, recipients: Id[], link: string, base: string, deleted: boolean): void => {
  const whenLabel = now();
  const sender = base ? sendingMailbox() : "";
  for (const userId of new Set([...recipients, entry.author.id].filter(Boolean))) {
    const person = users.byId.get(userId);
    if (!person || person.system) continue;
    const open = channels(person, entry.author.id, entry.scope);
    if (open.screen)
      notifications.emit(userId, {
        id: crypto.randomBytes(8).toString("hex"),
        kind: entry.kind,
        target_id: entry.targetId,
        title: entry.title,
        message: entry.message,
        author: entry.author.name || entry.author.email,
        deleted,
        created_at: whenLabel,
      } satisfies Notification);
    if (open.email && sender && wantsEmail(person)) enqueue(person, entry, link, sender);
  }
};

/** Announces a deletion. Never throws: the deletion is already done. */
export const notifyDeletion = (deletion: Deletion): void => {
  try {
    if (deletion.kind === "access") return;
    // What has vanished has no address: the e-mail opens Milo.
    const link =
      deletion.vanished || deletion.kind === "settings"
        ? `${deletion.base}/`
        : `${deletion.base}/${itemLink(deletion.kind === "board" ? "access" : deletion.kind, deletion.targetId)}`;
    emit({ ...deletion, kind: deletion.kind }, deletion.recipients, link, deletion.base, deletion.vanished);
  } catch (error) {
    console.error("Deletion notification abandoned:", error);
  }
};

// --- A board's structure ---------------------------------------------------
//
// What is not an item but holds them: a board's lists, its labels and their
// groups, its categories, its widgets. The notification opens the board.

const boardName = selection<{ name: string }>("SELECT name FROM boards WHERE id = ?");

export interface BoardChange {
  boardId: Id;
  /** What changed, in the third person: "a renommé la liste « A » en « B »". */
  message: string;
  author: Author;
  /** Those concerned besides the author (see `concerned`). */
  recipients: Id[];
  /** The root of the app (`Occurrence.base`); empty, no e-mail goes out. */
  base: string;
  /**
   * "edit" for the widgets and sections — the edit mode —; "production"
   * (the default) for what is changed while working in them: a list, a label.
   */
  scope?: NotificationScope;
}

/** Announces a change to a board's structure. Never throws. */
export const notifyBoard = (change: BoardChange): void => {
  try {
    emit(
      {
        kind: "board",
        targetId: change.boardId,
        title: boardName.get(change.boardId)?.name ?? "Tableau",
        message: change.message,
        author: change.author,
        scope: change.scope,
      },
      change.recipients,
      `${change.base}/${itemLink("access", change.boardId)}`,
      change.base,
      false,
    );
  } catch (error) {
    console.error("Board notification abandoned:", error);
  }
};

// --- Settings ----------------------------------------------------------------
//
// A setting of the whole application changes (Paramétrage): no item is
// touched, nobody follows it. Only its author is told, if they asked to be.

export interface SettingsChange {
  /** What changed: "a modifié les types de jalons". */
  message: string;
  author: Author;
  /** The root of the app (`Occurrence.base`); empty, no e-mail goes out. */
  base: string;
}

/** Announces a change of the settings. Never throws. */
export const notifySettings = (change: SettingsChange): void => {
  try {
    emit(
      {
        kind: "settings",
        scope: "settings",
        targetId: 0,
        title: "Paramétrage",
        message: change.message,
        author: change.author,
      },
      [],
      `${change.base}/`,
      change.base,
      false,
    );
  } catch (error) {
    console.error("Settings notification abandoned:", error);
  }
};

/** A ticket's name, as notifications display it. */
export const requestTitle = (request: { number: number; subject: string }): string =>
  `${supportTicketRef(request.number)}${request.subject ? ` — ${request.subject}` : ""}`;
