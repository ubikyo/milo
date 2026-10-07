// Accounts and their sessions.
//
// An account is born from a person's first Microsoft sign-in, or existed
// before Entra and attaches to it through its e-mail. The "admin" account
// (system) is separate: it only has a password, is only used for settings,
// and appears in no list.

import type {
  AdminPermissions,
  AdministrationRights,
  CompanyRights,
  Id,
  PublicUser,
  WidgetRights,
  WorkspaceRef,
  WorkspaceRights,
  NotificationRight,
  NotificationRights,
  ApplicationRight,
  ApplicationRights,
  StructurePermissions,
  StructureRights,
} from "@milo/shared";
import {
  ALL_COMPANIES,
  grantsAnything,
  fullAdminPermissions,
  mergeAdminPermissions,
  widgetPermissions,
  mergeWidgetRights,
  parseAdminRights,
  mergeNotificationRights,
  validNotificationRights,
  fullApplicationRights,
  mergeApplicationRights,
  validApplicationRights,
  fullStructureRights,
  mergeStructureRights,
  validStructurePermissions,
  validWidgetRights,
  widgetRightsEverywhere,
} from "@milo/shared";
import { mutation, selection } from "../db/query.js";
import type { SessionRow, UserRow } from "../db/rows.js";
import { fullName, gravatarUrl } from "../lib/auth.js";
import { notificationSettings } from "../lib/notification-settings.js";
import { workspaces } from "./workspaces.js";

/** The id of the "admin" account. */
export const ADMIN_USERNAME = "admin";

export const users = {
  byId: selection<UserRow>("SELECT * FROM users WHERE id = ?"),
  byEmail: selection<UserRow>("SELECT * FROM users WHERE email = ? COLLATE NOCASE AND system = 0"),
  byEntraId: selection<UserRow>("SELECT * FROM users WHERE entra_id = ? AND system = 0"),
  /** People: never the "admin" account. */
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
  /** On every sign-in: the identity and groups, as Entra provides them. */
  syncEntra: mutation(
    `UPDATE users SET first_name = ?, last_name = ?, name = ?, email = ?, entra_id = ?, entra_groups = ?
     WHERE id = ?`,
  ),
  setPassword: mutation("UPDATE users SET password_hash = ? WHERE id = ?"),
  /** The opening workspace, view and board, chosen in the profile. */
  setOpening: mutation(
    "UPDATE users SET default_workspace_id = ?, default_view = ?, default_board = ? WHERE id = ?",
  ),
  setWorkspace: mutation("UPDATE users SET workspace_id = ? WHERE id = ?"),
  /** Their notification settings, as JSON, chosen in the preferences. */
  setNotificationSettings: mutation("UPDATE users SET notification_settings = ? WHERE id = ?"),
  /** True if this id designates a person. Used to filter the attachments. */
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
  /** After a password change: the other sessions are dropped. */
  closeOthers: mutation("DELETE FROM sessions WHERE user_id = ? AND token != ?"),
  purgeExpired: mutation("DELETE FROM sessions WHERE expires_at != '' AND expires_at < ?"),
};

/** Who they are for permissions: themselves, or one of their groups. */
const ACCOUNT_PRINCIPAL = `(principal_type = 'user' AND principal_id = ?)
      OR (principal_type = 'group' AND principal_id IN (SELECT value FROM json_each(?)))`;

/**
 * Their access, workspace by workspace: their own and their groups', one
 * row per principal and per workspace.
 */
const accountAccess = selection<{
  workspace_id: number;
  widgets: string;
  notifications: string;
  application: string;
  structure: string;
}>(
  `SELECT workspace_id, widgets, notifications, application, structure FROM principal_permissions
   WHERE ${ACCOUNT_PRINCIPAL}`,
);

/** Their administration: their own and their groups'. */
const accountAdministration = selection<{ rights: string }>(
  `SELECT rights FROM principal_admin WHERE ${ACCOUNT_PRINCIPAL}`,
);

/** JSON as stored: unreadable, it grants nothing. */
const parsed = (json: string): unknown => {
  try {
    return JSON.parse(json);
  } catch {
    return undefined;
  }
};

