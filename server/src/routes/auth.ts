// Ouverture de compte, première connexion, connexion, préférences.
//
// Ce routeur est monté avant `requireAuth` pour ses routes publiques, et
// `/me` y est protégé à part : c'est la seule partie de l'API où la frontière
// passe à l'intérieur d'un routeur.

import { Router } from "express";
import type { Mode } from "@milo/shared";
import { DEFAULT_MODE, isMode, passwordIssues } from "@milo/shared";
import { env } from "../env.js";
import { createToken, fullName, hashPassword, verifyPassword } from "../lib/auth.js";
import { badRequest, conflict } from "../lib/http.js";
import { touch } from "../middleware/events.js";
import { rateLimit } from "../middleware/rate-limit.js";
import { requireAuth } from "../middleware/require-auth.js";
import { publicUser, sessions, users } from "../repositories/users.js";
import { now } from "../lib/time.js";

/** Ouvre une session et rend son jeton. */
const openSession = (userId: number | bigint): string => {
  const token = createToken();
  const maintenant = Date.now();
  sessions.open.run(
    token,
    userId,
    new Date(maintenant).toISOString(),
    new Date(maintenant).toISOString(),
    new Date(maintenant + env.sessionMaxIdleMs).toISOString(),
  );
  return token;
};

const verifierMotDePasse = (password: unknown): void => {
  const issues = passwordIssues(password);
  if (issues.length > 0) {
    badRequest(`Le mot de passe doit contenir : ${issues.join(", ")}`);
  }
};

/**
 * Les routes d'authentification sont les seules où un inconnu peut insister :
 * dix essais par quart d'heure et par adresse suffisent largement à un usage
 * normal, et coupent court à un forçage.
 */
const limiteTentatives = rateLimit({ max: 10, fenetreMs: 15 * 60 * 1000 });

export const publicAuthRoutes = Router();

// Première utilisation : tant qu'aucun compte n'existe, on autorise la
// création du compte initial sans être authentifié.
publicAuthRoutes.get("/setup", (_req, res) => {
  res.json({ needs_setup: users.count().count === 0 });
});

publicAuthRoutes.post("/setup", limiteTentatives, touch("lookups"), (req, res) => {
  if (users.count().count > 0) conflict("Un compte existe déjà");

  const firstName = String(req.body.first_name ?? "").trim();
  const lastName = String(req.body.last_name ?? "").trim();
  const email = String(req.body.email ?? "").trim();
  const password = String(req.body.password ?? "");
  if (!firstName || !lastName || !email || !password) {
    badRequest("Prénom, nom, e-mail et mot de passe sont requis");
  }
  verifierMotDePasse(password);

  const { lastInsertRowid } = users.create.run(
    firstName,
    lastName,
    fullName(firstName, lastName),
    email,
    hashPassword(password),
    now(),
  );

  res.status(201).json({
    token: openSession(lastInsertRowid),
    user: publicUser(users.byId.get(lastInsertRowid)!),
  });
});

// L'administrateur ne crée qu'une adresse ; la personne renseigne elle-même
// son identité et son mot de passe.
publicAuthRoutes.post("/first-login", limiteTentatives, touch("lookups"), (req, res) => {
  const email = String(req.body.email ?? "").trim();
  const firstName = String(req.body.first_name ?? "").trim();
  const lastName = String(req.body.last_name ?? "").trim();
  const password = String(req.body.password ?? "");
  const confirm = req.body.password_confirm;

  if (!email || !firstName || !lastName || !password) badRequest("Tous les champs sont requis");
  verifierMotDePasse(password);
  if (password !== confirm) badRequest("Les deux mots de passe ne correspondent pas");

  const user = users.byEmail.get(email);
  // Même réponse si l'adresse est inconnue ou déjà activée : on n'indique pas
  // quelles adresses existent.
  if (!user || user.password_hash) {
    conflict("Cette adresse est inconnue ou son mot de passe est déjà défini");
    return;
  }

  users.saveIdentity.run(firstName, lastName, fullName(firstName, lastName), user.email, user.id);
  users.setPassword.run(hashPassword(password), user.id);

  res.json({ token: openSession(user.id), user: publicUser(users.byId.get(user.id)!) });
});

publicAuthRoutes.post("/login", limiteTentatives, (req, res) => {
  const email = String(req.body.email ?? "").trim();
  const password = String(req.body.password ?? "");
  const user = email ? users.byEmail.get(email) : undefined;

  // Même message dans les deux cas : on n'indique pas si l'e-mail existe.
  if (!user?.password_hash || !password || !verifyPassword(password, user.password_hash)) {
    res.status(401).json({ error: "E-mail ou mot de passe incorrect" });
    return;
  }
  res.json({ token: openSession(user.id), user: publicUser(user) });
});

// --- Ce qui suit exige une session -----------------------------------------

export const authRoutes = Router();
authRoutes.use(requireAuth);

authRoutes.get("/me", (req, res) => {
  res.json(publicUser(req.user));
});

// Préférences : identité, mode d'ouverture et, si demandé, mot de passe. Le
// nom apparaît partout où la personne est acteur ou membre : les listes de
// référence et les projets changent avec lui.
authRoutes.put("/me", touch("lookups", "projects", "task-lists"), (req, res) => {
  const firstName = String(req.body.first_name ?? req.user.first_name).trim();
  const lastName = String(req.body.last_name ?? req.user.last_name).trim();
  const email = String(req.body.email ?? req.user.email).trim();
  const password = req.body.password as string | undefined;

  if (!firstName || !lastName || !email) badRequest("Prénom, nom et e-mail sont requis");

  const duplicate = users.byEmail.get(email);
  if (duplicate && duplicate.id !== req.user.id) conflict("Cet e-mail est déjà utilisé");

  if (password) {
    verifierMotDePasse(password);
    if (password !== req.body.password_confirm) {
      badRequest("Les deux mots de passe ne correspondent pas");
    }
  }

  const recu = req.body.default_mode ?? req.user.default_mode ?? DEFAULT_MODE;
  if (!isMode(recu)) badRequest("Mode inconnu");
  const defaultMode: Mode = recu as Mode;

  users.saveIdentity.run(firstName, lastName, fullName(firstName, lastName), email, req.user.id);
  users.setDefaultMode.run(defaultMode, req.user.id);

  if (password) {
    users.setPassword.run(hashPassword(password), req.user.id);
    // Les autres sessions de ce compte sont fermées.
    sessions.closeOthers.run(req.user.id, req.token);
  }

  res.json(publicUser(users.byId.get(req.user.id)!));
});

authRoutes.post("/logout", (req, res) => {
  sessions.close.run(req.token);
  res.status(204).end();
});
