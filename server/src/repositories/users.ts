// Accounts and their sessions.
//
// An account is born from a person's first Microsoft sign-in, or existed
// before Entra and attaches to it through its e-mail. The "admin" account
// (system) is separate: it only has a password, is only used for settings,
// and appears in no list.

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
  setDefaultView: mutation("UPDATE users SET default_view = ? WHERE id = ?"),
  setWorkspace: mutation("UPDATE users SET workspace_id = ? WHERE id = ?"),
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
const accountAccess = selection<{ workspace_id: number; widgets: string }>(
  `SELECT workspace_id, widgets FROM principal_permissions WHERE ${ACCOUNT_PRINCIPAL}`,
);

/** Their administration: their own and their groups'. */
const accountAdministration = selection<{ settings: string; workspaces: string }>(
  `SELECT settings, workspaces FROM principal_admin WHERE ${ACCOUNT_PRINCIPAL}`,
);

/** Their access, re-read: unreadable JSON grants nothing. */
const userRows = (user: UserRow): { workspace: Id; widgets: WidgetRights }[] =>
  accountAccess.all(user.entra_id, JSON.stringify(groupsOf(user))).map((l) => {
    let widgets: unknown = {};
    try {
      widgets = JSON.parse(l.widgets);
    } catch {
      // Unreadable JSON grants nothing.
    }
    return { workspace: l.workspace_id, widgets: validWidgetRights(widgets) };
  });

/**
 * Their administration, merged — their own and their groups': the widest
 * "Paramétrage" setting, workspace management if any of them grants it.
 * The "admin" account has everything.
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
 * The workspaces they can access — where they read at least one widget type —,
 * in their order: all of them for the "admin" account.
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
 * The workspace they work in: the one they chose if they still have access to
 * it, otherwise the first of theirs — "null" if they have none.
 */
export const currentWorkspace = (user: UserRow): Id | null => {
  const own = workspacesOf(user);
  return (own.find((w) => w.id === user.workspace_id) ?? own[0])?.id ?? null;
};

/** Can they manage workspaces? The "admin" account, or whoever administration grants it to. */
export const canManageWorkspaces = (user: UserRow): boolean =>
  administrationOf(user).workspaces === "update";

/**
 * Their permissions per widget type in the workspace they work in
 * ("workspace_id", which requireAuth keeps up to date), merged — their own and
 * their groups', the widest for each type. The "admin" account has
 * everything.
 */
const workspaceWidgets = (user: UserRow): WidgetRights =>
  user.system
    ? widgetRightsEverywhere("update")
    : mergeWidgetRights(
        userRows(user)
          .filter((l) => l.workspace === user.workspace_id)
          .map((l) => l.widgets),
      );

/** Their permissions per widget type. */
export const widgetRights = (user: UserRow): WidgetRights => workspaceWidgets(user);

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
 * or one of their groups'. The "admin" account has them all. "Modifier"
 * includes "Voir".
 */
export const settingsRights = (user: UserRow): SettingsRights => {
  const { settings } = administrationOf(user);
  return { view: settings !== "", update: settings === "update" };
};

/**
 * Does the account have access to Milo? The "admin" account, someone with
 * access to at least one workspace — directly, or through one of their
 * groups —, who sees "Paramétrage" or who manages workspaces.
 */
export const hasAccess = (user: UserRow): boolean =>
  Boolean(user.system) ||
  workspacesOf(user).length > 0 ||
  administrationOf(user).settings !== "" ||
  canManageWorkspaces(user);

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
    system: Boolean(user.system),
    default_view: user.default_view ?? "",
    workspace: user.workspace_id,
    workspaces: workspacesOf(user),
    manage_workspaces: canManageWorkspaces(user),
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
