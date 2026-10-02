// Les comptes et leurs sessions.
//
// Un compte naît de la première connexion d'une personne par Microsoft, ou
// existait avant Entra et s'y rattache par son e-mail. Le compte « admin »
// (system) est à part : il n'a qu'un mot de passe, ne sert qu'au paramétrage,
// et ne se montre dans aucune liste.

import type { AppPermissions, CompanyRights, Mode, Permissions, PublicUser } from "@milo/shared";
import {
  AREAS,
  DEFAULT_MODE,
  allPermissions,
  defaultAppPermissions,
  isMode,
  validAppPermissions,
  validPermissions,
} from "@milo/shared";
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

/** Un rôle du compte, dans n'importe quelle société : le sien ou celui d'un de ses groupes. */
const unRoleDuCompte = selection<{ role_id: number }>(
  `SELECT a.role_id
   FROM role_assignments a
   WHERE (a.principal_type = 'user' AND a.principal_id = ?)
      OR (a.principal_type = 'group' AND a.principal_id IN (SELECT value FROM json_each(?)))
   LIMIT 1`,
);

/** Ses permissions pour l'application : les siennes et celles de ses groupes. */
const permissionsDuCompte = selection<{ settings: string; modes: string }>(
  `SELECT settings, modes FROM principal_permissions
   WHERE (principal_type = 'user' AND principal_id = ?)
      OR (principal_type = 'group' AND principal_id IN (SELECT value FROM json_each(?)))`,
);

/** Les utilisateurs et groupes qui portent un rôle : ceux sans permissions en base ont celles par défaut. */
const principauxDuCompte = selection<{ principal_type: string; principal_id: string }>(
  `SELECT DISTINCT principal_type, principal_id FROM role_assignments
   WHERE (principal_type = 'user' AND principal_id = ?)
      OR (principal_type = 'group' AND principal_id IN (SELECT value FROM json_each(?)))
   EXCEPT
   SELECT principal_type, principal_id FROM principal_permissions`,
);

/**
 * Ses permissions pour l'application, réunies : le Paramétrage le plus large
 * de ceux qu'il tient, et tous les modes ouverts par l'un ou l'autre — lui ou
 * un de ses groupes. Qui porte un rôle sans permissions réglées a celles par
 * défaut : tous les modes, pas de Paramétrage.
 */
const permissionsApplication = (user: UserRow): AppPermissions => {
  const groupes = JSON.stringify(groupesDu(user));
  const toutes = permissionsDuCompte.all(user.entra_id, groupes).map((l) => {
    let modes: unknown = [];
    try {
      modes = JSON.parse(l.modes);
    } catch {
      // Un JSON illisible n'ouvre aucun mode.
    }
    return validAppPermissions({ settings: l.settings, modes });
  });
  if (principauxDuCompte.get(user.entra_id, groupes)) toutes.push(defaultAppPermissions());

  const modes = new Set<Mode>(toutes.flatMap((p) => p.modes));
  const settings = toutes.some((p) => p.settings === "update")
    ? "update"
    : toutes.some((p) => p.settings === "view")
      ? "view"
      : "";
  return { settings, modes: [...modes] };
};

/** Les mêmes, société par société. */
const rolesParSociete = selection<{ company_id: number; is_admin: number; permissions: string }>(
  `SELECT a.company_id, r.is_admin, r.permissions
   FROM role_assignments a JOIN roles r ON r.id = a.role_id
   WHERE (a.principal_type = 'user' AND a.principal_id = ?)
      OR (a.principal_type = 'group' AND a.principal_id IN (SELECT value FROM json_each(?)))`,
);

const toutesLesSocietes = selection<{ id: number }>("SELECT id FROM companies");

/** Les droits d'un rôle tels qu'il les accorde : tous pour l'administrateur. */
const droitsDuRole = (role: { is_admin: number; permissions: string }): Permissions => {
  if (role.is_admin) return allPermissions();
  try {
    return validPermissions(JSON.parse(role.permissions));
  } catch {
    // Un JSON illisible n'accorde rien.
    return {};
  }
};

/**
 * Ses droits dans les modes, société par société. Le compte « admin » les a
 * tous, partout. Les autres les tiennent de leurs rôles — le leur et ceux de
 * leurs groupes, qui s'additionnent dans une même société. Une société où
 * le compte n'a aucun rôle n'apparaît pas : elle ne lui accorde rien.
 */
export const droitsSocietes = (user: UserRow): CompanyRights => {
  if (user.system) {
    return Object.fromEntries(toutesLesSocietes.all().map((c) => [String(c.id), allPermissions()]));
  }
  // Un mode fermé pour l'application ne s'ouvre par aucun rôle.
  const ouverts = new Set(permissionsApplication(user).modes);
  const parSociete = new Map<string, Permissions>();
  for (const role of rolesParSociete.all(user.entra_id, JSON.stringify(groupesDu(user)))) {
    const cle = String(role.company_id);
    const deja = parSociete.get(cle) ?? {};
    const ajout = droitsDuRole(role);
    const union: Permissions = {};
    for (const { value: area } of AREAS) {
      if (!ouverts.has(area)) continue;
      const droits = new Set([...(deja[area] ?? []), ...(ajout[area] ?? [])]);
      if (droits.size > 0) union[area] = validPermissions({ [area]: [...droits] })[area];
    }
    parSociete.set(cle, union);
  }
  return Object.fromEntries(parSociete);
};

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
 * les tiennent de leurs permissions pour l'application — les leurs ou celles
 * d'un de leurs groupes : le Paramétrage est commun à toutes les sociétés,
 * aucun rôle ne l'accorde. « Modifier » comprend « Voir ».
 */
export const droitsParametrage = (user: UserRow): DroitsParametrage => {
  if (user.system) return { view: true, update: true };
  const { settings } = permissionsApplication(user);
  return { view: settings !== "", update: settings === "update" };
};

/**
 * Le compte a-t-il accès à Milo ? Le compte « admin », quelqu'un qui a un
 * rôle dans au moins une société, ou qui voit le Paramétrage — directement,
 * ou par l'un de ses groupes.
 */
export const aAcces = (user: UserRow): boolean =>
  Boolean(user.system) ||
  unRoleDuCompte.get(user.entra_id, JSON.stringify(groupesDu(user))) !== undefined ||
  droitsParametrage(user).view;

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
  rights: droitsSocietes(user),
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
