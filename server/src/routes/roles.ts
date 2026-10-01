// Les rôles : un nom et des droits, mode par mode. Un compte reçoit un rôle
// par société (routes/users.ts, /:id/roles).
//
// Le rôle Administrateur a tous les droits et ne se supprime pas : ses droits
// ne sont pas lus dans sa colonne, ils sont toujours complets.

import { Router } from "express";
import { allPermissions, validPermissions } from "@milo/shared";
import type { Permissions, Role } from "@milo/shared";
import { mutation, scalar, selection } from "../db/query.js";
import type { RoleRow } from "../db/rows.js";
import { conflict, orNotFound, refuserSiUtilise, requireText } from "../lib/http.js";
import { touch } from "../middleware/events.js";

const ROLE_INTROUVABLE = "Rôle introuvable";
const ROLE_EXISTANT = "Ce rôle existe déjà";

type RoleAvecCompte = RoleRow & { assignment_count: number };

// L'administrateur en tête, les autres par nom.
const tous = selection<RoleAvecCompte>(
  `SELECT roles.*,
          (SELECT COUNT(*) FROM role_assignments WHERE role_id = roles.id) AS assignment_count
   FROM roles
   ORDER BY is_admin DESC, name`,
);
const parId = selection<RoleAvecCompte>(
  `SELECT roles.*,
          (SELECT COUNT(*) FROM role_assignments WHERE role_id = roles.id) AS assignment_count
   FROM roles WHERE id = ?`,
);
const parNom = selection<RoleRow>("SELECT * FROM roles WHERE name = ? COLLATE NOCASE AND id != ?");
const creer = mutation("INSERT INTO roles (name, permissions) VALUES (?, '{}')");
const renommer = mutation("UPDATE roles SET name = ? WHERE id = ?");
const poserDroits = mutation("UPDATE roles SET permissions = ? WHERE id = ?");
const supprimer = mutation("DELETE FROM roles WHERE id = ?");
// Les attributions du rôle : un utilisateur ou un groupe, dans une société.
const utilisations = scalar<{ count: number }>(
  "SELECT COUNT(*) AS count FROM role_assignments WHERE role_id = ?",
);

/** Les droits d'une ligne : un JSON illisible n'accorde rien. */
const droits = (row: RoleRow): Permissions => {
  if (row.is_admin) return allPermissions();
  try {
    return validPermissions(JSON.parse(row.permissions));
  } catch {
    return {};
  }
};

const versRole = (row: RoleAvecCompte): Role => ({
  id: row.id,
  name: row.name,
  is_admin: Boolean(row.is_admin),
  permissions: droits(row),
  assignment_count: row.assignment_count,
});

export const roleRoutes = Router();

roleRoutes.use(touch("lookups"));

roleRoutes.get("/", (_req, res) => {
  res.json(tous.all().map(versRole));
});

roleRoutes.post("/", (req, res) => {
  const name = requireText(req.body.name, "Le nom est requis");
  if (parNom.get(name, 0)) conflict(ROLE_EXISTANT);

  const { lastInsertRowid } = creer.run(name);
  res.status(201).json(versRole(parId.get(lastInsertRowid)!));
});

// Le nom et les droits se modifient séparément : ce qui n'est pas envoyé reste.
roleRoutes.put("/:id", (req, res) => {
  const existing = orNotFound(parId.get(req.params.id), ROLE_INTROUVABLE);

  if (req.body.name !== undefined) {
    const name = requireText(req.body.name, "Le nom est requis");
    if (parNom.get(name, existing.id)) conflict(ROLE_EXISTANT);
    renommer.run(name, existing.id);
  }

  if (req.body.permissions !== undefined) {
    if (existing.is_admin) conflict("Les droits de l'administrateur ne se modifient pas");
    poserDroits.run(JSON.stringify(validPermissions(req.body.permissions)), existing.id);
  }

  res.json(versRole(parId.get(existing.id)!));
});

// Un rôle encore attribué ne se supprime pas : on retire d'abord ses
// attributions.
roleRoutes.delete("/:id", (req, res) => {
  const existing = orNotFound(parId.get(req.params.id), ROLE_INTROUVABLE);
  if (existing.is_admin) conflict("Le rôle administrateur ne se supprime pas");
  refuserSiUtilise(existing.name, utilisations(existing.id).count);

  supprimer.run(existing.id);
  res.status(204).end();
});
