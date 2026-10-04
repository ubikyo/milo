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
  ALL_COMPANIES,
  canRead,
  widgetPermissions,
  mergeWidgetRights,
  validAdminPermissions,
  validWidgetRights,
  widgetRightsEverywhere,
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
const ACCOUNT_PRINCIPAL = `(principal_type = 'user' AND principal_id = ?)
      OR (principal_type = 'group' AND principal_id IN (SELECT value FROM json_each(?)))`;

/**
 * Ses accès, workspace par workspace : les siens et ceux de ses groupes, une
 * ligne par principal et par workspace.
 */
const accountAccess = selection<{ workspace_id: number; widgets: string }>(
  `SELECT workspace_id, widgets FROM principal_permissions WHERE ${ACCOUNT_PRINCIPAL}`,
);

/** Son administration : la sienne et celle de ses groupes. */
const accountAdministration = selection<{ settings: string; workspaces: string }>(
  `SELECT settings, workspaces FROM principal_admin WHERE ${ACCOUNT_PRINCIPAL}`,
);

/** Ses accès, relus : un JSON illisible n'accorde rien. */
const userRows = (user: UserRow): { workspace: Id; widgets: WidgetRights }[] =>
  accountAccess.all(user.entra_id, JSON.stringify(groupsOf(user))).map((l) => {
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
const administrationOf = (user: UserRow): AdminPermissions => {
  if (user.system) return { settings: "update", workspaces: "update" };
  const all = accountAdministration
    .all(user.entra_id, JSON.stringify(groupsOf(user)))
    .map(validAdminPermissions);
  return {
    settings: all.some((p) => p.settings === "update")
      ? "update"
      : all.some((p) => p.settings === "view")
        ? "view"
        : "",
    workspaces: all.some((p) => p.workspaces === "update") ? "update" : "",
  };
};

/**
 * Les workspaces auxquels il a accès — où il lit au moins un type de widget —,
 * dans leur ordre : tous pour le compte « admin ».
 */
export const workspacesOf = (user: UserRow): WorkspaceRef[] => {
  const all = workspaces.all.all().map(({ id, name }) => ({ id, name }));
  if (user.system) return all;
  const openItems = new Set(
    userRows(user)
      .filter((l) => Object.values(l.widgets).some(canRead))
      .map((l) => l.workspace),
  );
  return all.filter((w) => openItems.has(w.id));
};

/**
 * Le workspace où il travaille : celui qu'il a choisi s'il y a encore accès,
 * sinon le premier des siens — « null » s'il n'en a aucun.
 */
export const currentWorkspace = (user: UserRow): Id | null => {
  const own = workspacesOf(user);
  return (own.find((w) => w.id === user.workspace_id) ?? own[0])?.id ?? null;
};

/** Peut-il gérer les workspaces ? Le compte « admin », ou à qui l'administration l'accorde. */
export const canManageWorkspaces = (user: UserRow): boolean =>
  administrationOf(user).workspaces === "update";

/**
 * Ses permissions par type de widget dans le workspace où il travaille
 * (« workspace_id », que requireAuth tient à jour), réunies — les siennes et
 * celles de ses groupes, la plus large pour chaque type. Le compte « admin »
 * a tout.
 */
const workspaceWidgets = (user: UserRow): WidgetRights =>
  user.system
    ? widgetRightsEverywhere("update")
    : mergeWidgetRights(
        userRows(user)
          .filter((l) => l.workspace === user.workspace_id)
          .map((l) => l.widgets),
      );

/** Ses permissions par type de widget. */
export const widgetRights = (user: UserRow): WidgetRights => workspaceWidgets(user);

/**
 * Ses droits dans les modes, déduits de ses permissions par type de widget
 * (shared, permissionsDesWidgets). Ils valent pour toutes les sociétés : la
 * clé « * » le dit.
 */
export const companyRights = (user: UserRow): CompanyRights => ({
  [ALL_COMPANIES]: widgetPermissions(widgetRights(user)),
});

/** Les groupes Entra du compte, tels que relus à sa dernière connexion. */
export const groupsOf = (user: UserRow): string[] => {
  try {
    const groups = JSON.parse(user.entra_groups) as unknown;
    return Array.isArray(groups) ? groups.map(String) : [];
  } catch {
    return [];
  }
};

export interface SettingsRights {
  view: boolean;
  update: boolean;
}

/**
 * Ses droits sur le Paramétrage, tenus de son administration — la sienne ou
 * celle d'un de ses groupes. Le compte « admin » les a tous. « Modifier »
 * comprend « Voir ».
 */
export const settingsRights = (user: UserRow): SettingsRights => {
  const { settings } = administrationOf(user);
  return { view: settings !== "", update: settings === "update" };
};

/**
 * Le compte a-t-il accès à Milo ? Le compte « admin », quelqu'un qui a accès
 * à au moins un workspace — directement, ou par l'un de ses groupes —, qui
 * voit le Paramétrage ou qui gère les workspaces.
 */
export const hasAccess = (user: UserRow): boolean =>
  Boolean(user.system) ||
  workspacesOf(user).length > 0 ||
  administrationOf(user).settings !== "" ||
  canManageWorkspaces(user);

/**
 * Le compte, son workspace remis d'aplomb : celui qu'il a choisi s'il y a
 * encore accès, sinon le premier des siens. Le changement s'enregistre, pour
 * que les requêtes qui le relisent en SQL (« @me ») trouvent le même.
 */
export const inOwnWorkspace = (user: UserRow): UserRow => {
  const current = currentWorkspace(user);
  if (current === user.workspace_id) return user;
  users.setWorkspace.run(current, user.id);
  return { ...user, workspace_id: current };
};

/** Un compte tel qu'il se montre : jamais son empreinte de mot de passe. */
export const publicUser = (account: UserRow): PublicUser => {
  // Rien ne s'enregistre ici : la liste des comptes passe aussi par là.
  const user = { ...account, workspace_id: currentWorkspace(account) };
  return {
    id: user.id,
    first_name: user.first_name,
    last_name: user.last_name,
    // `name` reste exposé : il alimente les initiales et les listes d'acteurs.
    name: fullName(user.first_name, user.last_name) || user.email,
    email: user.email,
    gravatar_url: gravatarUrl(user.email),
    settings: settingsRights(user),
    rights: companyRights(user),
    widgets: widgetRights(user),
    system: Boolean(user.system),
    default_view: user.default_view ?? "",
    workspace: user.workspace_id,
    workspaces: workspacesOf(user),
    manage_workspaces: canManageWorkspaces(user),
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
