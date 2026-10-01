// Les tableaux du mode Tâche, et la règle de visibilité qui les protège.
// Elle est lue par tout ce qui pend à un tableau : ses listes, ses cartes,
// ses étiquettes.

import { mutation, scalar, selection } from "../db/query.js";
import type { BoardRow, NextRow, UserRow } from "../db/rows.js";
import { HttpError } from "../lib/http.js";

export const BOARD_INTROUVABLE = "Tableau introuvable";

export const boards = {
  byId: selection<BoardRow>("SELECT * FROM boards WHERE id = ?"),
  visibleTo: selection<BoardRow>(
    `SELECT * FROM boards
     WHERE company_id = ? AND (is_private = 0 OR owner_id = ?)
     ORDER BY position, id`,
  ),
  nextPosition: scalar<NextRow>(
    "SELECT COALESCE(MAX(position), -1) + 1 AS next FROM boards WHERE company_id = ?",
  ),
  create: mutation(
    `INSERT INTO boards (company_id, name, position, show_card_numbers, is_private, owner_id, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ),
  update: mutation(
    `UPDATE boards SET name = ?, show_card_numbers = ?, is_private = ?, is_locked = ?, owner_id = ?
     WHERE id = ?`,
  ),
  remove: mutation("DELETE FROM boards WHERE id = ?"),
};

/**
 * Un tableau privé n'est qu'à son auteur : les autres ne le voient pas dans la
 * liste et n'en atteignent ni les listes, ni les cartes, ni les étiquettes.
 * Les tableaux d'avant l'option n'ont pas d'auteur connu : ils restent ouverts.
 */
export const boardLisible = (board: BoardRow | undefined, user: UserRow): boolean =>
  Boolean(board) && (!board?.is_private || board.owner_id === user.id);

/**
 * Le tableau demandé, s'il existe et que cette personne peut le voir. Sinon
 * « introuvable », car un tableau privé ne se laisse pas même deviner — dire
 * « interdit » reviendrait à confirmer qu'il existe.
 */
export const boardOuvert = (id: unknown, user: UserRow): BoardRow => {
  const board = boards.byId.get(id);
  if (!boardLisible(board, user) || !board) throw new HttpError(404, BOARD_INTROUVABLE);
  return board;
};

/**
 * Un tableau verrouillé garde ses listes telles qu'elles sont : on n'en
 * ajoute, n'en déplace ni n'en supprime. Ses cartes, elles, restent libres.
 */
export const listesLibres = (board: BoardRow): BoardRow => {
  if (board.is_locked) throw new HttpError(403, "Ce tableau est verrouillé : ses listes ne bougent pas");
  return board;
};
