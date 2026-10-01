// Les accès : le rôle d'un utilisateur ou d'un groupe Entra dans chaque
// société. Réservé aux administrateurs.
//
// Un utilisateur ou un groupe n'existe ici que par ses attributions : il
// apparaît avec la première, et disparaît avec la dernière.

import { Router } from "express";
import type { EntraPrincipal, PrincipalAssignments } from "@milo/shared";
import { mutation, selection, transaction } from "../db/query.js";
import { badRequest, requireText } from "../lib/http.js";
import { chercherDansLAnnuaire } from "../lib/entra.js";
import { touch } from "../middleware/events.js";

interface AttributionRow {
  principal_type: "user" | "group";
  principal_id: string;
  principal_name: string;
  principal_email: string;
  company_id: number;
  role_id: number;
}

const toutes = selection<AttributionRow>(
  `SELECT * FROM role_assignments
   ORDER BY principal_type DESC, principal_name COLLATE NOCASE, principal_id, company_id`,
);
const oublier = mutation("DELETE FROM role_assignments WHERE principal_type = ? AND principal_id = ?");
const attribuer = mutation(
  `INSERT INTO role_assignments
     (principal_type, principal_id, principal_name, principal_email, company_id, role_id)
   VALUES (?, ?, ?, ?, ?, ?)`,
);
const societeExiste = selection<{ id: number }>("SELECT id FROM companies WHERE id = ?");
const roleExiste = selection<{ id: number }>("SELECT id FROM roles WHERE id = ?");

/** Les attributions, regroupées par utilisateur ou groupe. */
const parPrincipal = (): PrincipalAssignments[] => {
  const groupes = new Map<string, PrincipalAssignments>();
  for (const row of toutes.all()) {
    const cle = `${row.principal_type}:${row.principal_id}`;
    let entree = groupes.get(cle);
    if (!entree) {
      entree = {
        principal: {
          type: row.principal_type,
          id: row.principal_id,
          name: row.principal_name,
          email: row.principal_email,
        },
        roles: [],
      };
      groupes.set(cle, entree);
    }
    entree.roles.push({ company_id: row.company_id, role_id: row.role_id });
  }
  return [...groupes.values()];
};

/** Les rôles d'un principal, remplacés d'un bloc : une société absente n'en a plus. */
const remplacer = transaction(
  (principal: EntraPrincipal, roles: { company_id: number; role_id: number }[]) => {
    oublier.run(principal.type, principal.id);
    for (const { company_id, role_id } of roles) {
      attribuer.run(principal.type, principal.id, principal.name, principal.email, company_id, role_id);
    }
  },
);

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

// La liste complète des rôles du principal, une entrée par société : elle
// remplace la précédente. Une liste vide lui retire tout accès.
assignmentRoutes.put("/:type/:id", (req, res) => {
  const principal: EntraPrincipal = {
    type: typeDe(req.params.type),
    id: requireText(req.params.id, "Identifiant requis"),
    name: String(req.body.name ?? "").trim(),
    email: String(req.body.email ?? "").trim(),
  };
  const demandes: unknown[] = Array.isArray(req.body.roles) ? req.body.roles : [];

  const parSociete = new Map<number, number>();
  for (const demande of demandes) {
    const { company_id, role_id } = (demande ?? {}) as Record<string, unknown>;
    const societe = Number(company_id);
    const role = Number(role_id);
    if (!societeExiste.get(societe)) badRequest("Société introuvable");
    if (!roleExiste.get(role)) badRequest("Rôle introuvable");
    parSociete.set(societe, role);
  }

  remplacer(
    principal,
    [...parSociete].map(([company_id, role_id]) => ({ company_id, role_id })),
  );
  res.json(parPrincipal());
});

assignmentRoutes.delete("/:type/:id", (req, res) => {
  oublier.run(typeDe(req.params.type), req.params.id);
  res.json(parPrincipal());
});
