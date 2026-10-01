// Les types de jalons : Commande, Développement, Installation… Réglés une fois
// pour toute l'application, dans les réglages. Un projet en choisit un, qui
// pose les marques et les couleurs de son curseur d'avancement.
//
// Supprimer un type ne supprime aucun projet : ceux qui le portaient gardent
// leur avancement, et leur curseur redevient nu (ON DELETE SET NULL).

import { Router } from "express";
import type { MilestoneType } from "@milo/shared";
import { mutation, scalar, selection, transaction } from "../db/query.js";
import type { MilestoneTypeRow } from "../db/rows.js";
import { badRequest, conflict, orNotFound, refuserSiUtilise, requireText } from "../lib/http.js";
import { touch } from "../middleware/events.js";
import { jalonsValides } from "../repositories/project-boards.js";

const TYPE_INTROUVABLE = "Type de jalons introuvable";
const TYPE_EXISTANT = "Ce type de jalons existe déjà";

const tous = selection<MilestoneTypeRow>("SELECT * FROM milestone_types ORDER BY name");
const parNom = selection<MilestoneTypeRow>(
  "SELECT * FROM milestone_types WHERE name = ? COLLATE NOCASE AND id != ?",
);
const creer = mutation("INSERT INTO milestone_types (name, milestones) VALUES (?, '[]')");
const renommer = mutation("UPDATE milestone_types SET name = ? WHERE id = ?");
const poserJalons = mutation("UPDATE milestone_types SET milestones = ? WHERE id = ?");
const detacher = mutation("UPDATE projects SET milestone_type_id = NULL WHERE milestone_type_id = ?");
const supprimer = mutation("DELETE FROM milestone_types WHERE id = ?");
const utilisations = scalar<{ count: number }>(
  "SELECT COUNT(*) AS count FROM projects WHERE milestone_type_id = ?",
);

export const milestoneTypes = {
  byId: selection<MilestoneTypeRow>("SELECT * FROM milestone_types WHERE id = ?"),
};

/** La ligne telle que l'API la rend : ses jalons redeviennent une liste. */
const versType = (row: MilestoneTypeRow): MilestoneType => {
  let milestones: MilestoneType["milestones"] = [];
  try {
    milestones = jalonsValides(JSON.parse(row.milestones)) ?? [];
  } catch {
    // Un JSON illisible vaut une liste vide plutôt qu'une page en erreur.
  }
  return { id: row.id, name: row.name, milestones };
};

export const milestoneTypeRoutes = Router();

// Les jalons se lisent sur les projets qui portent le type : les changer
// change leur curseur et la couleur de leur progression.
milestoneTypeRoutes.use(touch("lookups", "projects"));

milestoneTypeRoutes.get("/", (_req, res) => {
  res.json(tous.all().map(versType));
});

milestoneTypeRoutes.post("/", (req, res) => {
  const name = requireText(req.body.name, "Le nom est requis");
  if (parNom.get(name, 0)) conflict(TYPE_EXISTANT);

  const { lastInsertRowid } = creer.run(name);
  res.status(201).json(versType(milestoneTypes.byId.get(lastInsertRowid)!));
});

// Le nom et les jalons se modifient séparément : ce qui n'est pas envoyé reste.
milestoneTypeRoutes.put("/:id", (req, res) => {
  const existing = orNotFound(milestoneTypes.byId.get(req.params.id), TYPE_INTROUVABLE);

  if (req.body.name !== undefined) {
    const name = requireText(req.body.name, "Le nom est requis");
    if (parNom.get(name, existing.id)) conflict(TYPE_EXISTANT);
    renommer.run(name, existing.id);
  }

  if (req.body.milestones !== undefined) {
    const jalons =
      jalonsValides(req.body.milestones) ??
      badRequest("Chaque jalon demande une valeur de 0 à 100");
    poserJalons.run(JSON.stringify(jalons), existing.id);
  }

  res.json(versType(milestoneTypes.byId.get(existing.id)!));
});

milestoneTypeRoutes.delete("/:id", (req, res) => {
  const existing = orNotFound(milestoneTypes.byId.get(req.params.id), TYPE_INTROUVABLE);
  refuserSiUtilise(existing.name, utilisations(existing.id).count);
  // Détachés d'abord, sans compter sur la clé étrangère : une base ancienne a
  // reçu la colonne par ALTER TABLE, et c'est ici qu'on veut en être sûr.
  transaction(() => {
    detacher.run(existing.id);
    supprimer.run(existing.id);
  })();
  res.status(204).end();
});