/** Their access, re-read: unreadable JSON grants nothing. */
const userRows = (
  user: UserRow,
): {
  workspace: Id;
  widgets: WidgetRights;
  notifications: NotificationRight[];
  application: ApplicationRight[];
  structure: StructurePermissions;
}[] =>
  accountAccess.all(user.entra_id, JSON.stringify(groupsOf(user))).map((l) => ({
    workspace: l.workspace_id,
    widgets: validWidgetRights(parsed(l.widgets)),
    notifications: validNotificationRights(parsed(l.notifications)),
    application: validApplicationRights(parsed(l.application)),
    structure: validStructurePermissions(parsed(l.structure)),
  }));

/**
 * Their administration, merged — their own and their groups': each right
 * that one of them grants. The "admin" account has everything.
 */
const administrationOf = (user: UserRow): AdminPermissions => {
  if (user.system) return fullAdminPermissions();
  return mergeAdminPermissions(
    accountAdministration
      .all(user.entra_id, JSON.stringify(groupsOf(user)))
      .map((row) => parseAdminRights(row.rights)),
  );
};

/**
 * The workspaces they can access — where Accès grants them at least one right —,
 * in their order: all of them for the "admin" account.
 */
export const workspacesOf = (user: UserRow): WorkspaceRef[] => {
  const all = workspaces.all.all().map(({ id, name }) => ({ id, name }));
  if (user.system) return all;
  const openItems = new Set(
    userRows(user)
      .filter((l) => grantsAnything(l))
      .map((l) => l.workspace),
  );
  return all.filter((w) => openItems.has(w.id));
};

/**
 * The workspace they work in: the one they chose if they still have access to
 * it, otherwise the first of theirs — "null" if they have none.
 */
export const currentWorkspace = (user: UserRow): Id | null => {
  const own = workspacesOf(user);
  return (own.find((w) => w.id === user.workspace_id) ?? own[0])?.id ?? null;
};

/** Their rights on workspaces: the "admin" account's, or those administration grants them. */
export const workspaceRights = (user: UserRow): WorkspaceRights => {
  const { workspaces } = administrationOf(user);
  return {
    view: workspaces.includes("view"),
    create: workspaces.includes("create"),
    delete: workspaces.includes("delete"),
  };
};

/** Their rights on the administration: the "admin" account's, or those it grants them. */
export const administrationRights = (user: UserRow): AdministrationRights => {
  const { administration } = administrationOf(user);
  return {
    view: administration.includes("view"),
    create: administration.includes("create"),
    delete: administration.includes("delete"),
  };
};

/** Their administration, merged: what they may grant to others. */
export const adminPermissions = (user: UserRow): AdminPermissions => administrationOf(user);

/** Do they manage the e-mail templates ("Gestion des modèles d'email")? */
export const templatesAccess = (user: UserRow): boolean =>
  administrationOf(user).templates.includes("access");

/** Do they manage the themes ("Gestion des thèmes")? */
export const themesAccess = (user: UserRow): boolean =>
  administrationOf(user).themes.includes("access");

/** Do they hold at least one right in the administration? */
const anyAdminRight = (user: UserRow): boolean =>
  Object.values(administrationOf(user)).some((rights) => rights.length > 0);

/**
 * Their permissions per widget type in the workspace they work in
 * ("workspace_id", which requireAuth keeps up to date), merged — their own and
 * their groups', the widest for each type. The "admin" account has
 * everything.
 */
const workspaceWidgets = (user: UserRow): WidgetRights =>
  user.system
    ? widgetRightsEverywhere("delete")
    : mergeWidgetRights(
        userRows(user)
          .filter((l) => l.workspace === user.workspace_id)
          .map((l) => l.widgets),
      );

/** Their permissions per widget type. */
export const widgetRights = (user: UserRow): WidgetRights => workspaceWidgets(user);

/**
 * The notifications they receive in the workspace they work in — the one
 * they chose if they still have access to it —, merged: their own and their
 * groups'. The "admin" account receives them all.
 */
