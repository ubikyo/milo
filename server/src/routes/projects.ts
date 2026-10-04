// Les projets : la liste filtrée, la fiche, et les écritures.

import { Router } from "express";
import type { Request } from "express";
import type { Id, Project } from "@milo/shared";
import { selection, transaction } from "../db/query.js";
import type { ProjectJoinedRow, ProjectRow } from "../db/rows.js";
import { badRequest, orNotFound, requireText, toIds } from "../lib/http.js";
import { require, requestCan } from "../lib/rights.js";
import { cleanDescription, sameDescription } from "../lib/html.js";
import { quote, logAction, changes, list, editMessage } from "../lib/history.js";
import type { Field } from "../lib/history.js";
import { concerned, notify, notifyLinked, notifyDeletion, root } from "../lib/notify.js";
import { now } from "../lib/time.js";
import { touch } from "../middleware/events.js";
import { categories } from "../repositories/project-boards.js";
import { boardContext } from "../repositories/contexts.js";
import { keyInBoard } from "../repositories/lists.js";
import {
  VISIBLE_BOARDS_CLAUSE as visibleBoardsClause,
  boards,
  openBoard as projectBoardOpen,
} from "../repositories/boards.js";

/** Les projets des tableaux que « @me » voit. */
const VISIBLE_BOARDS_CLAUSE = visibleBoardsClause("projects.board_id");
import {
  PROJECT_SELECT,
  actorsOf,
  copyProjectLabels,
  labelsOf,
  oneWithRelations,
  projects,
  replaceActors,
  replaceProjectLabels,
  withRelations,
} from "../repositories/projects.js";
import { comments } from "../repositories/project-comments.js";
import { nextReference } from "../repositories/references.js";
import { milestoneTypes } from "./milestone-types.js";
import { creationNote, withAuthor } from "../repositories/comments.js";

const PROJECT_NOT_FOUND = "Projet introuvable";

/** Ce que le fil note d'un projet quand il change (lib/historique.ts). */
const photo = (p: Project): Field[] => [
  { label: "Nom", value: quote(p.name) },
  { label: "Description", value: p.description, opaque: true },
  { label: "Tableau", value: quote(boards.byId.get(p.board_id)?.name) },
  { label: "Catégorie", value: quote(p.category_name) },
  { label: "Contexte", value: quote(p.context_name) },
  {
    label: "Type de jalons",
    value: quote(p.milestone_type_id ? milestoneTypes.byId.get(p.milestone_type_id)?.name : null),
  },
  { label: "Avancement", value: `${p.status} %` },
  { label: "Acteurs", value: list(p.actors.map((a) => a.name)) },
  { label: "Étiquettes", value: list(p.labels.map((l) => l.name)) },
];

/** Un projet vient d'être créé : ses acteurs en sont prévenus. */
const projectCreated = (req: Request, id: Id): void => {
  const created = projects.joined.get(id);
  if (!created) return;
  // Ses acteurs y arrivent : chacun en est prévenu à l'écran et par e-mail,
  // et la notification de création ne les prévient pas une seconde fois.
  const attached = attachedActors(req, created.id, created.name, new Set());
  notify({
    kind: "project",
    targetId: created.id,
    title: created.name,
    message: "a créé le projet",
    author: req.user,
    except: attached,
    base: root(req),
  });
};

/** Prévient ceux qui viennent d'arriver parmi les acteurs du projet ; rend les prévenus. */
const attachedActors = (req: Request, id: Id, name: string, before: Set<Id>): Id[] =>
  notifyLinked({
    kind: "project",
    targetId: id,
    title: name,
    message: "vous a ajouté comme acteur",
    recipients: actorsOf(id).filter((a) => !before.has(a)),
    author: req.user,
    base: root(req),
  });

/**
 * Un projet d'un tableau fermé aux autres est, pour eux, introuvable : ni dans
 * la liste, ni par son identifiant, ni en écriture. De même sans le droit de
 * voir les projets.
 */
