// The Support's default replies, set in "Paramétrage". Each carries a title
// and its HTML template, entered in the editor.
//
// A reply can also go out automatically, on an event — a request arriving,
// its closing… (lib/support-auto-reply.ts). A reply has at most one event,
// and an event only sends one reply.

import { Router } from "express";
import { isSupportReplyEvent } from "@milo/shared";
import type { SupportReply, SupportReplyEvent } from "@milo/shared";
import { mutation, selection } from "../db/query.js";
import type { SupportReplyRow } from "../db/rows.js";
import { badRequest, conflict, orNotFound, requireText } from "../lib/http.js";
import { cleanDescription } from "../lib/html.js";

const REPLY_NOT_FOUND = "Réponse introuvable";
const REPLY_EXISTS = "Cette réponse existe déjà";

const all = selection<SupportReplyRow>("SELECT * FROM support_replies ORDER BY name");
const byId = selection<SupportReplyRow>("SELECT * FROM support_replies WHERE id = ?");
const byName = selection<SupportReplyRow>(
  "SELECT * FROM support_replies WHERE name = ? COLLATE NOCASE AND id != ?",
);
const byEvent = selection<SupportReplyRow>(
  "SELECT * FROM support_replies WHERE event = ? AND id != ?",
);
const create = mutation("INSERT INTO support_replies (name, event) VALUES (?, ?)");
const rename = mutation("UPDATE support_replies SET name = ? WHERE id = ?");
const setHtml = mutation("UPDATE support_replies SET html = ? WHERE id = ?");
const setEvent = mutation("UPDATE support_replies SET event = ? WHERE id = ?");
const remove = mutation("DELETE FROM support_replies WHERE id = ?");

const toReply = (row: SupportReplyRow): SupportReply => ({
  id: row.id,
  name: row.name,
  html: row.html,
  event: isSupportReplyEvent(row.event) ? row.event : null,
});

/** The reply an event sends, if there is one. */
export const replyFor = (event: SupportReplyEvent): SupportReply | undefined => {
  const row = byEvent.get(event, 0);
  return row && toReply(row);
};

/**
 * The received event, verified: known, and free — no other reply carries
 * it. Empty: no event.
 */
const receivedEvent = (received: unknown, id: number): SupportReplyEvent | "" => {
  if (received === null || received === "") return "";
  if (!isSupportReplyEvent(received)) badRequest("Évènement inconnu");
  const event = received as SupportReplyEvent;
  const other = byEvent.get(event, id);
  if (other) conflict(`Cet évènement envoie déjà la réponse « ${other.name} »`);
  return event;
};

export const supportReplyRoutes = Router();

supportReplyRoutes.get("/", (_req, res) => {
  res.json(all.all().map(toReply));
});

supportReplyRoutes.post("/", (req, res) => {
  const name = requireText(req.body.name, "L'intitulé est requis");
  if (byName.get(name, 0)) conflict(REPLY_EXISTS);
  const event = receivedEvent(req.body.event ?? null, 0);

  const { lastInsertRowid } = create.run(name, event);
  res.status(201).json(toReply(byId.get(lastInsertRowid)!));
});

// The title and template are edited separately: what is not sent stays. The
// HTML goes through the same flattening as descriptions: it only keeps what
// the editor can produce.
supportReplyRoutes.put("/:id", (req, res) => {
  const existing = orNotFound(byId.get(req.params.id), REPLY_NOT_FOUND);

  if (req.body.name !== undefined) {
    const name = requireText(req.body.name, "L'intitulé est requis");
    if (byName.get(name, existing.id)) conflict(REPLY_EXISTS);
    rename.run(name, existing.id);
  }
  if (req.body.html !== undefined) setHtml.run(cleanDescription(req.body.html), existing.id);
  if (req.body.event !== undefined) {
    setEvent.run(receivedEvent(req.body.event, existing.id), existing.id);
  }

  res.json(toReply(byId.get(existing.id)!));
});

supportReplyRoutes.delete("/:id", (req, res) => {
  const existing = orNotFound(byId.get(req.params.id), REPLY_NOT_FOUND);
  remove.run(existing.id);
  res.status(204).end();
});
