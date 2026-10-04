// The views' boards, and the visibility rule that protects them. It is read by
// everything hanging off a board: its projects, categories, lists, cards,
// labels, sections and widgets.
//
// A board is visible within its view's workspace, to its owner and to those
// it is shared with (repositories/shares.ts).

import type { Request } from "express";
import type { Id, Right } from "@milo/shared";
import { mutation, scalar, selection } from "../db/query.js";
import type { BoardRow, NextRow, UserRow } from "../db/rows.js";
import { require } from "../lib/rights.js";
import { HttpError } from "../lib/http.js";
import { views } from "./views.js";
import { SEES_BOARD, boardAccess } from "./shares.js";

export const BOARD_NOT_FOUND = "Tableau introuvable";

export const boards = {
  byId: selection<BoardRow>("SELECT * FROM boards WHERE id = ?"),
  /** Those of a view that this account sees, in the common order: (view, account). */
  visibleIn: selection<BoardRow>(
    `SELECT b.* FROM boards b, users me
     WHERE b.view_id = ? AND me.id = ? AND ${SEES_BOARD("b", "me")}
     ORDER BY b.position, b.id`,
  ),
  /** All those of a view, whoever sees them. */
  ofView: selection<BoardRow>("SELECT * FROM boards WHERE view_id = ? ORDER BY position, id"),
  nextPosition: scalar<NextRow>(
    "SELECT COALESCE(MAX(position), -1) + 1 AS next FROM boards WHERE view_id = ?",
  ),
  create: mutation(
    `INSERT INTO boards (view_id, name, position, show_card_numbers, owner_id, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
  ),
  update: mutation(
    `UPDATE boards SET name = ?, all_contexts_label = ?, context_group = ?, show_card_numbers = ?
     WHERE id = ?`,
  ),
  remove: mutation("DELETE FROM boards WHERE id = ?"),
};

/**
 * A board is visible within its view's workspace, to its owner and to those
 * it is shared with.
 */
export const readableBoard = (board: BoardRow | undefined, user: UserRow): boolean =>
  Boolean(board) &&
  views.byId.get(board!.view_id)?.workspace_id === user.workspace_id &&
  boardAccess(board!, user) !== null;

/**
 * The requested board, if it exists and that person can see it. Otherwise
 * "not found", because a board not shared with them must not even be guessed
 * at — saying "forbidden" would confirm it exists.
 */
export const openBoard = (id: unknown, user: UserRow): BoardRow => {
  const board = boards.byId.get(id);
  if (!readableBoard(board, user) || !board) throw new HttpError(404, BOARD_NOT_FOUND);
  return board;
};

/**
 * Throws unless the account may change this board — its layout, its name,
 * its contexts: its owner, or a "full" share. "read" only uses it.
 */
export const requireBoardControl = (board: BoardRow, user: UserRow): void => {
  if (boardAccess(board, user) === "read") {
    throw new HttpError(403, "Ce tableau vous est partagé en lecture seule");
  }
};

/** Throws unless the account owns this board: deleting it is theirs alone. */
export const requireBoardOwner = (board: BoardRow, user: UserRow): void => {
  if (boardAccess(board, user) !== "owner") {
    throw new HttpError(403, "Seul le propriétaire de ce tableau peut le supprimer");
  }
};

/**
 * The requested board, for its tasks: the right to see tasks is also needed,
 * and `right` in addition when writing to it. Everything hanging off lists —
 * cards, labels — goes through here.
 */
export const openTaskBoard = (id: unknown, req: Request, right: Right = "view"): BoardRow => {
  const board = openBoard(id, req.user);
  require(req, "tasks", "view", BOARD_NOT_FOUND);
  if (right !== "view") require(req, "tasks", right);
  return board;
};

/**
 * The clause that, in a query, keeps only the boards "@me" sees, within their
 * workspace (requireAuth recorded it).
 */
export const VISIBLE_BOARDS_CLAUSE = (column: string): string =>
  `${column} IN (
     SELECT b.id FROM boards b JOIN views v ON v.id = b.view_id JOIN users me ON me.id = @me
     WHERE v.workspace_id = me.workspace_id AND ${SEES_BOARD("b", "me")}
   )`;

/** The identifiers of a view's boards. */
export const viewBoards = selection<{ id: Id }>("SELECT id FROM boards WHERE view_id = ?");
