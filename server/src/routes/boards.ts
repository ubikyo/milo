// The boards of a view: its tabs. A board contains its projects and task
// lists, and its widget sections (routes/board-widgets.ts). Everything it
// shows belongs to one of its contexts (routes/contexts.ts).

import { Router } from "express";
import type { Request } from "express";
import type { Board, Id, LayoutState } from "@milo/shared";
import { mutation, selection, transaction } from "../db/query.js";
import type { BoardRow } from "../db/rows.js";
import { requireOrganize } from "../lib/rights.js";
import { badRequest, requireText } from "../lib/http.js";
import { concerned, notifyDeletion } from "../lib/notify.js";
import { now } from "../lib/time.js";
import { touch } from "../middleware/events.js";
import { boardSections } from "../repositories/board-widgets.js";
import { followLists } from "./board-widgets.js";
import { boards, openBoard } from "../repositories/boards.js";
import {
  selectedContext,
  contextOf,
  contexts,
} from "../repositories/contexts.js";
import { personalLayouts, boardScope } from "../repositories/layouts.js";
import { receivedOrder } from "../repositories/reorder.js";
import { inOrderOf, userTabOrders } from "../repositories/tab-orders.js";
import { openView } from "../repositories/views.js";

/** A setting arrives as a boolean; the database stores it as 0 or 1. */
const flag = (value: unknown, defaultValue: 0 | 1): 0 | 1 =>
  value === undefined ? defaultValue : (Number(Boolean(value)) as 0 | 1);

/** A view's boards are arranged together, account by account. */
const viewScope = (viewId: Id) => `boards:${viewId}`;

/**
 * A board as this account sees it: its "Hérité" and the context it looks at
 * are its own. A private board only has its public structure
 * (repositories/layouts.ts).
 */
export const boardForAccount = (board: BoardRow, userId: Id): Board => ({
  ...board,
  contexts: contexts.ofBoard.all(board.id).map(contextOf),
  context_id: selectedContext(userId, board.id),
  is_locked: 0,
  inherited:
    Boolean(board.is_private) || !personalLayouts.personal(userId, boardScope(board.id)),
});

/** The boards of a view that this account sees, in their own order. */
const visibleBoards = (viewId: Id, userId: Id): Board[] =>
  inOrderOf(userId, viewScope(viewId), boards.visibleIn.all(viewId, userId)).map((b) =>
    boardForAccount(b, userId),
  );

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
  personalLayouts.forgetScope.run(boardScope(id));
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
 * A new board in a view, after the others, with no context: they are added
 * from its list. With no first widget, it is born with no section: its empty
 * screen offers to create one.
 */
export const createBoard = transaction(
  (viewId: Id, name: string, firstWidget: string | null): Id => {
    const { next } = boards.nextPosition(viewId);
    const id = Number(boards.create.run(viewId, name, next, 1, 0, null, now()).lastInsertRowid);
    if (firstWidget) boardSections.setFirst(id, firstWidget);
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
  res.json(visibleBoards(openedView.id, req.user.id));
});

boardRoutes.post("/", (req, res) => {
  requireOrganize(req);
  const openedView = openView(req.body.view_id, req.user);
  const name = requireText(req.body.name, "Le nom du tableau est requis");
  const id = createBoard(openedView.id, name, null);
  res.status(201).json(boardForAccount(boards.byId.get(id)!, req.user.id));
});

// Arrange the tabs. Declared before "/:id", otherwise "reorder" would be
// taken for an id. The order is this account's only
// (repositories/tab-orders.ts): seeing it is enough to arrange it.
boardRoutes.put("/reorder", (req, res) => {
  const openedView = openView(req.body.view_id, req.user);
  const order = receivedOrder(
    req.body.ids,
    boards.visibleIn.all(openedView.id, req.user.id),
    "La liste des identifiants ne correspond pas aux tableaux de cette vue",
  );
  userTabOrders.store(req.user.id, viewScope(openedView.id), order);
  res.json(visibleBoards(openedView.id, req.user.id));
});

// A single board: its view above all, where the application must position
// itself to open what it contains — a project, a card, a widget found by
// search.
boardRoutes.get("/:id", (req, res) => {
  res.json(boardForAccount(openBoard(req.params.id, req.user), req.user.id));
});

boardRoutes.put("/:id", (req, res) => {
  requireOrganize(req);
  const existing = openBoard(req.params.id, req.user);
  const name = requireText(req.body.name ?? existing.name, "Le nom du tableau est requis");
  const isPrivate = flag(req.body.is_private, existing.is_private);
  // A board only has an owner when private: closing it means reserving it
  // for oneself; reopening it gives it back to everyone, with no owner. Only
  // whoever closed it still sees it, and so can reopen it.
  const owner = isPrivate ? (existing.is_private ? existing.owner_id : req.user.id) : null;
  const all = requireText(
    req.body.all_contexts_label ?? existing.all_contexts_label,
    "Le libellé de « Tous les contextes » est requis",
  );
  boards.update.run(
    name,
    all,
    flag(req.body.show_card_numbers, existing.show_card_numbers),
    isPrivate,
    owner,
    existing.id,
  );
  res.json(boardForAccount(boards.byId.get(existing.id)!, req.user.id));
});

boardRoutes.delete("/:id", (req, res) => {
  requireOrganize(req);
  deleteBoard(openBoard(req.params.id, req.user), req);
  res.status(204).end();
});

// A board's "Hérité": its public structure, or its own copy. Unchecking it
// starts from a copy of the public one — sections and widgets —; checking it
// again erases one's own. Seeing it is enough: it is only set for oneself. A
// private board only has its public structure.
boardRoutes.get("/:id/layout", (req, res) => {
  const board = openBoard(req.params.id, req.user);
  res.json({ inherited: boardForAccount(board, req.user.id).inherited } as LayoutState);
});

boardRoutes.put("/:id/layout", (req, res) => {
  const board = openBoard(req.params.id, req.user);
  if (board.is_private) badRequest("Un tableau privé n'a pas de structure partagée");
  const scope = boardScope(board.id);
  if (req.body.inherited) {
    boardSections.inherit(board.id, req.user.id);
    personalLayouts.remove(req.user.id, scope);
  } else if (!personalLayouts.personal(req.user.id, scope)) {
    boardSections.customize(board.id, req.user.id);
    personalLayouts.insertRow(req.user.id, scope);
  }
  res.json({ inherited: boardForAccount(board, req.user.id).inherited } as LayoutState);
});
