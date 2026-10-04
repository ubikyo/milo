// Ce qui part quand un élément suivi change — ou un élément dont on est
// acteur : une notification à l'écran, et un e-mail.
//
// Deux principes tiennent le fichier.
//
//   1. On ne se notifie jamais de ses propres gestes. C'est le dépôt qui
//      écarte l'auteur (repositories/follows.ts), pas l'affichage : rien ne
//      part, donc rien n'est à filtrer plus loin.
//
//   2. La notification à l'écran est immédiate, l'e-mail ne l'est pas. Dix
//      retouches d'un titre en deux minutes font dix notifications — elles
//      s'empilent et disparaissent — mais un seul e-mail, qui les résume. Sans
//      ce regroupement, suivre un projet actif reviendrait à s'inscrire à une
//      rafale.

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

// --- Les réglages (Paramétrage › Notifications) ---------------------------

/**
 * Les réglages de la section « Notifications ». Le délai de regroupement
 * part, tant qu'on ne l'a pas réglé, de MILO_NOTIFY_WINDOW_MINUTES.
 */
export const notificationSettings = (): NotificationSettings => ({
  toasts: readSetting<boolean>("notify_toasts", true) !== false,
  email: readSetting<boolean>("notify_email", true) !== false,
  emailMode: readSetting<string>("notify_email_mode", "grouped") === "immediate" ? "immediate" : "grouped",
  emailDelayMinutes: readSetting<number>("notify_email_delay", env.notifyWindowMs / 60000),
});

/**
 * Le temps pendant lequel les faits s'accumulent avant de partir en un
 * e-mail. Zéro quand les e-mails partent à chaque évènement : la minuterie
 * part au tour suivant, et seuls les faits d'un même geste se retrouvent
 * ensemble.
 */
const window = (): number => {
  const r = notificationSettings();
  return r.emailMode === "immediate" ? 0 : r.emailDelayMinutes * 60 * 1000;
};

/**
 * La boîte d'où partent les e-mails de notification, ou rien : les e-mails
 * sont coupés dans le Paramétrage, ou la messagerie n'est pas configurée.
 */
const sendingMailbox = (): string =>
  notificationSettings().email && mailboxConfigured() ? sendingAddress() : "";

/**
 * Qui a agi. Un compte le plus souvent ; l'expéditeur d'un e-mail reçu sur un
 * ticket n'en a pas toujours — son identifiant vaut alors 0, qui
 * n'écarte personne.
 */
export type Author = Pick<UserRow, "id" | "name" | "email">;

export interface Occurrence {
  /**
   * L'élément suivi : un projet, une carte, un ticket. Un
   * élément du mode Accès ne se suit pas.
   */
  kind: Exclude<NotificationKind, "access">;
  targetId: Id;
  /** Le nom de l'élément, tel qu'il s'affiche. */
  title: string;
  /** Ce qui a changé, à la troisième personne : « a modifié la fiche ». */
  message: string;
  /** Qui a agi. C'est aussi la personne qu'on ne notifie pas. */
  author: Author;
  /**
   * La liste d'où la carte vient, quand elle en change. Ceux qui suivaient
   * cette liste-là sont prévenus eux aussi : une carte qui s'en va est une
   * modification de ce qu'elle contient, au même titre qu'une carte qui
   * arrive.
   */
  sourceList?: Id;
  /**
   * Des comptes à ne pas prévenir cette fois : ceux qu'une autre notification
   * vient de prévenir du même geste — les acteurs qu'on vient d'assigner à une
   * demande ont déjà la leur.
   */
  except?: Id[];
  /**
   * La racine de l'application, telle qu'on l'a jointe : « https://milo.exemple.fr ».
   * Vide quand on ne la connaît pas — une relève de boîte n'a pas de requête :
   * la notification reste alors à l'écran, sans e-mail au lien cassé.
   */
  base: string;
}

// --- Les e-mails en attente ------------------------------------------------

/**
 * Un fait empilé, c'est une ligne du gabarit : le texte, et le nombre de fois
 * qu'il s'est répété d'affilée. Corriger un titre trois fois de suite donne
 * trois fois la même phrase, et l'e-mail dit « (3 fois) » plutôt que de la
 * recopier.
 */
type QueuedOccurrence = Row;

interface Pending {
  /** La boîte de support de la société de l'élément. */
  sender: string;
  recipient: string;
  title: string;
  link: string;
  /** Les faits accumulés, dans l'ordre où ils sont arrivés. */
  occurrences: QueuedOccurrence[];
  timeout: NodeJS.Timeout;
}

