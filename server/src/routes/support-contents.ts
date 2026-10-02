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
import { descriptionPropre } from "../lib/html.js";

const CONTENU_INTROUVABLE = "Contenu introuvable";
const CONTENU_EXISTANT = "Ce contenu existe déjà";

const tous = selection<SupportContentRow>("SELECT * FROM support_contents ORDER BY name");
const parId = selection<SupportContentRow>("SELECT * FROM support_contents WHERE id = ?");
const parNom = selection<SupportContentRow>(
  "SELECT * FROM support_contents WHERE name = ? COLLATE NOCASE AND id != ?",
);
const parEvenement = selection<SupportContentRow>(
  "SELECT * FROM support_contents WHERE event = ? AND id != ?",
);
const creer = mutation("INSERT INTO support_contents (name, event) VALUES (?, ?)");
const renommer = mutation("UPDATE support_contents SET name = ? WHERE id = ?");
const poserHtml = mutation("UPDATE support_contents SET html = ? WHERE id = ?");
const poserEvenement = mutation("UPDATE support_contents SET event = ? WHERE id = ?");
const supprimer = mutation("DELETE FROM support_contents WHERE id = ?");

const versContenu = (row: SupportContentRow): SupportContent => ({
  id: row.id,
  name: row.name,
  html: row.html,
  event: isSupportContentEvent(row.event) ? row.event : null,
});

/**
 * L'évènement reçu, vérifié : connu, et libre — aucun autre contenu ne le
 * porte. Vide : aucun évènement.
 */
const evenementRecu = (recu: unknown, id: number): SupportContentEvent | "" => {
  if (recu === null || recu === "") return "";
  if (!isSupportContentEvent(recu)) badRequest("Évènement inconnu");
  const evenement = recu as SupportContentEvent;
  const autre = parEvenement.get(evenement, id);
  if (autre) conflict(`Cet évènement pose déjà le contenu « ${autre.name} »`);
  return evenement;
};

export const supportContentRoutes = Router();

supportContentRoutes.get("/", (_req, res) => {
  res.json(tous.all().map(versContenu));
});

supportContentRoutes.post("/", (req, res) => {
  const name = requireText(req.body.name, "L'intitulé est requis");
  if (parNom.get(name, 0)) conflict(CONTENU_EXISTANT);
  const evenement = evenementRecu(req.body.event ?? null, 0);

  const { lastInsertRowid } = creer.run(name, evenement);
  res.status(201).json(versContenu(parId.get(lastInsertRowid)!));
});

// Comme pour les réponses par défaut : ce qui n'est pas envoyé reste, et le
// HTML ne garde que ce que l'éditeur sait produire.
supportContentRoutes.put("/:id", (req, res) => {
  const existing = orNotFound(parId.get(req.params.id), CONTENU_INTROUVABLE);

  if (req.body.name !== undefined) {
    const name = requireText(req.body.name, "L'intitulé est requis");
    if (parNom.get(name, existing.id)) conflict(CONTENU_EXISTANT);
    renommer.run(name, existing.id);
  }
  if (req.body.html !== undefined) poserHtml.run(descriptionPropre(req.body.html), existing.id);
  if (req.body.event !== undefined) {
    poserEvenement.run(evenementRecu(req.body.event, existing.id), existing.id);
  }

  res.json(versContenu(parId.get(existing.id)!));
});

supportContentRoutes.delete("/:id", (req, res) => {
  const existing = orNotFound(parId.get(req.params.id), CONTENU_INTROUVABLE);
  supprimer.run(existing.id);
  res.status(204).end();
});