const openProject = (req: Request, id: unknown): ProjectRow => {
  const project = orNotFound(projects.raw.get(id), PROJECT_NOT_FOUND);
  projectBoardOpen(project.board_id, req.user);
  require(req, "projects", "view", PROJECT_NOT_FOUND);
  return project;
};

/** Le projet, si l'on a en plus ce droit. */
export const projectFor = (req: Request, id: unknown, right: "update" | "delete"): ProjectRow => {
  const project = openProject(req, id);
  require(req, "projects", right);
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
  context: "projects.context_id = @context",
  actor: "projects.id IN (SELECT project_id FROM project_actors WHERE user_id = @actor)",
};

// Les requêtes assemblées sont gardées : une combinaison de filtres revient
// souvent, et SQLite n'a plus à recompiler le même SQL.
const filteredQueries = new Map<string, ReturnType<typeof selection<ProjectJoinedRow>>>();

const queryFor = (clauses: string[]) => {
  const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
  const already = filteredQueries.get(where);
  if (already) return already;
  const query = selection<ProjectJoinedRow>(
    `${PROJECT_SELECT} ${where} ORDER BY projects.updated_at DESC`,
  );
  filteredQueries.set(where, query);
  return query;
};

projectRoutes.get("/", (req, res) => {
  // Les tableaux fermés aux autres sont écartés d'office : la clause précède
  // les filtres du client et ne dépend pas d'eux.
  if (!requestCan(req, "projects", "view")) return void res.json([]);
  const clauses: string[] = [VISIBLE_BOARDS_CLAUSE];
  const params: Record<string, unknown> = { me: req.user.id };

  for (const [name, clause] of Object.entries(CLAUSES)) {
    const value = req.query[name];
    if (value && value !== "all") {
      clauses.push(clause);
      params[name] = value;
    }
  }

  // L'avancement n'est pas une valeur mais un intervalle : il ne passe pas par
  // un paramètre.
  const { status } = req.query;
  if (status === "in_progress") clauses.push("projects.status < 100");
  else if (status === "done") clauses.push("projects.status = 100");

  res.json(withRelations(queryFor(clauses).all(params)));
});

// Les acteurs proposés par le filtre « Acteurs » : ceux qui le sont d'au moins
// un projet du tableau — et du contexte, quand il est choisi. Les autres
// filtres n'y comptent pas : filtrer par acteur ne doit pas faire disparaître
// les autres acteurs de la liste.
const projectActors = selection<{ user_id: Id }>(
  `SELECT DISTINCT project_actors.user_id FROM project_actors
     JOIN projects ON projects.id = project_actors.project_id
    WHERE ${VISIBLE_BOARDS_CLAUSE}
      AND (@board IS NULL OR projects.board_id = @board)
      AND (@context IS NULL OR projects.context_id = @context)`,
);

projectRoutes.get("/actors", (req, res) => {
  if (!requestCan(req, "projects", "view")) return void res.json([]);
  const filter = (value: unknown) => (value && value !== "all" ? String(value) : null);
  res.json(
    projectActors
      .all({
        me: req.user.id,
        board: filter(req.query["board"]),
        context: filter(req.query["context"]),
      })
      .map((l) => l.user_id),
  );
});

projectRoutes.get("/:id", (req, res) => {
  const { id } = openProject(req, req.params.id);
  const project = orNotFound(projects.joined.get(id), PROJECT_NOT_FOUND);
  res.json({
    ...oneWithRelations(project),
    comments: comments.ofProject.all(project.id).map(withAuthor),
  });
});

/**
 * La catégorie retenue doit appartenir au tableau du projet : sinon le projet
 * porterait une catégorie absente de son onglet.
 */
const verifyCategory = (categoryId: unknown, boardId: unknown): void => {
  const category = categories.byId.get(categoryId);
  if (!category || String(category.board_id) !== String(boardId)) {
    badRequest("Cette catégorie n'appartient pas au tableau");
  }
};

/**
 * Le type de jalons retenu : un identifiant qui existe, ou aucun. Un type
 * inconnu est refusé plutôt que rangé tel quel.
 */
