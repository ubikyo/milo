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
  refuserSiUtilise,
  requireText,
} from "../lib/http.js";
import { exiger, peut } from "../lib/droits.js";
import { touch } from "../middleware/events.js";
import { CLAUSE_TABLEAUX_VISIBLES, tableauOuvert } from "../repositories/boards.js";
import { categorieRendue, categories, jalonsValides } from "../repositories/project-boards.js";
import { ordreRecu, rangerCategories } from "../repositories/reorder.js";

const CATEGORIE_INTROUVABLE = "Catégorie introuvable";
const CATEGORIE_EXISTANTE = "Cette catégorie existe déjà";

// --- Catégories ------------------------------------------------------------
// Une catégorie appartient à un tableau de projets : deux tableaux peuvent
// nommer une catégorie de la même façon.

const categoriesAvecComptes = selection<CategoryRow & { project_count: number }>(
  `SELECT categories.*,
          (SELECT COUNT(*) FROM projects WHERE projects.category_id = categories.id) AS project_count
   FROM categories
   WHERE ${CLAUSE_TABLEAUX_VISIBLES("categories.board_id")}
   ORDER BY name`,
);
const categoriesDuTableau = selection<CategoryRow & { project_count: number }>(
  `SELECT categories.*,
          (SELECT COUNT(*) FROM projects WHERE projects.category_id = categories.id) AS project_count
   FROM categories
   WHERE categories.board_id = ?
   ORDER BY position, name`,
);

const supprimerCategorie = mutation("DELETE FROM categories WHERE id = ?");

/**
 * Les catégories d'un tableau posées dans un autre. Celles qui y portent déjà
 * le même nom ne sont pas redoublées — la base le refuserait de toute façon,
 * le nom étant unique par tableau. « remplacer » : celles de l'accueil s'en
 * vont d'abord, sauf celles qui rangent encore des projets — les effacer
 * emporterait ces projets. Le compte rendu les dit gardées.
 */
const copierCategories = transaction((source: Id, cible: Id, remplacer: boolean): CopyResult => {
  let copied = 0;
  let skipped = 0;
  let removed = 0;
  let kept = 0;

  if (remplacer) {
    for (const categorie of categoriesDuTableau.all(cible)) {
      if (categorie.project_count > 0) {
        kept += 1;
        continue;
      }
      supprimerCategorie.run(categorie.id);
      removed += 1;
    }
  }

  for (const categorie of categoriesDuTableau.all(source)) {
    if (categories.byName.get(cible, categorie.name, 0)) {
      skipped += 1;
      continue;
    }
    categories.create.run(cible, categorie.name, categorie.milestones);
    copied += 1;
  }

  return { copied, skipped, removed, kept };
});

const compterProjetsDeLaCategorie = scalar<CountRow>(
  "SELECT COUNT(*) AS count FROM projects WHERE category_id = ?",
);
const supprimerProjetsDeLaCategorie = mutation("DELETE FROM projects WHERE category_id = ?");

const supprimerCategorieEnCascade = transaction((id: number): number => {
  const { count } = compterProjetsDeLaCategorie(id);
  supprimerProjetsDeLaCategorie.run(id);
  supprimerCategorie.run(id);
  return count;
});

/** Les jalons du corps de la requête ; « undefined » quand ils n'y sont pas. */
const lireJalons = (recu: unknown): Milestone[] | undefined => {
  if (recu === undefined) return undefined;
  return (
    jalonsValides(recu) ?? badRequest("Chaque jalon demande une valeur de 0 à 100")
  );
};

const majCategorie = transaction(
  (id: Id, name: string | null, milestones: Milestone[] | undefined): void => {
    if (name !== null) categories.rename.run(name, id);
    if (milestones) categories.setMilestones.run(JSON.stringify(milestones), id);
  },
);

export const categoryRoutes = Router();

categoryRoutes.use(touch("categories", "projects"));

