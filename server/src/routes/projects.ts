// Projects: the filtered list, the detail view, and the writes — its
// documents among them, which go out on upload, without waiting for
// "Sauvegarder", as a product's.

import { Router } from "express";
import type { Request } from "express";
import { inContext } from "@milo/shared";
import type { Id, Project, ProjectAttachment } from "@milo/shared";
import { mutation, selection, transaction } from "../db/query.js";
import type { ProjectJoinedRow, ProjectRow } from "../db/rows.js";
import { badRequest, orNotFound, requireText, toIds } from "../lib/http.js";
import { deleteMedia, isImage, mediaUrl, writeMedia } from "../lib/media.js";
import { require, requestCan } from "../lib/rights.js";
import { cleanDescription, sameDescription } from "../lib/html.js";
import { quote, logAction, changes, list, editMessage, eventLine } from "../lib/history.js";
import type { Field } from "../lib/history.js";
import { concerned, notify, notifyLinked, notifyDeletion, root } from "../lib/notify.js";
import { now } from "../lib/time.js";
import { touch } from "../middleware/events.js";
import { categories } from "../repositories/project-boards.js";
import { contextGroups, contextLabel } from "../repositories/contexts.js";
import { keyInBoard } from "../repositories/lists.js";
import type { ListScope } from "../repositories/lists.js";
import {
  VISIBLE_BOARDS_CLAUSE as visibleBoardsClause,
  boards,
  openBoard as projectBoardOpen,
} from "../repositories/boards.js";

/** The projects of the boards that "@me" sees. */
const VISIBLE_BOARDS_CLAUSE = visibleBoardsClause("projects.board_id");
import {
  PROJECT_SELECT,
  actorsOf,
  copyProjectLabels,
  labelsOf,
  moveProjectLabels,
  oneWithRelations,
  projects,
  replaceActors,
  replaceProjectLabels,
  withRelations,
} from "../repositories/projects.js";
import { comments } from "../repositories/project-comments.js";
import { nextReference } from "../repositories/references.js";
import { milestoneTypeOfList, milestoneTypes, twinMilestoneType } from "./milestone-types.js";
import { creationNote, withAuthor } from "../repositories/comments.js";
import { attachments as cardAttachments } from "../repositories/attachments.js";
import { fileBody, receivedFile } from "./products.js";

const PROJECT_NOT_FOUND = "Projet introuvable";

// --- Documents -------------------------------------------------------------

interface FileRow {
  id: Id;
  project_id: Id;
  file: string;
  name: string;
  mime: string;
  size: number;
  position: number;
  created_at: string;
}

const files = {
  byId: selection<FileRow>("SELECT * FROM project_attachments WHERE id = ?"),
  ofProject: selection<FileRow>(
    "SELECT * FROM project_attachments WHERE project_id = ? ORDER BY position, id DESC",
  ),
  // A dropped document is placed first, as on a card. The project is named
  // twice: better-sqlite3 refuses a numbered parameter used twice.
  create: mutation(
    `INSERT INTO project_attachments (project_id, file, name, mime, size, user_id, created_at, position)
     VALUES (?, ?, ?, ?, ?, ?, ?,
       (SELECT COALESCE(MIN(position), 1) - 1 FROM project_attachments WHERE project_id = ?))`,
  ),
  // A copy cites the same files: they go with the last row citing them.
  copy: mutation(
    `INSERT INTO project_attachments (project_id, file, name, mime, size, user_id, created_at, position)
     SELECT ?, file, name, mime, size, user_id, ?, position FROM project_attachments WHERE project_id = ?`,
  ),
  remove: mutation("DELETE FROM project_attachments WHERE id = ?"),
  place: mutation("UPDATE project_attachments SET position = ? WHERE id = ? AND project_id = ?"),
};

const attachmentOf = (row: FileRow): ProjectAttachment => ({
  ...row,
  url: mediaUrl(row.file),
  is_image: isImage(row.file),
});

const attachmentsOf = (projectId: Id): ProjectAttachment[] =>
  files.ofProject.all(projectId).map(attachmentOf);

/** The file goes when the last row citing it does. */
const dropFile = (file: string): void => {
  if (cardAttachments.countOfFile({ file }).count === 0) deleteMedia(file);
};

