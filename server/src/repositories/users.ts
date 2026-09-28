// Les comptes et leurs sessions.

import type { PublicUser } from "@milo/shared";
import { DEFAULT_MODE, isMode } from "@milo/shared";
import { mutation, scalar, selection } from "../db/query.js";
import type { CountRow, SessionRow, UserRow } from "../db/rows.js";
import { fullName, gravatarUrl } from "../lib/auth.js";

export const users = {
  byId: selection<UserRow>("SELECT * FROM users WHERE id = ?"),
  byEmail: selection<UserRow>("SELECT * FROM users WHERE email = ? COLLATE NOCASE"),
  all: selection<UserRow>("SELECT * FROM users ORDER BY name"),
  count: scalar<CountRow>("SELECT COUNT(*) AS count FROM users"),

  create: mutation(
    `INSERT INTO users (first_name, last_name, name, email, password_hash, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
  ),
  saveIdentity: mutation(
    "UPDATE users SET first_name = ?, last_name = ?, name = ?, email = ? WHERE id = ?",
  ),
  setPassword: mutation("UPDATE users SET password_hash = ? WHERE id = ?"),
  setDefaultMode: mutation("UPDATE users SET default_mode = ? WHERE id = ?"),
  remove: mutation("DELETE FROM users WHERE id = ?"),
  /** Vrai si cet identifiant désigne un compte. Sert à filtrer les rattachements. */
  exists: selection<{ id: number }>("SELECT id FROM users WHERE id = ?"),
};

export const sessions = {
  byToken: selection<SessionRow>("SELECT * FROM sessions WHERE token = ?"),
  open: mutation(
    `INSERT INTO sessions (token, user_id, created_at, last_seen_at, expires_at)
     VALUES (?, ?, ?, ?, ?)`,
  ),
  touch: mutation("UPDATE sessions SET last_seen_at = ?, expires_at = ? WHERE token = ?"),
  close: mutation("DELETE FROM sessions WHERE token = ?"),
  /** Après un changement de mot de passe : les autres sessions tombent. */
  closeOthers: mutation("DELETE FROM sessions WHERE user_id = ? AND token != ?"),
  purgeExpired: mutation("DELETE FROM sessions WHERE expires_at != '' AND expires_at < ?"),
};

/** Un compte tel qu'il se montre : jamais son empreinte de mot de passe. */
export const publicUser = (user: UserRow): PublicUser => ({
  id: user.id,
  first_name: user.first_name,
  last_name: user.last_name,
  // `name` reste exposé : il alimente les initiales et les listes d'acteurs.
  name: fullName(user.first_name, user.last_name) || user.email,
  email: user.email,
  gravatar_url: gravatarUrl(user.email),
  // Un mot de passe vide signifie « première connexion à faire ».
  activated: Boolean(user.password_hash),
  default_mode: isMode(user.default_mode) ? user.default_mode : DEFAULT_MODE,
  created_at: user.created_at,
});

/**
 * Une personne telle qu'elle accompagne autre chose : acteur, membre, auteur.
 * Le nom manque tant que la première connexion n'a pas eu lieu — l'e-mail
 * tient alors lieu de nom.
 */
export const actorOf = (row: { id: number; name: string; email: string }) => ({
  id: row.id,
  name: row.name || row.email,
  email: row.email,
  gravatar_url: gravatarUrl(row.email),
});
