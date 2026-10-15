// A Tickets widget's automatic replies, set in its drawer. Each widget has its
// own, by its list key; a new one has none. Each carries a title and its HTML
// template, entered in the editor.
//
// A reply goes out automatically, on an event — a request arriving, its
// closing… (lib/support-auto-reply.ts). A reply has at most one event, and in
// a widget an event only sends one reply.

import { Router } from "express";
import type { Request } from "express";
import { SUPPORT_DEFAULT_REPLIES, isSupportReplyEvent } from "@milo/shared";
import type { Right, SupportReply, SupportReplyEvent } from "@milo/shared";
import { mutation, scalar, selection, transaction } from "../db/query.js";
import type { SupportReplyRow } from "../db/rows.js";
import { badRequest, conflict, orNotFound, requireText } from "../lib/http.js";
import { cleanDescription } from "../lib/html.js";
import { supportScope as scopeOf } from "../lib/support-scope.js";
import type { ListScope } from "../repositories/lists.js";

const REPLY_NOT_FOUND = "Réponse introuvable";
const REPLY_EXISTS = "Cette réponse existe déjà";

const ofList = selection<SupportReplyRow>(
  "SELECT * FROM support_replies WHERE board_id = ? AND list_key = ? ORDER BY name",
);
const byId = selection<SupportReplyRow>("SELECT * FROM support_replies WHERE id = ?");
const byName = selection<SupportReplyRow>(
  `SELECT * FROM support_replies
   WHERE board_id = ? AND list_key = ? AND name = ? COLLATE NOCASE AND id != ?`,
);
const byEvent = selection<SupportReplyRow>(
  "SELECT * FROM support_replies WHERE board_id = ? AND list_key = ? AND event = ? AND id != ?",
);
const create = mutation(
  "INSERT INTO support_replies (board_id, list_key, name, event) VALUES (?, ?, ?, ?)",
);
const rename = mutation("UPDATE support_replies SET name = ? WHERE id = ?");
const setHtml = mutation("UPDATE support_replies SET html = ? WHERE id = ?");
const setEvent = mutation("UPDATE support_replies SET event = ? WHERE id = ?");
const remove = mutation("DELETE FROM support_replies WHERE id = ?");

const countOf = scalar<{ count: number }>(
  "SELECT COUNT(*) AS count FROM support_replies WHERE board_id = @board AND list_key = @list",
);
const createFull = mutation(
  "INSERT INTO support_replies (board_id, list_key, name, event, html) VALUES (?, ?, ?, ?, ?)",
);

/**
 * A new Tickets widget brings the default automatic replies
 * (SUPPORT_DEFAULT_REPLIES), as long as it has none. True when they were created.
 */
export const ensureDefaultReplies = transaction((scope: ListScope): boolean => {
  if (!scope.list || countOf(scope).count > 0) return false;
  for (const r of SUPPORT_DEFAULT_REPLIES) {
    createFull.run(scope.board, scope.list, r.name, r.event, r.html);
  }
  return true;
});

const toReply = (row: SupportReplyRow): SupportReply => ({
  id: row.id,
  name: row.name,
  html: row.html,
  event: isSupportReplyEvent(row.event) ? row.event : null,
});

/** The reply an event sends in this widget, if there is one. */
export const replyFor = (scope: ListScope, event: SupportReplyEvent): SupportReply | undefined => {
  const row = byEvent.get(scope.board, scope.list, event, 0);
  return row && toReply(row);
};

/**
 * The received event, verified: known, and free in the widget — no other
 * reply carries it. Empty: no event.
 */
const receivedEvent = (scope: ListScope, received: unknown, id: number): SupportReplyEvent | "" => {
  if (received === null || received === "") return "";
  if (!isSupportReplyEvent(received)) badRequest("Évènement inconnu");
  const event = received as SupportReplyEvent;
  const other = byEvent.get(scope.board, scope.list, event, id);
  if (other) conflict(`Cet évènement envoie déjà la réponse « ${other.name} »`);
  return event;
};

/** The reply, once the access to its widget is checked for this right. */
const openReply = (req: Request, id: unknown, right: Right) => {
  const existing = orNotFound(byId.get(id), REPLY_NOT_FOUND);
  return { existing, scope: scopeOf(req, existing.board_id, existing.list_key, right) };
};

export const supportReplyRoutes = Router();

supportReplyRoutes.get("/", (req, res) => {
  const scope = scopeOf(req, req.query.board, req.query.list, "view");
  res.json(ofList.all(scope.board, scope.list).map(toReply));
});

supportReplyRoutes.post("/", (req, res) => {
  const scope = scopeOf(req, req.body.board_id, req.body.list_key, "create");
  const name = requireText(req.body.name, "L'intitulé est requis");
  if (byName.get(scope.board, scope.list, name, 0)) conflict(REPLY_EXISTS);
  const event = receivedEvent(scope, req.body.event ?? null, 0);

  const { lastInsertRowid } = create.run(scope.board, scope.list, name, event);
  res.status(201).json(toReply(byId.get(lastInsertRowid)!));
});

// The title and template are edited separately: what is not sent stays. The
// HTML goes through the same flattening as descriptions: it only keeps what
// the editor can produce.
supportReplyRoutes.put("/:id", (req, res) => {
  const { existing, scope } = openReply(req, req.params.id, "update");

  if (req.body.name !== undefined) {
    const name = requireText(req.body.name, "L'intitulé est requis");
    if (byName.get(scope.board, scope.list, name, existing.id)) conflict(REPLY_EXISTS);
    rename.run(name, existing.id);
  }
  if (req.body.html !== undefined) setHtml.run(cleanDescription(req.body.html), existing.id);
  if (req.body.event !== undefined) {
    setEvent.run(receivedEvent(scope, req.body.event, existing.id), existing.id);
  }

  res.json(toReply(byId.get(existing.id)!));
});

supportReplyRoutes.delete("/:id", (req, res) => {
  const { existing } = openReply(req, req.params.id, "delete");
  remove.run(existing.id);
  res.status(204).end();
});