/**
 * Un envoi en attente par couple (personne, élément). En mémoire, comme les
 * compteurs de version : un redémarrage perd ce qui n'est pas encore parti. Ce
 * qui se perd alors, c'est un résumé de quelques minutes, et la notification à
 * l'écran, elle, a déjà eu lieu.
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
    // Personne n'attend cette réponse : l'écriture qui l'a déclenchée est
    // partie depuis longtemps. On la trace, et c'est tout — une notification
    // perdue ne doit pas faire échouer une modification réussie.
    console.error("Notification par e-mail non remise :", error);
  });
};

/** Ajoute un fait à l'envoi en cours pour cette personne et cet élément. */
const enqueue = (recipient: UserRow, occurrence: Occurrence, link: string, sender: string): void => {
  if (!recipient.email) return;

  const sendKey = key(recipient.id, occurrence.kind, occurrence.targetId);
  const current = pending.get(sendKey);
  const row = `${occurrence.author.name || occurrence.author.email} ${occurrence.message}`;

  if (current) {
    // Le titre suit l'élément : s'il vient d'être renommé, c'est le nouveau
    // nom qu'on veut lire dans l'e-mail.
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
    // `unref` laisse le processus se terminer sans attendre la fenêtre.
    timeout: setTimeout(() => dispatch(sendKey), window()).unref(),
  });
};

// --- D'où part l'e-mail ----------------------------------------------------

// --- Qui est prévenu -------------------------------------------------------

/** Le mode dont relève l'élément suivi. */
const domains: Record<Occurrence["kind"], Area> = {
  project: "projects",
  card: "tasks",
  support: "support",
};

/**
 * Les acteurs d'un élément, sauf celui qui vient d'agir : ceux d'un projet,
 * les membres d'une carte, les acteurs d'une demande. L'auteur d'un ticket —
 * l'expéditeur de l'e-mail, quand il a un compte, en devient acteur — n'est
 * pas de l'équipe : il n'est pas prévenu des gestes de celle-ci.
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
 * Les comptes à prévenir : ceux qui suivent l'élément, et ses acteurs. Une
 * carte a deux sources de suiveurs : ceux qui suivent la carte, et ceux qui
 * suivent la liste où elle se trouve — suivre une liste, c'est suivre ses
 * cartes. Une même personne peut être à plusieurs titres : elle n'est
 * prévenue qu'une fois.
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
  // Qui ne voit plus l'élément — ses permissions ont changé depuis qu'il le
  // suit — n'en est plus prévenu.
  return [...byId.values()].filter((p) => can(companyRights(p), domains[occurrence.kind], "view"));
};

/**
 * Le point d'entrée : une modification vient d'avoir lieu, on en tire ce qu'il
 * faut. Ne lève jamais — une notification qui échoue ne doit pas faire échouer
 * l'écriture qui l'a déclenchée, déjà enregistrée à ce stade.
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
    console.error("Notification de suivi abandonnée :", error);
  }
};

/**
 * La racine par laquelle on nous a joints, pour bâtir un lien qui s'ouvre. Le
 * serveur n'a pas d'autre moyen de connaître son adresse publique, et c'est
 * celle-là qui est juste : c'est celle que la personne a dans son navigateur.
 */
export const root = (req: { protocol: string; get(name: string): string | undefined }): string =>
  `${req.protocol}://${req.get("host") ?? ""}`;

// --- Rattachement d'un acteur ---------------------------------------------

export interface Linkage {
  /** L'élément où la personne arrive : un projet, une carte. */
  kind: "project" | "card";
  targetId: Id;
  /** Le nom de l'élément, tel qu'il s'affiche. */
  title: string;
  /**
   * Ce qui vient de se passer, adressé à la personne : « vous a ajouté comme
   * acteur », « vous a ajouté à l'élément « … » d'une checklist ».
   */
  message: string;
  /** Les comptes qui viennent d'arriver. */
  recipients: Id[];
  author: Author;
  base: string;
}

/**
 * Une personne rattachée à un élément — acteur d'un projet ou d'une carte,
 * personne d'un élément de checklist — : une notification à l'écran, et un
 * e-mail aussitôt, sans attendre la fenêtre des modifications : on veut
 * savoir tout de suite qu'une part du travail nous revient. On ne se prévient
 * pas soi-même, ni qui ne voit pas l'élément. Ne lève jamais : le
 * rattachement est déjà enregistré.
 *
 * Rend les comptes prévenus : la notification de modification du même geste
 * les écarte (`Fait.sauf`), pour ne pas les prévenir deux fois.
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
        console.error("Notification de rattachement non remise :", error);
      });
    }
  } catch (error) {
    console.error("Notification de rattachement abandonnée :", error);
  }
  return notified;
};

// --- Rappel d'une échéance ------------------------------------------------

export interface DueReminder {
  card: { id: Id; text: string };
  /** Ce que dit le rappel : « vous rappelle l'échéance du 5 octobre à 17:00 ». */
  message: string;
  recipients: Id[];
  /** La racine de l'application (MILO_PUBLIC_URL) ; vide, l'e-mail ne part pas. */
  base: string;
}

