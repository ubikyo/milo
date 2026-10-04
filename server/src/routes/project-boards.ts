// Project categories. A category belongs to a board: two boards can name a
// category the same way.

import { Router } from "express";
import type { CopyResult, Id, Milestone } from "@milo/shared";
import { mutation, scalar, selection, transaction } from "../db/query.js";
import type { CategoryRow, CountRow } from "../db/rows.js";
import {
  badRequest,
  conflict,
  orNotFound,
  refuseIfUsed,
  requireText,
} from "../lib/http.js";
import { require, requestCan } from "../lib/rights.js";
import { touch } from "../middleware/events.js";
import { VISIBLE_BOARDS_CLAUSE, openBoard } from "../repositories/boards.js";
import { renderedCategory, categories, validMilestones } from "../repositories/project-boards.js";
import { receivedOrder, arrangeCategories } from "../repositories/reorder.js";

const CATEGORY_NOT_FOUND = "Catégorie introuvable";
const EXISTING_CATEGORY = "Cette catégorie existe déjà";

// --- Categories ------------------------------------------------------------
// A category belongs to a project board: two boards can name a category the
// same way.

const categoriesWithCounts = selection<CategoryRow & { project_count: number }>(
  `SELECT categories.*,
          (SELECT COUNT(*) FROM projects WHERE projects.category_id = categories.id) AS project_count
   FROM categories
   WHERE ${VISIBLE_BOARDS_CLAUSE("categories.board_id")}
   ORDER BY name`,
);
const categoriesOfBoard = selection<CategoryRow & { project_count: number }>(
  `SELECT categories.*,
          (SELECT COUNT(*) FROM projects WHERE projects.category_id = categories.id) AS project_count
   FROM categories
   WHERE categories.board_id = ?
   ORDER BY position, name`,
);

const deleteCategory = mutation("DELETE FROM categories WHERE id = ?");

/**
 * The categories of one board set on another. Those already bearing the same
 * name there are not duplicated — the database would refuse it anyway, the
 * name being unique per board. "replace": the destination's go first, except
 * those still holding projects — deleting them would take those projects
 * with them. The report says they were kept.
 */
const copyCategories = transaction((source: Id, target: Id, replaceExisting: boolean): CopyResult => {
  let copied = 0;
  let skipped = 0;
  let removed = 0;
  let kept = 0;

  if (replaceExisting) {
    for (const category of categoriesOfBoard.all(target)) {
      if (category.project_count > 0) {
        kept += 1;
        continue;
      }
      deleteCategory.run(category.id);
      removed += 1;
    }
  }

  for (const category of categoriesOfBoard.all(source)) {
    if (categories.byName.get(target, category.name, 0)) {
      skipped += 1;
      continue;
    }
    categories.create.run(target, category.name, category.milestones);
    copied += 1;
  }

  return { copied, skipped, removed, kept };
});

const countProjectsOfCategory = scalar<CountRow>(
  "SELECT COUNT(*) AS count FROM projects WHERE category_id = ?",
);
const deleteCategoryProjects = mutation("DELETE FROM projects WHERE category_id = ?");

const deleteCategoryCascade = transaction((id: number): number => {
  const { count } = countProjectsOfCategory(id);
  deleteCategoryProjects.run(id);
  deleteCategory.run(id);
  return count;
});

/** The milestones from the request body; "undefined" when they are not there. */
const readMilestones = (received: unknown): Milestone[] | undefined => {
  if (received === undefined) return undefined;
  return (
    validMilestones(received) ?? badRequest("Chaque jalon demande une valeur de 0 à 100")
  );
};

const updateCategory = transaction(
  (id: Id, name: string | null, milestones: Milestone[] | undefined): void => {
    if (name !== null) categories.rename.run(name, id);
    if (milestones) categories.setMilestones.run(JSON.stringify(milestones), id);
  },
);

export const categoryRoutes = Router();

categoryRoutes.use(touch("categories", "projects"));

categoryRoutes.get("/", (req, res) => {
  if (!requestCan(req, "projects", "view")) return void res.json([]);
  const { board } = req.query;
  if (board && board !== "all") {
    // The targeted board must be open to this person: its categories do not
    // leave a board one does not see.
    const visible = openBoard(board, req.user);
    return void res.json(categoriesOfBoard.all(visible.id).map(renderedCategory));
  }
  // Without a filter, the categories of boards closed to others are dropped.
  res.json(categoriesWithCounts.all({ me: req.user.id }).map(renderedCategory));
});

categoryRoutes.post("/copy", (req, res) => {
  require(req, "projects", "create");
  const { from_board, to_board } = req.body;
  if (!from_board || !to_board) {
    badRequest("Le tableau d'origine et celui de destination sont requis");
  }
  const replaceExisting = req.body.replace === true;
  // Erasing the destination's means deleting some.
  if (replaceExisting) require(req, "projects", "delete");

  const source = openBoard(from_board, req.user);
  const target = openBoard(to_board, req.user);
  if (source.id === target.id) badRequest("Choisissez un autre tableau que celui-ci");

  res.json(copyCategories(source.id, target.id, replaceExisting));
});

// The order of a board's categories, dragged in the widget's drawer: it
// names all those of the board, each once.
categoryRoutes.put("/reorder", (req, res) => {
  require(req, "projects", "update");
  const { board_id, ids } = req.body;
  if (!board_id) badRequest("Le tableau est requis");
  const board = openBoard(board_id, req.user);
  const all = categoriesOfBoard.all(board.id);
  arrangeCategories(receivedOrder(ids, all, "L'ordre doit nommer toutes les catégories"), board.id);
  res.json(categoriesOfBoard.all(board.id).map(renderedCategory));
});

categoryRoutes.post("/", (req, res) => {
  require(req, "projects", "create");
  const name = requireText(req.body.name, "Le nom est requis");
  const boardId = req.body.board_id;
  if (!boardId) badRequest("Le tableau est requis");
  openBoard(boardId, req.user);
  if (categories.byName.get(boardId, name, 0)) conflict(EXISTING_CATEGORY);

  const milestones = readMilestones(req.body.milestones) ?? [];

  const { lastInsertRowid } = categories.create.run(boardId, name, JSON.stringify(milestones));
  res.status(201).json(renderedCategory(categories.byId.get(lastInsertRowid)!));
});

categoryRoutes.put("/:id", (req, res) => {
  require(req, "projects", "update");
  const existing = orNotFound(categories.byId.get(req.params.id), CATEGORY_NOT_FOUND);
  openBoard(existing.board_id, req.user);

  // The name and milestones are each edited on their own: what is not sent
  // does not change.
  const milestones = readMilestones(req.body.milestones);
  const name =
    req.body.name === undefined ? null : requireText(req.body.name, "Le nom est requis");
  if (name !== null && categories.byName.get(existing.board_id, name, existing.id)) {
    conflict(EXISTING_CATEGORY);
  }

  updateCategory(existing.id, name, milestones);
  res.json(renderedCategory(categories.byId.get(existing.id)!));
});

categoryRoutes.delete("/:id", (req, res) => {
  require(req, "projects", "delete");
  const existing = orNotFound(categories.byId.get(req.params.id), CATEGORY_NOT_FOUND);
  openBoard(existing.board_id, req.user);
  refuseIfUsed(existing.name, countProjectsOfCategory(existing.id).count);
  res.json({ deleted_projects: deleteCategoryCascade(existing.id) });
});
