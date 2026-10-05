// The boards of a view: its tabs. A board contains its projects and task
// lists, and its widget sections (routes/board-widgets.ts). Its contexts are
// the labels of the groups its lists choose (repositories/contexts.ts).

import { Router } from "express";
import type { Request } from "express";
import type { Board, Id } from "@milo/shared";
import { mutation, selection, transaction } from "../db/query.js";
import type { BoardRow, UserRow } from "../db/rows.js";
import { requireInterface, requireOrganize, requireStructureRight } from "../lib/rights.js";
import { structureRights } from "../repositories/users.js";
import { HttpError, badRequest, requireText } from "../lib/http.js";
import { concerned, notifyDeletion } from "../lib/notify.js";
import { now } from "../lib/time.js";
import { touch } from "../middleware/events.js";
import { boardSections } from "../repositories/board-widgets.js";
import { ensureSupportLabels } from "../repositories/support.js";
import { ensureProjectPriorities } from "../repositories/projects.js";
import { followLists } from "./board-widgets.js";
import {
  boards,
  openBoard,
  requireBoardControl,
  requireBoardOwner,
} from "../repositories/boards.js";
import {
  boardContextSections,
  boardGroup,
  contextGroupOptions,
  contextGroups,
  selectedContext,
} from "../repositories/contexts.js";
import { receivedOrder } from "../repositories/reorder.js";
import { hiddenTabs, inOrderOf, userTabOrders, withHidden } from "../repositories/tab-orders.js";
import { openView } from "../repositories/views.js";
import { boardAccess, ownsView } from "../repositories/shares.js";

/** A setting arrives as a boolean; the database stores it as 0 or 1. */
const flag = (value: unknown, defaultValue: 0 | 1): 0 | 1 =>
  value === undefined ? defaultValue : (Number(Boolean(value)) as 0 | 1);

/** A view's boards are arranged together, account by account. */
const viewScope = (viewId: Id) => `boards:${viewId}`;

/**
 * A board as this account sees it: what it may do with it, and the context
 * it looks at, are its own. Without "Lire" on contexts, it has none: nothing
 * is filtered.
 */
export const boardForAccount = (board: BoardRow, user: UserRow): Board => {
  const readsContexts = structureRights(user).contexts.view;
  const { is_private: _unused, ...rest } = board;
  const sections = readsContexts ? boardContextSections(board.id) : [];
  const contexts = sections.flatMap((s) => s.contexts);
  return {
    ...rest,
    context_group: readsContexts ? boardGroup(board.id) : null,
    context_group_options: readsContexts ? contextGroupOptions(board.id) : [],
    contexts,
    context_sections: sections,
    context_groups: readsContexts ? contextGroups(board.id) : {},
    context: readsContexts ? selectedContext(user.id, board.id, contexts) : null,
    is_locked: 0,
    access: boardAccess(board, user) ?? "read",
    is_hidden: hiddenTabs.of(user.id, viewScope(board.view_id)).has(String(board.id)),
  };
};

/**
 * The boards of a view that this account sees, in their own order — those it
 * hid at the end: none without "Lire" on boards.
 */
export const visibleBoards = (viewId: Id, user: UserRow): Board[] =>
  structureRights(user).boards.view
    ? withHidden(
        user.id,
        viewScope(viewId),
        inOrderOf(user.id, viewScope(viewId), boards.visibleIn.all(viewId, user.id)),
      ).map((b) => boardForAccount(b, user))
    : [];

const boardProjects = selection<{ id: Id; name: string }>(
  "SELECT id, name FROM projects WHERE board_id = ?",
);
const deleteBoardProjects = mutation("DELETE FROM projects WHERE board_id = ?");
const deleteBoardCategories = mutation("DELETE FROM categories WHERE board_id = ?");

/**
 * Cascade deletion: the board's projects go first (their comments and actors
 * follow through the foreign key), then its categories — a project
 * references its category —, then the board, which takes its lists, labels,
 * sections and widgets with it.
 */
const deleteCascade = transaction((id: Id): void => {
  deleteBoardProjects.run(id);
  deleteBoardCategories.run(id);
  boards.remove.run(id);
});

/**
 * A deleted board, and the announcement of what it takes with it: to those
 * who followed its lists or cards, and to the actors of each of its
 * projects. Recipients are read before the deletion.
 */
export const deleteBoard = (board: BoardRow, req: Request): void => {
  const recipients = concerned.board(board.id);
  const projects = boardProjects
    .all(board.id)
    .map((p) => ({ ...p, recipients: concerned.project(p.id) }));
  deleteCascade(board.id);
  notifyDeletion({
    kind: "card",
    targetId: board.id,
    title: board.name,
    message: "a supprimé le tableau",
    author: req.user,
    recipients,
    vanished: true,
  });
  for (const project of projects) {
    notifyDeletion({
      kind: "project",
      targetId: project.id,
      title: project.name,
      message: `a supprimé le tableau « ${board.name} » et ses projets`,
      author: req.user,
      recipients: project.recipients,
      vanished: true,
    });
  }
};