/** What the thread notes about a project when it changes (lib/history.ts). */
const photo = (p: Project): Field[] => [
  { label: "Nom", value: quote(p.name) },
  { label: "Description", value: p.description, opaque: true },
  { label: "Tableau", value: quote(boards.byId.get(p.board_id)?.name) },
  { label: "Catégorie", value: quote(p.category_name) },
  {
    label: "Type de jalons",
    value: quote(p.milestone_type_id ? milestoneTypes.byId.get(p.milestone_type_id)?.name : null),
  },
  { label: "Avancement", value: `${p.status} %` },
  { label: "Acteurs", value: list(p.actors.map((a) => a.name)) },
  { label: "Étiquettes", value: list(p.labels.map((l) => l.name)) },
];

/** A project has just been created: its actors are notified. */
const projectCreated = (req: Request, id: Id): void => {
  const created = projects.joined.get(id);
  if (!created) return;
  // Its actors arrive: each is notified on screen and by e-mail, and the
  // creation notification does not notify them a second time.
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

/** Notifies those who have just joined the project's actors; returns those notified. */
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
 * A project of a board closed to others is, for them, not found: neither in
 * the list, nor by its id, nor for writing. Likewise without the right to
 * see projects.
 */
const openProject = (req: Request, id: unknown): ProjectRow => {
  const project = orNotFound(projects.raw.get(id), PROJECT_NOT_FOUND);
  projectBoardOpen(project.board_id, req.user);
  require(req, "projects", "view", PROJECT_NOT_FOUND);
  return project;
};

/** The project, if one also has this right. */
export const projectFor = (req: Request, id: unknown, right: "update" | "delete"): ProjectRow => {
  const project = openProject(req, id);
  require(req, "projects", right);
  return project;
};

export const projectRoutes = Router();

projectRoutes.use(touch("projects"));

// The list's filters. Each is optional; "all" means "no filter". The SQL is
// assembled, but values always go through named parameters — never through
// interpolation.
const CLAUSES: Record<string, string> = {
  board: "projects.board_id = @board",
  // A category takes in those under it.
  category: `projects.category_id IN (
    WITH RECURSIVE under (id) AS (
      SELECT CAST(@category AS INTEGER)
      UNION SELECT categories.id FROM categories JOIN under ON categories.parent_id = under.id
    )
    SELECT id FROM under
  )`,
  actor: "projects.id IN (SELECT project_id FROM project_actors WHERE user_id = @actor)",
};

// Assembled queries are kept: a combination of filters comes back often,
// and SQLite no longer has to recompile the same SQL.
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
  // Boards closed to others are dropped outright: the clause precedes the
  // client's filters and does not depend on them.
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

  // Progress is not a value but a range: it does not go through a
  // parameter.
  const { status } = req.query;
  if (status === "in_progress") clauses.push("projects.status < 100");
  else if (status === "done") clauses.push("projects.status = 100");

  res.json(withRelations(queryFor(clauses).all(params)));
});

// The actors offered by the "Acteurs" filter: those who are one on at least
// one project of the board — and of the context, when chosen. The other
// filters do not count there: filtering by actor must not make the other
// actors disappear from the list.
const projectActors = selection<{ user_id: Id }>(
  `SELECT DISTINCT project_actors.user_id FROM project_actors
     JOIN projects ON projects.id = project_actors.project_id
    WHERE ${VISIBLE_BOARDS_CLAUSE}
      AND (@board IS NULL OR projects.board_id = @board)`,
);

projectRoutes.get("/actors", (req, res) => {
  if (!requestCan(req, "projects", "view")) return void res.json([]);
  const filter = (value: unknown) => (value && value !== "all" ? String(value) : null);
  const board = filter(req.query["board"]);
  const context = filter(req.query["context"]);
  if (!board || !context) {
    return void res.json(projectActors.all({ me: req.user.id, board }).map((l) => l.user_id));
  }
  // A context is a label (shared, contexts.ts): the board's projects are
  // read with theirs, and those of the context keep their actors.
  const groups = contextGroups(Number(board));
  const viewed = withRelations(
    queryFor([VISIBLE_BOARDS_CLAUSE, CLAUSES.board!]).all({ me: req.user.id, board }),
  ).filter((p) => inContext(p.labels, groups[p.list_key], context));
  res.json([...new Set(viewed.flatMap((p) => p.actors.map((a) => a.id)))]);
});

projectRoutes.get("/:id", (req, res) => {
  const { id } = openProject(req, req.params.id);
  const project = orNotFound(projects.joined.get(id), PROJECT_NOT_FOUND);
  res.json({
    ...oneWithRelations(project),
    comments: comments.ofProject.all(project.id).map(withAuthor),
    attachments: attachmentsOf(project.id),
  });
});

