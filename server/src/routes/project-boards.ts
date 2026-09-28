// Les tableaux du mode Projet, et leurs catégories. Les deux vont ensemble :
// une catégorie n'existe que dans un tableau.

import { Router } from "express";
import type { CopyResult, Id } from "@milo/shared";
import { mutation, scalar, selection, transaction } from "../db/query.js";
import type { CategoryRow, CountRow } from "../db/rows.js";
import { badRequest, conflict, forbidden, orNotFound, requireText } from "../lib/http.js";
import { touch } from "../middleware/events.js";
import {
  categories,
  projectBoardOuvert,
  projectBoards,
} from "../repositories/project-boards.js";
import { now } from "../lib/time.js";

const CATEGORIE_INTROUVABLE = "Catégorie introuvable";
const CATEGORIE_EXISTANTE = "Cette catégorie existe déjà";

/** Un réglage arrive en booléen ; la base le range en 0 ou 1. */
const drapeau = (valeur: unknown, defaut: 0 | 1): 0 | 1 =>
  valeur === undefined ? defaut : (Number(Boolean(valeur)) as 0 | 1);

// --- Tableaux --------------------------------------------------------------

const compterProjetsDuTableau = scalar<CountRow>(
  "SELECT COUNT(*) AS count FROM projects WHERE board_id = ?",
);
const supprimerProjetsDuTableau = mutation("DELETE FROM projects WHERE board_id = ?");
const supprimerCategoriesDuTableau = mutation("DELETE FROM categories WHERE board_id = ?");
const supprimerTableau = mutation("DELETE FROM project_boards WHERE id = ?");

/**
 * Suppression en cascade : les projets du tableau partent d'abord (leurs
 * commentaires et leurs acteurs suivent par clé étrangère), puis ses
 * catégories. L'ordre compte : un projet référence sa catégorie.
 */
const supprimerTableauEnCascade = transaction((id: number): number => {
  const { count } = compterProjetsDuTableau(id);
  supprimerProjetsDuTableau.run(id);
  supprimerCategoriesDuTableau.run(id);
  supprimerTableau.run(id);
  return count;
});

export const projectBoardRoutes = Router();

projectBoardRoutes.use(touch("project-boards", "categories", "projects", "project-labels"));

projectBoardRoutes.get("/", (req, res) => {
  res.json(projectBoards.visibleTo.all(req.user.id));
});

projectBoardRoutes.post("/", (req, res) => {
  const name = requireText(req.body.name, "Le nom du tableau est requis");
  // Nouveau tableau ajouté à la suite des autres. Le tiroir ne propose
  // « Privé » qu'une fois le tableau créé : il naît donc ouvert à tous, mais
  // son auteur est retenu dès maintenant.
  const { next } = projectBoards.nextPosition();
  const { lastInsertRowid } = projectBoards.create.run(
    name,
    next,
    drapeau(req.body.is_private, 0),
    req.user.id,
    now(),
  );
  res.status(201).json(projectBoards.byId.get(lastInsertRowid));
});

projectBoardRoutes.put("/:id", (req, res) => {
  const existing = projectBoardOuvert(req.params.id, req.user);
  const name = requireText(req.body.name ?? existing.name, "Le nom du tableau est requis");
  const isPrivate = drapeau(req.body.is_private, existing.is_private);

  // Fermer un tableau, c'est se le réserver : son auteur seul en décide. Ceux
  // d'avant l'option n'en ont pas — le premier à les fermer les adopte.
  let owner = existing.owner_id;
  if (isPrivate !== existing.is_private) {
    if (owner === null) owner = req.user.id;
    else if (owner !== req.user.id) {
      forbidden("Seul l'auteur du tableau peut le rendre privé");
    }
  }

  projectBoards.update.run(name, isPrivate, owner, existing.id);
  res.json(projectBoards.byId.get(existing.id));
});

projectBoardRoutes.delete("/:id", (req, res) => {
  const existing = projectBoardOuvert(req.params.id, req.user);
  res.json({ deleted_projects: supprimerTableauEnCascade(existing.id) });
});

// --- Catégories ------------------------------------------------------------
// Une catégorie appartient à un tableau de projets : deux tableaux peuvent
// nommer une catégorie de la même façon.

