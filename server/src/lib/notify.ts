// What goes out when a followed item changes — or an item one is an actor
// of: an on-screen notification, and an e-mail.
//
// Two principles hold the file together.
//
//   1. One is never notified of one's own actions. It is the repository that
//      excludes the author (repositories/follows.ts), not the display: nothing
//      goes out, so there is nothing to filter further on.
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
  NotificationSettings,
} from "@milo/shared";
import { can, itemLink, supportTicketRef } from "@milo/shared";
import type { Area } from "@milo/shared";
import type { UserRow } from "../db/rows.js";
import { selection } from "../db/query.js";
import { follows } from "../repositories/follows.js";
import { taskCards } from "../repositories/tasks.js";
import { env } from "../env.js";
import { sendingAddress } from "./entra.js";
import { sendMail, mailboxConfigured } from "./mail.js";
import { template } from "./mail-template.js";
import type { Row } from "./mail-template.js";
import { notifications } from "../repositories/notifications.js";
import { readSetting } from "../repositories/settings.js";
import { companyRights, users } from "../repositories/users.js";
import { now } from "./time.js";

// --- Settings (Paramétrage › Notifications) ---------------------------------

/**
 * The settings of the "Notifications" section. The grouping delay starts,
 * until it has been set, from MILO_NOTIFY_WINDOW_MINUTES.
 */
export const notificationSettings = (): NotificationSettings => ({
  toasts: readSetting<boolean>("notify_toasts", true) !== false,
  email: readSetting<boolean>("notify_email", true) !== false,
  emailMode: readSetting<string>("notify_email_mode", "grouped") === "immediate" ? "immediate" : "grouped",
  emailDelayMinutes: readSetting<number>("notify_email_delay", env.notifyWindowMs / 60000),
});

/**
 * How long occurrences accumulate before going out as a single e-mail. Zero
 * when e-mails go out on every event: the timer fires on the next tick, and
 * only the occurrences of a single action end up together.
 */
const window = (): number => {
  const r = notificationSettings();
  return r.emailMode === "immediate" ? 0 : r.emailDelayMinutes * 60 * 1000;
};

/**
 * The mailbox that notification e-mails go out from, or nothing: e-mails are
 * turned off in Settings, or the mailer is not configured.
 */
const sendingMailbox = (): string =>
  notificationSettings().email && mailboxConfigured() ? sendingAddress() : "";

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
  kind: Exclude<NotificationKind, "access">;
  targetId: Id;
  /** The item's name, as displayed. */
  title: string;
  /** What changed, in the third person: "a modifié la fiche". */
  message: string;
  /** Who acted. This is also the person who is not notified. */
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
 * A queued occurrence is one line of the template: the text, and the number
 * of times it repeated in a row. Correcting a title three times in a row
 * gives the same sentence three times, and the e-mail says "(3 fois)" rather
 * than copying it out.
 */
type QueuedOccurrence = Row;

interface Pending {
  /** The support mailbox of the item's company. */
  sender: string;
  recipient: string;
  title: string;
  link: string;
  /** The accumulated occurrences, in the order they arrived. */
  occurrences: QueuedOccurrence[];
  timeout: NodeJS.Timeout;
}

/**
 * One pending send per (person, item) pair. In memory, like the version
 * counters: a restart loses what has not gone out yet. What is lost then is
 * a summary of a few minutes, and the on-screen notification has already
 * happened.
 */
const pending = new Map<string, Pending>();

const key = (userId: Id, kind: NotificationKind, targetId: Id): string =>
  `${userId}:${kind}:${targetId}`;

const body = (sending: Pending): { text: string; html: string } => {
  const total = sending.occurrences.reduce((sum, occurrence) => sum + occurrence.repetitions, 0);

  return template({
    title: sending.title,
    intro: total === 1 ? "Une modification :" : `${total} modifications :`,
    rows: sending.occurrences,
    action: { url: sending.link, label: "Ouvrir dans Milo" },
    footer: "Vous recevez ce message parce que vous suivez cet élément dans Milo, ou que vous en êtes acteur.",
  });
};

