// Le suivi : qui veut être prévenu de quoi.

import { mutation, selection } from "../db/query.js";
import type { FollowRow, UserRow } from "../db/rows.js";
import type { FollowKind, Follows, Id } from "@milo/shared";
import { emptyFollows, isFollowKind } from "@milo/shared";

const deQui = selection<FollowRow>("SELECT * FROM follows WHERE user_id = ?");

const ajouter = mutation(
  `INSERT INTO follows (user_id, kind, target_id, created_at) VALUES (?, ?, ?, ?)
   ON CONFLICT (user_id, kind, target_id) DO NOTHING`,
);

const retirer = mutation("DELETE FROM follows WHERE user_id = ? AND kind = ? AND target_id = ?");

/**
 * Les comptes qui suivent cet élément, sauf celui qui vient d'agir : on ne se
 * notifie pas de ses propres gestes. Les comptes sans e-mail utilisable ne
 * sont pas écartés ici — c'est l'envoi qui s'en aperçoit, la notification à
 * l'écran, elle, n'en a pas besoin.
 */
const suiveurs = selection<UserRow>(
  `SELECT users.* FROM follows
   JOIN users ON users.id = follows.user_id
   WHERE follows.kind = ? AND follows.target_id = ? AND follows.user_id != ?`,
);

export const follows = {
  /** Ce qu'une personne suit, rangé par sorte : ce que le client tient à jour. */
  of: (userId: Id): Follows => {
    const rassembles = emptyFollows();
    for (const ligne of deQui.all(userId)) {
      if (isFollowKind(ligne.kind)) rassembles[ligne.kind].push(ligne.target_id);
    }
    return rassembles;
  },

  add: (userId: Id, kind: FollowKind, targetId: Id, quand: string): void => {
    ajouter.run(userId, kind, targetId, quand);
  },

  remove: (userId: Id, kind: FollowKind, targetId: Id): void => {
    retirer.run(userId, kind, targetId);
  },

  watchers: (kind: FollowKind, targetId: Id, sauf: Id): UserRow[] =>
    suiveurs.all(kind, targetId, sauf),
};