export const notificationRights = (user: UserRow): NotificationRights => {
  if (user.system) return { screen: true, email: true };
  const workspace = currentWorkspace(user);
  return mergeNotificationRights(
    userRows(user)
      .filter((l) => l.workspace === workspace)
      .map((l) => l.notifications),
  );
};

/**
 * What they may do with the interface of the workspace they work in, merged
 * — their own and their groups'. The "admin" account may do everything.
 */
export const applicationRights = (user: UserRow): ApplicationRights => {
  if (user.system) return fullApplicationRights();
  const workspace = currentWorkspace(user);
  return mergeApplicationRights(
    userRows(user)
      .filter((l) => l.workspace === workspace)
      .map((l) => l.application),
  );
};

/**
 * What they may do with the views and boards of the workspace they work in, merged — their own and their groups'. The "admin" account may do
 * everything.
 */
export const structureRights = (user: UserRow): StructureRights => {
  if (user.system) return fullStructureRights();
  const workspace = currentWorkspace(user);
  return mergeStructureRights(
    userRows(user)
      .filter((l) => l.workspace === workspace)
      .map((l) => l.structure),
  );
};

/**
 * Their rights in the modes, derived from their permissions per widget type
 * (shared, widgetPermissions). They apply to all companies: the "*" key says
 * so.
 */
export const companyRights = (user: UserRow): CompanyRights => ({
  [ALL_COMPANIES]: widgetPermissions(widgetRights(user)),
});

/** The account's Entra groups, as re-read at their last sign-in. */
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
 * Their rights on "Paramétrage", held through their administration — their own
 * or one of their groups'. The "admin" account has them all. "Autorisée"
 * ("Gestion du paramétrage") opens it and changes it.
 */
export const settingsRights = (user: UserRow): SettingsRights => {
  const access = administrationOf(user).settings.includes("access");
  return { view: access, update: access };
};

/**
 * Does the account have access to Milo? The "admin" account, someone with
 * access to at least one workspace — directly, or through one of their
 * groups —, who holds a right in the administration.
 */
export const hasAccess = (user: UserRow): boolean =>
  Boolean(user.system) ||
  workspacesOf(user).length > 0 ||
  anyAdminRight(user);

/**
 * The account, with its workspace straightened out: the one they chose if
 * they still have access to it, otherwise the first of theirs. The change is
 * saved, so that queries re-reading it in SQL ("@me") find the same one.
 */
export const inOwnWorkspace = (user: UserRow): UserRow => {
  const current = currentWorkspace(user);
  if (current === user.workspace_id) return user;
  users.setWorkspace.run(current, user.id);
  return { ...user, workspace_id: current };
};

/** An account as it is shown: never its password hash. */
export const publicUser = (account: UserRow): PublicUser => {
  // Nothing is saved here: the account list goes through here too.
  const user = { ...account, workspace_id: currentWorkspace(account) };
  return {
    id: user.id,
    first_name: user.first_name,
    last_name: user.last_name,
    // `name` stays exposed: it feeds the initials and the actor lists.
    name: fullName(user.first_name, user.last_name) || user.email,
    email: user.email,
    gravatar_url: gravatarUrl(user.email),
    settings: settingsRights(user),
    rights: companyRights(user),
    widgets: widgetRights(user),
    notifications: notificationRights(user),
    application: applicationRights(user),
    structure: structureRights(user),
    system: Boolean(user.system),
    default_workspace: workspacesOf(user).some((w) => w.id === user.default_workspace_id)
      ? user.default_workspace_id
      : null,
    default_view: user.default_view ?? "",
    default_board: user.default_board ?? "",
    notification_settings: notificationSettings(user),
    workspace: user.workspace_id,
    workspaces: workspacesOf(user),
    workspace_rights: workspaceRights(user),
    administration: administrationOf(user),
    created_at: user.created_at,
  };
};

/**
 * A person as they accompany something else: actor, member, author.
 * The e-mail stands in for the name when it is missing.
 */
export const actorOf = (row: { id: number; name: string; email: string }) => ({
  id: row.id,
  name: row.name || row.email,
  email: row.email,
  gravatar_url: gravatarUrl(row.email),
});
