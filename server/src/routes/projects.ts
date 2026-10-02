// Les projets : la liste filtrée, la fiche, et les écritures.

import { Router } from "express";
import type { Request } from "express";
import type { Id, Project } from "@milo/shared";
import { selection, transaction } from "../db/query.js";
import type { ProjectJoinedRow, ProjectRow } from "../db/rows.js";
import { badRequest, orNotFound, requireText, toIds } from "../lib/http.js";
import { clauseSocietes, exiger, filtreSocietes } from "../lib/droits.js";
import { descriptionPropre, memeDescription } from "../lib/html.js";
import { cite, consigner, ecarts, liste, messageModification } from "../lib/historique.js";
import type { Champ } from "../lib/historique.js";
import { concernes, notifier, notifierSuppression, racine } from "../lib/notify.js";
import { now } from "../lib/time.js";
import { touch } from "../middleware/events.js";
import {
  CLAUSE_TABLEAUX_VISIBLES,
  categories,
  projectBoardOuvert,
  projectBoards,
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
import { prochaineReference } from "../repositories/references.js";
import { milestoneTypes } from "./milestone-types.js";
import { motDeCreation, withAuthor } from "../repositories/comments.js";

const PROJET_INTROUVABLE = "Projet introuvable";

/** Ce que le fil note d'un projet quand il change (lib/historique.ts). */
const photo = (p: Project): Champ[] => [
  { libelle: "Nom", valeur: cite(p.name) },
  { libelle: "Description", valeur: p.description, opaque: true },
  { libelle: "Tableau", valeur: cite(projectBoards.byId.get(p.board_id)?.name) },
  { libelle: "Catégorie", valeur: cite(p.category_name) },
  { libelle: "Société", valeur: cite(p.company_name) },
  {
    libelle: "Type de jalons",
    valeur: cite(p.milestone_type_id ? milestoneTypes.byId.get(p.milestone_type_id)?.name : null),
  },
  { libelle: "Avancement", valeur: `${p.status} %` },
  { libelle: "Acteurs", valeur: liste(p.actors.map((a) => a.name)) },
  { libelle: "Étiquettes", valeur: liste(p.labels.map((l) => l.name)) },
];

/** Un projet vient d'être créé : ses acteurs en sont prévenus. */
const projetCree = (req: Request, id: Id): void => {
  const cree = projects.joined.get(id);
  if (!cree) return;
  notifier({
    kind: "project",
    targetId: cree.id,
    titre: cree.name,
    message: "a créé le projet",
    auteur: req.user,
    base: racine(req),
  });
};

/**
 * Un projet d'un tableau fermé aux autres est, pour eux, introuvable : ni dans
 * la liste, ni par son identifiant, ni en écriture. De même pour celui d'une
 * société où l'on n'a pas le droit de voir les projets.
 */
const projetOuvert = (req: Request, id: unknown): ProjectRow => {
  const project = orNotFound(projects.raw.get(id), PROJET_INTROUVABLE);
  projectBoardOuvert(project.board_id, req.user);
  exiger(req, "projects", "view", project.company_id, PROJET_INTROUVABLE);
  return project;
};

/** Le projet, si l'on a en plus ce droit dans sa société. */
export const projetPour = (req: Request, id: unknown, droit: "update" | "delete"): ProjectRow => {
  const project = projetOuvert(req, id);
  exiger(req, "projects", droit, project.company_id);
  return project;
};

/** La clause qui écarte les projets des sociétés qu'on ne voit pas. */
const CLAUSE_SOCIETES_VISIBLES = clauseSocietes("projects.company_id");

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
  const clauses: string[] = [CLAUSE_TABLEAUX_VISIBLES, CLAUSE_SOCIETES_VISIBLES];
  const params: Record<string, unknown> = { me: req.user.id, ...filtreSocietes(req, "projects") };

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

// Les acteurs proposés par le filtre « Acteurs » : ceux qui le sont d'au moins
// un projet du tableau — et de la société, quand elle est choisie. Les autres
// filtres n'y comptent pas : filtrer par acteur ne doit pas faire disparaître
// les autres acteurs de la liste.
const acteursDesProjets = selection<{ user_id: Id }>(
  `SELECT DISTINCT project_actors.user_id FROM project_actors
     JOIN projects ON projects.id = project_actors.project_id
    WHERE ${CLAUSE_TABLEAUX_VISIBLES}
      AND ${CLAUSE_SOCIETES_VISIBLES}
      AND (@board IS NULL OR projects.board_id = @board)
      AND (@company IS NULL OR projects.company_id = @company)`,
);

projectRoutes.get("/actors", (req, res) => {
  const filtre = (valeur: unknown) => (valeur && valeur !== "all" ? String(valeur) : null);
  res.json(
    acteursDesProjets
      .all({
        me: req.user.id,
        ...filtreSocietes(req, "projects"),
        board: filtre(req.query["board"]),
        company: filtre(req.query["company"]),
      })
      .map((l) => l.user_id),
  );
});

projectRoutes.get("/:id", (req, res) => {
  const { id } = projetOuvert(req, req.params.id);
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

/**
 * Le type de jalons retenu : un identifiant qui existe, ou aucun. Un type
 * inconnu est refusé plutôt que rangé tel quel.
 */
const typeDeJalons = (recu: unknown): number | null => {
  if (recu === null || recu === undefined || recu === "") return null;
  return orNotFound(milestoneTypes.byId.get(recu), "Type de jalons introuvable").id;
};

projectRoutes.post("/", (req, res) => {
  const {
    name,
    description = "",
    board_id,
    category_id,
    company_id = null,
    milestone_type_id = null,
    status = 0,
    actor_ids = [],
    label_ids = [],
  } = req.body;

  if (!name || !board_id || !category_id) {
    badRequest("name, board_id et category_id sont requis");
  }
  projectBoardOuvert(board_id, req.user);
  exiger(req, "projects", "create", company_id);
  verifierCategorie(category_id, board_id);
  const typeJalons = typeDeJalons(milestone_type_id);

  const timestamp = now();

  // Le projet, ses acteurs, ses étiquettes et l'ouverture de son fil : un tout
  // ou rien. Sans transaction, une erreur en cours de route laissait un projet
  // à moitié posé.
  const id = transaction((): Id => {
    const { lastInsertRowid } = projects.create.run({
      number: prochaineReference(),
      name,
      description: descriptionPropre(description),
      board_id,
      category_id,
      company_id,
      milestone_type_id: typeJalons,
      status,
      created_at: timestamp,
      updated_at: timestamp,
    });
    const projectId = Number(lastInsertRowid);

    replaceActors(projectId, toIds(actor_ids));
    replaceProjectLabels(projectId, toIds(label_ids), Number(board_id));

    // Le fil s'ouvre sur la création, datée et signée Milo. Les commentaires
    // écrits ensuite viennent à la suite.
    comments.createSystem.run(
      projectId,
      null,
      motDeCreation("Projet créé", timestamp, req.user.id),
      timestamp,
      timestamp,
    );
    return projectId;
  })();

  projetCree(req, id);
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
  const source = projetOuvert(req, req.params.id);
  exiger(req, "projects", "create", source.company_id);
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
      number: prochaineReference(),
      name,
      description: source.description,
      board_id: board.id,
      category_id: Number(categoryId),
      company_id: source.company_id,
      milestone_type_id: source.milestone_type_id,
      status: source.status,
      created_at: timestamp,
      updated_at: timestamp,
    });
    const copieId = Number(lastInsertRowid);

    replaceActors(copieId, acteursDe(source.id));
    copyProjectLabels(source.id, copieId, board.id, timestamp);

    comments.createSystem.run(
      copieId,
      null,
      motDeCreation("Projet créé", timestamp, req.user.id),
      timestamp,
      timestamp,
    );
    return copieId;
  })();

  projetCree(req, id);
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
  const existing = projetPour(req, req.params.id, "update");

  const {
    name = existing.name,
    description = existing.description,
    board_id = existing.board_id,
    category_id = existing.category_id,
    company_id = existing.company_id,
    milestone_type_id = existing.milestone_type_id,
    status = existing.status,
    actor_ids,
    label_ids,
  } = req.body;

  // Un projet ne sort pas d'un tableau privé et n'y entre pas.
  projectBoardOuvert(board_id, req.user);
  // Passer un projet à une autre société, c'est l'y ajouter.
  if (!memeValeur(company_id, existing.company_id)) {
    exiger(req, "projects", "create", company_id);
  }
  verifierCategorie(category_id, board_id);
  const typeJalons = typeDeJalons(milestone_type_id);

  const propre = descriptionPropre(description);
  const avant = photo(oneWithRelations(projects.joined.get(existing.id)!));

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
    memeValeur(typeJalons, existing.milestone_type_id) &&
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
      milestone_type_id: typeJalons,
      status,
      updated_at: inchange ? existing.updated_at : now(),
    });

    if (Array.isArray(actor_ids)) replaceActors(existing.id, toIds(actor_ids));
    if (Array.isArray(label_ids)) {
      replaceProjectLabels(existing.id, toIds(label_ids), Number(board_id));
    }
  })();

  const suivant = oneWithRelations(projects.joined.get(existing.id)!);
  // Ce qui a bougé se note dans le fil, signé Milo, et prévient ceux qui
  // suivent le projet ou en sont acteurs. Rien n'a bougé : rien ne part.
  const lignes = inchange ? [] : ecarts(avant, photo(suivant));
  if (lignes.length) {
    consigner("project", suivant.id, req.user, lignes);
    notifier({
      kind: "project",
      targetId: suivant.id,
      titre: suivant.name,
      message: messageModification(lignes),
      auteur: req.user,
      base: racine(req),
    });
  }

  res.json(suivant);
});

projectRoutes.delete("/:id", (req, res) => {
  const existing = projetPour(req, req.params.id, "delete");
  const destinataires = concernes.projet(existing.id);
  projects.remove.run(existing.id);
  notifierSuppression({
    kind: "project",
    targetId: existing.id,
    titre: existing.name,
    message: "a supprimé le projet",
    auteur: req.user,
    destinataires,
    disparu: true,
  });
  res.status(204).end();
});
