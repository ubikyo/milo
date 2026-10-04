// Le mode Support : ses demandes, leur fil, et les étiquettes qu'elles
// portent.
//
// Une demande pend à une société — celle de la liste déroulante de l'entête —
// et non à un tableau : il n'y a donc rien de privé ici, chacun voit les
// demandes des sociétés qu'il consulte.
//
// Les étiquettes ne passent pas par la fabrique de « routes/labels.ts » :
// celle-ci ne parle que de tableaux, et sait les copier de l'un à l'autre.
// Celles du support sont communes à toutes les sociétés et ne se copient pas.

import {
  SEND_SIZE_MAX,
  SEND_SIZE_MAX_MB,
  TICKET_SIZE_MAX,
  writeTicket,
  filesOf,
  uploadedFiles,
  forgetFiles,
} from "../lib/ticket-files.js";
import express, { Router } from "express";
import type { Request } from "express";
import {
  DEFAULT_SUPPORT_STATUS,
  SUPPORT_STATUSES,
  isSupportStatus,
  isLabelColor,
  DEFAULT_LABEL_COLOR,
  supportTicketRef,
} from "@milo/shared";
import type { Id, Right, SupportStatus } from "@milo/shared";
import { transaction } from "../db/query.js";
import type { SupportRequestRow, UserRow } from "../db/rows.js";
import { readableBoard, boards, openBoard } from "../repositories/boards.js";
import { boardContext, contexts } from "../repositories/contexts.js";
import { keyInBoard } from "../repositories/listes.js";
import {
  concerned,
  notify,
  notifyAssignments,
  notifyDeletion,
  root,
  requestTitle,
} from "../lib/notify.js";
import {
  badRequest,
  conflict,
  forbidden,
  notFound,
  orNotFound,
  refuseIfUsed,
  requireText,
  toIds,
} from "../lib/http.js";
import { require, requestCan } from "../lib/droits.js";
import { accountPerson, senderPerson } from "../lib/support-variables.js";
import { cleanDescription } from "../lib/html.js";
import {
  quote,
  logAction,
  date,
  changes,
  eventLine,
  list,
  editMessage,
} from "../lib/historique.js";
import type { Field } from "../lib/historique.js";
import { pollMailboxes } from "../lib/support-mail.js";
import { replyByEmail } from "../lib/support-reply.js";
import { sendAutoReply, statusEvent } from "../lib/support-auto-reply.js";
import { due, timestamp, now } from "../lib/time.js";
import { touch } from "../middleware/events.js";
import { SYSTEM_COMMENT, creationNote } from "../repositories/comments.js";
import { receivedOrder, arrangeSupportLabels } from "../repositories/reorder.js";
import {
  REQUEST_NOT_FOUND,
  SUPPORT_LABEL_NOT_FOUND,
  assignRequests,
  closeRequest,
  mergeRequests,
  addActors,
  oneWithRelations,
  nextTicketNumber,
  replaceSupportActors,
  replaceSupportLabels,
  supportCommentOf,
  supportComments,
  supportLabels,
  supportRequestDetail,
  supportRequests,
  withRelations,
} from "../repositories/support.js";
import { users } from "../repositories/users.js";

const COMMENT_NOT_FOUND = "Commentaire introuvable";


/** Le statut reçu. Une valeur inconnue est refusée plutôt que corrigée. */
const requestedStatus = (value: unknown, defaultValue: SupportStatus): SupportStatus => {
  if (value === undefined) return defaultValue;
  if (!isSupportStatus(value)) badRequest("Statut inconnu");
  return value as SupportStatus;
};

export const supportRequestRoutes = Router();

supportRequestRoutes.use(touch("support-requests"));

/** La demande visée, si elle existe. */
const request = (id: unknown) => orNotFound(supportRequests.byId.get(id), REQUEST_NOT_FOUND);

/**
 * La demande, si l'on voit le support et le tableau de son contexte — et
 * qu'on y a `droit` quand on y écrit. Répondre, commenter, assigner, fermer : c'est la
 * modifier.
 */
