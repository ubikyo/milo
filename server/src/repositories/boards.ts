// Les tableaux des vues, et la règle de visibilité qui les protège. Elle est
// lue par tout ce qui pend à un tableau : ses projets, ses catégories, ses
// listes, ses cartes, ses étiquettes, ses sections et ses widgets.
//
// Un tableau se voit si sa vue se voit — dans son workspace —, et s'il n'est
// pas privé — ou qu'on en est l'auteur.

import type { Request } from "express";
import type { Id, Right } from "@milo/shared";
import { mutation, scalar, selection } from "../db/query.js";
import type { BoardRow, NextRow, UserRow } from "../db/rows.js";
import { exiger } from "../lib/droits.js";
import { HttpError } from "../lib/http.js";
import { views, vueLisible } from "./views.js";

export const BOARD_INTROUVABLE = "Tableau introuvable";

export const boards = {
  byId: selection<BoardRow>("SELECT * FROM boards WHERE id = ?"),
  /** Ceux d'une vue que ce compte voit, dans l'ordre commun. */
  visibleIn: selection<BoardRow>(
    `SELECT * FROM boards
     WHERE view_id = ? AND (is_private = 0 OR owner_id = ?)
     ORDER BY position, id`,
  ),
  nextPosition: scalar<NextRow>(
    "SELECT COALESCE(MAX(position), -1) + 1 AS next FROM boards WHERE view_id = ?",
  ),
  create: mutation(
    `INSERT INTO boards (view_id, name, position, show_card_numbers, is_private, owner_id, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ),
  update: mutation(
    `UPDATE boards SET name = ?, all_contexts_label = ?, show_card_numbers = ?, is_private = ?,
       owner_id = ? WHERE id = ?`,
  ),
  remove: mutation("DELETE FROM boards WHERE id = ?"),
};

/**
 * Un tableau se voit si sa vue se voit et qu'il n'est pas privé — ou que
 * cette personne en est l'auteur.
 */
export const boardLisible = (board: BoardRow | undefined, user: UserRow): boolean =>
  Boolean(board) &&
  (!board?.is_private || board.owner_id === user.id) &&
  vueLisible(views.byId.get(board!.view_id), user);

/**
 * Le tableau demandé, s'il existe et que cette personne peut le voir. Sinon
 * « introuvable », car un tableau privé ne se laisse pas même deviner — dire
 * « interdit » reviendrait à confirmer qu'il existe.
 */
export const tableauOuvert = (id: unknown, user: UserRow): BoardRow => {
  const board = boards.byId.get(id);
  if (!boardLisible(board, user) || !board) throw new HttpError(404, BOARD_INTROUVABLE);
  return board;
};

/**
 * Le tableau demandé, pour ses tâches : il faut aussi le droit de voir les
 * tâches, et `droit` en plus quand on y écrit. Tout ce qui pend aux listes — cartes, étiquettes — passe par ici.
 */
export const boardOuvert = (id: unknown, req: Request, droit: Right = "view"): BoardRow => {
  const board = tableauOuvert(id, req.user);
  exiger(req, "tasks", "view", BOARD_INTROUVABLE);
  if (droit !== "view") exiger(req, "tasks", droit);
  return board;
};

/**
 * La clause qui, dans une requête, ne garde que les tableaux que « @me » voit,
 * dans son workspace (requireAuth l'a enregistré).
 */
export const CLAUSE_TABLEAUX_VISIBLES = (colonne: string): string =>
  `${colonne} IN (
     SELECT b.id FROM boards b JOIN views v ON v.id = b.view_id
     WHERE (b.is_private = 0 OR b.owner_id = @me) AND (v.is_private = 0 OR v.owner_id = @me)
       AND v.workspace_id = (SELECT workspace_id FROM users WHERE id = @me)
   )`;

/** Les identifiants des tableaux d'une vue. */
export const tableauxDeLaVue = selection<{ id: Id }>("SELECT id FROM boards WHERE view_id = ?");
