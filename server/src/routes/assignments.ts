// Les accès : les permissions d'un utilisateur ou d'un groupe Entra — le
// Paramétrage, et une permission par type de widget, communes à toutes les
// sociétés. Réservé à qui peut modifier le Paramétrage.
//
// Un utilisateur ou un groupe n'existe ici que par ce qu'il a : il apparaît
// avec sa première permission, et disparaît quand il n'en a plus aucune.

import { Router } from "express";
import { defaultAppPermissions, validAppPermissions } from "@milo/shared";
import type { AppPermissions, EntraPrincipal, PrincipalAssignments } from "@milo/shared";
import { mutation, selection } from "../db/query.js";
import { badRequest, requireText } from "../lib/http.js";
import { chercherDansLAnnuaire } from "../lib/entra.js";
import { touch } from "../middleware/events.js";

interface PermissionsRow {
  principal_type: "user" | "group";
  principal_id: string;
  principal_name: string;
  principal_email: string;
  settings: string;
  widgets: string;
}

const toutesLesPermissions = selection<PermissionsRow>(
  `SELECT * FROM principal_permissions
   ORDER BY principal_type DESC, principal_name COLLATE NOCASE, principal_id`,
);
const oublierPermissions = mutation(
  "DELETE FROM principal_permissions WHERE principal_type = ? AND principal_id = ?",
);
const poserPermissions = mutation(
  `INSERT INTO principal_permissions
     (principal_type, principal_id, principal_name, principal_email, settings, widgets)
   VALUES (?, ?, ?, ?, ?, ?)
   ON CONFLICT (principal_type, principal_id) DO UPDATE SET
     principal_name = excluded.principal_name, principal_email = excluded.principal_email,
     settings = excluded.settings, widgets = excluded.widgets`,
);

/** Les permissions d'une ligne, relues : un JSON illisible n'accorde rien. */
const permissionsDe = (row: PermissionsRow): AppPermissions => {
  let widgets: unknown = {};
  try {
    widgets = JSON.parse(row.widgets);
  } catch {
    // Rien à relire : aucun type n'est accordé.
  }
  return validAppPermissions({ settings: row.settings, widgets });
};

/** Les utilisateurs puis les groupes qui ont des permissions, chacun par nom. */
const parPrincipal = (): PrincipalAssignments[] =>
  toutesLesPermissions
    .all()
    .map((row) => ({
      principal: {
        type: row.principal_type,
        id: row.principal_id,
        name: row.principal_name,
        email: row.principal_email,
      },
      app: permissionsDe(row),
    }))
    .sort(
      (a, b) =>
        (a.principal.type === b.principal.type ? 0 : a.principal.type === "user" ? -1 : 1) ||
        a.principal.name.localeCompare(b.principal.name, "fr", { sensitivity: "base" }),
    );

/**
 * Les permissions d'un principal, remplacées d'un bloc. Sans Paramétrage ni
 * aucun type lisible, il n'a plus aucun accès : sa ligne s'efface.
 */
const remplacer = (principal: EntraPrincipal, app: AppPermissions): void => {
  if (app.settings === "" && Object.values(app.widgets).every((acces) => acces === "")) {
    oublierPermissions.run(principal.type, principal.id);
    return;
  }
  poserPermissions.run(
    principal.type,
    principal.id,
    principal.name,
    principal.email,
    app.settings,
    JSON.stringify(app.widgets),
  );
};

const typeDe = (valeur: unknown): "user" | "group" => {
  if (valeur !== "user" && valeur !== "group") badRequest("Type inconnu : utilisateur ou groupe");
  return valeur as "user" | "group";
};

export const assignmentRoutes = Router();

assignmentRoutes.use(touch("lookups"));

assignmentRoutes.get("/", (_req, res) => {
  res.json(parPrincipal());
});

/** Chercher un utilisateur ou un groupe dans l'annuaire, pour lui donner un accès. */
assignmentRoutes.get("/search", (req, res, next) => {
  chercherDansLAnnuaire(String(req.query["q"] ?? ""), req.query["groups"] ? "groups" : "all")
    .then((trouves) => res.json(trouves))
    .catch(next);
});

// Les permissions du principal — le Paramétrage et chaque type de widget :
// elles remplacent les précédentes.
assignmentRoutes.put("/:type/:id", (req, res) => {
  const principal: EntraPrincipal = {
    type: typeDe(req.params.type),
    id: requireText(req.params.id, "Identifiant requis"),
    name: String(req.body.name ?? "").trim(),
    email: String(req.body.email ?? "").trim(),
  };
  remplacer(principal, validAppPermissions(req.body.app ?? defaultAppPermissions()));
  res.json(parPrincipal());
});

assignmentRoutes.delete("/:type/:id", (req, res) => {
  oublierPermissions.run(typeDe(req.params.type), req.params.id);
  res.json(parPrincipal());
});
