// Project categories. A category belongs to a board: two boards can name a
// category the same way. A board's form a tree — "Interne > Informatique >
// Réseau" —: two categories of a parent do not share a name.

import { Router } from "express";
import type { Request } from "express";
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
import { concerned, notifyBoard, root } from "../lib/notify.js";
import { require, requestCan } from "../lib/rights.js";
import { touch } from "../middleware/events.js";
import { VISIBLE_BOARDS_CLAUSE, openBoard } from "../repositories/boards.js";
import {
  renderedCategory,
  categories,
  subtreeOf,
  validMilestones,
} from "../repositories/project-boards.js";
import { receivedOrder, arrangeCategories } from "../repositories/reorder.js";

const CATEGORY_NOT_FOUND = "Catégorie introuvable";

/** A change of a board's categories, announced to those its projects concern. */
const announce = (req: Request, boardId: Id, message: string): void =>
  notifyBoard({ boardId, message, author: req.user, base: root(req), recipients: concerned.projectBoard(boardId) });
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

/** A board's categories in the tree's order: each parent before its children. */
const inTreeOrder = <Row extends CategoryRow>(rows: Row[]): Row[] => {
  const ids = new Set(rows.map((r) => r.id));
  const ordered: Row[] = [];
  const visit = (parent: Id | null) => {
    for (const row of rows) {
      // A category whose parent is missing counts as a root.
      const at = row.parent_id !== null && ids.has(row.parent_id) ? row.parent_id : null;
      if (at !== parent) continue;
      ordered.push(row);
      visit(row.id);
    }
  };
  visit(null);
  return ordered;
};

/**
 * The categories of one board set on another, with their tree. Those already
 * bearing the same name under the same parent there are not duplicated: what
 * the source holds under them joins them. "replace": the destination's go
 * first, except those still holding projects — themselves or under them:
 * deleting them would take those projects with them. The report says they
 * were kept.
 */
const copyCategories = transaction((source: Id, target: Id, replaceExisting: boolean): CopyResult => {
  let copied = 0;
  let skipped = 0;
  let removed = 0;
  let kept = 0;

  if (replaceExisting) {
    // The deepest first: a parent goes once its children are gone.
    for (const category of inTreeOrder(categoriesOfBoard.all(target)).reverse()) {
      if (categories.children.all(category.id).length > 0 || category.project_count > 0) {
        kept += 1;
        continue;
      }
      deleteCategory.run(category.id);
      removed += 1;
    }
  }

  /** A source category's counterpart in the destination. */
  const counterpart = new Map<Id, Id>();
  for (const category of inTreeOrder(categoriesOfBoard.all(source))) {
    const parent = category.parent_id === null ? null : (counterpart.get(category.parent_id) ?? null);
    const already = categories.byName.get(target, parent, category.name, 0);
    if (already) {
      counterpart.set(category.id, already.id);
      skipped += 1;
      continue;
    }
    const { lastInsertRowid } = categories.create.run(target, category.name, category.milestones, parent);
    counterpart.set(category.id, Number(lastInsertRowid));
    copied += 1;
  }

  return { copied, skipped, removed, kept };
});

/**
 * The parent received for a category of this board: null at the root. It must
 * be one of the board's, and not the category itself or one under it.
 */
const readParent = (received: unknown, boardId: Id, own?: Id): Id | null => {
  if (received === null || received === undefined || received === "") return null;
  const parent = orNotFound(categories.byId.get(received), "Catégorie parente introuvable");
  if (String(parent.board_id) !== String(boardId)) {
    badRequest("La catégorie parente doit être du même tableau");
  }
  if (own !== undefined && subtreeOf(own).has(parent.id)) {
    badRequest("Une catégorie ne peut pas être rangée sous elle-même");
  }
  return parent.id;
};

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
  (
    id: Id,
    name: string | null,
    parent: Id | null | undefined,
    milestones: Milestone[] | undefined,
  ): void => {
    if (name !== null) categories.rename.run(name, id);
    if (parent !== undefined) categories.setParent.run(parent, id);
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

  const result = copyCategories(source.id, target.id, replaceExisting);
  if (result.copied || result.removed) {
    announce(
      req,
      target.id,
      replaceExisting
        ? "a remplacé les catégories par celles d'un autre tableau"
        : `a copié ${result.copied} catégorie${result.copied > 1 ? "s" : ""} d'un autre tableau`,
    );
  }
  res.json(result);
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
  announce(req, board.id, "a réorganisé les catégories");
  res.json(categoriesOfBoard.all(board.id).map(renderedCategory));
});

categoryRoutes.post("/", (req, res) => {
  require(req, "projects", "create");
  const name = requireText(req.body.name, "Le nom est requis");
  const boardId = req.body.board_id;
  if (!boardId) badRequest("Le tableau est requis");
  const board = openBoard(boardId, req.user);
  const parent = readParent(req.body.parent_id, board.id);
  if (categories.byName.get(board.id, parent, name, 0)) conflict(EXISTING_CATEGORY);

  const milestones = readMilestones(req.body.milestones) ?? [];

  const { lastInsertRowid } = categories.create.run(board.id, name, JSON.stringify(milestones), parent);
  announce(req, board.id, `a ajouté la catégorie « ${name} »`);
  res.status(201).json(renderedCategory(categories.byId.get(lastInsertRowid)!));
});

categoryRoutes.put("/:id", (req, res) => {
  require(req, "projects", "update");
  const existing = orNotFound(categories.byId.get(req.params.id), CATEGORY_NOT_FOUND);
  openBoard(existing.board_id, req.user);

  // The name, the parent and the milestones are each edited on their own:
  // what is not sent does not change.
  const milestones = readMilestones(req.body.milestones);
  const name =
    req.body.name === undefined ? null : requireText(req.body.name, "Le nom est requis");
  const parent =
    req.body.parent_id === undefined
      ? undefined
      : readParent(req.body.parent_id, existing.board_id, existing.id);
  if (
    (name !== null || parent !== undefined) &&
    categories.byName.get(
      existing.board_id,
      parent === undefined ? existing.parent_id : parent,
      name ?? existing.name,
      existing.id,
    )
  ) {
    conflict(EXISTING_CATEGORY);
  }

  updateCategory(existing.id, name, parent, milestones);
  if (name !== null && name !== existing.name) {
    announce(req, existing.board_id, `a renommé la catégorie « ${existing.name} » en « ${name} »`);
  }
  if (parent !== undefined && parent !== existing.parent_id) {
    announce(req, existing.board_id, `a déplacé la catégorie « ${name ?? existing.name} »`);
  }
  if (milestones) {
    announce(req, existing.board_id, `a modifié les jalons de la catégorie « ${name ?? existing.name} »`);
  }
  res.json(renderedCategory(categories.byId.get(existing.id)!));
});

categoryRoutes.delete("/:id", (req, res) => {
  require(req, "projects", "delete");
  const existing = orNotFound(categories.byId.get(req.params.id), CATEGORY_NOT_FOUND);
  openBoard(existing.board_id, req.user);
  refuseIfUsed(existing.name, countProjectsOfCategory(existing.id).count);
  // Those under it go first.
  if (categories.children.get(existing.id)) {
    conflict(`« ${existing.name} » contient encore d'autres catégories`);
  }
  const deleted = deleteCategoryCascade(existing.id);
  announce(req, existing.board_id, `a supprimé la catégorie « ${existing.name} »`);
  res.json({ deleted_projects: deleted });
});