const milestoneTypeFrom = (received: unknown): number | null => {
  if (received === null || received === undefined || received === "") return null;
  return orNotFound(milestoneTypes.byId.get(received), "Type de jalons introuvable").id;
};

projectRoutes.post("/", (req, res) => {
  const {
    name,
    description = "",
    board_id,
    category_id,
    context_id,
    milestone_type_id = null,
    status = 0,
    actor_ids = [],
    label_ids = [],
  } = req.body;

  if (!name || !board_id || !category_id) {
    badRequest("name, board_id et category_id sont requis");
  }
  const board = projectBoardOpen(board_id, req.user);
  require(req, "projects", "create");
  verifyCategory(category_id, board_id);
  const context = boardContext(board.id, context_id);
  const milestoneType = milestoneTypeFrom(milestone_type_id);

  const timestamp = now();

  // Le projet, ses acteurs, ses étiquettes et l'ouverture de son fil : un tout
  // ou rien. Sans transaction, une erreur en cours de route laissait un projet
  // à moitié posé.
  const id = transaction((): Id => {
    const { lastInsertRowid } = projects.create.run({
      number: nextReference(),
      name,
      description: cleanDescription(description),
      board_id,
      category_id,
      context_id: context,
      // Le widget « Projets » d'où il est créé, à défaut le premier.
      list_key: keyInBoard(board.id, "project.list", req.body.list_key),
      milestone_type_id: milestoneType,
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
      creationNote("Projet créé", timestamp, req.user.id),
      timestamp,
      timestamp,
    );
    return projectId;
  })();

  projectCreated(req, id);
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
  const source = openProject(req, req.params.id);
  require(req, "projects", "create");
  const board = projectBoardOpen(req.body.board_id ?? source.board_id, req.user);
  const name = requireText(req.body.name ?? source.name, "Le nom de la copie est requis");

  // Les catégories appartiennent au tableau : la copie garde la sienne chez
  // elle, et en reçoit une autre ailleurs.
  const categoryId =
    req.body.category_id ?? (board.id === source.board_id ? source.category_id : null);
  if (!categoryId) badRequest("La catégorie est requise");
  verifyCategory(categoryId, board.id);

  const timestamp = now();

  const id = transaction((): Id => {
    const { lastInsertRowid } = projects.create.run({
      number: nextReference(),
      name,
      description: source.description,
      board_id: board.id,
      category_id: Number(categoryId),
      // Un autre tableau a d'autres contextes : la copie prend celui qu'on
      // dit, ou le premier.
      context_id: boardContext(
        board.id,
        req.body.context_id,
        board.id === source.board_id ? source.context_id : null,
      ),
      list_key: keyInBoard(
        board.id,
        "project.list",
        board.id === source.board_id ? source.list_key : undefined,
      ),
      milestone_type_id: source.milestone_type_id,
      status: source.status,
      created_at: timestamp,
      updated_at: timestamp,
    });
    const copyId = Number(lastInsertRowid);

    replaceActors(copyId, actorsOf(source.id));
    copyProjectLabels(source.id, copyId, board.id, timestamp);

    comments.createSystem.run(
      copyId,
      null,
      creationNote("Projet créé", timestamp, req.user.id),
      timestamp,
      timestamp,
    );
    return copyId;
  })();

  projectCreated(req, id);
  res.status(201).json(oneWithRelations(projects.joined.get(id)!));
});

/**
 * Deux valeurs qui désignent la même chose, quel que soit leur type : le
 * client envoie ses identifiants tantôt en nombre, tantôt en chaîne, et
 * « aucun » s'écrit aussi bien null qu'une chaîne vide.
 */
const sameValue = (a: unknown, b: unknown): boolean => {
  const normalized = (v: unknown) => (v === null || v === undefined || v === "" ? null : Number(v));
  return normalized(a) === normalized(b);
};

/**
 * Deux listes d'identifiants qui désignent le même ensemble, sans égard à
 * l'ordre ni aux doublons. Une liste absente du corps ne change rien.
 */
const sameIds = (received: unknown, current: Id[]): boolean => {
  if (!Array.isArray(received)) return true;
  const sortedUnique = (list: unknown[]) => [...new Set(list.map(Number))].sort((x, y) => x - y);
  const left = sortedUnique(received);
  const rightHand = sortedUnique(current);
  return left.length === rightHand.length && left.every((v, i) => v === rightHand[i]);
};

projectRoutes.put("/:id", (req, res) => {
  const existing = projectFor(req, req.params.id, "update");

  const {
    name = existing.name,
    description = existing.description,
    board_id = existing.board_id,
    category_id = existing.category_id,
    context_id,
    milestone_type_id = existing.milestone_type_id,
    status = existing.status,
    actor_ids,
    label_ids,
  } = req.body;

  // Un projet ne sort pas d'un tableau privé et n'y entre pas.
  const board = projectBoardOpen(board_id, req.user);
  // Le contexte doit être du tableau du projet : changé de tableau, le projet
  // prend celui qu'on dit, ou le premier du nouveau.
  const context = boardContext(
    board.id,
    context_id,
    board.id === existing.board_id ? existing.context_id : null,
  );
  verifyCategory(category_id, board_id);
  const milestoneType = milestoneTypeFrom(milestone_type_id);

  const clean = cleanDescription(description);
  const before = photo(oneWithRelations(projects.joined.get(existing.id)!));
  const previousActors = new Set(actorsOf(existing.id));

  // La date de modification ne bouge que si quelque chose a bougé. Le tiroir
  // enregistre en se refermant : sans cette comparaison, ouvrir une fiche pour
  // la relire suffirait à la dater de maintenant, et le tableau se
  // réordonnerait pour rien.
  const unchanged =
    name === existing.name &&
    sameDescription(clean, existing.description) &&
    sameValue(board_id, existing.board_id) &&
    sameValue(category_id, existing.category_id) &&
    sameValue(context, existing.context_id) &&
    sameValue(milestoneType, existing.milestone_type_id) &&
    sameValue(status, existing.status) &&
    sameIds(actor_ids, actorsOf(existing.id)) &&
    sameIds(label_ids, labelsOf(existing.id));

  transaction(() => {
    projects.update.run({
      id: existing.id,
      name,
      description: clean,
      board_id,
      category_id,
      context_id: context,
      // Changé de tableau, il va au premier widget « Projets » du nouveau.
      list_key:
        board.id === existing.board_id
          ? existing.list_key
          : keyInBoard(board.id, "project.list", undefined),
      milestone_type_id: milestoneType,
      status,
      updated_at: unchanged ? existing.updated_at : now(),
    });

    if (Array.isArray(actor_ids)) replaceActors(existing.id, toIds(actor_ids));
    if (Array.isArray(label_ids)) {
      replaceProjectLabels(existing.id, toIds(label_ids), Number(board_id));
    }
  })();

  const next = oneWithRelations(projects.joined.get(existing.id)!);
  // Ce qui a bougé se note dans le fil, signé Milo, et prévient ceux qui
  // suivent le projet ou en sont acteurs. Rien n'a bougé : rien ne part.
  const rows = unchanged ? [] : changes(before, photo(next));
  const attached = attachedActors(req, next.id, next.name, previousActors);
  if (rows.length) {
    logAction("project", next.id, req.user, rows);
    notify({
      kind: "project",
      targetId: next.id,
      title: next.name,
      message: editMessage(rows),
      author: req.user,
      except: attached,
      base: root(req),
    });
  }

  res.json(next);
});

projectRoutes.delete("/:id", (req, res) => {
  const existing = projectFor(req, req.params.id, "delete");
  const recipients = concerned.project(existing.id);
  projects.remove.run(existing.id);
  notifyDeletion({
    kind: "project",
    targetId: existing.id,
    title: existing.name,
    message: "a supprimé le projet",
    author: req.user,
    recipients,
    vanished: true,
  });
  res.status(204).end();
});
