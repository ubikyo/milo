// Les tickets : leur contexte, leurs acteurs, leurs étiquettes et
// leur fil. Les étiquettes, elles, sont communes à tous les contextes.
//
// Une demande pend à un contexte d'un tableau : celui que la liste des
// demandes associe à la boîte où elle est arrivée, ou celui qu'on a choisi en
// la saisissant. Ses acteurs et ses étiquettes se posent comme les membres et
// les étiquettes d'une carte : autant qu'il faut, par une table d'association.

import { parseAttachments } from "../lib/ticket-files.js";
import { MILO_ACTOR, SUPPORT_URGENCY_LABELS, supportTicketRef } from "@milo/shared";
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
import { actorOf } from "./users.js";

export const REQUEST_NOT_FOUND = "Demande introuvable";
export const SUPPORT_LABEL_NOT_FOUND = "Étiquette introuvable";

export const supportRequests = {
  byId: selection<SupportRequestRow>("SELECT * FROM support_requests WHERE id = ?"),
  /**
   * Les demandes d'un tableau — de l'un de ses contextes, ou de tous —, de la
   * plus récente à la plus ancienne.
   */
  ofBoard: selection<SupportRequestRow>(
    `SELECT * FROM support_requests
     WHERE board_id = @board AND (@context IS NULL OR context_id = @context)
     ORDER BY created_at DESC, id DESC`,
  ),
  all: selection<SupportRequestRow>(
    "SELECT * FROM support_requests ORDER BY created_at DESC, id DESC",
  ),
  create: mutation(
    `INSERT INTO support_requests
       (number, board_id, context_id, list_key, subject, status, due_date, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ),
  // Une demande née d'un e-mail : elle en garde la boîte, l'expéditeur et
  // l'identifiant. « OR IGNORE » : un message déjà importé — deux relèves qui
  // se croisent — ne fait pas une seconde demande.
  createFromMail: mutation(
    `INSERT OR IGNORE INTO support_requests
       (number, board_id, context_id, list_key, mailbox, subject, status, due_date,
        sender_name, sender_email, mail_id, conversation_id, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ),
  // Une boîte reçue par plusieurs listes y fait une demande par liste : ce
  // qu'on cherche d'un e-mail se cherche dans sa boîte et dans sa liste.
  byMailId: selection<{ id: Id }>(
    `SELECT id FROM support_requests
     WHERE mailbox = ? COLLATE NOCASE AND list_key = ? AND mail_id = ?`,
  ),
  /**
   * La demande d'une boîte qu'un e-mail cite, par l'identifiant Internet de
   * son e-mail d'origine ou de l'un de ses messages — reçu, ou parti de Milo.
   * C'est ainsi qu'une réponse retrouve son ticket.
   */
  citedByMail: selection<SupportRequestRow>(
    `SELECT * FROM support_requests
     WHERE mailbox = ? COLLATE NOCASE AND list_key = ? AND (
       mail_id = ? OR id IN (SELECT request_id FROM support_comments WHERE mail_id = ?)
     )
     ORDER BY id DESC LIMIT 1`,
  ),
  /** La demande d'une boîte née dans cette conversation de Graph. */
  ofConversation: selection<SupportRequestRow>(
    `SELECT * FROM support_requests
     WHERE mailbox = ? COLLATE NOCASE AND list_key = ?
       AND conversation_id = ? AND conversation_id != ''
     ORDER BY id DESC LIMIT 1`,
  ),
  /**
   * La demande qui porte ce numéro de ticket : arrivée dans cette boîte, ou
   * saisie — ses réponses sont parties de l'adresse d'envoi.
   */
  byNumber: selection<SupportRequestRow>(
    `SELECT * FROM support_requests
     WHERE ((mailbox = ? COLLATE NOCASE AND list_key = ?) OR mailbox = '') AND number = ?`,
  ),
  /** Un e-mail déjà rangé dans un fil de la boîte : il ne s'importe pas deux fois. */
  mailAlreadyFiled: selection<{ id: Id }>(
    `SELECT support_comments.id FROM support_comments
     JOIN support_requests ON support_requests.id = support_comments.request_id
     WHERE support_requests.mailbox = ? COLLATE NOCASE AND support_requests.list_key = ?
       AND support_comments.mail_id = ?`,
  ),
  /** Les demandes nées d'un e-mail de cet objet, parti de cette adresse. */
  createdBySend: selection<{ id: Id }>(
    `SELECT id FROM support_requests
     WHERE subject = ? AND sender_email = ? COLLATE NOCASE AND mail_id != ''`,
  ),
  /** Cet e-mail est-il déjà dans le fil de cette demande ? */
  mailInThread: selection<{ id: Id }>(
    "SELECT id FROM support_comments WHERE request_id = ? AND mail_id = ?",
  ),
  /** Une réponse de l'expéditeur rouvre une demande qu'on croyait close. */
  reopen: mutation(
    `UPDATE support_requests SET status = ?, updated_at = ?
     WHERE id = ? AND status IN ('resolved', 'closed')`,
  ),
  // Le contexte en fait partie : il se change depuis la fiche, pour un autre
  // du même tableau.
  update: mutation(
    `UPDATE support_requests SET context_id = ?, subject = ?, status = ?, due_date = ?, updated_at = ?
     WHERE id = ?`,
  ),
  remove: mutation("DELETE FROM support_requests WHERE id = ?"),
  touch: mutation("UPDATE support_requests SET updated_at = ? WHERE id = ?"),
  /** Le statut que choisit le bouton d'envoi d'une réponse. */
  setStatus: mutation("UPDATE support_requests SET status = ?, updated_at = ? WHERE id = ?"),
};

// --- Numéros de ticket -----------------------------------------------------

/**
 * Le numéro du prochain ticket : la prochaine référence, commune aux demandes,
 * aux projets et aux cartes (repositories/references.ts).
 */
export const nextTicketNumber = nextReference;

export const supportLabels = {
  byId: selection<SupportLabelRow>("SELECT * FROM support_labels WHERE id = ?"),
  // Toutes : elles sont communes à tout le support.
  all: selection<SupportLabelRow>("SELECT * FROM support_labels ORDER BY position, id"),
  nextPosition: scalar<NextRow>(
    "SELECT COALESCE(MAX(position), -1) + 1 AS next FROM support_labels",
  ),
  create: mutation(
    "INSERT INTO support_labels (name, color, weight, position, created_at) VALUES (?, ?, ?, ?, ?)",
  ),
  update: mutation("UPDATE support_labels SET name = ?, color = ?, weight = ? WHERE id = ?"),
  remove: mutation("DELETE FROM support_labels WHERE id = ?"),
  byName: selection<SupportLabelRow>(
    "SELECT * FROM support_labels WHERE name = ? COLLATE NOCASE LIMIT 1",
  ),
  usage: scalar<{ count: number }>(
    "SELECT COUNT(*) AS count FROM support_request_labels WHERE label_id = ?",
  ),
};

/**
 * L'étiquette qui porte ce nom. Si elle a disparu — renommée, supprimée —,
 * elle est recréée : une demande reçue par e-mail la porte toujours.
 */
export const namedLabel = (name: string): SupportLabelRow => {
  const already = supportLabels.byName.get(name);
  if (already) return already;
  const template = SUPPORT_URGENCY_LABELS.find((l) => l.name === name);
  const { next } = supportLabels.nextPosition();
  const { lastInsertRowid } = supportLabels.create.run(
    name,
    template?.color ?? "red.6",
    template?.weight ?? 0,
    next,
    new Date().toISOString(),
  );
  return supportLabels.byId.get(lastInsertRowid)!;
};

const prioritiesByWeight = selection<SupportLabelRow>(
  `SELECT * FROM support_labels
   WHERE name COLLATE NOCASE IN (SELECT value FROM json_each(?))
   ORDER BY weight, position, id
   LIMIT 1`,
);

/**
 * Celle des étiquettes d'urgence qui pèse le moins, telle que les poids ont
 * été réglés. S'il n'en reste aucune, la plus légère du modèle est recréée.
 */
export const lightestPriority = (): SupportLabelRow => {
  const names = SUPPORT_URGENCY_LABELS.map((l) => l.name);
  const foundItem = prioritiesByWeight.get(JSON.stringify(names));
  if (foundItem) return foundItem;
  const template = [...SUPPORT_URGENCY_LABELS].sort((a, b) => a.weight - b.weight)[0]!;
  return namedLabel(template.name);
};

// --- Acteurs d'une demande -------------------------------------------------

const deleteActors = mutation("DELETE FROM support_request_actors WHERE request_id = ?");
const addActor = mutation(
  `INSERT OR IGNORE INTO support_request_actors (request_id, user_id)
   SELECT ?, id FROM users WHERE id = ?`,
);

/**
 * Les acteurs d'une demande, remplacés en bloc. Un identifiant qui ne désigne
 * aucun compte est ignoré plutôt que refusé : le `SELECT` de l'insertion s'en
 * charge, comme pour les membres d'une carte.
 */
export const replaceSupportActors = transaction((requestId: Id, userIds: Id[]) => {
  deleteActors.run(requestId);
  for (const userId of userIds) addActor.run(requestId, userId);
});

/** Des acteurs ajoutés à une demande, sans retirer ceux qui y sont. */
export const addActors = transaction((requestId: Id, userIds: Id[]) => {
  for (const userId of userIds) addActor.run(requestId, userId);
});

// --- Étiquettes posées sur une demande -------------------------------------

const deleteLabels = mutation("DELETE FROM support_request_labels WHERE request_id = ?");
const addLabel = mutation(
  `INSERT OR IGNORE INTO support_request_labels (request_id, label_id)
   SELECT ?, id FROM support_labels WHERE id = ?`,
);

/**
 * Les étiquettes d'une demande, remplacées en bloc. Un identifiant qui ne
 * désigne aucune étiquette est ignoré plutôt que refusé, comme les membres
 * d'une carte.
 */
export const replaceSupportLabels = transaction((requestId: Id, labelIds: Id[]) => {
  deleteLabels.run(requestId);
  for (const labelId of labelIds) addLabel.run(requestId, labelId);
});

// --- Lecture d'un lot ------------------------------------------------------
// Les acteurs, les étiquettes et le nombre d'échanges se lisent pour tout le
// lot en trois requêtes, et non trois par demande.

type LinkedLabelRow = SupportLabel & { request_id: Id };

const requestLabels = selection<LinkedLabelRow>(
  `SELECT support_request_labels.request_id, support_labels.*
   FROM support_request_labels
   JOIN support_labels ON support_labels.id = support_request_labels.label_id
   WHERE support_request_labels.request_id IN (SELECT value FROM json_each(?))
   ORDER BY support_labels.weight DESC, support_labels.position, support_labels.id`,
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

/** Un lot de demandes, chacune avec ses acteurs, ses étiquettes et ses échanges. */
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

  // L'identifiant de l'e-mail ne sert qu'à l'import : il ne sort pas.
  return rows.map(({ mail_id: _mailId, ...request }) => ({
    ...request,
    actors: actors.get(request.id) ?? [],
    labels: labels.get(request.id) ?? [],
    comment_count: exchanges.get(request.id) ?? 0,
  }));
};

/** Une demande seule, avec ce qui l'accompagne. */
export const oneWithRelations = (row: SupportRequestRow): SupportRequest =>
  withRelations([row])[0] as SupportRequest;

// --- Fil d'une demande -----------------------------------------------------

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
  // Le message d'un e-mail reçu : un fait, comme la création — il ne se
  // retouche pas. Son auteur est le compte de l'expéditeur s'il en a un, son
  // nom et son adresse sinon. Son corps est le HTML de l'e-mail, montré tel
  // quel, et ses fichiers sont rangés avec lui.
  createFromMail: mutation(
    `INSERT INTO support_comments
       (request_id, user_id, text, system, sender_name, sender_email, mail_id, format,
        attachments, created_at, updated_at)
     VALUES (?, ?, ?, 1, ?, ?, ?, 'email', ?, ?, ?)`,
  ),
  /** Les fichiers des messages d'une demande, avant de la supprimer. */
  attachmentsOfRequest: selection<{ attachments: string }>(
    "SELECT attachments FROM support_comments WHERE request_id = ? AND attachments != '[]'",
  ),
  update: mutation("UPDATE support_comments SET text = ?, updated_at = ? WHERE id = ?"),
  // Une réponse par défaut partie d'office : sans compte, signée Milo.
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
  /** Les pièces jointes d'une réponse, en JSON. */
  setAttachments: mutation("UPDATE support_comments SET attachments = ? WHERE id = ?"),
  remove: mutation("DELETE FROM support_comments WHERE id = ?"),
};