const dispatch = (sendKey: string): void => {
  const sending = pending.get(sendKey);
  if (!sending) return;
  pending.delete(sendKey);

  sendMail({
    from: sending.sender,
    to: sending.recipient,
    subject: `Milo — ${sending.title}`,
    ...body(sending),
  }).catch((error: unknown) => {
    // Nobody is waiting for this answer: the write that triggered it left
    // long ago. We log it, and that is all — a lost notification must not
    // make a successful modification fail.
    console.error("E-mail notification not delivered:", error);
  });
};

/** Adds an occurrence to the send in progress for this person and this item. */
const enqueue = (recipient: UserRow, occurrence: Occurrence, link: string, sender: string): void => {
  if (!recipient.email) return;

  const sendKey = key(recipient.id, occurrence.kind, occurrence.targetId);
  const current = pending.get(sendKey);
  const row = `${occurrence.author.name || occurrence.author.email} ${occurrence.message}`;

  if (current) {
    // The title follows the item: if it has just been renamed, it is the new
    // name we want to read in the e-mail.
    current.title = occurrence.title;

    const last = current.occurrences[current.occurrences.length - 1];
    if (last && last.text === row) last.repetitions += 1;
    else current.occurrences.push({ text: row, repetitions: 1 });
    return;
  }

  pending.set(sendKey, {
    sender,
    recipient: recipient.email,
    title: occurrence.title,
    link,
    occurrences: [{ text: row, repetitions: 1 }],
    // `unref` lets the process terminate without waiting for the window.
    timeout: setTimeout(() => dispatch(sendKey), window()).unref(),
  });
};

// --- Where the e-mail comes from -------------------------------------------

// --- Who is notified -------------------------------------------------------

/** The mode the followed item belongs to. */
const domains: Record<Occurrence["kind"], Area> = {
  project: "projects",
  card: "tasks",
  support: "support",
};

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

  const byId = new Map<Id, UserRow>();
  for (const [kind, id] of kinds) {
    for (const person of follows.watchers(kind, id, occurrence.author.id)) {
      byId.set(person.id, person);
    }
  }
  for (const person of actors[occurrence.kind].all(occurrence.targetId, occurrence.author.id)) {
    byId.set(person.id, person);
  }
  for (const id of occurrence.except ?? []) byId.delete(id);
  // Whoever can no longer see the item — their permissions changed since they
  // started following it — is no longer notified of it.
  return [...byId.values()].filter((p) => can(companyRights(p), domains[occurrence.kind], "view"));
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

    for (const person of recipients) {
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

      if (sender) enqueue(person, occurrence, link, sender);
    }
  } catch (error) {
    console.error("Follow-up notification abandoned:", error);
  }
};

/**
 * The root through which we were reached, to build a link that opens. The
 * server has no other way to know its public address, and this one is the
 * right one: it is the one the person has in their browser.
 */
export const root = (req: { protocol: string; get(name: string): string | undefined }): string =>
  `${req.protocol}://${req.get("host") ?? ""}`;

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
 * that a share of the work falls to us. One does not notify oneself, nor
 * whoever cannot see the item. Never throws: the attachment is already
 * saved.
 *
 * Returns the accounts notified: the modification notification of the same
 * action leaves them out (`Occurrence.except`), so as not to notify them
 * twice.
 */
