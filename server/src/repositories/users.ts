// Les comptes et leurs sessions.
//
// Un compte naît de la première connexion d'une personne par Microsoft, ou
// existait avant Entra et s'y rattache par son e-mail. Le compte « admin »
// (system) est à part : il n'a qu'un mot de passe, ne sert qu'au paramétrage,
// et ne se montre dans aucune liste.

import type {
  AdminPermissions,
  CompanyRights,
  Id,
  PublicUser,
  WidgetRights,
  WorkspaceRef,
} from "@milo/shared";
import {
  TOUTES_SOCIETES,
  peutLire,
  permissionsDesWidgets,
  reunirWidgetRights,
  validAdminPermissions,
  validWidgetRights,
  widgetRightsPartout,
} from "@milo/shared";
import { mutation, selection } from "../db/query.js";
import type { SessionRow, UserRow } from "../db/rows.js";
import { fullName, gravatarUrl } from "../lib/auth.js";
import { workspaces } from "./workspaces.js";

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
  setDefaultView: mutation("UPDATE users SET default_view = ? WHERE id = ?"),
  setWorkspace: mutation("UPDATE users SET workspace_id = ? WHERE id = ?"),
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

/** Qui il est pour les permissions : lui, ou l'un de ses groupes. */
const PRINCIPAL_DU_COMPTE = `(principal_type = 'user' AND principal_id = ?)
      OR (principal_type = 'group' AND principal_id IN (SELECT value FROM json_each(?)))`;

/**
 * Ses accès, workspace par workspace : les siens et ceux de ses groupes, une
 * ligne par principal et par workspace.
 */
const accesDuCompte = selection<{ workspace_id: number; widgets: string }>(
  `SELECT workspace_id, widgets FROM principal_permissions WHERE ${PRINCIPAL_DU_COMPTE}`,
);

/** Son administration : la sienne et celle de ses groupes. */
const administrationDuCompte = selection<{ settings: string; workspaces: string }>(
  `SELECT settings, workspaces FROM principal_admin WHERE ${PRINCIPAL_DU_COMPTE}`,
);

/** Ses accès, relus : un JSON illisible n'accorde rien. */
const lignesDu = (user: UserRow): { workspace: Id; widgets: WidgetRights }[] =>
  accesDuCompte.all(user.entra_id, JSON.stringify(groupesDu(user))).map((l) => {
    let widgets: unknown = {};
    try {
      widgets = JSON.parse(l.widgets);
    } catch {
      // Un JSON illisible n'accorde rien.
    }
    return { workspace: l.workspace_id, widgets: validWidgetRights(widgets) };
  });

/**
 * Son administration, réunie — la sienne et celle de ses groupes : le
 * Paramétrage le plus large, la gestion des workspaces si l'une l'accorde.
 * Le compte « admin » a tout.
 */
const administrationDu = (user: UserRow): AdminPermissions => {
  if (user.system) return { settings: "update", workspaces: "update" };
  const toutes = administrationDuCompte
    .all(user.entra_id, JSON.stringify(groupesDu(user)))
    .map(validAdminPermissions);
  return {
    settings: toutes.some((p) => p.settings === "update")
      ? "update"
      : toutes.some((p) => p.settings === "view")
        ? "view"
        : "",
    workspaces: toutes.some((p) => p.workspaces === "update") ? "update" : "",
  };
};

/**
 * Les workspaces auxquels il a accès — où il lit au moins un type de widget —,
 * dans leur ordre : tous pour le compte « admin ».
 */
export const workspacesDu = (user: UserRow): WorkspaceRef[] => {
  const tous = workspaces.all.all().map(({ id, name }) => ({ id, name }));
  if (user.system) return tous;
  const ouverts = new Set(
    lignesDu(user)
      .filter((l) => Object.values(l.widgets).some(peutLire))
      .map((l) => l.workspace),
  );
  return tous.filter((w) => ouverts.has(w.id));
};

