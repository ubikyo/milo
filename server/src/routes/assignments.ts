// Les accès : les permissions d'un utilisateur ou d'un groupe Entra — pour
// l'application (Paramétrage, modes), puis son rôle dans chaque société.
// Réservé à qui peut modifier le Paramétrage.
//
// Un utilisateur ou un groupe n'existe ici que par ce qu'il a : il apparaît
// avec son premier rôle ou son accès au Paramétrage, et disparaît quand il
// n'a plus ni l'un ni l'autre.

import { Router } from "express";
import { defaultAppPermissions, validAppPermissions } from "@milo/shared";
import type { AppPermissions, EntraPrincipal, PrincipalAssignments } from "@milo/shared";
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

interface PermissionsRow {
  principal_type: "user" | "group";
  principal_id: string;
  principal_name: string;
  principal_email: string;
  settings: string;
  modes: string;
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
     (principal_type, principal_id, principal_name, principal_email, settings, modes)
   VALUES (?, ?, ?, ?, ?, ?)
   ON CONFLICT (principal_type, principal_id) DO UPDATE SET
     principal_name = excluded.principal_name, principal_email = excluded.principal_email,
     settings = excluded.settings, modes = excluded.modes`,
);

const permissionsDe = (row: PermissionsRow): AppPermissions => {
  let modes: unknown = [];
  try {
    modes = JSON.parse(row.modes);
  } catch {
    // Un JSON illisible n'ouvre aucun mode.
  }
  return validAppPermissions({ settings: row.settings, modes });
};
const attribuer = mutation(
  `INSERT INTO role_assignments
     (principal_type, principal_id, principal_name, principal_email, company_id, role_id)
   VALUES (?, ?, ?, ?, ?, ?)`,
);
const societeExiste = selection<{ id: number }>("SELECT id FROM companies WHERE id = ?");
const roleExiste = selection<{ id: number }>("SELECT id FROM roles WHERE id = ?");

/** Les permissions et les attributions, regroupées par utilisateur ou groupe. */
const parPrincipal = (): PrincipalAssignments[] => {
  const groupes = new Map<string, PrincipalAssignments>();
  const entreeDe = (row: {
    principal_type: "user" | "group";
    principal_id: string;
    principal_name: string;
    principal_email: string;
  }): PrincipalAssignments => {
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
        app: defaultAppPermissions(),
        roles: [],
      };
      groupes.set(cle, entree);
    }
    return entree;
  };
  for (const row of toutesLesPermissions.all()) entreeDe(row).app = permissionsDe(row);
  for (const row of toutes.all()) {
    entreeDe(row).roles.push({ company_id: row.company_id, role_id: row.role_id });
  }
  return [...groupes.values()].sort(
    (a, b) =>
      (a.principal.type === b.principal.type ? 0 : a.principal.type === "user" ? -1 : 1) ||
      a.principal.name.localeCompare(b.principal.name, "fr", { sensitivity: "base" }),
  );
};

/**
 * Les permissions d'un principal, remplacées d'un bloc : une société absente
 * n'a plus de rôle. Sans rôle ni Paramétrage, il n'a plus aucun accès : ses
 * permissions s'effacent avec lui.
 */
const remplacer = transaction(
  (
    principal: EntraPrincipal,
    app: AppPermissions,
    roles: { company_id: number; role_id: number }[],
  ) => {
    oublier.run(principal.type, principal.id);
    for (const { company_id, role_id } of roles) {
      attribuer.run(principal.type, principal.id, principal.name, principal.email, company_id, role_id);
    }
    if (roles.length === 0 && app.settings === "") {
      oublierPermissions.run(principal.type, principal.id);
    } else {
      poserPermissions.run(
        principal.type,
        principal.id,
        principal.name,
        principal.email,
        app.settings,
        JSON.stringify(app.modes),
      );
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

// Les permissions pour l'application, et la liste complète des rôles du
// principal, une entrée par société : elles remplacent les précédentes. Sans
// rôle ni Paramétrage, il n'a plus aucun accès.
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
    validAppPermissions(req.body.app ?? defaultAppPermissions()),
    [...parSociete].map(([company_id, role_id]) => ({ company_id, role_id })),
  );
  res.json(parPrincipal());
});

assignmentRoutes.delete("/:type/:id", (req, res) => {
  const type = typeDe(req.params.type);
  transaction(() => {
    oublier.run(type, req.params.id);
    oublierPermissions.run(type, req.params.id);
  })();
  res.json(parPrincipal());
});
