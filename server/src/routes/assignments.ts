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
import { chercherDansLAnnuaire } from "../lib/entra.js";
import { touch } from "../middleware/events.js";
import { droitsParametrage, peutGererWorkspaces } from "../repositories/users.js";
import { WORKSPACE_INTROUVABLE, workspaces } from "../repositories/workspaces.js";

interface PrincipalRow {
  principal_type: "user" | "group";
  principal_id: string;
  principal_name: string;
  principal_email: string;
}

interface AccesRow extends PrincipalRow {
  widgets: string;
}

interface AdministrationRow extends PrincipalRow {
  settings: string;
  workspaces: string;
}

const accesDuWorkspace = selection<AccesRow>(
  "SELECT * FROM principal_permissions WHERE workspace_id = ?",
);
const oublierAcces = mutation(
  "DELETE FROM principal_permissions WHERE workspace_id = ? AND principal_type = ? AND principal_id = ?",
);
const poserAcces = mutation(
  `INSERT INTO principal_permissions
     (workspace_id, principal_type, principal_id, principal_name, principal_email, widgets)
   VALUES (?, ?, ?, ?, ?, ?)
   ON CONFLICT (workspace_id, principal_type, principal_id) DO UPDATE SET
     principal_name = excluded.principal_name, principal_email = excluded.principal_email,
     widgets = excluded.widgets`,
);

const toutesLesAdministrations = selection<AdministrationRow>("SELECT * FROM principal_admin");
const administrationDuPrincipal = selection<AdministrationRow>(
  "SELECT * FROM principal_admin WHERE principal_type = ? AND principal_id = ?",
);
const oublierAdministration = mutation(
  "DELETE FROM principal_admin WHERE principal_type = ? AND principal_id = ?",
);
const poserAdministration = mutation(
  `INSERT INTO principal_admin
     (principal_type, principal_id, principal_name, principal_email, settings, workspaces)
   VALUES (?, ?, ?, ?, ?, ?)
   ON CONFLICT (principal_type, principal_id) DO UPDATE SET
     principal_name = excluded.principal_name, principal_email = excluded.principal_email,
     settings = excluded.settings, workspaces = excluded.workspaces`,
);

/** Les types de widgets d'une ligne, relus : un JSON illisible n'accorde rien. */
const widgetsDe = (row: AccesRow): WidgetRights => {
  let widgets: unknown = {};
  try {
    widgets = JSON.parse(row.widgets);
  } catch {
    // Rien à relire : aucun type n'est accordé.
  }
  return validWidgetRights(widgets);
};

const principalDe = (row: PrincipalRow): EntraPrincipal => ({
  type: row.principal_type,
  id: row.principal_id,
  name: row.principal_name,
  email: row.principal_email,
});

/** Les utilisateurs puis les groupes, chacun par nom. */
const parNom = <T extends { principal: EntraPrincipal }>(liste: T[]): T[] =>
  liste.sort(
    (a, b) =>
      (a.principal.type === b.principal.type ? 0 : a.principal.type === "user" ? -1 : 1) ||
      a.principal.name.localeCompare(b.principal.name, "fr", { sensitivity: "base" }),
  );

const accesDe = (workspace: Id): PrincipalAssignments[] =>
  parNom(
    accesDuWorkspace
      .all(workspace)
      .map((row) => ({ principal: principalDe(row), permissions: widgetsDe(row) })),
  );

const administrations = (): PrincipalAdministration[] =>
  parNom(
    toutesLesAdministrations
      .all()
      .map((row) => ({ principal: principalDe(row), permissions: validAdminPermissions(row) })),
  );

const typeDe = (valeur: unknown): "user" | "group" => {
  if (valeur !== "user" && valeur !== "group") badRequest("Type inconnu : utilisateur ou groupe");
  return valeur as "user" | "group";
};

/** Le principal désigné par l'adresse, avec le nom et l'e-mail reçus. */
const principalRecu = (req: Request): EntraPrincipal => ({
  type: typeDe(req.params.type),
  id: requireText(req.params.id, "Identifiant requis"),
  name: String(req.body.name ?? "").trim(),
  email: String(req.body.email ?? "").trim(),
});

