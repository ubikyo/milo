// The Support mode: its requests, their thread, and the labels they carry.
//
// A request hangs off a company — the one in the header's dropdown — and
// not off a board: so nothing is private here, everyone sees the requests of
// the companies they consult.
//
// Labels do not go through the "routes/labels.ts" factory: it only deals with
// boards, and knows how to copy them from one to another. Support's labels
// are shared across all companies and are not copied.

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
import { keyInBoard } from "../repositories/lists.js";
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
import { require, requestCan } from "../lib/rights.js";
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
} from "../lib/history.js";
import type { Field } from "../lib/history.js";
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


/** The received status. An unknown value is rejected rather than corrected. */
const requestedStatus = (value: unknown, defaultValue: SupportStatus): SupportStatus => {
  if (value === undefined) return defaultValue;
  if (!isSupportStatus(value)) badRequest("Statut inconnu");
  return value as SupportStatus;
};

export const supportRequestRoutes = Router();

supportRequestRoutes.use(touch("support-requests"));

/** The targeted request, if it exists. */
const request = (id: unknown) => orNotFound(supportRequests.byId.get(id), REQUEST_NOT_FOUND);

/**
 * The request, if one sees the support and the board of its context — and
 * has `right` there when writing to it. Replying, commenting, assigning,
 * closing: that is editing it.
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
 * A request has changed: those following it and its actors are notified —
 * except `except`, whom the assignment has just notified.
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

/** What the thread notes about a request when it changes (lib/history.ts). */
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
 * Requests are about to be deleted: their actors and those following them,
 * read while they are still there, are notified once the deletion is done.
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

// The requests of a board — of one of its contexts, or of all —, whatever
// their status.
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

// Polling the support inboxes, on demand: the mode opens on it, without
// waiting for the next periodic poll. It signals the created requests
// itself; a poll that brings nothing makes clients re-read nothing.
supportRequestRoutes.post("/sync", (req, res, next) => {
  require(req, "support", "view");
  res.locals.touched?.clear();
  pollMailboxes()
    .then((created) => res.json({ created }))
    .catch(next);
});

// --- Actions on the checked requests ---------------------------------------
// All take the list of checked requests. A request that no longer exists
// — deleted by someone else in the meantime — makes the whole thing be
// rejected: we don't act on a selection that is no longer the one we saw.

/**
 * The checked requests, all existing, without duplicates — and all where
 * one has this right.
 */
const checked = (req: Request, value: unknown, right: Right): SupportRequestRow[] => {
  const ids = [...new Set(toIds(value))];
  if (ids.length === 0) badRequest("Aucune demande sélectionnée");
  return ids.map((id) => requestFor(req, id, right));
};

// Merge: the most recent stays and receives the exchanges of the others,
// which are closed. They must belong to the same context — a request does
// not change context behind the scenes.
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

  // Each thread notes the merge, signed Milo: the remaining one, what it
  // received — the absorbed tickets, and the subject, actors, labels they
  // bring it; the others, where they went.
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
  // The sender of each request that has just been closed is notified, if
  // "Paramétrage" gave them a reply ("Demande fermée").
  for (const d of requests) {
    if (d.status !== "closed") void sendAutoReply(d.id, "closed");
  }
  res.status(204).end();
});

/** The files stored for a request's e-mails. */
const requestFiles = (requestId: Id): string[] =>
  supportComments.attachmentsOfRequest
    .all(requestId)
    .flatMap(({ attachments }) => filesOf(attachments).map((f) => f.file));

supportRequestRoutes.post("/delete", (req, res) => {
  const requests = checked(req, req.body.ids, "delete");
  const files = requests.flatMap((d) => requestFiles(d.id));
  const announce = announceDeletions(req, requests);
  // Their labels and thread go with them, through the foreign key.
  transaction(() => {
    for (const d of requests) supportRequests.remove.run(d.id);
  })();
  forgetFiles(files);
  announce();
  res.status(204).end();
});

// Assign: the chosen accounts are added to the actors, and those who arrive
// on a request are notified, on screen and by e-mail.
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
  // The given context, or the given board's first.
  const received = req.body.context_id ? contexts.byId.get(req.body.context_id) : undefined;
  const board = openBoard(received?.board_id ?? req.body.board_id, req.user);
  const context = boardContext(board.id, received?.id);

  // Read before taking a number: a rejected entry does not consume one.
  const status = requestedStatus(req.body.status, DEFAULT_SUPPORT_STATUS);
  const dueDate = due(req.body.due_date, "");

  const timestamp = now();
  const { lastInsertRowid } = supportRequests.create.run(
    nextTicketNumber(),
    board.id,
    context,
    // The "Tickets" widget it is entered from, failing that the board's
    // first.
    keyInBoard(board.id, "support.list", req.body.list_key),
    String(req.body.subject ?? "").trim(),
    status,
    dueDate,
    timestamp,
    timestamp,
  );

  // A request's thread opens on its creation, like a card's.
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

// The people the templates cite — the signed-in account, and the request's
// sender if there is one: their Entra records. A reply's detail view uses
// them to place its default contents; the request already knows them.
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

