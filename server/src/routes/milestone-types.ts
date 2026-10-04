// Milestone types: Commande, Développement, Installation… Set once for the
// whole application, in the settings. A project picks one, which sets the
// marks and colors of its progress slider.
//
// Deleting a type deletes no project: those carrying it keep their progress,
// and their slider goes back to bare (ON DELETE SET NULL).

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

/** The milestones of the "Défaut" type: the colors of a project's progress. */
const DEFAULT_MILESTONES: Milestone[] = [
  { value: 33, label: "", color: "red.6" },
  { value: 66, label: "", color: "orange.6" },
  { value: 100, label: "", color: "teal.6" },
];
const createWithMilestones = mutation("INSERT INTO milestone_types (name, milestones) VALUES (?, ?)");

/**
 * Sets the "Défaut" type if it does not exist — when a projects widget
 * arrives in a board. True if it was just created.
 */
export const ensureDefaultType = (): boolean => {
  if (byName.get(DEFAULT_MILESTONE_TYPE, 0)) return false;
  createWithMilestones.run(DEFAULT_MILESTONE_TYPE, JSON.stringify(DEFAULT_MILESTONES));
  return true;
};

/** The row as the API returns it: its milestones become a list again. */
const toType = (row: MilestoneTypeRow): MilestoneType => {
  let milestones: MilestoneType["milestones"] = [];
  try {
    milestones = validMilestones(JSON.parse(row.milestones)) ?? [];
  } catch {
    // Unreadable JSON counts as an empty list rather than an error page.
  }
  return { id: row.id, name: row.name, milestones };
};

export const milestoneTypeRoutes = Router();

// Milestones are read on the projects carrying the type: changing them
// changes their slider and the color of their progress.
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

// The name and milestones are edited separately: what is not sent stays.
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
  // Detached first, without relying on the foreign key: an old database got
  // the column through ALTER TABLE, and this is where we want to be sure.
  transaction(() => {
    detach.run(existing.id);
    remove.run(existing.id);
  })();
  res.status(204).end();
});
