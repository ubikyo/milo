// Les projets : la liste filtrée, la fiche, et les écritures.

import { Router } from "express";
import type { Id } from "@milo/shared";
import { selection, transaction } from "../db/query.js";
import type { ProjectJoinedRow, ProjectRow, UserRow } from "../db/rows.js";
import { badRequest, orNotFound, requireText, toIds } from "../lib/http.js";
import { descriptionPropre, memeDescription } from "../lib/html.js";
import { notifier, racine } from "../lib/notify.js";
import { horodatage, now } from "../lib/time.js";
import { touch } from "../middleware/events.js";
import {
  CLAUSE_TABLEAUX_VISIBLES,
  categories,
  projectBoardOuvert,
} from "../repositories/project-boards.js";
import {
  PROJECT_SELECT,
  acteursDe,
  copyProjectLabels,
  etiquettesDe,
  oneWithRelations,
  projects,
  replaceActors,
  replaceProjectLabels,
  withRelations,
} from "../repositories/projects.js";
import { comments } from "../repositories/project-comments.js";
import { withAuthor } from "../repositories/comments.js";

const PROJET_INTROUVABLE = "Projet introuvable";

/**
 * Un projet d'un tableau fermé aux autres est, pour eux, introuvable : ni dans
 * la liste, ni par son identifiant, ni en écriture.
 */
const projetOuvert = (id: unknown, user: UserRow): ProjectRow => {
  const project = orNotFound(projects.raw.get(id), PROJET_INTROUVABLE);
  projectBoardOuvert(project.board_id, user);
  return project;
};

export const projectRoutes = Router();

projectRoutes.use(touch("projects"));

// Les filtres de la liste. Chacun est facultatif ; « all » vaut « pas de
// filtre ». Le SQL est assemblé, mais les valeurs passent toujours en
// paramètres nommés — jamais par interpolation.
const CLAUSES: Record<string, string> = {
  board: "projects.board_id = @board",
  category: "projects.category_id = @category",
  company: "projects.company_id = @company",
  actor: "projects.id IN (SELECT project_id FROM project_actors WHERE user_id = @actor)",
};

// Les requêtes assemblées sont gardées : une combinaison de filtres revient
// souvent, et SQLite n'a plus à recompiler le même SQL.
const requetesFiltrees = new Map<string, ReturnType<typeof selection<ProjectJoinedRow>>>();

const requetePour = (clauses: string[]) => {
  const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
  const deja = requetesFiltrees.get(where);
  if (deja) return deja;
  const requete = selection<ProjectJoinedRow>(
    `${PROJECT_SELECT} ${where} ORDER BY projects.updated_at DESC`,
  );
  requetesFiltrees.set(where, requete);
  return requete;
};

projectRoutes.get("/", (req, res) => {
  // Les tableaux fermés aux autres sont écartés d'office : la clause précède
  // les filtres du client et ne dépend pas d'eux.
  const clauses: string[] = [CLAUSE_TABLEAUX_VISIBLES];
  const params: Record<string, unknown> = { me: req.user.id };

  for (const [nom, clause] of Object.entries(CLAUSES)) {
    const valeur = req.query[nom];
    if (valeur && valeur !== "all") {
      clauses.push(clause);
      params[nom] = valeur;
    }
  }

  // L'avancement n'est pas une valeur mais un intervalle : il ne passe pas par
  // un paramètre.
  const { status } = req.query;
  if (status === "in_progress") clauses.push("projects.status < 100");
  else if (status === "done") clauses.push("projects.status = 100");

  res.json(withRelations(requetePour(clauses).all(params)));
});

projectRoutes.get("/:id", (req, res) => {
  const { id } = projetOuvert(req.params.id, req.user);
  const project = orNotFound(projects.joined.get(id), PROJET_INTROUVABLE);
  res.json({
    ...oneWithRelations(project),
    comments: comments.ofProject.all(project.id).map(withAuthor),
  });
});

/**
 * La catégorie retenue doit appartenir au tableau du projet : sinon le projet
 * porterait une catégorie absente de son onglet.
 */
const verifierCategorie = (categoryId: unknown, boardId: unknown): void => {
  const category = categories.byId.get(categoryId);
  if (!category || String(category.board_id) !== String(boardId)) {
    badRequest("Cette catégorie n'appartient pas au tableau");
  }
};

projectRoutes.post("/", (req, res) => {
  const {
    name,
    description = "",
    board_id,
    category_id,
    company_id = null,
    status = 0,
    actor_ids = [],
    label_ids = [],
  } = req.body;

  if (!name || !board_id || !category_id) {
    badRequest("name, board_id et category_id sont requis");
  }
  projectBoardOuvert(board_id, req.user);
  verifierCategorie(category_id, board_id);

  const timestamp = now();

  // Le projet, ses acteurs, ses étiquettes et l'ouverture de son fil : un tout
  // ou rien. Sans transaction, une erreur en cours de route laissait un projet
  // à moitié posé.
  const id = transaction((): Id => {
    const { lastInsertRowid } = projects.create.run({
      name,
      description: descriptionPropre(description),
      board_id,
      category_id,
      company_id,
      status,
      created_at: timestamp,
      updated_at: timestamp,
    });
    const projectId = Number(lastInsertRowid);

    replaceActors(projectId, toIds(actor_ids));
    replaceProjectLabels(projectId, toIds(label_ids), Number(board_id));

    // Le fil s'ouvre sur la création : qui, et quand. Les commentaires écrits
    // ensuite viennent à la suite.
    comments.createSystem.run(
      projectId,
      req.user.id,
      `Projet créé le ${horodatage(timestamp)}`,
      timestamp,
      timestamp,
    );
    return projectId;
  })();

  res.status(201).json(oneWithRelations(projects.joined.get(id)!));
});

