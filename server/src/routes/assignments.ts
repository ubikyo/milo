// Les permissions des utilisateurs et des groupes Entra, en deux parts :
//
// - les accès d'un workspace (`assignmentRoutes`) : une permission par type
//   de widget. Ils se règlent depuis le workspace, par qui gère les
//   workspaces ;
// - l'administration de l'application (`administrationRoutes`) : le
//   Paramétrage et la gestion des workspaces, qui ne dépendent d'aucun
//   workspace. Elle se lit avec le Paramétrage, se change avec son droit
//   « Modifier » ; seul qui gère les workspaces accorde ou retire leur
//   gestion.
//
// Un utilisateur ou un groupe n'existe ici que par ce qu'il a : il apparaît
// avec sa première permission, et disparaît quand il n'en a plus aucune.

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

/** Les types de widgets d'une ligne, relus : un JSON illisible n'accorde rien. */
const widgetsOf = (row: AccessRow): WidgetRights => {
  let widgets: unknown = {};
  try {
    widgets = JSON.parse(row.widgets);
  } catch {
    // Rien à relire : aucun type n'est accordé.
  }
  return validWidgetRights(widgets);
};

const principalOf = (row: PrincipalRow): EntraPrincipal => ({
  type: row.principal_type,
  id: row.principal_id,
  name: row.principal_name,
  email: row.principal_email,
});

/** Les utilisateurs puis les groupes, chacun par nom. */
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

/** Le principal désigné par l'adresse, avec le nom et l'e-mail reçus. */
const receivedPrincipal = (req: Request): EntraPrincipal => ({
  type: typeOf(req.params.type),
  id: requireText(req.params.id, "Identifiant requis"),
  name: String(req.body.name ?? "").trim(),
  email: String(req.body.email ?? "").trim(),
});

/** Le workspace dont on règle les accès. */
const workspaceOf = (req: Request): Id => {
  const id = Number(req.query["workspace"]);
  if (!workspaces.byId.get(id)) throw new HttpError(404, WORKSPACE_NOT_FOUND);
  return id;
};

// --- Les accès d'un workspace ------------------------------------------------

/** Réservés à qui gère les workspaces : c'est depuis eux qu'ils se règlent. */
const requireManagement = (req: Request, _res: Response, next: NextFunction): void => {
  if (!canManageWorkspaces(req.user)) {
    throw new HttpError(403, "Réservé à qui peut gérer les workspaces");
  }
  next();
};

export const assignmentRoutes = Router();

assignmentRoutes.use(touch("lookups"));

/**
 * Chercher un utilisateur ou un groupe dans l'annuaire, pour lui donner un
 * accès ou une administration : il suffit de voir le Paramétrage ou de gérer
 * les workspaces. Déclaré avant la garde des accès.
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

// Les types de widgets du principal dans le workspace : ils remplacent les
// précédents. Aucun type lisible : il n'y a plus accès, sa ligne s'efface.
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

// --- L'administration de l'application --------------------------------------

/**
 * Le Paramétrage se lit avec « Voir », se change avec « Modifier ». Qui gère
 * les workspaces sans voir le Paramétrage ne vient pas ici.
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

// L'administration du principal remplace la précédente ; sans rien, sa ligne
// s'efface. Seul qui gère les workspaces peut accorder ou retirer leur
// gestion : pour les autres, elle reste ce qu'elle était.
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
  // Retirer l'administration de qui gère les workspaces, c'est lui retirer
  // leur gestion : réservé à qui la détient.
  const before = principalAdministration.get(type, req.params.id);
  if (before && validAdminPermissions(before).workspaces === "update" && !canManageWorkspaces(req.user)) {
    throw new HttpError(403, "Réservé à qui peut gérer les workspaces");
  }
  forgetAdministration.run(type, req.params.id);
  res.json(administrations());
});
