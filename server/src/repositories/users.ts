// Les comptes et leurs sessions.
//
// Un compte naît de la première connexion d'une personne par Microsoft, ou
// existait avant Entra et s'y rattache par son e-mail. Le compte « admin »
// (system) est à part : il n'a qu'un mot de passe, ne sert qu'au paramétrage,
// et ne se montre dans aucune liste.

import type { PublicUser } from "@milo/shared";
import { DEFAULT_MODE, isMode, validPermissions } from "@milo/shared";
import { mutation, selection } from "../db/query.js";
import type { SessionRow, UserRow } from "../db/rows.js";
import { fullName, gravatarUrl } from "../lib/auth.js";

/** L'identifiant du compte « admin ». */
export const ADMIN_USERNAME = "admin";

export const users = {
  byId: selection<UserRow>("SELECT * FROM users WHERE id = ?"),
  byEmail: selection<UserRow>("SELECT * FROM users WHERE email = ? COLLATE NOCASE AND system = 0"),
  byEntraId: selection<UserRow>("SELECT * FROM users WHERE entra_id = ? AND system = 0"),
  /** Les personnes : jamais le compte « admin ». */
  all: selection<UserRow>("SELECT * FROM users WHERE system = 0 ORDER BY name"),
  admin: selection<UserRow>("SELECT * FROM users WHERE system = 1"),

  createAdmin: mutation(
    `INSERT INTO users (first_name, last_name, name, email, password_hash, created_at, system)
     VALUES ('Admin', '', 'Admin', ?, ?, ?, 1)`,
  ),
  createFromEntra: mutation(
    `INSERT INTO users (first_name, last_name, name, email, password_hash, created_at, entra_id)
     VALUES (?, ?, ?, ?, '', ?, ?)`,
  ),
  /** À chaque connexion : l'identité et les groupes, tels qu'Entra les donne. */
  syncEntra: mutation(
    `UPDATE users SET first_name = ?, last_name = ?, name = ?, email = ?, entra_id = ?, entra_groups = ?
     WHERE id = ?`,
  ),
  setPassword: mutation("UPDATE users SET password_hash = ? WHERE id = ?"),
  setDefaultMode: mutation("UPDATE users SET default_mode = ? WHERE id = ?"),
  /** Vrai si cet identifiant désigne une personne. Sert à filtrer les rattachements. */
  exists: selection<{ id: number }>("SELECT id FROM users WHERE id = ? AND system = 0"),
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

/** Les rôles du compte, dans toutes ses sociétés : les siens et ceux de ses groupes. */
const rolesDuCompte = selection<{ is_admin: number; permissions: string }>(
  `SELECT r.is_admin, r.permissions
   FROM role_assignments a JOIN roles r ON r.id = a.role_id
   WHERE (a.principal_type = 'user' AND a.principal_id = ?)
      OR (a.principal_type = 'group' AND a.principal_id IN (SELECT value FROM json_each(?)))`,
);

/** Les groupes Entra du compte, tels que relus à sa dernière connexion. */
export const groupesDu = (user: UserRow): string[] => {
  try {
    const groupes = JSON.parse(user.entra_groups) as unknown;
    return Array.isArray(groupes) ? groupes.map(String) : [];
  } catch {
    return [];
  }
};

export interface DroitsParametrage {
  view: boolean;
  update: boolean;
}

/**
 * Ses droits sur le Paramétrage. Le compte « admin » les a tous. Les autres
 * les tiennent de leurs rôles, dans n'importe quelle société : le Paramétrage
 * est commun à toutes — le rôle Administrateur les accorde toujours, les
 * autres rôles selon leur grille.
 */
export const droitsParametrage = (user: UserRow): DroitsParametrage => {
  if (user.system) return { view: true, update: true };

  const droits = { view: false, update: false };
  for (const role of rolesDuCompte.all(user.entra_id, JSON.stringify(groupesDu(user)))) {
    if (role.is_admin) return { view: true, update: true };
    let accordes: string[] = [];
    try {
      accordes = validPermissions(JSON.parse(role.permissions)).settings ?? [];
    } catch {
      // Un JSON illisible n'accorde rien.
    }
    if (accordes.includes("view")) droits.view = true;
    if (accordes.includes("update")) droits.update = true;
  }
  return droits;
};

/**
 * Le compte a-t-il accès à Milo ? Le compte « admin », ou quelqu'un qui a un
 * rôle dans au moins une société — directement, ou par l'un de ses groupes.
 */
export const aAcces = (user: UserRow): boolean =>
  Boolean(user.system) ||
  rolesDuCompte.get(user.entra_id, JSON.stringify(groupesDu(user))) !== undefined;

/** Un compte tel qu'il se montre : jamais son empreinte de mot de passe. */
export const publicUser = (user: UserRow): PublicUser => ({
  id: user.id,
  first_name: user.first_name,
  last_name: user.last_name,
  // `name` reste exposé : il alimente les initiales et les listes d'acteurs.
  name: fullName(user.first_name, user.last_name) || user.email,
  email: user.email,
  gravatar_url: gravatarUrl(user.email),
  settings: droitsParametrage(user),
  system: Boolean(user.system),
  default_mode: isMode(user.default_mode) ? user.default_mode : DEFAULT_MODE,
  created_at: user.created_at,
});

/**
 * Une personne telle qu'elle accompagne autre chose : acteur, membre, auteur.
 * L'e-mail tient lieu de nom quand il manque.
 */
export const actorOf = (row: { id: number; name: string; email: string }) => ({
  id: row.id,
  name: row.name || row.email,
  email: row.email,
  gravatar_url: gravatarUrl(row.email),
});