/** Le workspace dont on règle les accès. */
const workspaceDe = (req: Request): Id => {
  const id = Number(req.query["workspace"]);
  if (!workspaces.byId.get(id)) throw new HttpError(404, WORKSPACE_INTROUVABLE);
  return id;
};

// --- Les accès d'un workspace ------------------------------------------------

/** Réservés à qui gère les workspaces : c'est depuis eux qu'ils se règlent. */
const exigerGestion = (req: Request, _res: Response, next: NextFunction): void => {
  if (!peutGererWorkspaces(req.user)) {
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
  if (!droitsParametrage(req.user).view && !peutGererWorkspaces(req.user)) {
    throw new HttpError(403, "Réservé à qui peut voir le Paramétrage");
  }
  chercherDansLAnnuaire(String(req.query["q"] ?? ""), req.query["groups"] ? "groups" : "all")
    .then((trouves) => res.json(trouves))
    .catch(next);
});

assignmentRoutes.use(exigerGestion);

assignmentRoutes.get("/", (req, res) => {
  res.json(accesDe(workspaceDe(req)));
});

// Les types de widgets du principal dans le workspace : ils remplacent les
// précédents. Aucun type lisible : il n'y a plus accès, sa ligne s'efface.
assignmentRoutes.put("/:type/:id", (req, res) => {
  const workspace = workspaceDe(req);
  const principal = principalRecu(req);
  const widgets = validWidgetRights(req.body.permissions);
  if (Object.values(widgets).every((acces) => acces === "")) {
    oublierAcces.run(workspace, principal.type, principal.id);
  } else {
    poserAcces.run(
      workspace,
      principal.type,
      principal.id,
      principal.name,
      principal.email,
      JSON.stringify(widgets),
    );
  }
  res.json(accesDe(workspace));
});

assignmentRoutes.delete("/:type/:id", (req, res) => {
  const workspace = workspaceDe(req);
  oublierAcces.run(workspace, typeDe(req.params.type), req.params.id);
  res.json(accesDe(workspace));
});

// --- L'administration de l'application --------------------------------------

/**
 * Le Paramétrage se lit avec « Voir », se change avec « Modifier ». Qui gère
 * les workspaces sans voir le Paramétrage ne vient pas ici.
 */
const exigerParametrage = (req: Request, _res: Response, next: NextFunction): void => {
  const droits = droitsParametrage(req.user);
  if (!droits.view) throw new HttpError(403, "Réservé à qui peut voir le Paramétrage");
  if (req.method !== "GET" && !droits.update) {
    throw new HttpError(403, "Réservé à qui peut modifier le Paramétrage");
  }
  next();
};

export const administrationRoutes = Router();

administrationRoutes.use(touch("lookups"), exigerParametrage);

administrationRoutes.get("/", (_req, res) => {
  res.json(administrations());
});

// L'administration du principal remplace la précédente ; sans rien, sa ligne
// s'efface. Seul qui gère les workspaces peut accorder ou retirer leur
// gestion : pour les autres, elle reste ce qu'elle était.
administrationRoutes.put("/:type/:id", (req, res) => {
  const principal = principalRecu(req);
  const recue: AdminPermissions = validAdminPermissions(req.body.permissions);
  if (!peutGererWorkspaces(req.user)) {
    const avant = administrationDuPrincipal.get(principal.type, principal.id);
    recue.workspaces = avant ? validAdminPermissions(avant).workspaces : "";
  }
  if (recue.settings === "" && recue.workspaces === "") {
    oublierAdministration.run(principal.type, principal.id);
  } else {
    poserAdministration.run(
      principal.type,
      principal.id,
      principal.name,
      principal.email,
      recue.settings,
      recue.workspaces,
    );
  }
  res.json(administrations());
});

administrationRoutes.delete("/:type/:id", (req, res) => {
  const type = typeDe(req.params.type);
  // Retirer l'administration de qui gère les workspaces, c'est lui retirer
  // leur gestion : réservé à qui la détient.
  const avant = administrationDuPrincipal.get(type, req.params.id);
  if (avant && validAdminPermissions(avant).workspaces === "update" && !peutGererWorkspaces(req.user)) {
    throw new HttpError(403, "Réservé à qui peut gérer les workspaces");
  }
  oublierAdministration.run(type, req.params.id);
  res.json(administrations());
});