const requestFor = (req: Request, id: unknown, right: Right = "view"): SupportRequestRow => {
  const d = request(id);
  require(req, "support", "view", REQUEST_NOT_FOUND);
  if (!readableBoard(boards.byId.get(d.board_id), req.user)) {
    notFound(REQUEST_NOT_FOUND);
  }
  if (right !== "view") require(req, "support", right);
  return d;
};

/**
 * Une demande a changé : ceux qui la suivent et ses acteurs en sont prévenus
 * — sauf `sauf`, que l'assignation vient de prévenir.
 */
const updatedRequest = (req: Request, requestId: Id, message: string, except: Id[] = []): void => {
  const d = supportRequests.byId.get(requestId);
  if (!d) return;
  notify({
    kind: "support",
    targetId: d.id,
    title: requestTitle(d),
    message,
    author: req.user,
    base: root(req),
    except,
  });
};

const statusLabel = (value: string): string =>
  SUPPORT_STATUSES.find((s) => s.value === value)?.label ?? value;

/** Ce que le fil note d'une demande quand elle change (lib/historique.ts). */
const photo = (requestId: Id): Field[] => {
  const d = oneWithRelations(request(requestId));
  return [
    {
      label: "Contexte",
      value: quote(d.context_id ? contexts.byId.get(d.context_id)?.name : null),
    },
    { label: "Objet", value: quote(d.subject) },
    { label: "Statut", value: statusLabel(d.status) },
    { label: "Échéance", value: date(d.due_date) },
    { label: "Acteurs", value: list(d.actors.map((a) => a.name)) },
    { label: "Étiquettes", value: list(d.labels.map((l) => l.name)) },
  ];
};

/**
 * Des demandes vont être supprimées : leurs acteurs et ceux qui les suivent,
 * lus tant qu'ils sont là, sont prévenus une fois la suppression faite.
 */
const announceDeletions = (req: Request, requests: SupportRequestRow[]): (() => void) => {
  const announcements = requests.map((d) => ({ d, recipients: concerned.request(d.id) }));
  return () => {
    for (const { d, recipients } of announcements) {
      notifyDeletion({
        kind: "support",
        targetId: d.id,
        title: requestTitle(d),
        message: "a supprimé la demande",
        author: req.user,
        recipients,
        vanished: true,
      });
    }
  };
};

// Les demandes d'un tableau — de l'un de ses contextes, ou de tous —, quel que
// soit leur statut.
supportRequestRoutes.get("/", (req, res) => {
  if (!requestCan(req, "support", "view")) return void res.json([]);
  const board = openBoard(req.query.board, req.user);
  const context = req.query.context;
  res.json(
    withRelations(
      supportRequests.ofBoard.all({
        board: board.id,
        context: context && context !== "all" ? boardContext(board.id, context) : null,
      }),
    ),
  );
});

// La relève des boîtes de support, à la demande : le mode s'ouvre dessus, sans
// attendre la prochaine relève périodique. Elle signale elle-même les demandes
// créées ; une relève qui n'apporte rien ne fait rien relire aux clients.
supportRequestRoutes.post("/sync", (req, res, next) => {
  require(req, "support", "view");
  res.locals.touched?.clear();
  pollMailboxes()
    .then((created) => res.json({ created }))
    .catch(next);
});

// --- Actions sur les demandes cochées --------------------------------------
// Toutes prennent la liste des demandes cochées. Une demande qui n'existe plus
// — supprimée par quelqu'un d'autre entre-temps — fait refuser le tout : on
// n'agit pas sur une sélection qui n'est plus celle qu'on a vue.

/**
 * Les demandes cochées, toutes existantes, sans doublon — et toutes où l'on
 * a ce droit.
 */
const checked = (req: Request, value: unknown, right: Right): SupportRequestRow[] => {
  const ids = [...new Set(toIds(value))];
  if (ids.length === 0) badRequest("Aucune demande sélectionnée");
  return ids.map((id) => requestFor(req, id, right));
};

