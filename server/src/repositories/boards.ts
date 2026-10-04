// The views' boards, and the visibility rule that protects them. It is read by
// everything hanging off a board: its projects, categories, lists, cards,
// labels, sections and widgets.
//
// A board is visible if its view is visible — within its workspace —, and if
// it is not private — or the person is its author.

import type { Request } from "express";
import type { Id, Right } from "@milo/shared";
import { mutation, scalar, selection } from "../db/query.js";
import type { BoardRow, NextRow, UserRow } from "../db/rows.js";
import { require } from "../lib/rights.js";
import { HttpError } from "../lib/http.js";
import { views, isViewVisible } from "./views.js";

export const BOARD_NOT_FOUND = "Tableau introuvable";

export const boards = {
  byId: selection<BoardRow>("SELECT * FROM boards WHERE id = ?"),
  /** Those of a view that this account sees, in the common order. */
  visibleIn: selection<BoardRow>(
    `SELECT * FROM boards
     WHERE view_id = ? AND (is_private = 0 OR owner_id = ?)
     ORDER BY position, id`,
  ),
  nextPosition: scalar<NextRow>(
    "SELECT COALESCE(MAX(position), -1) + 1 AS next FROM boards WHERE view_id = ?",
  ),
  create: mutation(
    `INSERT INTO boards (view_id, name, position, show_card_numbers, is_private, owner_id, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ),
  update: mutation(
    `UPDATE boards SET name = ?, all_contexts_label = ?, show_card_numbers = ?, is_private = ?,
       owner_id = ? WHERE id = ?`,
  ),
  remove: mutation("DELETE FROM boards WHERE id = ?"),
};

/**
 * A board is visible if its view is visible and it is not private — or that
 * person is its author.
 */
export const readableBoard = (board: BoardRow | undefined, user: UserRow): boolean =>
  Boolean(board) &&
  (!board?.is_private || board.owner_id === user.id) &&
  isViewVisible(views.byId.get(board!.view_id), user);

/**
 * The requested board, if it exists and that person can see it. Otherwise
 * "not found", because a private board must not even be guessed at — saying
 * "forbidden" would confirm it exists.
 */
export const openBoard = (id: unknown, user: UserRow): BoardRow => {
  const board = boards.byId.get(id);
  if (!readableBoard(board, user) || !board) throw new HttpError(404, BOARD_NOT_FOUND);
  return board;
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
     SELECT b.id FROM boards b JOIN views v ON v.id = b.view_id
     WHERE (b.is_private = 0 OR b.owner_id = @me) AND (v.is_private = 0 OR v.owner_id = @me)
       AND v.workspace_id = (SELECT workspace_id FROM users WHERE id = @me)
   )`;

/** The identifiers of a view's boards. */
export const viewBoards = selection<{ id: Id }>("SELECT id FROM boards WHERE view_id = ?");
