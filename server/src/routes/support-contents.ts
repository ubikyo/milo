// A Tickets widget's predefined replies, set in its drawer: a signature, a
// greeting… Each widget has its own, by its list key; a new one has none.
// Each carries a title, its HTML template, entered in the editor, and the
// event that places it in the editor of a team reply (SUPPORT_CONTENT_EVENTS).
// An event may place several: in the list's order, dragged in the drawer.

import { Router } from "express";
import type { Request } from "express";
import { isSupportContentEvent } from "@milo/shared";
import type { Right, SupportContent, SupportContentEvent } from "@milo/shared";
import { mutation, selection } from "../db/query.js";
import type { SupportContentRow } from "../db/rows.js";
import { badRequest, conflict, orNotFound, requireText } from "../lib/http.js";
import { cleanDescription } from "../lib/html.js";
import { supportScope as scopeOf } from "../lib/support-scope.js";
import type { ListScope } from "../repositories/lists.js";

const CONTENT_NOT_FOUND = "Contenu introuvable";
const EXISTING_CONTENT = "Ce contenu existe déjà";

const ofList = selection<SupportContentRow>(
  "SELECT * FROM support_contents WHERE board_id = ? AND list_key = ? ORDER BY position, id",
);
const byId = selection<SupportContentRow>("SELECT * FROM support_contents WHERE id = ?");
const byName = selection<SupportContentRow>(
  `SELECT * FROM support_contents
   WHERE board_id = ? AND list_key = ? AND name = ? COLLATE NOCASE AND id != ?`,
);
// A new content goes last of its list.
const create = mutation(
  `INSERT INTO support_contents (board_id, list_key, name, event, position)
   VALUES (?, ?, ?, ?, (SELECT COALESCE(MAX(position), 0) + 1 FROM support_contents
                        WHERE board_id = ? AND list_key = ?))`,
);
const place = mutation("UPDATE support_contents SET position = ? WHERE id = ?");
const rename = mutation("UPDATE support_contents SET name = ? WHERE id = ?");
const setHtml = mutation("UPDATE support_contents SET html = ? WHERE id = ?");
const setEvent = mutation("UPDATE support_contents SET event = ? WHERE id = ?");
const remove = mutation("DELETE FROM support_contents WHERE id = ?");

const all = (scope: ListScope) => ofList.all(scope.board, scope.list);

/** The content, once the access to its widget is checked for this right. */
const openContent = (req: Request, id: unknown, right: Right) => {
  const existing = orNotFound(byId.get(id), CONTENT_NOT_FOUND);
  return { existing, scope: scopeOf(req, existing.board_id, existing.list_key, right) };
};

const toContent = (row: SupportContentRow): SupportContent => ({
  id: row.id,
  name: row.name,
  html: row.html,
  event: isSupportContentEvent(row.event) ? row.event : null,
});

/** The received event, verified: known. Empty: no event. */
const receivedEvent = (received: unknown): SupportContentEvent | "" => {
  if (received === null || received === "") return "";
  if (!isSupportContentEvent(received)) badRequest("Évènement inconnu");
  return received as SupportContentEvent;
};

export const supportContentRoutes = Router();

supportContentRoutes.get("/", (req, res) => {
  res.json(all(scopeOf(req, req.query.board, req.query.list, "view")).map(toContent));
});

supportContentRoutes.post("/", (req, res) => {
  const scope = scopeOf(req, req.body.board_id, req.body.list_key, "create");
  const name = requireText(req.body.name, "L'intitulé est requis");
  if (byName.get(scope.board, scope.list, name, 0)) conflict(EXISTING_CONTENT);
  const event = receivedEvent(req.body.event ?? null);

  const { lastInsertRowid } = create.run(scope.board, scope.list, name, event, scope.board, scope.list);
  res.status(201).json(toContent(byId.get(lastInsertRowid)!));
});

/** The contents in the order received: each id at its rank; one left out keeps its place after. */
supportContentRoutes.put("/order", (req, res) => {
  const scope = scopeOf(req, req.body?.board_id, req.body?.list_key, "update");
  const ids = Array.isArray(req.body?.ids)
    ? (req.body.ids as unknown[]).map(Number)
    : badRequest("L'ordre est une liste");
  const known = new Set(all(scope).map((c) => c.id));
  ids.filter((id) => known.has(id)).forEach((id, rank) => place.run(rank + 1, id));
  res.json(all(scope).map(toContent));
});

// As for default replies: what is not sent stays, and the HTML only keeps
// what the editor can produce.
supportContentRoutes.put("/:id", (req, res) => {
  const { existing, scope } = openContent(req, req.params.id, "update");

  if (req.body.name !== undefined) {
    const name = requireText(req.body.name, "L'intitulé est requis");
    if (byName.get(scope.board, scope.list, name, existing.id)) conflict(EXISTING_CONTENT);
    rename.run(name, existing.id);
  }
  if (req.body.html !== undefined) setHtml.run(cleanDescription(req.body.html), existing.id);
  if (req.body.event !== undefined) {
    setEvent.run(receivedEvent(req.body.event), existing.id);
  }

  res.json(toContent(byId.get(existing.id)!));
});

supportContentRoutes.delete("/:id", (req, res) => {
  const { existing } = openContent(req, req.params.id, "delete");
  remove.run(existing.id);
  res.status(204).end();
});
