// A board's contexts: the list at the top left. Everything the board
// carries — projects, cards, requests, workstations — belongs to one of them,
// and goes with it (ON DELETE CASCADE). Each person chooses, board by board,
// which one they look at; with no choice, they look at all of them.

import type { Context, CopyResult, Id } from "@milo/shared";
import { mutation, scalar, selection, transaction } from "../db/query.js";
import type { ContextRow, NextRow } from "../db/rows.js";
import { badRequest } from "../lib/http.js";
import { now } from "../lib/time.js";

export const contexts = {
  ofBoard: selection<ContextRow>(
    "SELECT * FROM contexts WHERE board_id = ? ORDER BY position, id",
  ),
  byId: selection<ContextRow>("SELECT * FROM contexts WHERE id = ?"),
  nextPosition: scalar<NextRow>(
    "SELECT COALESCE(MAX(position), -1) + 1 AS next FROM contexts WHERE board_id = ?",
  ),
  create: mutation(
    "INSERT INTO contexts (board_id, name, position, created_at) VALUES (?, ?, ?, ?)",
  ),
  rename: mutation("UPDATE contexts SET name = ? WHERE id = ?"),
  remove: mutation("DELETE FROM contexts WHERE id = ?"),
  /** The context this account looks at in this board; null for all. */
  selected: selection<{ context_id: Id | null }>(
    "SELECT context_id FROM user_board_contexts WHERE user_id = ? AND board_id = ?",
  ),
  select: mutation(
    `INSERT INTO user_board_contexts (user_id, board_id, context_id) VALUES (?, ?, ?)
     ON CONFLICT(user_id, board_id) DO UPDATE SET context_id = excluded.context_id`,
  ),
};

/**
 * A board's contexts, copied after those of another, in their order. A name
 * the destination board already has — case aside — is not duplicated: it is
 * counted separately. "replaceExisting": those of the destination board go
 * away first, with their projects, cards, requests and workstations (ON DELETE
 * CASCADE).
 */
export const copyContexts = transaction(
  (since: Id, to: Id, replaceExisting: boolean): CopyResult => {
    const removed = replaceExisting ? clearContexts.run(to).changes : 0;
    const already = new Set(contexts.ofBoard.all(to).map((c) => c.name.trim().toLowerCase()));
    let copied = 0;
    let skipped = 0;
    for (const { name } of contexts.ofBoard.all(since)) {
      const key = name.trim().toLowerCase();
      if (already.has(key)) {
        skipped += 1;
        continue;
      }
      addContext(to, name);
      already.add(key);
      copied += 1;
    }
    return { copied, skipped, removed };
  },
);

const clearContexts = mutation("DELETE FROM contexts WHERE board_id = ?");

/** A context after the others. */
export const addContext = (boardId: Id, name: string): Id => {
  const { next } = contexts.nextPosition(boardId);
  return Number(contexts.create.run(boardId, name, next, now()).lastInsertRowid);
};

export const contextOf = (row: ContextRow): Context => ({ ...row });

/**
 * The context received for an item of this board: it must belong to it. When
 * absent, it is `defaultValue` — or, failing that, the board's first; null
 * when the board has none.
 */
export const boardContext = (
  boardId: Id,
  value: unknown,
  defaultValue?: Id | null,
): Id | null => {
  if (value === undefined || value === null || value === "") {
    if (defaultValue) return defaultValue;
    return contexts.ofBoard.all(boardId)[0]?.id ?? null;
  }
  const context = contexts.byId.get(value);
  if (!context || context.board_id !== boardId) badRequest("Contexte introuvable");
  return context!.id;
};

/** The context this account looks at in this board; null for all. */
export const selectedContext = (userId: Id, boardId: Id): Id | null =>
  contexts.selected.get(userId, boardId)?.context_id ?? null;
