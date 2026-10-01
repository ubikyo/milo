// Les tableaux du mode Projet, et leurs catégories. Les deux vont ensemble :
// une catégorie n'existe que dans un tableau.

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
import { concernes, notifierSuppression } from "../lib/notify.js";
import { touch } from "../middleware/events.js";
import {
  categorieRendue,
  categories,
  jalonsValides,
  projectBoardOuvert,
  projectBoards,
} from "../repositories/project-boards.js";
import { ordreRecu, rangerProjectBoards } from "../repositories/reorder.js";
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
const projetsDuTableau = selection<{ id: Id; name: string }>(
  "SELECT id, name FROM projects WHERE board_id = ?",
);

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
  // Nouveau tableau ajouté à la suite des autres, ouvert à tous : « Privé » se
  // règle ensuite, depuis le menu de l'onglet.
  const { next } = projectBoards.nextPosition();
  const { lastInsertRowid } = projectBoards.create.run(
    name,
    next,
    drapeau(req.body.is_private, 0),
    // Le propriétaire n'existe que pour un tableau privé.
    drapeau(req.body.is_private, 0) ? req.user.id : null,
    now(),
  );
  res.status(201).json(projectBoards.byId.get(lastInsertRowid));
});

// Ranger les onglets. Déclaré avant « /:id », sinon « reorder » serait pris
// pour un identifiant. L'ordre est celui de tout le monde : un tableau privé
// qu'on ne voit pas garde sa place (repositories/reorder.ts).
projectBoardRoutes.put("/reorder", (req, res) => {
  const visibles = projectBoards.visibleTo.all(req.user.id);
  const ordre = ordreRecu(
    req.body.ids,
    visibles,
    "La liste des identifiants ne correspond pas aux tableaux",
  );

  rangerProjectBoards(ordre);
  res.json(projectBoards.visibleTo.all(req.user.id));
});

projectBoardRoutes.put("/:id", (req, res) => {
  const existing = projectBoardOuvert(req.params.id, req.user);
  const name = requireText(req.body.name ?? existing.name, "Le nom du tableau est requis");
  const isPrivate = drapeau(req.body.is_private, existing.is_private);

  // Un tableau n'a de propriétaire que privé : le fermer, c'est se le
  // réserver ; le rouvrir le rend à tous, sans propriétaire. Seul celui qui
  // l'a fermé le voit encore, et peut donc le rouvrir.
  const owner = isPrivate ? (existing.is_private ? existing.owner_id : req.user.id) : null;

  projectBoards.update.run(name, isPrivate, owner, existing.id);
  res.json(projectBoards.byId.get(existing.id));
});

projectBoardRoutes.delete("/:id", (req, res) => {
  const existing = projectBoardOuvert(req.params.id, req.user);
  // Chaque projet emporté est annoncé à ses acteurs et à ceux qui le suivent,
  // lus avant qu'ils partent avec lui.
  const emportes = projetsDuTableau
    .all(existing.id)
    .map((p) => ({ ...p, destinataires: concernes.projet(p.id) }));
  const deleted_projects = supprimerTableauEnCascade(existing.id);
  for (const projet of emportes) {
    notifierSuppression({
      kind: "project",
      targetId: projet.id,
      titre: projet.name,
      message: `a supprimé le tableau « ${existing.name} » et ses projets`,
      auteur: req.user,
      destinataires: projet.destinataires,
      disparu: true,
    });
  }
  res.json({ deleted_projects });
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
    categories.create.run(cible, categorie.name, categorie.milestones);
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
  const { board } = req.query;
  if (board && board !== "all") {
    // Le tableau visé doit être ouvert à cette personne : ses catégories ne
    // sortent pas d'un tableau privé.
    const visible = projectBoardOuvert(board, req.user);
    return void res.json(categoriesDuTableau.all(visible.id).map(categorieRendue));
  }
  // Sans filtre, les catégories des tableaux fermés aux autres sont écartées.
  res.json(categoriesAvecComptes.all({ me: req.user.id }).map(categorieRendue));
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

  const milestones = lireJalons(req.body.milestones) ?? [];

  const { lastInsertRowid } = categories.create.run(boardId, name, JSON.stringify(milestones));
  res.status(201).json(categorieRendue(categories.byId.get(lastInsertRowid)!));
});

categoryRoutes.put("/:id", (req, res) => {
  const existing = orNotFound(categories.byId.get(req.params.id), CATEGORIE_INTROUVABLE);
  projectBoardOuvert(existing.board_id, req.user);

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
  const existing = orNotFound(categories.byId.get(req.params.id), CATEGORIE_INTROUVABLE);
  projectBoardOuvert(existing.board_id, req.user);
  refuserSiUtilise(existing.name, compterProjetsDeLaCategorie(existing.id).count);
  res.json({ deleted_projects: supprimerCategorieEnCascade(existing.id) });
});