/**
 * Copie d'un projet : sa fiche, ses acteurs, ses étiquettes. Sans tableau
 * d'accueil, la copie reste dans celui du projet d'origine.
 *
 * Ce qui ne se copie pas : le fil. Un commentaire porte un auteur et une date ;
 * le recopier fabriquerait une conversation qui n'a pas eu lieu. La copie
 * s'ouvre sur son propre mot de création, comme un projet neuf — c'est la même
 * règle que pour la copie d'une liste.
 */
projectRoutes.post("/:id/copy", (req, res) => {
  const source = projetOuvert(req.params.id, req.user);
  const board = projectBoardOuvert(req.body.board_id ?? source.board_id, req.user);
  const name = requireText(req.body.name ?? source.name, "Le nom de la copie est requis");

  // Les catégories appartiennent au tableau : la copie garde la sienne chez
  // elle, et en reçoit une autre ailleurs.
  const categoryId =
    req.body.category_id ?? (board.id === source.board_id ? source.category_id : null);
  if (!categoryId) badRequest("La catégorie est requise");
  verifierCategorie(categoryId, board.id);

  const timestamp = now();

  const id = transaction((): Id => {
    const { lastInsertRowid } = projects.create.run({
      name,
      description: source.description,
      board_id: board.id,
      category_id: Number(categoryId),
      company_id: source.company_id,
      status: source.status,
      created_at: timestamp,
      updated_at: timestamp,
    });
    const copieId = Number(lastInsertRowid);

    replaceActors(copieId, acteursDe(source.id));
    copyProjectLabels(source.id, copieId, board.id, timestamp);

    comments.createSystem.run(
      copieId,
      req.user.id,
      `Projet créé le ${horodatage(timestamp)}`,
      timestamp,
      timestamp,
    );
    return copieId;
  })();

  res.status(201).json(oneWithRelations(projects.joined.get(id)!));
});

/**
 * Deux valeurs qui désignent la même chose, quel que soit leur type : le
 * client envoie ses identifiants tantôt en nombre, tantôt en chaîne, et
 * « aucun » s'écrit aussi bien null qu'une chaîne vide.
 */
const memeValeur = (a: unknown, b: unknown): boolean => {
  const normalise = (v: unknown) => (v === null || v === undefined || v === "" ? null : Number(v));
  return normalise(a) === normalise(b);
};

/**
 * Deux listes d'identifiants qui désignent le même ensemble, sans égard à
 * l'ordre ni aux doublons. Une liste absente du corps ne change rien.
 */
const memesIds = (recus: unknown, actuels: Id[]): boolean => {
  if (!Array.isArray(recus)) return true;
  const trie = (liste: unknown[]) => [...new Set(liste.map(Number))].sort((x, y) => x - y);
  const gauche = trie(recus);
  const droite = trie(actuels);
  return gauche.length === droite.length && gauche.every((v, i) => v === droite[i]);
};

projectRoutes.put("/:id", (req, res) => {
  const existing = projetOuvert(req.params.id, req.user);

  const {
    name = existing.name,
    description = existing.description,
    board_id = existing.board_id,
    category_id = existing.category_id,
    company_id = existing.company_id,
    status = existing.status,
    actor_ids,
    label_ids,
  } = req.body;

  // Un projet ne sort pas d'un tableau privé et n'y entre pas.
  projectBoardOuvert(board_id, req.user);
  verifierCategorie(category_id, board_id);

  const propre = descriptionPropre(description);

  // La date de modification ne bouge que si quelque chose a bougé. Le tiroir
  // enregistre en se refermant : sans cette comparaison, ouvrir une fiche pour
  // la relire suffirait à la dater de maintenant, et le tableau se
  // réordonnerait pour rien.
  const inchange =
    name === existing.name &&
    memeDescription(propre, existing.description) &&
    memeValeur(board_id, existing.board_id) &&
    memeValeur(category_id, existing.category_id) &&
    memeValeur(company_id, existing.company_id) &&
    memeValeur(status, existing.status) &&
    memesIds(actor_ids, acteursDe(existing.id)) &&
    memesIds(label_ids, etiquettesDe(existing.id));

  transaction(() => {
    projects.update.run({
      id: existing.id,
      name,
      description: propre,
      board_id,
      category_id,
      company_id,
      status,
      updated_at: inchange ? existing.updated_at : now(),
    });

    if (Array.isArray(actor_ids)) replaceActors(existing.id, toIds(actor_ids));
    if (Array.isArray(label_ids)) {
      replaceProjectLabels(existing.id, toIds(label_ids), Number(board_id));
    }
  })();

  const suivant = projects.joined.get(existing.id)!;
  notifier({
    kind: "project",
    targetId: suivant.id,
    titre: suivant.name,
    message: "a modifié la fiche",
    auteur: req.user,
    base: racine(req),
  });

  res.json(oneWithRelations(suivant));
});

projectRoutes.delete("/:id", (req, res) => {
  const existing = projetOuvert(req.params.id, req.user);
  projects.remove.run(existing.id);
  res.status(204).end();
});
