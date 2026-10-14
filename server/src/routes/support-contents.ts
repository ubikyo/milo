// The Support's default contents, set in "Paramétrage": a signature, a
// greeting… Each carries a title, its HTML template, entered in the editor,
// and the event that places it in the editor of a team reply
// (SUPPORT_CONTENT_EVENTS). An event may place several: in the list's order,
// dragged in the drawer.

import { Router } from "express";
import { isSupportContentEvent } from "@milo/shared";
import type { SupportContent, SupportContentEvent } from "@milo/shared";
import { mutation, selection } from "../db/query.js";
import type { SupportContentRow } from "../db/rows.js";
import { badRequest, conflict, orNotFound, requireText } from "../lib/http.js";
import { cleanDescription } from "../lib/html.js";

const CONTENT_NOT_FOUND = "Contenu introuvable";
const EXISTING_CONTENT = "Ce contenu existe déjà";

const all = selection<SupportContentRow>("SELECT * FROM support_contents ORDER BY position, id");
const byId = selection<SupportContentRow>("SELECT * FROM support_contents WHERE id = ?");
const byName = selection<SupportContentRow>(
  "SELECT * FROM support_contents WHERE name = ? COLLATE NOCASE AND id != ?",
);
// A new content goes last.
const create = mutation(
  `INSERT INTO support_contents (name, event, position)
   VALUES (?, ?, (SELECT COALESCE(MAX(position), 0) + 1 FROM support_contents))`,
);
const place = mutation("UPDATE support_contents SET position = ? WHERE id = ?");
const rename = mutation("UPDATE support_contents SET name = ? WHERE id = ?");
const setHtml = mutation("UPDATE support_contents SET html = ? WHERE id = ?");
const setEvent = mutation("UPDATE support_contents SET event = ? WHERE id = ?");
const remove = mutation("DELETE FROM support_contents WHERE id = ?");

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

supportContentRoutes.get("/", (_req, res) => {
  res.json(all.all().map(toContent));
});

supportContentRoutes.post("/", (req, res) => {
  const name = requireText(req.body.name, "L'intitulé est requis");
  if (byName.get(name, 0)) conflict(EXISTING_CONTENT);
  const event = receivedEvent(req.body.event ?? null);

  const { lastInsertRowid } = create.run(name, event);
  res.status(201).json(toContent(byId.get(lastInsertRowid)!));
});

/** The contents in the order received: each id at its rank; one left out keeps its place after. */
supportContentRoutes.put("/order", (req, res) => {
  const ids = Array.isArray(req.body?.ids)
    ? (req.body.ids as unknown[]).map(Number)
    : badRequest("L'ordre est une liste");
  const known = new Set(all.all().map((c) => c.id));
  ids.filter((id) => known.has(id)).forEach((id, rank) => place.run(rank + 1, id));
  res.json(all.all().map(toContent));
});

// As for default replies: what is not sent stays, and the HTML only keeps
// what the editor can produce.
supportContentRoutes.put("/:id", (req, res) => {
  const existing = orNotFound(byId.get(req.params.id), CONTENT_NOT_FOUND);

  if (req.body.name !== undefined) {
    const name = requireText(req.body.name, "L'intitulé est requis");
    if (byName.get(name, existing.id)) conflict(EXISTING_CONTENT);
    rename.run(name, existing.id);
  }
  if (req.body.html !== undefined) setHtml.run(cleanDescription(req.body.html), existing.id);
  if (req.body.event !== undefined) {
    setEvent.run(receivedEvent(req.body.event), existing.id);
  }

  res.json(toContent(byId.get(existing.id)!));
});

supportContentRoutes.delete("/:id", (req, res) => {
  const existing = orNotFound(byId.get(req.params.id), CONTENT_NOT_FOUND);
  remove.run(existing.id);
  res.status(204).end();
});