// Fusionner : la plus récente reste et reçoit les échanges des autres, qui
// sont fermées. Elles doivent appartenir au même contexte — une demande ne
// change pas de contexte en cachette.
supportRequestRoutes.post("/merge", (req, res) => {
  const requests = checked(req, req.body.ids, "update");
  if (requests.length < 2) badRequest("Sélectionnez au moins deux demandes à fusionner");
  if (new Set(requests.map((d) => d.context_id)).size > 1) {
    badRequest("Seules des demandes d'un même contexte peuvent être fusionnées");
  }

  const [keptRequest, ...others] = [...requests].sort((a, b) =>
    a.created_at === b.created_at ? b.id - a.id : a.created_at < b.created_at ? 1 : -1,
  ) as [SupportRequestRow, ...SupportRequestRow[]];
  const before = new Map(requests.map((d) => [d.id, photo(d.id)]));
  mergeRequests(keptRequest, others, req.user.id, timestamp(now()));

  // Chaque fil note la fusion, signé Milo : celle qui reste, ce qu'elle a
  // reçu — les tickets absorbés, et l'objet, les acteurs, les étiquettes
  // qu'ils lui apportent ; les autres, où elles sont parties.
  const refs = others.map((a) => supportTicketRef(a.number));
  logAction("support", keptRequest.id, req.user, [
    eventLine("Fusion", `${refs.join(", ")} ${refs.length > 1 ? "fusionnées" : "fusionnée"} ici`),
    ...changes(before.get(keptRequest.id)!, photo(keptRequest.id)),
  ]);
  for (const other of others) {
    logAction("support", other.id, req.user, [
      eventLine("Fusion", `fusionnée dans ${supportTicketRef(keptRequest.number)}`),
      ...changes(before.get(other.id)!, photo(other.id)),
    ]);
  }
  updatedRequest(
    req,
    keptRequest.id,
    others.length === 1
      ? `y a fusionné ${requestTitle(others[0]!)}`
      : `y a fusionné ${others.length} demandes`,
  );
  for (const other of others) {
    updatedRequest(req, other.id, `a fusionné la demande dans ${requestTitle(keptRequest)}`);
  }

  res.json(supportRequestDetail(request(keptRequest.id)));
});

supportRequestRoutes.post("/close", (req, res) => {
  const requests = checked(req, req.body.ids, "update");
  const note = `Fermée le ${timestamp(now())}`;
  transaction(() => {
    for (const d of requests) closeRequest(d, req.user.id, note);
  })();
  for (const d of requests) updatedRequest(req, d.id, "a fermé la demande");
  // L'expéditeur de chaque demande qui vient d'être fermée en est prévenu,
  // si le Paramétrage lui a donné une réponse (« Demande fermée »).
  for (const d of requests) {
    if (d.status !== "closed") void sendAutoReply(d.id, "closed");
  }
  res.status(204).end();
});

/** Les fichiers rangés pour les e-mails d'une demande. */
const requestFiles = (requestId: Id): string[] =>
  supportComments.attachmentsOfRequest
    .all(requestId)
    .flatMap(({ attachments }) => filesOf(attachments).map((f) => f.file));

supportRequestRoutes.post("/delete", (req, res) => {
  const requests = checked(req, req.body.ids, "delete");
  const files = requests.flatMap((d) => requestFiles(d.id));
  const announce = announceDeletions(req, requests);
  // Leurs étiquettes et leur fil partent avec elles, par clé étrangère.
  transaction(() => {
    for (const d of requests) supportRequests.remove.run(d.id);
  })();
  forgetFiles(files);
  announce();
  res.status(204).end();
});

// Assigner : les comptes choisis s'ajoutent aux acteurs, et ceux qui arrivent
// sur une demande en sont prévenus, à l'écran et par e-mail.
supportRequestRoutes.post("/assign", (req, res) => {
  const requests = checked(req, req.body.ids, "update");
  const accounts = [...new Set(toIds(req.body.actor_ids))]
    .map((id) => users.byId.get(id))
    .filter((u): u is UserRow => Boolean(u && !u.system));
  if (accounts.length === 0) badRequest("Choisissez au moins un acteur");

  const before = new Map(requests.map((d) => [d.id, photo(d.id)]));
  const arrivals = assignRequests(requests, accounts.map((u) => u.id));
  const byId = new Map(accounts.map((u) => [u.id, u]));
  notifyAssignments(
    requests
      .filter((d) => arrivals.has(d.id))
      .map((d) => ({
        request: d,
        recipients: arrivals.get(d.id)!.map((id) => byId.get(id)!),
        author: req.user,
        base: root(req),
      })),
  );
  for (const d of requests) {
    const newItems = arrivals.get(d.id);
    if (!newItems) continue;
    logAction("support", d.id, req.user, changes(before.get(d.id)!, photo(d.id)));
    updatedRequest(req, d.id, "a assigné la demande", newItems);
  }
  res.status(204).end();
});

