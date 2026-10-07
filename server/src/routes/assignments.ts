// Permissions of users and Entra groups, in two parts:
//
// - a workspace's access (`assignmentRoutes`): one permission per widget
//   type. It is set from the workspace: read with the "Voir" right on
//   workspaces, changed with "Créer";
// - the application's administration (`administrationRoutes`): rights on
//   "Paramétrage" and on workspaces, which depend on no workspace. It goes
//   with "Paramétrage"; a right on workspaces is only granted or removed by
//   whoever holds it.
//
// A user or group stays listed without any right, until they are removed.
// In the administration, their own rights, and their groups', are only added
// to: one does not lock oneself out.

import { Router } from "express";
import type { NextFunction, Request, Response } from "express";
import {
  ADMIN_SECTIONS,
  defaultAdminPermissions,
  parseAdminRights,
  validAdminPermissions,
  validApplicationRights,
  validNotificationRights,
  validStructurePermissions,
  validWidgetRights,
} from "@milo/shared";
import type {
  AdminPermissions,
  EntraPrincipal,
  Id,
  PrincipalAdministration,
  PrincipalAssignments,
  WorkspacePermissions,
} from "@milo/shared";
import { mutation, selection } from "../db/query.js";
import { HttpError, badRequest, requireText } from "../lib/http.js";
import { searchInDirectory } from "../lib/entra.js";
import { inviteToAdministration, inviteToWorkspace } from "../lib/invitations.js";
import { root } from "../lib/notify.js";
import { touch } from "../middleware/events.js";
import {
  adminPermissions,
  administrationRights,
  groupsOf,
  workspaceRights,
} from "../repositories/users.js";
import type { UserRow } from "../db/rows.js";
import { WORKSPACE_NOT_FOUND, workspaces } from "../repositories/workspaces.js";

interface PrincipalRow {
  principal_type: "user" | "group";
  principal_id: string;
  principal_name: string;
  principal_email: string;
}

interface AccessRow extends PrincipalRow {
  widgets: string;
  notifications: string;
  application: string;
  structure: string;
}

interface AdministrationRow extends PrincipalRow {
  rights: string;
}

const workspaceAccess = selection<AccessRow>(
  "SELECT * FROM principal_permissions WHERE workspace_id = ?",
);
const forgetAccess = mutation(
  "DELETE FROM principal_permissions WHERE workspace_id = ? AND principal_type = ? AND principal_id = ?",
);
const setAccess = mutation(
  `INSERT INTO principal_permissions
     (workspace_id, principal_type, principal_id, principal_name, principal_email, widgets,
      notifications, application, structure)
   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
   ON CONFLICT (workspace_id, principal_type, principal_id) DO UPDATE SET
     principal_name = excluded.principal_name, principal_email = excluded.principal_email,
     widgets = excluded.widgets, notifications = excluded.notifications,
     application = excluded.application, structure = excluded.structure`,
);

const allAdministrations = selection<AdministrationRow>("SELECT * FROM principal_admin");
const principalAdministration = selection<AdministrationRow>(
  "SELECT * FROM principal_admin WHERE principal_type = ? AND principal_id = ?",
);
const forgetAdministration = mutation(
  "DELETE FROM principal_admin WHERE principal_type = ? AND principal_id = ?",
);
const setAdministration = mutation(
  `INSERT INTO principal_admin
     (principal_type, principal_id, principal_name, principal_email, rights)
   VALUES (?, ?, ?, ?, ?)
   ON CONFLICT (principal_type, principal_id) DO UPDATE SET
     principal_name = excluded.principal_name, principal_email = excluded.principal_email,
     rights = excluded.rights`,
);

/** JSON as stored: unreadable, it grants nothing. */
const parsed = (json: string): unknown => {
  try {
    return JSON.parse(json);
  } catch {
    return undefined;
  }
};

/** A row's widget types, notifications, application and structure rights, re-read. */
const permissionsOf = (row: AccessRow): WorkspacePermissions => ({
  widgets: validWidgetRights(parsed(row.widgets)),
  notifications: validNotificationRights(parsed(row.notifications)),
  application: validApplicationRights(parsed(row.application)),
  structure: validStructurePermissions(parsed(row.structure)),
});