/**
 * Le workspace où il travaille : celui qu'il a choisi s'il y a encore accès,
 * sinon le premier des siens — « null » s'il n'en a aucun.
 */
export const workspaceCourant = (user: UserRow): Id | null => {
  const siens = workspacesDu(user);
  return (siens.find((w) => w.id === user.workspace_id) ?? siens[0])?.id ?? null;
};

/** Peut-il gérer les workspaces ? Le compte « admin », ou à qui l'administration l'accorde. */
export const peutGererWorkspaces = (user: UserRow): boolean =>
  administrationDu(user).workspaces === "update";

/**
 * Ses permissions par type de widget dans le workspace où il travaille
 * (« workspace_id », que requireAuth tient à jour), réunies — les siennes et
 * celles de ses groupes, la plus large pour chaque type. Le compte « admin »
 * a tout.
 */
const widgetsDuWorkspace = (user: UserRow): WidgetRights =>
  user.system
    ? widgetRightsPartout("update")
    : reunirWidgetRights(
        lignesDu(user)
          .filter((l) => l.workspace === user.workspace_id)
          .map((l) => l.widgets),
      );

/** Ses permissions par type de widget. */
export const droitsWidgets = (user: UserRow): WidgetRights => widgetsDuWorkspace(user);

/**
 * Ses droits dans les modes, déduits de ses permissions par type de widget
 * (shared, permissionsDesWidgets). Ils valent pour toutes les sociétés : la
 * clé « * » le dit.
 */
export const droitsSocietes = (user: UserRow): CompanyRights => ({
  [TOUTES_SOCIETES]: permissionsDesWidgets(droitsWidgets(user)),
});

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
 * Ses droits sur le Paramétrage, tenus de son administration — la sienne ou
 * celle d'un de ses groupes. Le compte « admin » les a tous. « Modifier »
 * comprend « Voir ».
 */
export const droitsParametrage = (user: UserRow): DroitsParametrage => {
  const { settings } = administrationDu(user);
  return { view: settings !== "", update: settings === "update" };
};

/**
 * Le compte a-t-il accès à Milo ? Le compte « admin », quelqu'un qui a accès
 * à au moins un workspace — directement, ou par l'un de ses groupes —, qui
 * voit le Paramétrage ou qui gère les workspaces.
 */
export const aAcces = (user: UserRow): boolean =>
  Boolean(user.system) ||
  workspacesDu(user).length > 0 ||
  administrationDu(user).settings !== "" ||
  peutGererWorkspaces(user);

/**
 * Le compte, son workspace remis d'aplomb : celui qu'il a choisi s'il y a
 * encore accès, sinon le premier des siens. Le changement s'enregistre, pour
 * que les requêtes qui le relisent en SQL (« @me ») trouvent le même.
 */
export const dansSonWorkspace = (user: UserRow): UserRow => {
  const courant = workspaceCourant(user);
  if (courant === user.workspace_id) return user;
  users.setWorkspace.run(courant, user.id);
  return { ...user, workspace_id: courant };
};

/** Un compte tel qu'il se montre : jamais son empreinte de mot de passe. */
export const publicUser = (compte: UserRow): PublicUser => {
  // Rien ne s'enregistre ici : la liste des comptes passe aussi par là.
  const user = { ...compte, workspace_id: workspaceCourant(compte) };
  return {
    id: user.id,
    first_name: user.first_name,
    last_name: user.last_name,
    // `name` reste exposé : il alimente les initiales et les listes d'acteurs.
    name: fullName(user.first_name, user.last_name) || user.email,
    email: user.email,
    gravatar_url: gravatarUrl(user.email),
    settings: droitsParametrage(user),
    rights: droitsSocietes(user),
    widgets: droitsWidgets(user),
    system: Boolean(user.system),
    default_view: user.default_view ?? "",
    workspace: user.workspace_id,
    workspaces: workspacesDu(user),
    manage_workspaces: peutGererWorkspaces(user),
    created_at: user.created_at,
  };
};

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