supportRequestRoutes.post("/", (req, res) => {
  require(req, "support", "create");
  // Le contexte dit, ou le premier du tableau dit.
  const received = req.body.context_id ? contexts.byId.get(req.body.context_id) : undefined;
  const board = openBoard(received?.board_id ?? req.body.board_id, req.user);
  const context = boardContext(board.id, received?.id);

  // Lus avant de prendre un numéro : une saisie refusée n'en consomme pas.
  const status = requestedStatus(req.body.status, DEFAULT_SUPPORT_STATUS);
  const dueDate = due(req.body.due_date, "");

  const timestamp = now();
  const { lastInsertRowid } = supportRequests.create.run(
    nextTicketNumber(),
    board.id,
    context,
    // Le widget « Tickets » d'où elle est saisie, à défaut le
    // premier du tableau.
    keyInBoard(board.id, "support.list", req.body.list_key),
    String(req.body.subject ?? "").trim(),
    status,
    dueDate,
    timestamp,
    timestamp,
  );

  // Le fil d'une demande s'ouvre sur sa création, comme celui d'une carte.
  supportComments.createSystem.run(
    lastInsertRowid,
    null,
    creationNote("Demande créée", timestamp, req.user.id),
    timestamp,
    timestamp,
  );

  const created = request(lastInsertRowid);
  if (Array.isArray(req.body.actor_ids)) {
    replaceSupportActors(created.id, toIds(req.body.actor_ids));
    notifyNewActors(req, created.id, new Set());
  }
  if (Array.isArray(req.body.label_ids)) {
    replaceSupportLabels(created.id, toIds(req.body.label_ids));
  }

  res.status(201).json(supportRequestDetail(created));
});

// Les personnes que citent les modèles — le compte connecté, et l'expéditeur
// de la demande s'il y en a une : leurs fiches Entra. La fiche d'une réponse
// s'en sert pour poser ses contenus par défaut ; la demande, elle les connaît.
supportRequestRoutes.get("/variables", (req, res, next) => {
  const id = req.query["request"];
  const existing = id ? requestFor(req, id) : null;
  Promise.all([accountPerson(req.user), existing ? senderPerson(existing) : null])
    .then(([user, sender]) => res.json({ user, sender }))
    .catch(next);
});

supportRequestRoutes.get("/:id", (req, res) => {
  res.json(supportRequestDetail(requestFor(req, req.params.id)));
});

// Chaque champ absent du corps reste tel quel. Le contexte est modifiable,
// pour un autre du même tableau.
supportRequestRoutes.put("/:id", (req, res, next) => {
  const existing = requestFor(req, req.params.id, "update");
  const before = currentActors(existing.id);
  const photoBefore = photo(existing.id);
  const context =
    req.body.context_id === undefined
      ? existing.context_id
      : boardContext(existing.board_id, req.body.context_id);

  supportRequests.update.run(
    context,
    req.body.subject === undefined ? existing.subject : String(req.body.subject ?? "").trim(),
    requestedStatus(req.body.status, existing.status),
    due(req.body.due_date, existing.due_date),
    now(),
    existing.id,
  );

  let assigned: Id[] = [];
  if (Array.isArray(req.body.actor_ids)) {
    replaceSupportActors(existing.id, toIds(req.body.actor_ids));
    assigned = notifyNewActors(req, existing.id, before);
  }
  // Les étiquettes sont communes : une demande qui change de contexte les
  // garde.
  if (Array.isArray(req.body.label_ids)) {
    replaceSupportLabels(existing.id, toIds(req.body.label_ids));
  }

  // Ce qui a bougé se note dans les commentaires de l'équipe, signé Milo.
  // Rien n'a bougé : rien ne part.
  const rows = changes(photoBefore, photo(existing.id));
  if (rows.length) {
    logAction("support", existing.id, req.user, rows);
    updatedRequest(req, existing.id, editMessage(rows), assigned);
  }

  // Un nouveau statut envoie à l'expéditeur la réponse par défaut qui lui
  // correspond, s'il y en a une : la fiche se relit une fois partie.
  const after = request(existing.id);
  const event = after.status !== existing.status ? statusEvent(after.status) : null;
  if (!event) {
    res.json(supportRequestDetail(after));
    return;
  }
  sendAutoReply(existing.id, event)
    .then(() => res.json(supportRequestDetail(request(existing.id))))
    .catch(next);
});