const principalOf = (row: PrincipalRow): EntraPrincipal => ({
  type: row.principal_type,
  id: row.principal_id,
  name: row.principal_name,
  email: row.principal_email,
});

/** Users then groups, each by name. */
const byName = <T extends { principal: EntraPrincipal }>(list: T[]): T[] =>
  list.sort(
    (a, b) =>
      (a.principal.type === b.principal.type ? 0 : a.principal.type === "user" ? -1 : 1) ||
      a.principal.name.localeCompare(b.principal.name, "fr", { sensitivity: "base" }),
  );

const accessOf = (workspace: Id, user: UserRow): PrincipalAssignments[] =>
  byName(
    workspaceAccess.all(workspace).map((row) => ({
      principal: principalOf(row),
      permissions: permissionsOf(row),
      own: isOwn(user, row.principal_type, row.principal_id),
    })),
  );

/**
 * Is it the account itself, or one of its groups? The "admin" account is
 * neither: it holds everything without a row.
 */
const isOwn = (user: UserRow, type: string, id: string): boolean =>
  !user.system &&
  ((type === "user" && id === user.entra_id) || (type === "group" && groupsOf(user).includes(id)));

const administrations = (user: UserRow): PrincipalAdministration[] =>
  byName(
    allAdministrations.all().map((row) => ({
      principal: principalOf(row),
      permissions: parseAdminRights(row.rights),
      own: isOwn(user, row.principal_type, row.principal_id),
    })),
  );

const typeOf = (value: unknown): "user" | "group" => {
  if (value !== "user" && value !== "group") badRequest("Type inconnu : utilisateur ou groupe");
  return value as "user" | "group";
};

/** The principal designated by the address, with the received name and e-mail. */
const receivedPrincipal = (req: Request): EntraPrincipal => ({
  type: typeOf(req.params.type),
  id: requireText(req.params.id, "Identifiant requis"),
  name: String(req.body.name ?? "").trim(),
  email: String(req.body.email ?? "").trim(),
});

/** The workspace whose access is being set. */
const workspaceOf = (req: Request): Id => {
  const id = Number(req.query["workspace"]);
  if (!workspaces.byId.get(id)) throw new HttpError(404, WORKSPACE_NOT_FOUND);
  return id;
};

// --- A workspace's access ----------------------------------------------------

/** Read with "Voir" on workspaces, changed with "Créer": that is where they are set from. */
const requireManagement = (req: Request, _res: Response, next: NextFunction): void => {
  const rights = workspaceRights(req.user);
  if (!rights.view) throw new HttpError(403, "Réservé à qui peut voir les workspaces");
  if (req.method !== "GET" && !rights.create) {
    throw new HttpError(403, "Réservé à qui peut créer les workspaces");
  }
  next();
};

export const assignmentRoutes = Router();

assignmentRoutes.use(touch("lookups"));

/**
 * Search for a user or group in the directory, to give them access or an
 * administration: "Créer" on workspaces or on the administration is enough.
 * Declared before the access guard.
 */
assignmentRoutes.get("/search", (req, res, next) => {
  if (!workspaceRights(req.user).create && !administrationRights(req.user).create) {
    throw new HttpError(403, "Réservé à qui peut donner des droits");
  }
  searchInDirectory(String(req.query["q"] ?? ""), req.query["groups"] ? "groups" : "all")
    .then((matches) => res.json(matches))
    .catch(next);
});

assignmentRoutes.use(requireManagement);

assignmentRoutes.get("/", (req, res) => {
  res.json(accessOf(workspaceOf(req), req.user));
});

// The principal's widget types, notifications and application rights in the
// workspace: they
// replace the previous ones. Without any right, they stay listed, with no
// access, until they are removed. Unlike the administration, one's own
// access can be changed: it only concerns this workspace. Just added, and
// "invite" given, they receive the "Nouvel utilisateur" e-mail — each user of
// a group.
assignmentRoutes.put("/:type/:id", (req, res) => {
  const workspace = workspaceOf(req);
  const principal = receivedPrincipal(req);
  const received = (req.body.permissions ?? {}) as Record<string, unknown>;
  const isNew = !workspaceAccess
    .all(workspace)
    .some((row) => row.principal_type === principal.type && row.principal_id === principal.id);
  setAccess.run(
    workspace,
    principal.type,
    principal.id,
    principal.name,
    principal.email,
    JSON.stringify(validWidgetRights(received["widgets"])),
    JSON.stringify(validNotificationRights(received["notifications"])),
    JSON.stringify(validApplicationRights(received["application"])),
    JSON.stringify(validStructurePermissions(received["structure"])),
  );
  if (isNew && req.body.invite === true) {
    inviteToWorkspace([principal], workspaces.byId.get(workspace)!.name, req.user, root(req));
  }
  res.json(accessOf(workspace, req.user));
});

