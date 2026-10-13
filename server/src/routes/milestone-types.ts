// Milestone types: Commande, Développement, Installation… Each "Projets"
// widget has its own (its board and its list key). A project picks one of its
// list's, which sets the marks and colors of its progress slider.
//
// Deleting a type deletes no project: those carrying it keep their progress,
// and their slider goes back to bare (ON DELETE SET NULL).

import { Router } from "express";
import type { Request } from "express";
import { DEFAULT_MILESTONE_TYPE } from "@milo/shared";
import type { Id, Milestone, MilestoneType, Right } from "@milo/shared";
import { mutation, scalar, selection, transaction } from "../db/query.js";
import type { MilestoneTypeRow } from "../db/rows.js";
import { badRequest, conflict, orNotFound, refuseIfUsed, requireText } from "../lib/http.js";
import { require } from "../lib/rights.js";
import { touch } from "../middleware/events.js";
import { openBoard } from "../repositories/boards.js";
import { listInBoard } from "../repositories/lists.js";
import type { ListScope } from "../repositories/lists.js";
import { validMilestones } from "../repositories/project-boards.js";

const TYPE_NOT_FOUND = "Type de jalons introuvable";
const TYPE_EXISTS = "Ce type de jalons existe déjà";

const ofList = selection<MilestoneTypeRow>(
  "SELECT * FROM milestone_types WHERE board_id = ? AND list_key = ? ORDER BY name",
);
const ofBoard = selection<MilestoneTypeRow>(
  "SELECT * FROM milestone_types WHERE board_id = ? ORDER BY name",
);
const byName = selection<MilestoneTypeRow>(
  `SELECT * FROM milestone_types
   WHERE board_id = ? AND list_key = ? AND name = ? COLLATE NOCASE AND id != ?`,
);
const createStatement = mutation(
  "INSERT INTO milestone_types (board_id, list_key, name, milestones) VALUES (?, ?, ?, ?)",
);
const create = (scope: ListScope, name: string, milestones: Milestone[] = []) =>
  createStatement.run(scope.board, scope.list, name, JSON.stringify(milestones));
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

/**
 * Sets the "Défaut" type of a "Projets" widget if it has none of that name —
 * when the widget arrives. True if it was just created.
 */
export const ensureDefaultType = (scope: ListScope): boolean => {
  if (!scope.list || byName.get(scope.board, scope.list, DEFAULT_MILESTONE_TYPE, 0)) return false;
  create(scope, DEFAULT_MILESTONE_TYPE, DEFAULT_MILESTONES);
  return true;
};

/** The type a project of this list may carry: one of the list's own. */
export const milestoneTypeOfList = (scope: ListScope, received: unknown): MilestoneTypeRow => {
  const type = orNotFound(milestoneTypes.byId.get(received), TYPE_NOT_FOUND);
  if (type.board_id !== scope.board || type.list_key !== scope.list) badRequest(TYPE_NOT_FOUND);
  return type;
};

/**
 * The type of the same name in another list, created there if needed: what a
 * project copied or moved to it carries.
 */
export const twinMilestoneType = (id: Id | null, target: ListScope): Id | null => {
  const type = id ? milestoneTypes.byId.get(id) : undefined;
  if (!type) return null;
  if (type.board_id === target.board && type.list_key === target.list) return type.id;
  const twin = byName.get(target.board, target.list, type.name, 0);
  if (twin) return twin.id;
  return Number(
    createStatement.run(target.board, target.list, type.name, type.milestones).lastInsertRowid,
  );
};

/** The row as the API returns it: its milestones become a list again. */
const toType = (row: MilestoneTypeRow): MilestoneType => {
  let milestones: MilestoneType["milestones"] = [];
  try {
    milestones = validMilestones(JSON.parse(row.milestones)) ?? [];
  } catch {
    // Unreadable JSON counts as an empty list rather than an error page.
  }
  return { id: row.id, board_id: row.board_id, list_key: row.list_key, name: row.name, milestones };
};

/** The board of a request, open to this person with this right in the Projects mode. */
const boardOf = (req: Request, boardId: unknown, right: Right) => {
  require(req, "projects", right);
  return openBoard(boardId, req.user).id;
};

/** The "Projets" widget a request names, once its board's access is checked. */
const scopeOf = (req: Request, boardId: unknown, list: unknown, right: Right): ListScope =>
  listInBoard(boardOf(req, boardId, right), "project.list", list);

export const milestoneTypeRoutes = Router();

// Milestones are read on the projects carrying the type: changing them
// changes their slider and the color of their progress.
milestoneTypeRoutes.use(touch("lookups", "projects"));

// Without a list, every type of the board: each carries its list key.
milestoneTypeRoutes.get("/", (req, res) => {
  const { board, list } = req.query;
  if (!board) badRequest("Le paramètre board est requis");
  const rows = list
    ? (() => {
        const scope = scopeOf(req, board, list, "view");
        return ofList.all(scope.board, scope.list);
      })()
    : ofBoard.all(boardOf(req, board, "view"));
  res.json(rows.map(toType));
});

milestoneTypeRoutes.post("/", (req, res) => {
  const scope = scopeOf(req, req.body.board_id, req.body.list_key, "create");
  const name = requireText(req.body.name, "Le nom est requis");
  if (byName.get(scope.board, scope.list, name, 0)) conflict(TYPE_EXISTS);

  const { lastInsertRowid } = create(scope, name);
  res.status(201).json(toType(milestoneTypes.byId.get(lastInsertRowid)!));
});

// The name and milestones are edited separately: what is not sent stays.
milestoneTypeRoutes.put("/:id", (req, res) => {
  const existing = orNotFound(milestoneTypes.byId.get(req.params.id), TYPE_NOT_FOUND);
  scopeOf(req, existing.board_id, existing.list_key, "update");

  if (req.body.name !== undefined) {
    const name = requireText(req.body.name, "Le nom est requis");
    if (byName.get(existing.board_id, existing.list_key, name, existing.id)) conflict(TYPE_EXISTS);
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
  scopeOf(req, existing.board_id, existing.list_key, "delete");
  refuseIfUsed(existing.name, uses(existing.id).count);
  // Detached first, without relying on the foreign key: an old database got
  // the column through ALTER TABLE, and this is where we want to be sure.
  transaction(() => {
    detach.run(existing.id);
    remove.run(existing.id);
  })();
  res.status(204).end();
});