/**
 * The chosen category must belong to the project's widget: otherwise the
 * project would carry a category absent from its list.
 */
const verifyCategory = (categoryId: unknown, scope: ListScope): void => {
  const category = categories.byId.get(categoryId);
  if (!category || category.board_id !== scope.board || category.list_key !== scope.list) {
    badRequest("Cette catégorie n'appartient pas au widget");
  }
};

/**
 * The chosen milestone type: one of the widget's, or none. An unknown type is
 * rejected rather than stored as is.
 */
const milestoneTypeFrom = (received: unknown, scope: ListScope): number | null => {
  if (received === null || received === undefined || received === "") return null;
  return milestoneTypeOfList(scope, received).id;
};

projectRoutes.post("/", (req, res) => {
  const {
    name,
    description = "",
    board_id,
    category_id,
    context,
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
  // The "Projets" widget it is created from, failing that the first.
  const list = keyInBoard(board.id, "project.list", req.body.list_key);
  const scope = { board: board.id, list };
  verifyCategory(category_id, scope);
  const milestoneType = milestoneTypeFrom(milestone_type_id, scope);
  // Created in a context, it receives its label: it stays in sight.
  const label = contextLabel("project.list", board.id, list, context);

  const timestamp = now();

  // The project, its actors, its labels and the opening of its thread: all or
  // nothing. Without a transaction, an error along the way left a half-made
  // project.
  const id = transaction((): Id => {
    const { lastInsertRowid } = projects.create.run({
      number: nextReference("project", board.id, list),
      name,
      description: cleanDescription(description),
      board_id,
      category_id,
      list_key: list,
      milestone_type_id: milestoneType,
      status,
      created_at: timestamp,
      updated_at: timestamp,
    });
    const projectId = Number(lastInsertRowid);

    replaceActors(projectId, toIds(actor_ids));
    const labelIds = toIds(label_ids);
    if (label !== null && !labelIds.includes(label)) labelIds.push(label);
    replaceProjectLabels(projectId, labelIds, scope);

    // The thread opens on the creation, dated and signed Milo. Comments
    // written afterwards follow.
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
 * Copy of a project: its record, actors, labels, documents — the same
 * files, cited twice. Without a destination
 * board, the copy stays in the original project's; without a destination
 * widget, in the original's within its board, the first elsewhere.
 *
 * What is not copied: the thread. A comment carries an author and a date;
 * copying it would fabricate a conversation that did not take place. The
 * copy opens on its own creation note, like a new project — the same rule
 * as for copying a list.
 */
projectRoutes.post("/:id/copy", (req, res) => {
  const source = openProject(req, req.params.id);
  require(req, "projects", "create");
  const board = projectBoardOpen(req.body.board_id ?? source.board_id, req.user);
  const name = requireText(req.body.name ?? source.name, "Le nom de la copie est requis");

  const list = keyInBoard(
    board.id,
    "project.list",
    req.body.list_key ?? (board.id === source.board_id ? source.list_key : undefined),
  );
  const scope = { board: board.id, list };
  const home = scope.board === source.board_id && scope.list === source.list_key;

  // Categories belong to the widget: the copy keeps its own at home, and gets
  // another elsewhere.
  const categoryId = req.body.category_id ?? (home ? source.category_id : null);
  if (!categoryId) badRequest("La catégorie est requise");
  verifyCategory(categoryId, scope);

  const timestamp = now();

  const id = transaction((): Id => {
    const { lastInsertRowid } = projects.create.run({
      number: nextReference("project", board.id, list),
      name,
      description: source.description,
      board_id: board.id,
      category_id: Number(categoryId),
      list_key: list,
      // Its type, or its twin of the same name in the destination widget.
      milestone_type_id: twinMilestoneType(source.milestone_type_id, scope),
      status: source.status,
      created_at: timestamp,
      updated_at: timestamp,
    });
    const copyId = Number(lastInsertRowid);

    replaceActors(copyId, actorsOf(source.id));
    copyProjectLabels(source.id, copyId, scope, timestamp);
    files.copy.run(copyId, timestamp, source.id);

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
 * Two values designating the same thing, whatever their type: the client
 * sends its ids sometimes as numbers, sometimes as strings, and "none" is
 * written as null just as well as an empty string.
 */
const sameValue = (a: unknown, b: unknown): boolean => {
  const normalized = (v: unknown) => (v === null || v === undefined || v === "" ? null : Number(v));
  return normalized(a) === normalized(b);
};

/**
 * Two lists of ids designating the same set, regardless of order or
 * duplicates. A list absent from the body changes nothing.
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
    milestone_type_id = existing.milestone_type_id,
    status = existing.status,
    actor_ids,
    label_ids,
  } = req.body;

  // A project does not leave a board one does not see, nor enter one.
  const board = projectBoardOpen(board_id, req.user);
  // Moved to another widget — named, or the new board's first —, it takes
  // its next number there.
  const list =
    board.id === existing.board_id && req.body.list_key === undefined
      ? existing.list_key
      : keyInBoard(board.id, "project.list", req.body.list_key);
  const scope = { board: board.id, list };
  const moved = board.id !== existing.board_id || list !== existing.list_key;
  verifyCategory(category_id, scope);
  // Moved, it keeps its type through its twin there, unless it names one.
  const milestoneType =
    moved && req.body.milestone_type_id === undefined
      ? twinMilestoneType(existing.milestone_type_id, scope)
      : milestoneTypeFrom(milestone_type_id, scope);

  const clean = cleanDescription(description);
  const before = photo(oneWithRelations(projects.joined.get(existing.id)!));
  const previousActors = new Set(actorsOf(existing.id));

  // The modification date only moves if something moved. The drawer saves as
  // it closes: without this comparison, opening a record to re-read it would
  // be enough to date it now, and the board would reorder for nothing.
  const unchanged =
    name === existing.name &&
    sameDescription(clean, existing.description) &&
    !moved &&
    sameValue(category_id, existing.category_id) &&
    sameValue(milestoneType, existing.milestone_type_id) &&
    sameValue(status, existing.status) &&
    sameIds(actor_ids, actorsOf(existing.id)) &&
    sameIds(label_ids, labelsOf(existing.id));

  transaction(() => {
    projects.update.run({
      id: existing.id,
      number: moved ? nextReference("project", board.id, list) : existing.number,
      name,
      description: clean,
      board_id,
      category_id,
      list_key: list,
      milestone_type_id: milestoneType,
      status,
      updated_at: unchanged ? existing.updated_at : now(),
    });

    if (Array.isArray(actor_ids)) replaceActors(existing.id, toIds(actor_ids));
    if (Array.isArray(label_ids)) {
      replaceProjectLabels(existing.id, toIds(label_ids), scope);
    } else if (moved) {
      // Moved without its labels named, it keeps their twins.
      moveProjectLabels(existing.id, scope, now());
    }
  })();

  const next = oneWithRelations(projects.joined.get(existing.id)!);
  // What moved is noted in the thread, signed Milo, and notifies those who
  // follow the project or are its actors. Nothing moved: nothing goes out.
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
  const cited = files.ofProject.all(existing.id);
  projects.remove.run(existing.id);
  for (const { file } of cited) dropFile(file);
  notifyDeletion({
    kind: "project",
    targetId: existing.id,
    title: existing.name,
    message: "a supprimé le projet",
    author: req.user,
    base: root(req),
    recipients,
    vanished: true,
  });
  res.status(204).end();
});

// A document: sent at once, noted in the thread. Adding one means editing the
// project.
projectRoutes.post("/:id/attachments", fileBody, (req, res) => {
  const project = projectFor(req, req.params.id, "update");
  const { content, name, mime } = receivedFile(req);
  const { lastInsertRowid } = files.create.run(
    project.id,
    writeMedia(content, name),
    name,
    mime,
    content.length,
    req.user.id,
    now(),
    project.id,
  );
  logAction("project", project.id, req.user, [eventLine("Documents", `${quote(name)} ajouté`)]);
  res.status(201).json(attachmentOf(files.byId.get(lastInsertRowid)!));
});

// The documents' order, as the detail view shows it.
projectRoutes.put("/:id/attachments/order", (req, res) => {
  const project = projectFor(req, req.params.id, "update");
  transaction(() => toIds(req.body.ids).forEach((id, rank) => files.place.run(rank, id, project.id)))();
  res.json(attachmentsOf(project.id));
});

projectRoutes.delete("/attachments/:attachment", (req, res) => {
  const attachment = orNotFound(files.byId.get(req.params.attachment), "Document introuvable");
  projectFor(req, attachment.project_id, "update");
  files.remove.run(attachment.id);
  dropFile(attachment.file);
  logAction("project", attachment.project_id, req.user, [
    eventLine("Documents", `${quote(attachment.name)} supprimé`),
  ]);
  res.status(204).end();
});
