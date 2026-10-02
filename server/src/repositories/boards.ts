// Les tableaux du mode Tâche, et la règle de visibilité qui les protège.
// Elle est lue par tout ce qui pend à un tableau : ses listes, ses cartes,
// ses étiquettes.

import type { Request } from "express";
import type { Right } from "@milo/shared";
import { mutation, scalar, selection } from "../db/query.js";
import type { BoardRow, NextRow, UserRow } from "../db/rows.js";
import { exiger } from "../lib/droits.js";
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
 * « interdit » reviendrait à confirmer qu'il existe. Il faut aussi le droit de
 * voir les tâches de sa société, et `droit` en plus quand on y écrit : tout
 * ce qui pend au tableau — listes, cartes, étiquettes — passe par ici.
 */
export const boardOuvert = (id: unknown, req: Request, droit: Right = "view"): BoardRow => {
  const board = boards.byId.get(id);
  if (!boardLisible(board, req.user) || !board) throw new HttpError(404, BOARD_INTROUVABLE);
  exiger(req, "tasks", "view", board.company_id, BOARD_INTROUVABLE);
  if (droit !== "view") exiger(req, "tasks", droit, board.company_id);
  return board;
};