/**
 * A new board in a view, after the others. It belongs to its creator. With no first widget, it is born
 * with no section: its empty screen offers to create one.
 */
export const createBoard = transaction(
  (viewId: Id, name: string, owner: Id, firstWidget: string | null): Id => {
    const { next } = boards.nextPosition(viewId);
    const id = Number(boards.create.run(viewId, name, next, 1, owner, now()).lastInsertRowid);
    if (firstWidget) boardSections.setFirst(id, firstWidget);
    // A Support widget brings the default labels (repositories/support.ts).
    if (firstWidget === "support.list") ensureSupportLabels(id);
    // A projects widget brings the "Priorités" labels (repositories/projects.ts).
    if (firstWidget === "project.list") ensureProjectPriorities(id);
    return id;
  },
);

export const boardRoutes = Router();

// Deleting a board takes its lists, cards, labels, projects, categories and
// widgets with it.
boardRoutes.use(followLists);
boardRoutes.use(
  touch("boards", "board-widgets", "task-lists", "labels", "projects", "categories", "project-labels"),
);

boardRoutes.get("/", (req, res) => {
  const { view } = req.query;
  if (!view) badRequest("La vue est requise");
  const openedView = openView(view, req.user);
  res.json(visibleBoards(openedView.id, req.user));
});

boardRoutes.post("/", (req, res) => {
  requireStructureRight(req, "boards", "create");
  const openedView = openView(req.body.view_id, req.user);
  // A view's boards are added by its owner: those it is shared with only see
  // what was shared.
  if (!ownsView(openedView, req.user)) {
    throw new HttpError(403, "Seul le propriétaire de cette vue peut y ajouter un tableau");
  }
  const name = requireText(req.body.name, "Le nom du tableau est requis");
  const id = createBoard(openedView.id, name, req.user.id, null);
  res.status(201).json(boardForAccount(boards.byId.get(id)!, req.user));
});

// Arrange the tabs. Declared before "/:id", otherwise "reorder" would be
// taken for an id. The order is this account's only
// (repositories/tab-orders.ts); it follows the right to modify the interface.
boardRoutes.put("/reorder", (req, res) => {
  requireInterface(req);
  const openedView = openView(req.body.view_id, req.user);
  const order = receivedOrder(
    req.body.ids,
    boards.visibleIn.all(openedView.id, req.user.id),
    "La liste des identifiants ne correspond pas aux tableaux de cette vue",
  );
  userTabOrders.store(req.user.id, viewScope(openedView.id), order);
  res.json(visibleBoards(openedView.id, req.user));
});

// "Masquer": hidden for this account, it only shows in interface editing,
// greyed at the end of the row. The last board shown in a view stays.
boardRoutes.put("/:id/hidden", (req, res) => {
  requireInterface(req);
  const board = openBoard(req.params.id, req.user);
  const hidden = req.body.hidden === true;
  if (hidden) {
    const others = visibleBoards(board.view_id, req.user).filter(
      (b) => b.id !== board.id && !b.is_hidden,
    );
    if (others.length === 0) badRequest("Le dernier tableau affiché ne peut pas être masqué");
  }
  hiddenTabs.set(req.user.id, viewScope(board.view_id), board.id, hidden);
  res.json(visibleBoards(board.view_id, req.user));
});

// A single board: its view above all, where the application must position
// itself to open what it contains — a project, a card, a widget found by
// search.
boardRoutes.get("/:id", (req, res) => {
  res.json(boardForAccount(openBoard(req.params.id, req.user), req.user));
});

boardRoutes.put("/:id", (req, res) => {
  requireOrganize(req);
  const existing = openBoard(req.params.id, req.user);
  requireBoardControl(existing, req.user);
  const name = requireText(req.body.name ?? existing.name, "Le nom du tableau est requis");
  const all = requireText(
    req.body.all_contexts_label ?? existing.all_contexts_label,
    "Le libellé de « Tous les contextes » est requis",
  );
  // The label group that gives its contexts, by its name; empty for none.
  const group = req.body.context_group;
  boards.update.run(
    name,
    all,
    group === undefined ? existing.context_group : typeof group === "string" ? group.trim() : "",
    flag(req.body.show_card_numbers, existing.show_card_numbers),
    existing.id,
  );
  res.json(boardForAccount(boards.byId.get(existing.id)!, req.user));
});

boardRoutes.delete("/:id", (req, res) => {
  requireStructureRight(req, "boards", "delete");
  const board = openBoard(req.params.id, req.user);
  requireBoardOwner(board, req.user);
  deleteBoard(board, req);
  res.status(204).end();
});
