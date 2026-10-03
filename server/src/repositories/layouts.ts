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
export const scopeTableau = (boardId: Id): string => `board:${boardId}`;

const ligne = selection<{ scope: string }>(
  "SELECT scope FROM personal_layouts WHERE user_id = ? AND scope = ?",
);
const poser = mutation(
  "INSERT OR IGNORE INTO personal_layouts (user_id, scope, created_at) VALUES (?, ?, ?)",
);
const retirer = mutation("DELETE FROM personal_layouts WHERE user_id = ? AND scope = ?");

export const personalLayouts = {
  /** Vrai quand ce compte a sa propre structure ici. */
  personnel: (userId: Id, scope: string): boolean => Boolean(ligne.get(userId, scope)),
  /**
   * Le propriétaire des sections que ce compte voit et modifie ici : lui, ou
   * personne — la structure publique.
   */
  proprietaire: (userId: Id, scope: string): Id | null =>
    ligne.get(userId, scope) ? userId : null,
  poser: (userId: Id, scope: string): void => {
    poser.run(userId, scope, now());
  },
  retirer: (userId: Id, scope: string): void => {
    retirer.run(userId, scope);
  },
  /** Un tableau supprimé n'a plus de structures personnelles à suivre. */
  oublierScope: mutation("DELETE FROM personal_layouts WHERE scope = ?"),
};