categoryRoutes.get("/", (req, res) => {
  if (!peut(req, "projects", "view")) return void res.json([]);
  const { board } = req.query;
  if (board && board !== "all") {
    // Le tableau visé doit être ouvert à cette personne : ses catégories ne
    // sortent pas d'un tableau privé.
    const visible = tableauOuvert(board, req.user);
    return void res.json(categoriesDuTableau.all(visible.id).map(categorieRendue));
  }
  // Sans filtre, les catégories des tableaux fermés aux autres sont écartées.
  res.json(categoriesAvecComptes.all({ me: req.user.id }).map(categorieRendue));
});

categoryRoutes.post("/copy", (req, res) => {
  exiger(req, "projects", "create");
  const { from_board, to_board } = req.body;
  if (!from_board || !to_board) {
    badRequest("Le tableau d'origine et celui de destination sont requis");
  }
  const remplacer = req.body.replace === true;
  // Effacer celles de l'accueil, c'est en supprimer.
  if (remplacer) exiger(req, "projects", "delete");

  const source = tableauOuvert(from_board, req.user);
  const cible = tableauOuvert(to_board, req.user);
  if (source.id === cible.id) badRequest("Choisissez un autre tableau que celui-ci");

  res.json(copierCategories(source.id, cible.id, remplacer));
});

// L'ordre des catégories d'un tableau, glissé dans le tiroir du widget : il
// nomme toutes celles du tableau, chacune une fois.
categoryRoutes.put("/reorder", (req, res) => {
  exiger(req, "projects", "update");
  const { board_id, ids } = req.body;
  if (!board_id) badRequest("Le tableau est requis");
  const tableau = tableauOuvert(board_id, req.user);
  const toutes = categoriesDuTableau.all(tableau.id);
  rangerCategories(ordreRecu(ids, toutes, "L'ordre doit nommer toutes les catégories"), tableau.id);
  res.json(categoriesDuTableau.all(tableau.id).map(categorieRendue));
});

categoryRoutes.post("/", (req, res) => {
  exiger(req, "projects", "create");
  const name = requireText(req.body.name, "Le nom est requis");
  const boardId = req.body.board_id;
  if (!boardId) badRequest("Le tableau est requis");
  tableauOuvert(boardId, req.user);
  if (categories.byName.get(boardId, name, 0)) conflict(CATEGORIE_EXISTANTE);

  const milestones = lireJalons(req.body.milestones) ?? [];

  const { lastInsertRowid } = categories.create.run(boardId, name, JSON.stringify(milestones));
  res.status(201).json(categorieRendue(categories.byId.get(lastInsertRowid)!));
});

categoryRoutes.put("/:id", (req, res) => {
  exiger(req, "projects", "update");
  const existing = orNotFound(categories.byId.get(req.params.id), CATEGORIE_INTROUVABLE);
  tableauOuvert(existing.board_id, req.user);

  // Le nom et les jalons se modifient chacun de leur côté : ce qui n'est pas
  // envoyé ne change pas.
  const milestones = lireJalons(req.body.milestones);
  const name =
    req.body.name === undefined ? null : requireText(req.body.name, "Le nom est requis");
  if (name !== null && categories.byName.get(existing.board_id, name, existing.id)) {
    conflict(CATEGORIE_EXISTANTE);
  }

  majCategorie(existing.id, name, milestones);
  res.json(categorieRendue(categories.byId.get(existing.id)!));
});

categoryRoutes.delete("/:id", (req, res) => {
  exiger(req, "projects", "delete");
  const existing = orNotFound(categories.byId.get(req.params.id), CATEGORIE_INTROUVABLE);
  tableauOuvert(existing.board_id, req.user);
  refuserSiUtilise(existing.name, compterProjetsDeLaCategorie(existing.id).count);
  res.json({ deleted_projects: supprimerCategorieEnCascade(existing.id) });
});
