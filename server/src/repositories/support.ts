// Tickets: their actors, labels and thread. Labels are shared by all boards.
//
// A request hangs off a context of a board: the one the request list ties to
// the inbox it arrived in, or the one chosen when entering it. Its actors and
// labels are set like a card's members and labels: as many as needed, through
// a join table.

import { parseAttachments } from "../lib/ticket-files.js";
import {
  MILO_ACTOR,
  SUPPORT_URGENCY_GROUP,
  SUPPORT_URGENCY_LABELS,
  supportTicketRef,
} from "@milo/shared";
import type {
  Actor,
  Id,
  SupportComment,
  SupportLabel,
  SupportRequest,
  SupportRequestDetail,
} from "@milo/shared";
import { mutation, scalar, selection, transaction } from "../db/query.js";
import type {
  NextRow,
  SupportCommentRow,
  SupportLabelRow,
  SupportRequestRow,
  WithAuthorColumns,
} from "../db/rows.js";
import { withAuthor } from "./comments.js";
import { nextReference } from "./references.js";
import { supportLabelGroups } from "./label-groups.js";
import { actorOf } from "./users.js";

export const REQUEST_NOT_FOUND = "Demande introuvable";
export const SUPPORT_LABEL_NOT_FOUND = "Étiquette introuvable";

