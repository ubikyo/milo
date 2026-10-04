// Les types de jalons : Commande, Développement, Installation… Réglés une fois
// pour toute l'application, dans les réglages. Un projet en choisit un, qui
// pose les marques et les couleurs de son curseur d'avancement.
//
// Supprimer un type ne supprime aucun projet : ceux qui le portaient gardent
// leur avancement, et leur curseur redevient nu (ON DELETE SET NULL).

import { Router } from "express";
import { DEFAULT_MILESTONE_TYPE } from "@milo/shared";
import type { Milestone, MilestoneType } from "@milo/shared";
import { mutation, scalar, selection, transaction } from "../db/query.js";
import type { MilestoneTypeRow } from "../db/rows.js";
import { badRequest, conflict, orNotFound, refuseIfUsed, requireText } from "../lib/http.js";
import { touch } from "../middleware/events.js";
import { validMilestones } from "../repositories/project-boards.js";

const TYPE_NOT_FOUND = "Type de jalons introuvable";
const TYPE_EXISTS = "Ce type de jalons existe déjà";

const all = selection<MilestoneTypeRow>("SELECT * FROM milestone_types ORDER BY name");
const byName = selection<MilestoneTypeRow>(
  "SELECT * FROM milestone_types WHERE name = ? COLLATE NOCASE AND id != ?",
);
const create = mutation("INSERT INTO milestone_types (name, milestones) VALUES (?, '[]')");
const rename = mutation("UPDATE milestone_types SET name = ? WHERE id = ?");
const setMilestones = mutation("UPDATE milestone_types SET milestones = ? WHERE id = ?");
const detach = mutation("UPDATE projects SET milestone_type_id = NULL WHERE milestone_type_id = ?");
const remove = mutation("DELETE FROM milestone_types WHERE id = ?");
const uses = scalar<{ count: number }>(
  "SELECT COUNT(*) AS count FROM projects WHERE milestone_type_id = ?",
);

export const milestoneTypes = {
  byId: selection<MilestoneTypeRow>("SELECT * FROM milestone_types WHERE id = ?"),
};

/** Les jalons du type « Défaut » : les couleurs de la progression d'un projet. */
const DEFAULT_MILESTONES: Milestone[] = [
  { value: 33, label: "", color: "red.6" },
  { value: 66, label: "", color: "orange.6" },
  { value: 100, label: "", color: "teal.6" },
];
const createWithMilestones = mutation("INSERT INTO milestone_types (name, milestones) VALUES (?, ?)");

/**
 * Pose le type « Défaut » s'il n'existe pas — à l'arrivée d'un widget de
 * projets dans un tableau. Vrai s'il vient d'être créé.
 */
export const ensureDefaultType = (): boolean => {
  if (byName.get(DEFAULT_MILESTONE_TYPE, 0)) return false;
  createWithMilestones.run(DEFAULT_MILESTONE_TYPE, JSON.stringify(DEFAULT_MILESTONES));
  return true;
};

/** La ligne telle que l'API la rend : ses jalons redeviennent une liste. */
const toType = (row: MilestoneTypeRow): MilestoneType => {
  let milestones: MilestoneType["milestones"] = [];
  try {
    milestones = validMilestones(JSON.parse(row.milestones)) ?? [];
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
  res.json(all.all().map(toType));
});

milestoneTypeRoutes.post("/", (req, res) => {
  const name = requireText(req.body.name, "Le nom est requis");
  if (byName.get(name, 0)) conflict(TYPE_EXISTS);

  const { lastInsertRowid } = create.run(name);
  res.status(201).json(toType(milestoneTypes.byId.get(lastInsertRowid)!));
});

// Le nom et les jalons se modifient séparément : ce qui n'est pas envoyé reste.
milestoneTypeRoutes.put("/:id", (req, res) => {
  const existing = orNotFound(milestoneTypes.byId.get(req.params.id), TYPE_NOT_FOUND);

  if (req.body.name !== undefined) {
    const name = requireText(req.body.name, "Le nom est requis");
    if (byName.get(name, existing.id)) conflict(TYPE_EXISTS);
    rename.run(name, existing.id);
  }

  if (req.body.milestones !== undefined) {
    const milestones =
      validMilestones(req.body.milestones) ??
      badRequest("Chaque jalon demande une valeur de 0 à 100");
    setMilestones.run(JSON.stringify(milestones), existing.id);
  }

  res.json(toType(milestoneTypes.byId.get(existing.id)!));
});

milestoneTypeRoutes.delete("/:id", (req, res) => {
  const existing = orNotFound(milestoneTypes.byId.get(req.params.id), TYPE_NOT_FOUND);
  refuseIfUsed(existing.name, uses(existing.id).count);
  // Détachés d'abord, sans compter sur la clé étrangère : une base ancienne a
  // reçu la colonne par ALTER TABLE, et c'est ici qu'on veut en être sûr.
  transaction(() => {
    detach.run(existing.id);
    remove.run(existing.id);
  })();
  res.status(204).end();
});