supportRequestRoutes.delete("/:id", (req, res) => {
  // Ses étiquettes et son fil partent avec elle, par clé étrangère ; les
  // fichiers de ses e-mails, eux, sont effacés du disque.
  const existing = requestFor(req, req.params.id, "delete");
  const files = requestFiles(existing.id);
  const announce = announceDeletions(req, [existing]);
  supportRequests.remove.run(existing.id);
  forgetFiles(files);
  announce();
  res.status(204).end();
});

// --- Fil d'une demande -----------------------------------------------------

/**
 * Le texte d'un message : du HTML venu de l'éditeur, nettoyé de ce qu'il ne
 * sait pas produire. Un message vide est refusé.
 */
/** Une adresse e-mail, à peu près : de quoi refuser une faute de frappe. */
const ADDRESS = /^[^\s@<>,;]+@[^\s@<>,;]+\.[^\s@<>,;]+$/;

/** Les adresses en copie d'une réponse : sans doublon, et bien formées. */
const receivedAddresses = (value: unknown): string[] => {
  if (value === undefined) return [];
  if (!Array.isArray(value)) badRequest("Les adresses en copie doivent être une liste");
  const addresses = [...new Set((value as unknown[]).map((a) => String(a).trim().toLowerCase()))];
  const invalid = addresses.find((a) => !ADDRESS.test(a));
  if (invalid) badRequest(`Adresse e-mail invalide : ${invalid}`);
  return addresses;
};

const receivedMessage = (value: unknown): string => {
  const text = cleanDescription(value);
  if (!text) badRequest("Le message est vide");
  return text;
};

/**
 * Prévient ceux qui viennent d'arriver parmi les acteurs d'une demande, par le
 * geste de quelqu'un d'autre. S'ajouter soi-même ne prévient personne. Rend
 * les comptes prévenus.
 */
const notifyNewActors = (
  req: Request,
  requestId: Id,
  before: Set<Id>,
): Id[] => {
  const after = request(requestId);
  const newItems = oneWithRelations(after)
    .actors.filter((a) => !before.has(a.id) && a.id !== req.user.id)
    .map((a) => users.byId.get(a.id))
    .filter((u): u is UserRow => Boolean(u));
  if (!newItems.length) return [];
  notifyAssignments([
    { request: after, recipients: newItems, author: req.user, base: root(req) },
  ]);
  return newItems.map((u) => u.id);
};

const currentActors = (requestId: Id): Set<Id> =>
  new Set(oneWithRelations(request(requestId)).actors.map((a) => a.id));

/**
 * Déposer une pièce jointe de réponse, avant d'envoyer la réponse : le fichier
 * arrive seul, en brut, et la réponse ne porte ensuite que son nom de
 * rangement. Un fichier déposé puis jamais envoyé reste sans message.
 */
const fileBody = express.raw({ type: () => true, limit: TICKET_SIZE_MAX });

supportRequestRoutes.post("/:id/files", fileBody, (req, res) => {
  requestFor(req, req.params.id, "update");
  const content = req.body as unknown;
  if (!Buffer.isBuffer(content) || content.length === 0) badRequest("Le fichier est vide");
  const name = String(req.query["name"] ?? "").trim() || "piece-jointe";
  const mime = String(req.query["type"] ?? "") || "application/octet-stream";
  const file = writeTicket(content as Buffer, name);
  res.status(201).json({ file, name, mime, size: (content as Buffer).length });
});

