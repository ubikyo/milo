// Permissions of users and Entra groups, in two parts:
//
// - a workspace's access (`assignmentRoutes`): one permission per widget
//   type. It is set from the workspace, by whoever manages workspaces;
// - the application's administration (`administrationRoutes`): "Paramétrage"
//   and workspace management, which depend on no workspace. It is read with
//   "Paramétrage", changed with its "Modifier" right; only whoever manages
//   workspaces grants or removes their management.
//
// A user or group exists here only through what they have: they appear with
// their first permission, and disappear when they have none left.

import { Router } from "express";
import type { NextFunction, Request, Response } from "express";
import { validAdminPermissions, validWidgetRights } from "@milo/shared";
import type {
  AdminPermissions,
  EntraPrincipal,
  Id,
  PrincipalAdministration,
  PrincipalAssignments,
  WidgetRights,
} from "@milo/shared";
import { mutation, selection } from "../db/query.js";
import { HttpError, badRequest, requireText } from "../lib/http.js";
import { searchInDirectory } from "../lib/entra.js";
import { touch } from "../middleware/events.js";
import { settingsRights, canManageWorkspaces } from "../repositories/users.js";
import { WORKSPACE_NOT_FOUND, workspaces } from "../repositories/workspaces.js";

interface PrincipalRow {
  principal_type: "user" | "group";
  principal_id: string;
  principal_name: string;
  principal_email: string;
}

interface AccessRow extends PrincipalRow {
  widgets: string;
}

interface AdministrationRow extends PrincipalRow {
  settings: string;
  workspaces: string;
}

const workspaceAccess = selection<AccessRow>(
  "SELECT * FROM principal_permissions WHERE workspace_id = ?",
);
const forgetAccess = mutation(
  "DELETE FROM principal_permissions WHERE workspace_id = ? AND principal_type = ? AND principal_id = ?",
);
const setAccess = mutation(
  `INSERT INTO principal_permissions
     (workspace_id, principal_type, principal_id, principal_name, principal_email, widgets)
   VALUES (?, ?, ?, ?, ?, ?)
   ON CONFLICT (workspace_id, principal_type, principal_id) DO UPDATE SET
     principal_name = excluded.principal_name, principal_email = excluded.principal_email,
     widgets = excluded.widgets`,
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
     (principal_type, principal_id, principal_name, principal_email, settings, workspaces)
   VALUES (?, ?, ?, ?, ?, ?)
   ON CONFLICT (principal_type, principal_id) DO UPDATE SET
     principal_name = excluded.principal_name, principal_email = excluded.principal_email,
     settings = excluded.settings, workspaces = excluded.workspaces`,
);

/** A row's widget types, re-read: unreadable JSON grants nothing. */
const widgetsOf = (row: AccessRow): WidgetRights => {
  let widgets: unknown = {};
  try {
    widgets = JSON.parse(row.widgets);
  } catch {
    // Nothing to re-read: no type is granted.
  }
  return validWidgetRights(widgets);
};

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

const accessOf = (workspace: Id): PrincipalAssignments[] =>
  byName(
    workspaceAccess
      .all(workspace)
      .map((row) => ({ principal: principalOf(row), permissions: widgetsOf(row) })),
  );

const administrations = (): PrincipalAdministration[] =>
  byName(
    allAdministrations
      .all()
      .map((row) => ({ principal: principalOf(row), permissions: validAdminPermissions(row) })),
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

/** Reserved to whoever manages workspaces: that is where they are set from. */
const requireManagement = (req: Request, _res: Response, next: NextFunction): void => {
  if (!canManageWorkspaces(req.user)) {
    throw new HttpError(403, "Réservé à qui peut gérer les workspaces");
  }
  next();
};

export const assignmentRoutes = Router();

assignmentRoutes.use(touch("lookups"));

/**
 * Search for a user or group in the directory, to give them access or an
 * administration: seeing "Paramétrage" or managing workspaces is enough.
 * Declared before the access guard.
 */
assignmentRoutes.get("/search", (req, res, next) => {
  if (!settingsRights(req.user).view && !canManageWorkspaces(req.user)) {
    throw new HttpError(403, "Réservé à qui peut voir le Paramétrage");
  }
  searchInDirectory(String(req.query["q"] ?? ""), req.query["groups"] ? "groups" : "all")
    .then((matches) => res.json(matches))
    .catch(next);
});

assignmentRoutes.use(requireManagement);

assignmentRoutes.get("/", (req, res) => {
  res.json(accessOf(workspaceOf(req)));
});

// The principal's widget types in the workspace: they replace the previous
// ones. No readable type: they no longer have access, their row is deleted.
assignmentRoutes.put("/:type/:id", (req, res) => {
  const workspace = workspaceOf(req);
  const principal = receivedPrincipal(req);
  const widgets = validWidgetRights(req.body.permissions);
  if (Object.values(widgets).every((access) => access === "")) {
    forgetAccess.run(workspace, principal.type, principal.id);
  } else {
    setAccess.run(
      workspace,
      principal.type,
      principal.id,
      principal.name,
      principal.email,
      JSON.stringify(widgets),
    );
  }
  res.json(accessOf(workspace));
});

assignmentRoutes.delete("/:type/:id", (req, res) => {
  const workspace = workspaceOf(req);
  forgetAccess.run(workspace, typeOf(req.params.type), req.params.id);
  res.json(accessOf(workspace));
});

// --- The application's administration ----------------------------------------

/**
 * "Paramétrage" is read with "Voir", changed with "Modifier". Whoever manages
 * workspaces without seeing "Paramétrage" does not come here.
 */
const requireSettings = (req: Request, _res: Response, next: NextFunction): void => {
  const rights = settingsRights(req.user);
  if (!rights.view) throw new HttpError(403, "Réservé à qui peut voir le Paramétrage");
  if (req.method !== "GET" && !rights.update) {
    throw new HttpError(403, "Réservé à qui peut modifier le Paramétrage");
  }
  next();
};

export const administrationRoutes = Router();

administrationRoutes.use(touch("lookups"), requireSettings);

administrationRoutes.get("/", (_req, res) => {
  res.json(administrations());
});

// The principal's administration replaces the previous one; with nothing,
// their row is deleted. Only whoever manages workspaces can grant or remove
// their management: for the others, it stays as it was.
administrationRoutes.put("/:type/:id", (req, res) => {
  const principal = receivedPrincipal(req);
  const received: AdminPermissions = validAdminPermissions(req.body.permissions);
  if (!canManageWorkspaces(req.user)) {
    const before = principalAdministration.get(principal.type, principal.id);
    received.workspaces = before ? validAdminPermissions(before).workspaces : "";
  }
  if (received.settings === "" && received.workspaces === "") {
    forgetAdministration.run(principal.type, principal.id);
  } else {
    setAdministration.run(
      principal.type,
      principal.id,
      principal.name,
      principal.email,
      received.settings,
      received.workspaces,
    );
  }
  res.json(administrations());
});

administrationRoutes.delete("/:type/:id", (req, res) => {
  const type = typeOf(req.params.type);
  // Removing the administration of whoever manages workspaces means removing
  // their management: reserved to whoever holds it.
  const before = principalAdministration.get(type, req.params.id);
  if (before && validAdminPermissions(before).workspaces === "update" && !canManageWorkspaces(req.user)) {
    throw new HttpError(403, "Réservé à qui peut gérer les workspaces");
  }
  forgetAdministration.run(type, req.params.id);
  res.json(administrations());
});
