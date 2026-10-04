// « Hérité » : la structure qu'un compte voit dans un tableau. Hérité, il
// voit les sections publiques (owner_id nul), partagées avec tous ; sinon les
// siennes (owner_id = lui).
//
// Le choix se range dans personal_layouts, et non dans la présence de
// sections à soi : une structure personnelle peut être vide.

import type { Id } from "@milo/shared";
import { mutation, selection } from "../db/query.js";
import { now } from "../lib/time.js";

/** La portée de « Hérité » : un tableau. */
export const boardScope = (boardId: Id): string => `board:${boardId}`;

const row = selection<{ scope: string }>(
  "SELECT scope FROM personal_layouts WHERE user_id = ? AND scope = ?",
);
const insertRow = mutation(
  "INSERT OR IGNORE INTO personal_layouts (user_id, scope, created_at) VALUES (?, ?, ?)",
);
const remove = mutation("DELETE FROM personal_layouts WHERE user_id = ? AND scope = ?");

export const personalLayouts = {
  /** Vrai quand ce compte a sa propre structure ici. */
  personal: (userId: Id, scope: string): boolean => Boolean(row.get(userId, scope)),
  /**
   * Le propriétaire des sections que ce compte voit et modifie ici : lui, ou
   * personne — la structure publique.
   */
  owner: (userId: Id, scope: string): Id | null =>
    row.get(userId, scope) ? userId : null,
  insertRow: (userId: Id, scope: string): void => {
    insertRow.run(userId, scope, now());
  },
  remove: (userId: Id, scope: string): void => {
    remove.run(userId, scope);
  },
  /** Un tableau supprimé n'a plus de structures personnelles à suivre. */
  forgetScope: mutation("DELETE FROM personal_layouts WHERE scope = ?"),
};