const categoriesAvecComptes = selection<CategoryRow & { project_count: number }>(
  `SELECT categories.*,
          (SELECT COUNT(*) FROM projects WHERE projects.category_id = categories.id) AS project_count
   FROM categories
   WHERE categories.board_id IN (
     SELECT id FROM project_boards WHERE is_private = 0 OR owner_id = @me
   )
   ORDER BY name`,
);
const categoriesDuTableau = selection<CategoryRow & { project_count: number }>(
  `SELECT categories.*,
          (SELECT COUNT(*) FROM projects WHERE projects.category_id = categories.id) AS project_count
   FROM categories
   WHERE categories.board_id = ?
   ORDER BY name`,
);

/**
 * Les catégories d'un tableau posées dans un autre. Celles qui y portent déjà
 * le même nom ne sont pas redoublées — la base le refuserait de toute façon,
 * le nom étant unique par tableau.
 */
const copierCategories = transaction((source: Id, cible: Id): CopyResult => {
  let copied = 0;
  let skipped = 0;

  for (const categorie of categoriesDuTableau.all(source)) {
    if (categories.byName.get(cible, categorie.name, 0)) {
      skipped += 1;
      continue;
    }
    categories.create.run(cible, categorie.name);
    copied += 1;
  }

  return { copied, skipped };
});

const compterProjetsDeLaCategorie = scalar<CountRow>(
  "SELECT COUNT(*) AS count FROM projects WHERE category_id = ?",
);
const supprimerProjetsDeLaCategorie = mutation("DELETE FROM projects WHERE category_id = ?");
const supprimerCategorie = mutation("DELETE FROM categories WHERE id = ?");

const supprimerCategorieEnCascade = transaction((id: number): number => {
  const { count } = compterProjetsDeLaCategorie(id);
  supprimerProjetsDeLaCategorie.run(id);
  supprimerCategorie.run(id);
  return count;
});

export const categoryRoutes = Router();

categoryRoutes.use(touch("categories", "projects"));

categoryRoutes.get("/", (req, res) => {
  const { board } = req.query;
  if (board && board !== "all") {
    // Le tableau visé doit être ouvert à cette personne : ses catégories ne
    // sortent pas d'un tableau privé.
    const visible = projectBoardOuvert(board, req.user);
    return void res.json(categoriesDuTableau.all(visible.id));
  }
  // Sans filtre, les catégories des tableaux fermés aux autres sont écartées.
  res.json(categoriesAvecComptes.all({ me: req.user.id }));
});

categoryRoutes.post("/copy", (req, res) => {
  const { from_board, to_board } = req.body;
  if (!from_board || !to_board) {
    badRequest("Le tableau d'origine et celui de destination sont requis");
  }

  const source = projectBoardOuvert(from_board, req.user);
  const cible = projectBoardOuvert(to_board, req.user);
  if (source.id === cible.id) badRequest("Choisissez un autre tableau que celui-ci");

  res.json(copierCategories(source.id, cible.id));
});

categoryRoutes.post("/", (req, res) => {
  const name = requireText(req.body.name, "Le nom est requis");
  const boardId = req.body.board_id;
  if (!boardId) badRequest("Le tableau est requis");
  projectBoardOuvert(boardId, req.user);
  if (categories.byName.get(boardId, name, 0)) conflict(CATEGORIE_EXISTANTE);

  const { lastInsertRowid } = categories.create.run(boardId, name);
  res.status(201).json(categories.byId.get(lastInsertRowid));
});

categoryRoutes.put("/:id", (req, res) => {
  const existing = orNotFound(categories.byId.get(req.params.id), CATEGORIE_INTROUVABLE);
  projectBoardOuvert(existing.board_id, req.user);
  const name = requireText(req.body.name, "Le nom est requis");
  if (categories.byName.get(existing.board_id, name, existing.id)) conflict(CATEGORIE_EXISTANTE);

  categories.rename.run(name, existing.id);
  res.json(categories.byId.get(existing.id));
});

categoryRoutes.delete("/:id", (req, res) => {
  const existing = orNotFound(categories.byId.get(req.params.id), CATEGORIE_INTROUVABLE);
  projectBoardOuvert(existing.board_id, req.user);
  res.json({ deleted_projects: supprimerCategorieEnCascade(existing.id) });
});