assignmentRoutes.delete("/:type/:id", (req, res) => {
  const workspace = workspaceOf(req);
  forgetAccess.run(workspace, typeOf(req.params.type), req.params.id);
  res.json(accessOf(workspace, req.user));
});

// --- The application's administration ----------------------------------------

/**
 * "Gestion des droits d'administration", right by right: reading requires
 * "Voir", removing someone "Supprimer", the rest — adding someone, setting
 * their rights — "Créer".
 */
const requireAdministration = (req: Request, _res: Response, next: NextFunction): void => {
  const rights = administrationRights(req.user);
  if (req.method === "GET") {
    if (!rights.view) throw new HttpError(403, "Réservé à qui peut voir les droits d'administration");
  } else if (req.method === "DELETE") {
    if (!rights.delete) {
      throw new HttpError(403, "Réservé à qui peut supprimer des droits d'administration");
    }
  } else if (!rights.create) {
    throw new HttpError(403, "Réservé à qui peut créer des droits d'administration");
  }
  next();
};

export const administrationRoutes = Router();

administrationRoutes.use(touch("lookups"), requireAdministration);

administrationRoutes.get("/", (req, res) => {
  res.json(administrations(req.user));
});

/** The principal's administration as saved, or none. */
const administrationBefore = (type: string, id: string): AdminPermissions => {
  const row = principalAdministration.get(type, id);
  return row ? parseAdminRights(row.rights) : defaultAdminPermissions();
};

// The principal's administration replaces the previous one; without any
// right, they stay listed. A right the author does not hold stays as it
// was: only whoever holds it grants or removes it. The author's own rights,
// and their groups', are only added to. Just added, and
// "invite" given, they receive the "Nouvel administrateur" e-mail — each user
// of a group.
administrationRoutes.put("/:type/:id", (req, res) => {
  const principal = receivedPrincipal(req);
  const isNew = !principalAdministration.get(principal.type, principal.id);
  const received: AdminPermissions = validAdminPermissions(req.body.permissions);
  const own = adminPermissions(req.user);
  const before = administrationBefore(principal.type, principal.id);
  const kept = isOwn(req.user, principal.type, principal.id);
  const permissions = validAdminPermissions(
    Object.fromEntries(
      ADMIN_SECTIONS.map(({ value: section }) => {
        const held = own[section] as string[];
        return [
          section,
          [
            ...(received[section] as string[]).filter((r) => held.includes(r)),
            ...(before[section] as string[]).filter((r) => !held.includes(r) || kept),
          ],
        ];
      }),
    ),
  );
  setAdministration.run(
    principal.type,
    principal.id,
    principal.name,
    principal.email,
    JSON.stringify(permissions),
  );
  if (isNew && req.body.invite === true) inviteToAdministration([principal], req.user, root(req));
  res.json(administrations(req.user));
});

administrationRoutes.delete("/:type/:id", (req, res) => {
  const type = typeOf(req.params.type);
  if (isOwn(req.user, type, req.params.id)) {
    throw new HttpError(403, "Vos propres droits, ou ceux de vos groupes, ne se retirent pas");
  }
  // Removing someone removes all their rights: each one is reserved to
  // whoever holds it.
  const own = adminPermissions(req.user);
  const before = administrationBefore(type, req.params.id);
  if (ADMIN_SECTIONS.some((s) => (before[s.value] as string[]).some((r) => !(own[s.value] as string[]).includes(r)))) {
    throw new HttpError(403, "Réservé à qui détient tous ces droits d'administration");
  }
  forgetAdministration.run(type, req.params.id);
  res.json(administrations(req.user));
});
