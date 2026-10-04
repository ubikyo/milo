// Le suivi : qui veut être prévenu de quoi.

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
 * Les comptes qui suivent cet élément, sauf celui qui vient d'agir : on ne se
 * notifie pas de ses propres gestes. Les comptes sans e-mail utilisable ne
 * sont pas écartés ici — c'est l'envoi qui s'en aperçoit, la notification à
 * l'écran, elle, n'en a pas besoin.
 */
const followers = selection<UserRow>(
  `SELECT users.* FROM follows
   JOIN users ON users.id = follows.user_id
   WHERE follows.kind = ? AND follows.target_id = ? AND follows.user_id != ?`,
);

export const follows = {
  /** Ce qu'une personne suit, rangé par sorte : ce que le client tient à jour. */
  of: (userId: Id): Follows => {
    const rassembles = emptyFollows();
    for (const row of forUser.all(userId)) {
      if (isFollowKind(row.kind)) rassembles[row.kind].push(row.target_id);
    }
    return rassembles;
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
