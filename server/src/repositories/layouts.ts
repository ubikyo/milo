// "Hérité": the structure an account sees in a board. Inherited, it sees the
// public sections (null owner_id), shared with everyone; otherwise its own
// (owner_id = itself).
//
// The choice is stored in personal_layouts, and not in the presence of own
// sections: a personal structure may be empty.

import type { Id } from "@milo/shared";
import { mutation, selection } from "../db/query.js";
import { now } from "../lib/time.js";

/** The scope of "Hérité": a board. */
export const boardScope = (boardId: Id): string => `board:${boardId}`;

const row = selection<{ scope: string }>(
  "SELECT scope FROM personal_layouts WHERE user_id = ? AND scope = ?",
);
const insertRow = mutation(
  "INSERT OR IGNORE INTO personal_layouts (user_id, scope, created_at) VALUES (?, ?, ?)",
);
const remove = mutation("DELETE FROM personal_layouts WHERE user_id = ? AND scope = ?");

export const personalLayouts = {
  /** True when this account has its own structure here. */
  personal: (userId: Id, scope: string): boolean => Boolean(row.get(userId, scope)),
  /**
   * The owner of the sections this account sees and modifies here: itself, or
   * nobody — the public structure.
   */
  owner: (userId: Id, scope: string): Id | null =>
    row.get(userId, scope) ? userId : null,
  insertRow: (userId: Id, scope: string): void => {
    insertRow.run(userId, scope, now());
  },
  remove: (userId: Id, scope: string): void => {
    remove.run(userId, scope);
  },
  /** A deleted board has no personal structures left to follow. */
  forgetScope: mutation("DELETE FROM personal_layouts WHERE scope = ?"),
};
