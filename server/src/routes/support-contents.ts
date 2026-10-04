// Les contenus par défaut du Support, réglés au Paramétrage : une signature,
// une formule d'accueil… Chacun porte un intitulé, son modèle HTML, saisi
// dans l'éditeur, et l'évènement qui le pose dans l'éditeur d'une réponse de
// l'équipe (SUPPORT_CONTENT_EVENTS). Un évènement ne pose qu'un contenu.

import { Router } from "express";
import { isSupportContentEvent } from "@milo/shared";
import type { SupportContent, SupportContentEvent } from "@milo/shared";
import { mutation, selection } from "../db/query.js";
import type { SupportContentRow } from "../db/rows.js";
import { badRequest, conflict, orNotFound, requireText } from "../lib/http.js";
import { cleanDescription } from "../lib/html.js";

const CONTENT_NOT_FOUND = "Contenu introuvable";
const EXISTING_CONTENT = "Ce contenu existe déjà";

const all = selection<SupportContentRow>("SELECT * FROM support_contents ORDER BY name");
const byId = selection<SupportContentRow>("SELECT * FROM support_contents WHERE id = ?");
const byName = selection<SupportContentRow>(
  "SELECT * FROM support_contents WHERE name = ? COLLATE NOCASE AND id != ?",
);
const byEvent = selection<SupportContentRow>(
  "SELECT * FROM support_contents WHERE event = ? AND id != ?",
);
const create = mutation("INSERT INTO support_contents (name, event) VALUES (?, ?)");
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

/**
 * L'évènement reçu, vérifié : connu, et libre — aucun autre contenu ne le
 * porte. Vide : aucun évènement.
 */
const receivedEvent = (received: unknown, id: number): SupportContentEvent | "" => {
  if (received === null || received === "") return "";
  if (!isSupportContentEvent(received)) badRequest("Évènement inconnu");
  const event = received as SupportContentEvent;
  const other = byEvent.get(event, id);
  if (other) conflict(`Cet évènement pose déjà le contenu « ${other.name} »`);
  return event;
};

export const supportContentRoutes = Router();

supportContentRoutes.get("/", (_req, res) => {
  res.json(all.all().map(toContent));
});

supportContentRoutes.post("/", (req, res) => {
  const name = requireText(req.body.name, "L'intitulé est requis");
  if (byName.get(name, 0)) conflict(EXISTING_CONTENT);
  const event = receivedEvent(req.body.event ?? null, 0);

  const { lastInsertRowid } = create.run(name, event);
  res.status(201).json(toContent(byId.get(lastInsertRowid)!));
});

// Comme pour les réponses par défaut : ce qui n'est pas envoyé reste, et le
// HTML ne garde que ce que l'éditeur sait produire.
supportContentRoutes.put("/:id", (req, res) => {
  const existing = orNotFound(byId.get(req.params.id), CONTENT_NOT_FOUND);

  if (req.body.name !== undefined) {
    const name = requireText(req.body.name, "L'intitulé est requis");
    if (byName.get(name, existing.id)) conflict(EXISTING_CONTENT);
    rename.run(name, existing.id);
  }
  if (req.body.html !== undefined) setHtml.run(cleanDescription(req.body.html), existing.id);
  if (req.body.event !== undefined) {
    setEvent.run(receivedEvent(req.body.event, existing.id), existing.id);
  }

  res.json(toContent(byId.get(existing.id)!));
});

supportContentRoutes.delete("/:id", (req, res) => {
  const existing = orNotFound(byId.get(req.params.id), CONTENT_NOT_FOUND);
  remove.run(existing.id);
  res.status(204).end();
});
