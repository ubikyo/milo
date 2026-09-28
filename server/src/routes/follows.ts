// Le suivi : ce que chacun demande à être prévenu quand cela change.
//
// Rien ici ne touche les compteurs d'événements : suivre un élément ne change
// ce que voit personne d'autre, et le client tient sa propre liste à jour.

import { Router } from "express";
import { badRequest } from "../lib/http.js";
import { isFollowKind } from "@milo/shared";
import type { FollowKind, Id } from "@milo/shared";
import { follows } from "../repositories/follows.js";
import { now } from "../lib/time.js";

export const followRoutes = Router();

/**
 * La sorte reçue. Écrite ainsi — un « return » sur une fonction qui lève —
 * pour que le garde de type rende bien un `FollowKind` à la suite, sans
 * transtypage.
 */
const sorte = (valeur: unknown): FollowKind => {
  if (!isFollowKind(valeur)) return badRequest("Sorte d'élément inconnue");
  return valeur;
};

const identifiant = (valeur: unknown): Id => {
  const id = Number(valeur);
  if (!Number.isInteger(id) || id <= 0) return badRequest("Identifiant invalide");
  return id;
};

followRoutes.get("/", (req, res) => {
  res.json(follows.of(req.user.id));
});

followRoutes.put("/:kind/:id", (req, res) => {
  follows.add(req.user.id, sorte(req.params.kind), identifiant(req.params.id), now());
  res.json(follows.of(req.user.id));
});

followRoutes.delete("/:kind/:id", (req, res) => {
  follows.remove(req.user.id, sorte(req.params.kind), identifiant(req.params.id));
  res.json(follows.of(req.user.id));
});