export const supportRequests = {
  byId: selection<SupportRequestRow>("SELECT * FROM support_requests WHERE id = ?"),
  /** The requests of a board, from newest to oldest. */
  ofBoard: selection<SupportRequestRow>(
    `SELECT * FROM support_requests WHERE board_id = ? ORDER BY created_at DESC, id DESC`,
  ),
  all: selection<SupportRequestRow>(
    "SELECT * FROM support_requests ORDER BY created_at DESC, id DESC",
  ),
  create: mutation(
    `INSERT INTO support_requests
       (number, board_id, list_key, subject, status, due_date, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ),
  // A request born from an e-mail: it keeps the inbox, the sender and the
  // id. "OR IGNORE": an already imported message — two crossing polls — does
  // not make a second request.
  createFromMail: mutation(
    `INSERT OR IGNORE INTO support_requests
       (number, board_id, list_key, mailbox, subject, status, due_date,
        sender_name, sender_email, mail_id, conversation_id, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ),
  // An inbox received by several lists makes one request per list: what we
  // look up for an e-mail is looked up in its inbox and in its list.
  byMailId: selection<{ id: Id }>(
    `SELECT id FROM support_requests
     WHERE mailbox = ? COLLATE NOCASE AND list_key = ? AND mail_id = ?`,
  ),
  /**
   * The request of an inbox that an e-mail cites, by the Internet id of its
   * original e-mail or of one of its messages — received, or sent from Milo.
   * This is how a reply finds its ticket.
   */
  citedByMail: selection<SupportRequestRow>(
    `SELECT * FROM support_requests
     WHERE mailbox = ? COLLATE NOCASE AND list_key = ? AND (
       mail_id = ? OR id IN (SELECT request_id FROM support_comments WHERE mail_id = ?)
     )
     ORDER BY id DESC LIMIT 1`,
  ),
  /** The request of an inbox born from this Graph conversation. */
  ofConversation: selection<SupportRequestRow>(
    `SELECT * FROM support_requests
     WHERE mailbox = ? COLLATE NOCASE AND list_key = ?
       AND conversation_id = ? AND conversation_id != ''
     ORDER BY id DESC LIMIT 1`,
  ),
  /**
   * The request bearing this ticket number: arrived in this inbox, or
   * entered by hand — its replies were sent from the sending address.
   */
  byNumber: selection<SupportRequestRow>(
    `SELECT * FROM support_requests
     WHERE ((mailbox = ? COLLATE NOCASE AND list_key = ?) OR mailbox = '') AND number = ?`,
  ),
  /** An e-mail already filed in an inbox thread: it is not imported twice. */
  mailAlreadyFiled: selection<{ id: Id }>(
    `SELECT support_comments.id FROM support_comments
     JOIN support_requests ON support_requests.id = support_comments.request_id
     WHERE support_requests.mailbox = ? COLLATE NOCASE AND support_requests.list_key = ?
       AND support_comments.mail_id = ?`,
  ),
  /** The requests born from an e-mail with this subject, sent from this address. */
  createdBySend: selection<{ id: Id }>(
    `SELECT id FROM support_requests
     WHERE subject = ? AND sender_email = ? COLLATE NOCASE AND mail_id != ''`,
  ),
  /** Is this e-mail already in this request's thread? */
  mailInThread: selection<{ id: Id }>(
    "SELECT id FROM support_comments WHERE request_id = ? AND mail_id = ?",
  ),
  /** A reply from the sender reopens a request thought to be closed. */
  reopen: mutation(
    `UPDATE support_requests SET status = ?, updated_at = ?
     WHERE id = ? AND status IN ('resolved', 'closed')`,
  ),
  update: mutation(
    `UPDATE support_requests SET subject = ?, status = ?, due_date = ?, updated_at = ?
     WHERE id = ?`,
  ),
  remove: mutation("DELETE FROM support_requests WHERE id = ?"),
  touch: mutation("UPDATE support_requests SET updated_at = ? WHERE id = ?"),
  /** The status chosen by the send button of a reply. */
  setStatus: mutation("UPDATE support_requests SET status = ?, updated_at = ? WHERE id = ?"),
};

// --- Ticket numbers --------------------------------------------------------

/**
 * The number of the next ticket: the next reference, shared by requests,
 * projects and cards (repositories/references.ts).
 */
export const nextTicketNumber = nextReference;

export const supportLabels = {
  // With the name of their group: the lists title them by it.
  byId: selection<SupportLabelRow>(
    `SELECT l.*, g.name AS group_name FROM support_labels l
     LEFT JOIN support_label_groups g ON g.id = l.group_id WHERE l.id = ?`,
  ),
  // All of them: they are shared across all of support.
  all: selection<SupportLabelRow>(
    `SELECT l.*, g.name AS group_name FROM support_labels l
     LEFT JOIN support_label_groups g ON g.id = l.group_id ORDER BY l.position, l.id`,
  ),
  nextPosition: scalar<NextRow>(
    "SELECT COALESCE(MAX(position), -1) + 1 AS next FROM support_labels",
  ),
  create: mutation(
    "INSERT INTO support_labels (group_id, name, color, position, created_at) VALUES (?, ?, ?, ?, ?)",
  ),
  update: mutation("UPDATE support_labels SET name = ?, color = ? WHERE id = ?"),
  remove: mutation("DELETE FROM support_labels WHERE id = ?"),
  byName: selection<SupportLabelRow>(
    "SELECT * FROM support_labels WHERE name = ? COLLATE NOCASE LIMIT 1",
  ),
  usage: scalar<{ count: number }>(
    "SELECT COUNT(*) AS count FROM support_request_labels WHERE label_id = ?",
  ),
};

/**
 * The label with this name. If it has disappeared — renamed, deleted —, it
 * is recreated: a request received by e-mail always carries it.
 */
export const namedLabel = (name: string): SupportLabelRow => {
  const already = supportLabels.byName.get(name);
  if (already) return already;
  const template = SUPPORT_URGENCY_LABELS.find((l) => l.name === name);
  // An urgency goes back among the urgencies.
  const group = template
    ? supportLabelGroups.named(undefined, SUPPORT_URGENCY_GROUP)
    : supportLabelGroups.groupFor(undefined, null);
  const { next } = supportLabels.nextPosition();
  const { lastInsertRowid } = supportLabels.create.run(
    group,
    name,
    template?.color ?? "red.6",
    next,
    new Date().toISOString(),
  );
  supportLabelGroups.renumber(undefined);
  return supportLabels.byId.get(lastInsertRowid)!;
};

/** A label rewritten, and moved to the end of its new group if it changes. */
export const updateSupportLabel = transaction(
  (
    existing: SupportLabelRow,
    { name, color, group }: { name: string; color: string; group: Id },
  ) => {
    supportLabels.update.run(name, color, existing.id);
    if (group !== existing.group_id) supportLabelGroups.moveTo(existing.id, group, undefined);
  },
);

const firstPriority = selection<SupportLabelRow>(
  `SELECT * FROM support_labels
   WHERE name COLLATE NOCASE IN (SELECT value FROM json_each(?))
   ORDER BY position, id
   LIMIT 1`,
);

/**
 * The least urgent label: the first urgency in the labels' order. If none is
 * left, the model's first one is recreated.
 */
export const lightestPriority = (): SupportLabelRow => {
  const names = SUPPORT_URGENCY_LABELS.map((l) => l.name);
  const foundItem = firstPriority.get(JSON.stringify(names));
  if (foundItem) return foundItem;
  return namedLabel(SUPPORT_URGENCY_LABELS[0].name);
};

// --- Request actors --------------------------------------------------------

const deleteActors = mutation("DELETE FROM support_request_actors WHERE request_id = ?");
const addActor = mutation(
  `INSERT OR IGNORE INTO support_request_actors (request_id, user_id)
   SELECT ?, id FROM users WHERE id = ?`,
);

/**
 * The actors of a request, replaced as a whole. An id that designates no
 * account is ignored rather than rejected: the insertion's `SELECT` takes
 * care of it, as for a card's members.
 */
export const replaceSupportActors = transaction((requestId: Id, userIds: Id[]) => {
  deleteActors.run(requestId);
  for (const userId of userIds) addActor.run(requestId, userId);
});

/** Actors added to a request, without removing those already there. */
export const addActors = transaction((requestId: Id, userIds: Id[]) => {
  for (const userId of userIds) addActor.run(requestId, userId);
});

// --- Labels set on a request -----------------------------------------------

const deleteLabels = mutation("DELETE FROM support_request_labels WHERE request_id = ?");
const addLabel = mutation(
  `INSERT OR IGNORE INTO support_request_labels (request_id, label_id)
   SELECT ?, id FROM support_labels WHERE id = ?`,
);

/**
 * The labels of a request, replaced as a whole. An id that designates no
 * label is ignored rather than rejected, like a card's members.
 */
export const replaceSupportLabels = transaction((requestId: Id, labelIds: Id[]) => {
  deleteLabels.run(requestId);
  for (const labelId of labelIds) addLabel.run(requestId, labelId);
});

/** One more label on a request: the context it was created in. */
export const addSupportLabel = (requestId: Id, labelId: Id): void => {
  addLabel.run(requestId, labelId);
};

// --- Reading a batch -------------------------------------------------------
// Actors, labels and the number of exchanges are read for the whole batch in
// three queries, not three per request.

type LinkedLabelRow = SupportLabel & { request_id: Id };

const requestLabels = selection<LinkedLabelRow>(
  `SELECT support_request_labels.request_id, support_labels.*
   FROM support_request_labels
   JOIN support_labels ON support_labels.id = support_request_labels.label_id
   WHERE support_request_labels.request_id IN (SELECT value FROM json_each(?))
   ORDER BY support_labels.position, support_labels.id`,
);

const requestActors = selection<{ request_id: Id; id: Id; name: string; email: string }>(
  `SELECT support_request_actors.request_id, users.id, users.name, users.email
   FROM support_request_actors
   JOIN users ON users.id = support_request_actors.user_id
   WHERE support_request_actors.request_id IN (SELECT value FROM json_each(?))
   ORDER BY users.name`,
);

const requestExchanges = selection<{ request_id: Id; count: number }>(
  `SELECT request_id, COUNT(*) AS count
   FROM support_comments
   WHERE request_id IN (SELECT value FROM json_each(?))
   GROUP BY request_id`,
);

/** A batch of requests, each with its actors, labels and exchanges. */
export const withRelations = (rows: SupportRequestRow[]): SupportRequest[] => {
  if (rows.length === 0) return [];
  const ids = JSON.stringify(rows.map((r) => r.id));

  const actors = new Map<Id, Actor[]>();
  for (const row of requestActors.all(ids)) {
    const already = actors.get(row.request_id);
    if (already) already.push(actorOf(row));
    else actors.set(row.request_id, [actorOf(row)]);
  }

  const labels = new Map<Id, SupportLabel[]>();
  for (const { request_id, ...label } of requestLabels.all(ids)) {
    const already = labels.get(request_id);
    if (already) already.push(label);
    else labels.set(request_id, [label]);
  }

  const exchanges = new Map<Id, number>();
  for (const row of requestExchanges.all(ids)) exchanges.set(row.request_id, row.count);

  // The e-mail id is only used for import: it does not go out.
  return rows.map(({ mail_id: _mailId, ...request }) => ({
    ...request,
    actors: actors.get(request.id) ?? [],
    labels: labels.get(request.id) ?? [],
    comment_count: exchanges.get(request.id) ?? 0,
  }));
};

/** A single request, with what comes with it. */
export const oneWithRelations = (row: SupportRequestRow): SupportRequest =>
  withRelations([row])[0] as SupportRequest;

// --- A request's thread ----------------------------------------------------

const SUPPORT_COMMENT_SELECT = `
  SELECT support_comments.*, users.name AS author_name, users.email AS author_email
  FROM support_comments
  LEFT JOIN users ON users.id = support_comments.user_id
`;

export const supportComments = {
  byId: selection<WithAuthorColumns<SupportCommentRow>>(
    `${SUPPORT_COMMENT_SELECT} WHERE support_comments.id = ?`,
  ),
  ofRequest: selection<WithAuthorColumns<SupportCommentRow>>(
    `${SUPPORT_COMMENT_SELECT} WHERE support_comments.request_id = ?
     ORDER BY support_comments.created_at ASC, support_comments.id ASC`,
  ),
  create: mutation(
    `INSERT INTO support_comments (request_id, user_id, text, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?)`,
  ),
  createSystem: mutation(
    `INSERT INTO support_comments (request_id, user_id, text, system, created_at, updated_at)
     VALUES (?, ?, ?, 1, ?, ?)`,
  ),
  // The message of a received e-mail: a fact, like the creation — it is not
  // edited. Its author is the sender's account if there is one, otherwise
  // their name and address. Its body is the e-mail's HTML, shown as is, and
  // its files are stored with it.
  createFromMail: mutation(
    `INSERT INTO support_comments
       (request_id, user_id, text, system, sender_name, sender_email, mail_id, format,
        attachments, created_at, updated_at)
     VALUES (?, ?, ?, 1, ?, ?, ?, 'email', ?, ?, ?)`,
  ),
  /** The files of a request's messages, before deleting it. */
  attachmentsOfRequest: selection<{ attachments: string }>(
    "SELECT attachments FROM support_comments WHERE request_id = ? AND attachments != '[]'",
  ),
  update: mutation("UPDATE support_comments SET text = ?, updated_at = ? WHERE id = ?"),
  // A default reply sent automatically: with no account, signed Milo.
  createAuto: mutation(
    `INSERT INTO support_comments (request_id, user_id, text, auto_event, created_at, updated_at)
     VALUES (?, NULL, ?, ?, ?, ?)`,
  ),
  createInternal: mutation(
    `INSERT INTO support_comments (request_id, user_id, text, internal, created_at, updated_at)
     VALUES (?, ?, ?, 1, ?, ?)`,
  ),
  setMailStatus: mutation("UPDATE support_comments SET mail_status = ?, mail_to = ? WHERE id = ?"),
  setMailCopies: mutation("UPDATE support_comments SET mail_cc = ?, mail_bcc = ? WHERE id = ?"),
  /** The attachments of a reply, as JSON. */
  setAttachments: mutation("UPDATE support_comments SET attachments = ? WHERE id = ?"),
  remove: mutation("DELETE FROM support_comments WHERE id = ?"),
};

/**
 * A comment and its author. That of an e-mail received from a person with no
 * account has no id: it is not chosen anywhere, it is just displayed.
 */
export const supportCommentOf = (
  row: WithAuthorColumns<SupportCommentRow>,
): SupportComment => {
  const { sender_name, sender_email, mail_id: _mailId, attachments, ...rest } = row;
  const comment = withAuthor({ ...rest, attachments: parseAttachments(attachments) });
  // A default reply sent automatically: it is Milo that sent it.
  if (!comment.user_id && row.auto_event) return { ...comment, author: MILO_ACTOR };
  // A received e-mail is a "system" note with no account: the sender signs
  // it, not Milo.
  if (comment.user_id || !sender_email) return comment;
  return { ...comment, author: actorOf({ id: 0, name: sender_name, email: sender_email }) };
};

export const commentsOf = (requestId: Id): SupportComment[] =>
  supportComments.ofRequest.all(requestId).map(supportCommentOf);

/** The request and everything that comes with it, for its drawer. */
export const supportRequestDetail = (row: SupportRequestRow): SupportRequestDetail => ({
  ...oneWithRelations(row),
  comments: commentsOf(row.id),
});

// --- Actions on several requests -------------------------------------------

const close = mutation(
  "UPDATE support_requests SET status = 'closed', updated_at = ? WHERE id = ?",
);

const copyThread = mutation(
  `INSERT INTO support_comments
     (request_id, user_id, text, system, sender_name, sender_email, mail_status, mail_to,
      mail_cc, mail_bcc, internal, mail_id, format, attachments, created_at, updated_at)
   SELECT ?, user_id, text, system, sender_name, sender_email, mail_status, mail_to,
          mail_cc, mail_bcc, internal, mail_id, format, attachments, created_at, updated_at
   FROM support_comments WHERE request_id = ?
     -- Les mots de Milo — création, modifications — racontent la demande
     -- absorbée, pas celle qui la reçoit : ils restent chez elle.
     AND NOT (system = 1 AND user_id IS NULL AND sender_email = '' AND format = '')`,
);

const carryActors = mutation(
  `INSERT OR IGNORE INTO support_request_actors (request_id, user_id)
   SELECT ?, user_id FROM support_request_actors WHERE request_id = ?`,
);

const carryLabels = mutation(
  `INSERT OR IGNORE INTO support_request_labels (request_id, label_id)
   SELECT ?, label_id FROM support_request_labels WHERE request_id = ?`,
);

// What the kept request lacks, it takes from those it absorbs: a subject, a
// sender.
const completeText = mutation(
  `UPDATE support_requests SET
     subject = CASE WHEN subject = '' THEN :subject ELSE subject END,
     sender_name = CASE WHEN sender_email = '' THEN :sender_name ELSE sender_name END,
     sender_email = CASE WHEN sender_email = '' THEN :sender_email ELSE sender_email END
   WHERE id = :id`,
);

const actorsOf = selection<{ user_id: Id }>(
  "SELECT user_id FROM support_request_actors WHERE request_id = ?",
);

/**
 * Closes a request, noting it in its thread. An already closed request is
 * not closed a second time.
 */
export const closeRequest = (request: SupportRequestRow, author: Id, note: string): void => {
  if (request.status === "closed") return;
  const instant = new Date().toISOString();
  close.run(instant, request.id);
  supportComments.createSystem.run(request.id, author, note, instant, instant);
};

/**
 * The merge: the most recent request stays, and receives the exchanges,
 * actors and labels of the others. Those are closed, not deleted — their
 * thread stays readable where it was, and says where it went.
 */
export const mergeRequests = transaction(
  (keptRequest: SupportRequestRow, others: SupportRequestRow[], author: Id, whenLabel: string) => {
    for (const other of others) {
      completeText.run({
        id: keptRequest.id,
        subject: other.subject,
        sender_name: other.sender_name,
        sender_email: other.sender_email,
      });
      copyThread.run(keptRequest.id, other.id);
      carryActors.run(keptRequest.id, other.id);
      carryLabels.run(keptRequest.id, other.id);
      closeRequest(other, author, `Fusionnée dans ${supportTicketRef(keptRequest.number)} le ${whenLabel}`);
    }
    const instant = new Date().toISOString();
    supportComments.createSystem.run(
      keptRequest.id,
      author,
      `${others.map((a) => supportTicketRef(a.number)).join(", ")} ${
        others.length > 1 ? "fusionnées" : "fusionnée"
      } ici le ${whenLabel}`,
      instant,
      instant,
    );
    supportRequests.touch.run(instant, keptRequest.id);
  },
);

/**
 * "Assigner à": the accounts are added to each request's actors, without
 * removing those already there. Returns, for each request, the accounts that
 * just arrived: they are the ones to notify.
 */
export const assignRequests = transaction(
  (requests: SupportRequestRow[], userIds: Id[]): Map<Id, Id[]> => {
    const arrivals = new Map<Id, Id[]>();
    const instant = new Date().toISOString();
    for (const request of requests) {
      const already = new Set(actorsOf.all(request.id).map((r) => r.user_id));
      const newItems: Id[] = [];
      for (const userId of userIds) {
        if (already.has(userId)) continue;
        if (addActor.run(request.id, userId).changes) newItems.push(userId);
      }
      if (newItems.length) {
        supportRequests.touch.run(instant, request.id);
        arrivals.set(request.id, newItems);
      }
    }
    return arrivals;
  },
);
