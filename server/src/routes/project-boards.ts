// Les catégories des projets. Une catégorie appartient à un tableau : deux
// tableaux peuvent nommer une catégorie de la même façon.

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
import { require, requestCan } from "../lib/droits.js";
import { touch } from "../middleware/events.js";
import { VISIBLE_BOARDS_CLAUSE, openBoard } from "../repositories/boards.js";
import { renderedCategory, categories, validMilestones } from "../repositories/project-boards.js";
import { receivedOrder, arrangeCategories } from "../repositories/reorder.js";

const CATEGORY_NOT_FOUND = "Catégorie introuvable";
const EXISTING_CATEGORY = "Cette catégorie existe déjà";

// --- Catégories ------------------------------------------------------------
// Une catégorie appartient à un tableau de projets : deux tableaux peuvent
// nommer une catégorie de la même façon.

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
 * Les catégories d'un tableau posées dans un autre. Celles qui y portent déjà
 * le même nom ne sont pas redoublées — la base le refuserait de toute façon,
 * le nom étant unique par tableau. « remplacer » : celles de l'accueil s'en
 * vont d'abord, sauf celles qui rangent encore des projets — les effacer
 * emporterait ces projets. Le compte rendu les dit gardées.
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

/** Les jalons du corps de la requête ; « undefined » quand ils n'y sont pas. */
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
    // Le tableau visé doit être ouvert à cette personne : ses catégories ne
    // sortent pas d'un tableau privé.
    const visible = openBoard(board, req.user);
    return void res.json(categoriesOfBoard.all(visible.id).map(renderedCategory));
  }
  // Sans filtre, les catégories des tableaux fermés aux autres sont écartées.
  res.json(categoriesWithCounts.all({ me: req.user.id }).map(renderedCategory));
});

categoryRoutes.post("/copy", (req, res) => {
  require(req, "projects", "create");
  const { from_board, to_board } = req.body;
  if (!from_board || !to_board) {
    badRequest("Le tableau d'origine et celui de destination sont requis");
  }
  const replaceExisting = req.body.replace === true;
  // Effacer celles de l'accueil, c'est en supprimer.
  if (replaceExisting) require(req, "projects", "delete");

  const source = openBoard(from_board, req.user);
  const target = openBoard(to_board, req.user);
  if (source.id === target.id) badRequest("Choisissez un autre tableau que celui-ci");

  res.json(copyCategories(source.id, target.id, replaceExisting));
});

// L'ordre des catégories d'un tableau, glissé dans le tiroir du widget : il
// nomme toutes celles du tableau, chacune une fois.
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

  // Le nom et les jalons se modifient chacun de leur côté : ce qui n'est pas
  // envoyé ne change pas.
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
