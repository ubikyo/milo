// A board's contexts: adding, renaming, arranging, deleting them — which
// takes their projects, cards, requests and workstations with them — and
// choosing the one being looked at. Each route returns the board as this
// account sees it, with its contexts up to date.
//
// Contexts are the board's shared structure: changing them requires being
// able to organize boards (lib/rights.ts), and controlling the board — owning
// it, or a "full" share. Choosing the one being looked at only concerns
// oneself: seeing the board is enough.

import { Router } from "express";
import type { Request } from "express";
import { mutation } from "../db/query.js";
import type { ContextRow } from "../db/rows.js";
import { requireOrganize, requireStructureRight } from "../lib/rights.js";
import { badRequest, notFound, requireText } from "../lib/http.js";
import { touch, touchNow } from "../middleware/events.js";
import {
  boards,
  readableBoard,
  openBoard,
  requireBoardControl,
} from "../repositories/boards.js";
import {
  addContext,
  boardContext,
  contexts,
  copyContexts,
} from "../repositories/contexts.js";
import { arrangeContexts, receivedOrder } from "../repositories/reorder.js";
import { followLists } from "./board-widgets.js";
import { boardForAccount } from "./boards.js";

const CONTEXT_NOT_FOUND = "Contexte introuvable";

/** The label of a board's "Tous les contextes". */
const renameAll = mutation("UPDATE boards SET all_contexts_label = ? WHERE id = ?");

/** The route's board, as this account sees it. */
const render = (req: Request, boardId: number) =>
  boardForAccount(boards.byId.get(boardId)!, req.user);

/** A context of a board that this account sees, and may change. */
const openContext = (id: unknown, req: Request): ContextRow => {
  const context = contexts.byId.get(id);
  const board = context && boards.byId.get(context.board_id);
  if (!context || !board || !readableBoard(board, req.user)) {
    return notFound(CONTEXT_NOT_FOUND);
  }
  requireBoardControl(board, req.user);
  return context;
};

/** The route's board, which this account sees and may change. */
const controlledBoard = (req: Request) => {
  const board = openBoard((req.params as { id: string }).id, req.user);
  requireBoardControl(board, req.user);
  return board;
};

/** Mounted under /api/boards/:id/contexts. */
export const boardContextRoutes = Router({ mergeParams: true });

// Choosing the context being looked at: null for all. Declared before the
// rest, which touches the shared structure.
boardContextRoutes.put("/selected", (req, res) => {
  const board = openBoard((req.params as { id: string }).id, req.user);
  const value = req.body.context_id;
  const selected =
    value === null || value === undefined || value === "" || value === "all"
      ? null
      : boardContext(board.id, value);
  contexts.select.run(req.user.id, board.id, selected);
  res.json(render(req, board.id));
});

boardContextRoutes.use(touch("boards"));

boardContextRoutes.post("/", (req, res) => {
  requireStructureRight(req, "contexts", "create");
  const board = controlledBoard(req);
  const name = requireText(req.body.name, "Le nom du contexte est requis");
  addContext(board.id, name);
  res.status(201).json(render(req, board.id));
});

// Copy the board's contexts to another, after its own. Those already bearing
// the same name there are not duplicated: they are counted. Only the names
// are carried over — not what the contexts contain. "replace": the
// destination's are removed first, with what they contain. "rename_all": the
// destination also takes the label of "Tous les contextes", the global
// selector.
boardContextRoutes.post("/copy", (req, res) => {
  requireStructureRight(req, "contexts", "create");
  // Replacing the destination's deletes them, with what they contain.
  if (req.body.replace === true) requireStructureRight(req, "contexts", "delete");
  const source = openBoard((req.params as { id: string }).id, req.user);
  if (!req.body.to_board) badRequest("Le tableau de destination est requis");
  const target = openBoard(req.body.to_board, req.user);
  requireBoardControl(target, req.user);
  if (source.id === target.id) badRequest("Choisissez un autre tableau que celui-ci");
  const replaceExisting = req.body.replace === true;
  if (replaceExisting) touchNow(res, "projects", "task-lists", "support-requests", "assets");
  const result = copyContexts(source.id, target.id, replaceExisting);
  if (req.body.rename_all === true) renameAll.run(source.all_contexts_label, target.id);
  res.json(result);
});

boardContextRoutes.put("/reorder", (req, res) => {
  requireOrganize(req);
  const board = controlledBoard(req);
  const order = receivedOrder(
    req.body.ids,
    contexts.ofBoard.all(board.id),
    "La liste des identifiants ne correspond pas aux contextes de ce tableau",
  );
  arrangeContexts(order, board.id);
  res.json(render(req, board.id));
});

/** Mounted under /api/contexts. */
export const contextRoutes = Router();

contextRoutes.use(followLists);

contextRoutes.put("/:id", touch("boards"), (req, res) => {
  requireOrganize(req);
  const context = openContext(req.params.id, req);
  contexts.rename.run(requireText(req.body.name, "Le nom du contexte est requis"), context.id);
  res.json(render(req, context.board_id));
});

// Deleting a context takes, through the foreign key, its projects, cards,
// requests and workstations — and whatever hangs off each of them.
contextRoutes.delete(
  "/:id",
  touch("boards", "projects", "task-lists", "support-requests", "assets"),
  (req, res) => {
    requireStructureRight(req, "contexts", "delete");
    const context = openContext(req.params.id, req);
    contexts.remove.run(context.id);
    res.json(render(req, context.board_id));
  },
);
