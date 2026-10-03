// Les contextes d'un tableau : la liste en haut à gauche. Tout ce que le
// tableau porte — projets, cartes, demandes, postes — appartient à l'un
// d'eux, et part avec lui (ON DELETE CASCADE). Chacun choisit, tableau par
// tableau, celui qu'il regarde ; sans choix, il les regarde tous.

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
  /** Le contexte que ce compte regarde dans ce tableau ; nul pour tous. */
  choisi: selection<{ context_id: Id | null }>(
    "SELECT context_id FROM user_board_contexts WHERE user_id = ? AND board_id = ?",
  ),
  choisir: mutation(
    `INSERT INTO user_board_contexts (user_id, board_id, context_id) VALUES (?, ?, ?)
     ON CONFLICT(user_id, board_id) DO UPDATE SET context_id = excluded.context_id`,
  ),
};

/**
 * Les contextes d'un tableau, recopiés à la suite de ceux d'un autre, dans
 * leur ordre. Un nom que le tableau d'arrivée porte déjà — à la casse près —
 * n'est pas redoublé : il est compté à part. « remplacer » : ceux du tableau
 * d'arrivée s'en vont d'abord, avec leurs projets, leurs cartes, leurs
 * demandes et leurs postes (ON DELETE CASCADE).
 */
export const copierContextes = transaction(
  (depuis: Id, vers: Id, remplacer: boolean): CopyResult => {
    const removed = remplacer ? effacerContextes.run(vers).changes : 0;
    const deja = new Set(contexts.ofBoard.all(vers).map((c) => c.name.trim().toLowerCase()));
    let copied = 0;
    let skipped = 0;
    for (const { name } of contexts.ofBoard.all(depuis)) {
      const cle = name.trim().toLowerCase();
      if (deja.has(cle)) {
        skipped += 1;
        continue;
      }
      ajouterContexte(vers, name);
      deja.add(cle);
      copied += 1;
    }
    return { copied, skipped, removed };
  },
);

const effacerContextes = mutation("DELETE FROM contexts WHERE board_id = ?");

/** Un contexte à la suite des autres. */
export const ajouterContexte = (boardId: Id, name: string): Id => {
  const { next } = contexts.nextPosition(boardId);
  return Number(contexts.create.run(boardId, name, next, now()).lastInsertRowid);
};

export const contexteDe = (row: ContextRow): Context => ({ ...row });

/**
 * Le contexte reçu pour un élément de ce tableau : il doit en être. Absent,
 * c'est `defaut` — ou, à défaut, le premier du tableau ; nul quand le tableau
 * n'en a aucun.
 */
export const contexteDuTableau = (
  boardId: Id,
  valeur: unknown,
  defaut?: Id | null,
): Id | null => {
  if (valeur === undefined || valeur === null || valeur === "") {
    if (defaut) return defaut;
    return contexts.ofBoard.all(boardId)[0]?.id ?? null;
  }
  const contexte = contexts.byId.get(valeur);
  if (!contexte || contexte.board_id !== boardId) badRequest("Contexte introuvable");
  return contexte!.id;
};

/** Le contexte que ce compte regarde dans ce tableau ; nul pour tous. */
export const contexteChoisi = (userId: Id, boardId: Id): Id | null =>
  contexts.choisi.get(userId, boardId)?.context_id ?? null;