/**
 * Un commentaire et son auteur. Celui d'un e-mail reçu d'une personne sans
 * compte n'a pas d'identifiant : il ne se choisit nulle part, il s'affiche.
 */
export const supportCommentOf = (
  row: WithAuthorColumns<SupportCommentRow>,
): SupportComment => {
  const { sender_name, sender_email, mail_id: _mailId, attachments, ...rest } = row;
  const comment = withAuthor({ ...rest, attachments: parseAttachments(attachments) });
  // Une réponse par défaut partie d'office : c'est Milo qui l'a envoyée.
  if (!comment.user_id && row.auto_event) return { ...comment, author: MILO_ACTOR };
  // Un e-mail reçu est un mot « système » sans compte : c'est l'expéditeur
  // qui le signe, pas Milo.
  if (comment.user_id || !sender_email) return comment;
  return { ...comment, author: actorOf({ id: 0, name: sender_name, email: sender_email }) };
};

export const commentsOf = (requestId: Id): SupportComment[] =>
  supportComments.ofRequest.all(requestId).map(supportCommentOf);

/** La demande et tout ce qui l'accompagne, pour son tiroir. */
export const supportRequestDetail = (row: SupportRequestRow): SupportRequestDetail => ({
  ...oneWithRelations(row),
  comments: commentsOf(row.id),
});

// --- Actions sur plusieurs demandes ----------------------------------------

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

// Ce que la demande gardée n'a pas, elle le prend de celles qu'elle absorbe :
// un objet, un expéditeur.
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
 * Ferme une demande, en le notant dans son fil. Une demande déjà fermée ne
 * l'est pas une seconde fois.
 */
export const closeRequest = (request: SupportRequestRow, author: Id, note: string): void => {
  if (request.status === "closed") return;
  const instant = new Date().toISOString();
  close.run(instant, request.id);
  supportComments.createSystem.run(request.id, author, note, instant, instant);
};

/**
 * La fusion : la demande la plus récente reste, et reçoit les échanges, les
 * acteurs et les étiquettes des autres. Celles-ci sont fermées, pas
 * supprimées — leur fil reste lisible là où il était, et dit où il est parti.
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
 * « Assigner à » : les comptes s'ajoutent aux acteurs de chaque demande, sans
 * retirer ceux qui y sont déjà. Rend, pour chaque demande, les comptes qui
 * viennent d'y arriver : ce sont eux qu'on prévient.
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