/**
 * Le rappel d'une échéance : il vient de Milo, pas d'une personne. Une
 * notification à l'écran et un e-mail à chaque acteur de la carte qui la voit
 * encore. Ne lève jamais.
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
        console.error("Rappel d'échéance non remis :", error);
      });
    }
  } catch (error) {
    console.error("Rappel d'échéance abandonné :", error);
  }
};

// --- Assignation d'un ticket ------------------------------------------------

export interface Assignment {
  /** La demande, son numéro de ticket et son objet. */
  request: { id: Id; number: number; subject: string };
  /** Les comptes qui viennent d'y être assignés. */
  recipients: UserRow[];
  author: UserRow;
  base: string;
}

/**
 * Une personne assignée à des demandes : une notification à l'écran par
 * demande, tout de suite, et un seul e-mail par personne qui les liste
 * toutes — assigner dix tickets d'un coup n'envoie pas dix e-mails.
 * On ne se prévient pas soi-même. Ne lève jamais : l'assignation est déjà
 * enregistrée.
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
          // Une seule demande : le lien l'ouvre. Plusieurs : il ouvre Milo,
          // où elles attendent dans le mode Support.
          action: { url: nounPhrase ? link : base, label: "Ouvrir dans Milo" },
          footer: "Vous recevez ce message parce qu'un ticket vous a été assigné dans Milo.",
        }),
      }).catch((error: unknown) => {
        console.error("Notification d'assignation non remise :", error);
      });
    }
  } catch (error) {
    console.error("Notification d'assignation abandonnée :", error);
  }
};

// --- Suppressions ----------------------------------------------------------
//
// Supprimer un élément prévient ceux qui s'y trouvaient engagés : les autres
// acteurs d'un projet ou d'un ticket, et ceux qui les suivent ;
// dans le mode Tâches, ceux qui suivent la carte, la liste ou le tableau. La
// notification passe à l'écran et se range dans « Notifications », sans
// e-mail : ce qu'elle annonce est fait, et un lien n'ouvrirait plus rien.
//
// Les destinataires se lisent AVANT la suppression : après, les acteurs et
// les cartes sont partis avec l'élément.

/** Une requête sur un seul élément, nommé « @id » autant de fois qu'il le faut. */
const idsOf = (sql: string) => {
  const query = selection<{ user_id: Id }>(sql);
  return (id: Id): Id[] => query.all({ id }).map((l) => l.user_id);
};

/** Qui est concerné par un élément, pour lui annoncer sa suppression. */
export const concerned = {
  /** Les acteurs du projet et ceux qui le suivent. */
  project: idsOf(
    `SELECT user_id FROM project_actors WHERE project_id = @id
     UNION SELECT user_id FROM follows WHERE kind = 'project' AND target_id = @id`,
  ),
  /** Les acteurs de la demande et ceux qui la suivent. */
  request: idsOf(
    `SELECT user_id FROM support_request_actors WHERE request_id = @id
     UNION SELECT user_id FROM follows WHERE kind = 'support' AND target_id = @id`,
  ),
  /** Ceux qui suivent la carte, et ceux qui suivent sa liste. */
  card: idsOf(
    `SELECT user_id FROM follows WHERE kind = 'card' AND target_id = @id
     UNION SELECT user_id FROM follows
      WHERE kind = 'list' AND target_id = (SELECT list_id FROM task_cards WHERE id = @id)`,
  ),
  /** Ceux qui suivent la liste, et ceux qui suivent l'une de ses cartes. */
  list: idsOf(
    `SELECT user_id FROM follows WHERE kind = 'list' AND target_id = @id
     UNION SELECT user_id FROM follows
      WHERE kind = 'card' AND target_id IN (SELECT id FROM task_cards WHERE list_id = @id)`,
  ),
  /** Ceux qui suivent l'une des listes du tableau, ou l'une de ses cartes. */
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
  /** La famille de l'élément : « card » vaut pour tout le mode Tâches. */
  kind: NotificationKind;
  targetId: Id;
  /** Le nom de l'élément touché. */
  title: string;
  /** Ce qui a été supprimé, à la troisième personne : « a supprimé le projet ». */
  message: string;
  author: Author;
  /** Les comptes à prévenir, lus avant la suppression (voir `concernes`). */
  recipients: Id[];
  /**
   * Vrai quand c'est l'élément lui-même qui disparaît. Faux quand c'est une
   * partie de lui — un commentaire, une pièce jointe — : il s'ouvre toujours.
   */
  vanished: boolean;
}

/** Annonce une suppression. Ne lève jamais : la suppression est déjà faite. */
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
    console.error("Notification de suppression abandonnée :", error);
  }
};

/** Le nom d'un ticket, tel que les notifications l'affichent. */
export const requestTitle = (request: { number: number; subject: string }): string =>
  `${supportTicketRef(request.number)}${request.subject ? ` — ${request.subject}` : ""}`;