supportRequestRoutes.post("/:id/comments", (req, res, next) => {
  const existing = requestFor(req, req.params.id, "update");

  // Un commentaire interne : du texte simple, entre membres de l'équipe,
  // comme ceux des cartes et des projets. Il ne part pas par e-mail.
  if (req.body.internal) {
    const text = requireText(req.body.text, "Le commentaire est vide");
    const instant = now();
    const { lastInsertRowid } = supportComments.createInternal.run(
      existing.id,
      req.user.id,
      text,
      instant,
      instant,
    );
    updatedRequest(req, existing.id, "a ajouté un commentaire");
    res.status(201).json(supportCommentOf(supportComments.byId.get(lastInsertRowid)!));
    return;
  }

  const text = receivedMessage(req.body.text);
  const copies = { cc: receivedAddresses(req.body.cc), bcc: receivedAddresses(req.body.bcc) };
  // Le bouton d'envoi dit aussi où en est la demande : en attente, résolue
  // ou fermée.
  const requestedStatus = req.body.status;
  if (requestedStatus !== undefined && !isSupportStatus(requestedStatus)) badRequest("Statut inconnu");
  // Les pièces jointes, déposées d'abord (POST /:id/files).
  const files = uploadedFiles(req.body.files);
  if (!files) badRequest("Pièce jointe introuvable");
  if (
    existing.sender_email &&
    files!.reduce((total, f) => total + f.size, 0) > SEND_SIZE_MAX
  ) {
    badRequest(`Les pièces jointes d'une réponse ne dépassent pas ${SEND_SIZE_MAX_MB} Mo au total`);
  }

  // Qui écrit sur une demande s'en occupe : il en devient acteur.
  if (!req.user.system) addActors(existing.id, [req.user.id]);

  const timestamp = now();
  const { lastInsertRowid } = supportComments.create.run(
    existing.id,
    req.user.id,
    text,
    timestamp,
    timestamp,
  );

  // Sur une demande reçue par e-mail, le message part aussi à l'expéditeur —
  // ou fait semblant, tant que les envois sont simulés. Il est enregistré
  // quoi qu'il arrive : son état dit si l'e-mail est parti.
  if (requestedStatus && requestedStatus !== existing.status) {
    supportRequests.setStatus.run(requestedStatus, timestamp, existing.id);
  }
  if (files!.length) {
    supportComments.setAttachments.run(JSON.stringify(files), lastInsertRowid);
  }
  updatedRequest(
    req,
    existing.id,
    existing.sender_email ? "a répondu par e-mail" : "a ajouté un message",
  );

  // La réponse de l'équipe d'abord, puis celle que le nouveau statut appelle :
  // l'expéditeur les reçoit dans cet ordre.
  const event = requestedStatus && requestedStatus !== existing.status ? statusEvent(requestedStatus) : null;
  replyByEmail(existing, lastInsertRowid as Id, text, copies, files!)
    .then(() => (event ? sendAutoReply(existing.id, event) : undefined))
    .then(() =>
      res.status(201).json(supportCommentOf(supportComments.byId.get(lastInsertRowid)!)),
    )
    .catch(next);
});

/** Monté sous `/api/support-comments`. */
export const supportCommentRoutes = Router();

supportCommentRoutes.use(touch("support-requests"));

supportCommentRoutes.put("/:id", (req, res) => {
  const comment = orNotFound(supportComments.byId.get(req.params.id), COMMENT_NOT_FOUND);
  if (comment.system) forbidden(SYSTEM_COMMENT);
  requestFor(req, comment.request_id, "update");
  // Chaque fil garde sa forme : texte simple pour un commentaire interne,
  // HTML nettoyé pour un échange.
  const text = comment.internal
    ? requireText(req.body.text, "Le commentaire est vide")
    : receivedMessage(req.body.text);

  // Un texte identique n'est pas une modification : la date ne bouge pas, et
  // le commentaire ne se met pas à porter « (modifié) ».
  if (text === comment.text) {
    res.json(supportCommentOf(comment));
    return;
  }

  supportComments.update.run(text, now(), comment.id);
  updatedRequest(
    req,
    comment.request_id,
    comment.internal ? "a modifié un commentaire" : "a modifié un message",
  );
  res.json(supportCommentOf(supportComments.byId.get(comment.id)!));
});