export const notifyLinked = (r: Linkage): Id[] => {
  const notified: Id[] = [];
  try {
    const whenLabel = now();
    const link = `${r.base}/${itemLink(r.kind, r.targetId)}`;
    const mailbox = r.base ? sendingMailbox() : "";
    const who = r.author.name || r.author.email;

    for (const id of new Set(r.recipients)) {
      if (id === r.author.id) continue;
      const person = users.byId.get(id);
      if (!person || person.system) continue;
      if (!can(companyRights(person), domains[r.kind], "view")) continue;

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

      if (!mailbox || !person.email) continue;
      sendMail({
        from: mailbox,
        to: person.email,
        subject: `Milo — ${r.title}`,
        ...template({
          title: r.title,
          intro: `${who} ${r.message}.`,
          action: { url: link, label: "Ouvrir dans Milo" },
          footer: "Vous recevez ce message parce que vous avez été ajouté à cet élément dans Milo.",
        }),
      }).catch((error: unknown) => {
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
  /** The app's root (MILO_PUBLIC_URL); empty, the e-mail is not sent. */
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

    for (const id of new Set(r.recipients)) {
      const person = users.byId.get(id);
      if (!person || person.system) continue;
      if (!can(companyRights(person), "tasks", "view")) continue;

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

      if (!mailbox || !person.email) continue;
      sendMail({
        from: mailbox,
        to: person.email,
        subject: `Milo — ${r.card.text}`,
        ...template({
          title: r.card.text,
          intro: `Milo ${r.message}.`,
          action: { url: link, label: "Ouvrir dans Milo" },
          footer: "Vous recevez ce message parce que vous êtes acteur de cette tâche dans Milo.",
        }),
      }).catch((error: unknown) => {
        console.error("Due-date reminder not delivered:", error);
      });
    }
  } catch (error) {
    console.error("Due-date reminder abandoned:", error);
  }
};

// --- Ticket assignment ------------------------------------------------------

export interface Assignment {
  /** The request, its ticket number and its subject. */
  request: { id: Id; number: number; subject: string };
  /** The accounts that have just been assigned to it. */
  recipients: UserRow[];
  author: UserRow;
  base: string;
}

/**
 * A person assigned to requests: one on-screen notification per request,
 * right away, and a single e-mail per person listing them all — assigning
 * ten tickets at once does not send ten e-mails. One does not notify
 * oneself. Never throws: the assignment is already saved.
 */
export const notifyAssignments = (assignments: Assignment[]): void => {
  try {
    const whenLabel = now();
    const mails = new Map<string, { person: UserRow; mailbox: string; rows: Row[]; link: string; base: string; author: UserRow }>();

    for (const { request, recipients, author, base } of assignments) {
      const title = requestTitle(request);
      const link = `${base}/${itemLink("support", request.id)}`;
      const mailbox = sendingMailbox();

      for (const person of recipients) {
        if (person.id === author.id) continue;
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

        if (!mailbox || !person.email) continue;
        const sendKey = String(person.id);
        const current = mails.get(sendKey);
        if (current) current.rows.push({ text: title, repetitions: 1 });
        else {
          mails.set(sendKey, {
            person,
            mailbox,
            rows: [{ text: title, repetitions: 1 }],
            link,
            base,
            author,
          });
        }
      }
    }

    for (const { person, mailbox, rows, link, base, author } of mails.values()) {
      const who = author.name || author.email;
      const nounPhrase = rows.length === 1;
      sendMail({
        from: mailbox,
        to: person.email,
        subject: nounPhrase ? `Milo — ${rows[0]!.text}` : `Milo — ${rows.length} demandes vous sont assignées`,
        ...template({
          title: nounPhrase ? "Demande assignée" : "Demandes assignées",
          intro: nounPhrase
            ? `${who} vous a assigné cette demande :`
            : `${who} vous a assigné ces ${rows.length} demandes :`,
          rows,
          // A single request: the link opens it. Several: it opens Milo,
          // where they wait in Support mode.
          action: { url: nounPhrase ? link : base, label: "Ouvrir dans Milo" },
          footer: "Vous recevez ce message parce qu'un ticket vous a été assigné dans Milo.",
        }),
      }).catch((error: unknown) => {
        console.error("Assignment notification not delivered:", error);
      });
    }
  } catch (error) {
    console.error("Assignment notification abandoned:", error);
  }
};

// --- Deletions -------------------------------------------------------------
//
// Deleting an item notifies those who were involved in it: the other actors
// of a project or a ticket, and those who follow them; in Tasks mode, those
// who follow the card, the list or the board. The notification goes to the
// screen and is filed under "Notifications", without an e-mail: what it
// announces is done, and a link would open nothing any more.
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
}

/** Announces a deletion. Never throws: the deletion is already done. */
export const notifyDeletion = (deletion: Deletion): void => {
  try {
    const whenLabel = now();
    for (const userId of new Set(deletion.recipients)) {
      if (userId === deletion.author.id) continue;
      notifications.emit(userId, {
        id: crypto.randomBytes(8).toString("hex"),
        kind: deletion.kind,
        target_id: deletion.targetId,
        title: deletion.title,
        message: deletion.message,
        author: deletion.author.name || deletion.author.email,
        deleted: deletion.vanished,
        created_at: whenLabel,
      } satisfies Notification);
    }
  } catch (error) {
    console.error("Deletion notification abandoned:", error);
  }
};

/** A ticket's name, as notifications display it. */
export const requestTitle = (request: { number: number; subject: string }): string =>
  `${supportTicketRef(request.number)}${request.subject ? ` — ${request.subject}` : ""}`;
