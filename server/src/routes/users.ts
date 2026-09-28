// Les comptes, vus depuis les réglages. Chacun ne modifie le sien que par ses
// préférences (PUT /api/auth/me), qui gère aussi le mot de passe.

import { Router } from "express";
import { conflict, orNotFound, requireText } from "../lib/http.js";
import { touch } from "../middleware/events.js";
import { publicUser, users } from "../repositories/users.js";
import { fullName } from "../lib/auth.js";
import { now } from "../lib/time.js";

const UTILISATEUR_INTROUVABLE = "Utilisateur introuvable";

export const userRoutes = Router();

// Le nom d'un compte s'affiche partout où il est acteur ou membre.
userRoutes.use(touch("lookups", "projects", "task-lists"));

userRoutes.get("/", (_req, res) => {
  res.json(users.all.all().map(publicUser));
});

// L'administrateur n'invite qu'une adresse ; la personne complète son profil
// lors de sa première connexion.
userRoutes.post("/", (req, res) => {
  const email = requireText(req.body.email, "L'e-mail est requis");
  if (users.byEmail.get(email)) conflict("Cet e-mail est déjà utilisé");

  // Les colonnes sont renseignées explicitement : sur une base créée avant
  // l'ajout des valeurs par défaut, `name` et `password_hash` sont NOT NULL
  // sans défaut, et `CREATE TABLE IF NOT EXISTS` ne les a pas modifiées.
  const { lastInsertRowid } = users.create.run("", "", "", email, "", now());
  res.status(201).json(publicUser(users.byId.get(lastInsertRowid)!));
});

userRoutes.put("/:id", (req, res) => {
  const existing = orNotFound(users.byId.get(req.params.id), UTILISATEUR_INTROUVABLE);
  if (existing.id === req.user.id) {
    conflict("Modifiez votre propre compte depuis vos préférences");
  }

  const firstName = String(req.body.first_name ?? existing.first_name).trim();
  const lastName = String(req.body.last_name ?? existing.last_name).trim();
  const email = requireText(req.body.email ?? existing.email, "L'e-mail est requis");

  const duplicate = users.byEmail.get(email);
  if (duplicate && duplicate.id !== existing.id) conflict("Cet e-mail est déjà utilisé");

  users.saveIdentity.run(firstName, lastName, fullName(firstName, lastName), email, existing.id);
  res.json(publicUser(users.byId.get(existing.id)!));
});

userRoutes.delete("/:id", (req, res) => {
  const existing = orNotFound(users.byId.get(req.params.id), UTILISATEUR_INTROUVABLE);
  if (existing.id === req.user.id) conflict("Vous ne pouvez pas supprimer votre propre compte");
  if (users.count().count <= 1) conflict("Il doit rester au moins un utilisateur");

  users.remove.run(existing.id);
  res.status(204).end();
});
