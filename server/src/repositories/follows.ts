// Follows: who wants to be notified of what.

import { mutation, selection } from "../db/query.js";
import type { FollowRow, UserRow } from "../db/rows.js";
import type { FollowKind, Follows, Id } from "@milo/shared";
import { emptyFollows, isFollowKind } from "@milo/shared";

const forUser = selection<FollowRow>("SELECT * FROM follows WHERE user_id = ?");

const add = mutation(
  `INSERT INTO follows (user_id, kind, target_id, created_at) VALUES (?, ?, ?, ?)
   ON CONFLICT (user_id, kind, target_id) DO NOTHING`,
);

const remove = mutation("DELETE FROM follows WHERE user_id = ? AND kind = ? AND target_id = ?");

/**
 * The accounts following this item, except the one that just acted: we do not
 * notify ourselves of our own actions. Accounts without a usable e-mail are
 * not excluded here — it is the sending that notices, the on-screen
 * notification does not need one.
 */
const followers = selection<UserRow>(
  `SELECT users.* FROM follows
   JOIN users ON users.id = follows.user_id
   WHERE follows.kind = ? AND follows.target_id = ? AND follows.user_id != ?`,
);

export const follows = {
  /** What a person follows, grouped by kind: what the client keeps up to date. */
  of: (userId: Id): Follows => {
    const grouped = emptyFollows();
    for (const row of forUser.all(userId)) {
      if (isFollowKind(row.kind)) grouped[row.kind].push(row.target_id);
    }
    return grouped;
  },

  add: (userId: Id, kind: FollowKind, targetId: Id, whenLabel: string): void => {
    add.run(userId, kind, targetId, whenLabel);
  },

  remove: (userId: Id, kind: FollowKind, targetId: Id): void => {
    remove.run(userId, kind, targetId);
  },

  watchers: (kind: FollowKind, targetId: Id, except: Id): UserRow[] =>
    followers.all(kind, targetId, except),
};