supportCommentRoutes.delete("/:id", (req, res) => {
  const comment = orNotFound(supportComments.byId.get(req.params.id), COMMENT_NOT_FOUND);
  if (comment.system) forbidden(SYSTEM_COMMENT);
  requestFor(req, comment.request_id, "update");

  supportComments.remove.run(comment.id);
  const parent = supportRequests.byId.get(comment.request_id);
  if (parent) {
    notifyDeletion({
      kind: "support",
      targetId: parent.id,
      title: requestTitle(parent),
      message: comment.internal ? "a supprimé un commentaire" : "a supprimé un message",
      author: req.user,
      recipients: concerned.request(parent.id),
      vanished: false,
    });
  }
  res.status(204).end();
});

// --- Étiquettes ------------------------------------------------------------
// Elles sont communes à tout le support, quelle que soit la société : les
// renommer, les recolorer ou les supprimer touche toutes les demandes qui les
// portent.

/** Le poids reçu : un entier, positif ou non. */
const labelWeight = (value: unknown): number => {
  const weight = Number(value);
  if (!Number.isInteger(weight)) badRequest("Le poids doit être un nombre entier");
  return weight;
};

export const supportLabelRoutes = Router();

supportLabelRoutes.use(touch("support-labels", "support-requests"));

// Communes à toutes les sociétés, elles suivent les droits du support dans
// n'importe laquelle.

supportLabelRoutes.get("/", (req, res) => {
  if (!requestCan(req, "support", "view")) return void res.json([]);
  res.json(supportLabels.all.all());
});

supportLabelRoutes.post("/", (req, res) => {
  require(req, "support", "create");
  const name = requireText(req.body.name, "Le nom de l'étiquette est requis");
  // Communes à toutes les sociétés : deux du même nom ne se distingueraient
  // plus dans une liste.
  if (supportLabels.byName.get(name)) conflict("Cette étiquette existe déjà");
  const color = req.body.color || DEFAULT_LABEL_COLOR;
  if (!isLabelColor(color)) badRequest("Couleur inconnue");
  const weight = labelWeight(req.body.weight ?? 0);

  const { next } = supportLabels.nextPosition();
  const { lastInsertRowid } = supportLabels.create.run(name, color, weight, next, now());
  res.status(201).json(supportLabels.byId.get(lastInsertRowid));
});

// Ranger les étiquettes : l'ordre où les listes les présentent. Déclaré avant
// « /:id », sinon « reorder » serait pris pour un identifiant. Toutes se
// voient de tous : l'ordre reçu les nomme toutes, chacune une fois.
supportLabelRoutes.put("/reorder", (req, res) => {
  require(req, "support", "update");
  const order = receivedOrder(
    req.body.ids,
    supportLabels.all.all(),
    "L'ordre doit nommer chaque étiquette une fois",
  );
  arrangeSupportLabels(order);
  res.json(supportLabels.all.all());
});

supportLabelRoutes.put("/:id", (req, res) => {
  require(req, "support", "update");
  const existing = orNotFound(
    supportLabels.byId.get(req.params.id),
    SUPPORT_LABEL_NOT_FOUND,
  );
  const name = requireText(req.body.name ?? existing.name, "Le nom de l'étiquette est requis");
  const namesake = supportLabels.byName.get(name);
  if (namesake && namesake.id !== existing.id) conflict("Cette étiquette existe déjà");
  const color = req.body.color ?? existing.color;
  if (!isLabelColor(color)) badRequest("Couleur inconnue");
  const weight = labelWeight(req.body.weight ?? existing.weight);

  supportLabels.update.run(name, color, weight, existing.id);
  res.json(supportLabels.byId.get(existing.id));
});

supportLabelRoutes.delete("/:id", (req, res) => {
  require(req, "support", "delete");
  const existing = orNotFound(
    supportLabels.byId.get(req.params.id),
    SUPPORT_LABEL_NOT_FOUND,
  );
  refuseIfUsed(existing.name, supportLabels.usage(existing.id).count);
  supportLabels.remove.run(existing.id);
  res.status(204).end();
});
