// Les réponses par défaut du Support, réglées au Paramétrage. Chacune porte un
// intitulé et son modèle HTML, saisi dans l'éditeur.
//
// Une réponse peut aussi partir d'office, sur un évènement — l'arrivée d'une
// demande, sa fermeture… (lib/support-auto-reply.ts). Une réponse a au plus
// un évènement, et un évènement n'envoie qu'une réponse.

import { Router } from "express";
import { isSupportReplyEvent } from "@milo/shared";
import type { SupportReply, SupportReplyEvent } from "@milo/shared";
import { mutation, selection } from "../db/query.js";
import type { SupportReplyRow } from "../db/rows.js";
import { badRequest, conflict, orNotFound, requireText } from "../lib/http.js";
import { descriptionPropre } from "../lib/html.js";

const REPONSE_INTROUVABLE = "Réponse introuvable";
const REPONSE_EXISTANTE = "Cette réponse existe déjà";

const toutes = selection<SupportReplyRow>("SELECT * FROM support_replies ORDER BY name");
const parId = selection<SupportReplyRow>("SELECT * FROM support_replies WHERE id = ?");
const parNom = selection<SupportReplyRow>(
  "SELECT * FROM support_replies WHERE name = ? COLLATE NOCASE AND id != ?",
);
const parEvenement = selection<SupportReplyRow>(
  "SELECT * FROM support_replies WHERE event = ? AND id != ?",
);
const creer = mutation("INSERT INTO support_replies (name, event) VALUES (?, ?)");
const renommer = mutation("UPDATE support_replies SET name = ? WHERE id = ?");
const poserHtml = mutation("UPDATE support_replies SET html = ? WHERE id = ?");
const poserEvenement = mutation("UPDATE support_replies SET event = ? WHERE id = ?");
const supprimer = mutation("DELETE FROM support_replies WHERE id = ?");

const versReponse = (row: SupportReplyRow): SupportReply => ({
  id: row.id,
  name: row.name,
  html: row.html,
  event: isSupportReplyEvent(row.event) ? row.event : null,
});

/** La réponse qu'envoie un évènement, s'il y en a une. */
export const reponsePour = (evenement: SupportReplyEvent): SupportReply | undefined => {
  const row = parEvenement.get(evenement, 0);
  return row && versReponse(row);
};

/**
 * L'évènement reçu, vérifié : connu, et libre — aucune autre réponse ne le
 * porte. Vide : aucun évènement.
 */
const evenementRecu = (recu: unknown, id: number): SupportReplyEvent | "" => {
  if (recu === null || recu === "") return "";
  if (!isSupportReplyEvent(recu)) badRequest("Évènement inconnu");
  const evenement = recu as SupportReplyEvent;
  const autre = parEvenement.get(evenement, id);
  if (autre) conflict(`Cet évènement envoie déjà la réponse « ${autre.name} »`);
  return evenement;
};

export const supportReplyRoutes = Router();

supportReplyRoutes.get("/", (_req, res) => {
  res.json(toutes.all().map(versReponse));
});

supportReplyRoutes.post("/", (req, res) => {
  const name = requireText(req.body.name, "L'intitulé est requis");
  if (parNom.get(name, 0)) conflict(REPONSE_EXISTANTE);
  const evenement = evenementRecu(req.body.event ?? null, 0);

  const { lastInsertRowid } = creer.run(name, evenement);
  res.status(201).json(versReponse(parId.get(lastInsertRowid)!));
});

// L'intitulé et le modèle se modifient séparément : ce qui n'est pas envoyé
// reste. Le HTML passe par la même remise à plat que les descriptions : il ne
// garde que ce que l'éditeur sait produire.
supportReplyRoutes.put("/:id", (req, res) => {
  const existing = orNotFound(parId.get(req.params.id), REPONSE_INTROUVABLE);

  if (req.body.name !== undefined) {
    const name = requireText(req.body.name, "L'intitulé est requis");
    if (parNom.get(name, existing.id)) conflict(REPONSE_EXISTANTE);
    renommer.run(name, existing.id);
  }
  if (req.body.html !== undefined) poserHtml.run(descriptionPropre(req.body.html), existing.id);
  if (req.body.event !== undefined) {
    poserEvenement.run(evenementRecu(req.body.event, existing.id), existing.id);
  }

  res.json(versReponse(parId.get(existing.id)!));
});

supportReplyRoutes.delete("/:id", (req, res) => {
  const existing = orNotFound(parId.get(req.params.id), REPONSE_INTROUVABLE);
  supprimer.run(existing.id);
  res.status(204).end();
});