// Each field absent from the body stays as is. The context can be changed,
// to another one of the same board.
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
  // Labels are shared: a request that changes context keeps them.
  if (Array.isArray(req.body.label_ids)) {
    replaceSupportLabels(existing.id, toIds(req.body.label_ids));
  }

  // What moved is noted in the team comments, signed Milo. Nothing moved:
  // nothing goes out.
  const rows = changes(photoBefore, photo(existing.id));
  if (rows.length) {
    logAction("support", existing.id, req.user, rows);
    updatedRequest(req, existing.id, editMessage(rows), assigned);
  }

  // A new status sends the sender the default reply that matches it, if
  // there is one: the detail view is re-read once it has gone.
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
  // Its labels and thread go with it, through the foreign key; the files of
  // its e-mails, however, are erased from disk.
  const existing = requestFor(req, req.params.id, "delete");
  const files = requestFiles(existing.id);
  const announce = announceDeletions(req, [existing]);
  supportRequests.remove.run(existing.id);
  forgetFiles(files);
  announce();
  res.status(204).end();
});

// --- A request's thread ----------------------------------------------------

/**
 * A message's text: HTML from the editor, cleaned of whatever it cannot
 * produce. An empty message is rejected.
 */
/** An e-mail address, roughly: enough to reject a typo. */
const ADDRESS = /^[^\s@<>,;]+@[^\s@<>,;]+\.[^\s@<>,;]+$/;

/** The cc addresses of a reply: without duplicates, and well formed. */
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
 * Notifies those who have just joined a request's actors, through someone
 * else's action. Adding oneself notifies no one. Returns the accounts
 * notified.
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
 * Upload a reply attachment, before sending the reply: the file arrives
 * alone, raw, and the reply then only carries its storage name. A file
 * uploaded and then never sent stays without a message.
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

  // An internal comment: plain text, between team members, like those of
  // cards and projects. It does not go out by e-mail.
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
  // The send button also says where the request stands: pending, resolved
  // or closed.
  const requestedStatus = req.body.status;
  if (requestedStatus !== undefined && !isSupportStatus(requestedStatus)) badRequest("Statut inconnu");
  // The attachments, uploaded first (POST /:id/files).
  const files = uploadedFiles(req.body.files);
  if (!files) badRequest("Pièce jointe introuvable");
  if (
    existing.sender_email &&
    files!.reduce((total, f) => total + f.size, 0) > SEND_SIZE_MAX
  ) {
    badRequest(`Les pièces jointes d'une réponse ne dépassent pas ${SEND_SIZE_MAX_MB} Mo au total`);
  }

  // Whoever writes on a request takes care of it: they become an actor.
  if (!req.user.system) addActors(existing.id, [req.user.id]);

  const timestamp = now();
  const { lastInsertRowid } = supportComments.create.run(
    existing.id,
    req.user.id,
    text,
    timestamp,
    timestamp,
  );

  // On a request received by e-mail, the message also goes to the sender —
  // or pretends to, as long as sends are simulated. It is recorded no matter
  // what: its state says whether the e-mail went out.
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

  // The team's reply first, then the one the new status calls for: the sender
  // receives them in that order.
  const event = requestedStatus && requestedStatus !== existing.status ? statusEvent(requestedStatus) : null;
  replyByEmail(existing, lastInsertRowid as Id, text, copies, files!)
    .then(() => (event ? sendAutoReply(existing.id, event) : undefined))
    .then(() =>
      res.status(201).json(supportCommentOf(supportComments.byId.get(lastInsertRowid)!)),
    )
    .catch(next);
});

/** Mounted under `/api/support-comments`. */
export const supportCommentRoutes = Router();

supportCommentRoutes.use(touch("support-requests"));

supportCommentRoutes.put("/:id", (req, res) => {
  const comment = orNotFound(supportComments.byId.get(req.params.id), COMMENT_NOT_FOUND);
  if (comment.system) forbidden(SYSTEM_COMMENT);
  requestFor(req, comment.request_id, "update");
  // Each thread keeps its form: plain text for an internal comment, cleaned
  // HTML for an exchange.
  const text = comment.internal
    ? requireText(req.body.text, "Le commentaire est vide")
    : receivedMessage(req.body.text);

  // An identical text is not a modification: the date does not move, and the
  // comment does not start carrying "(modifié)".
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

// --- Labels ----------------------------------------------------------------
// They are shared across all of support, whatever the company: renaming,
// recoloring or deleting them touches every request that carries them.

/** The received weight: an integer, positive or not. */
const labelWeight = (value: unknown): number => {
  const weight = Number(value);
  if (!Number.isInteger(weight)) badRequest("Le poids doit être un nombre entier");
  return weight;
};

export const supportLabelRoutes = Router();

supportLabelRoutes.use(touch("support-labels", "support-requests"));

// Shared across all companies, they follow the support rights in any of
// them.

supportLabelRoutes.get("/", (req, res) => {
  if (!requestCan(req, "support", "view")) return void res.json([]);
  res.json(supportLabels.all.all());
});

supportLabelRoutes.post("/", (req, res) => {
  require(req, "support", "create");
  const name = requireText(req.body.name, "Le nom de l'étiquette est requis");
  // Shared across all companies: two with the same name could no longer be
  // told apart in a list.
  if (supportLabels.byName.get(name)) conflict("Cette étiquette existe déjà");
  const color = req.body.color || DEFAULT_LABEL_COLOR;
  if (!isLabelColor(color)) badRequest("Couleur inconnue");
  const weight = labelWeight(req.body.weight ?? 0);

  const { next } = supportLabels.nextPosition();
  const { lastInsertRowid } = supportLabels.create.run(name, color, weight, next, now());
  res.status(201).json(supportLabels.byId.get(lastInsertRowid));
});

// Arrange the labels: the order in which lists present them. Declared before
// "/:id", otherwise "reorder" would be taken for an id. All are visible to
// everyone: the received order names them all, each once.
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
