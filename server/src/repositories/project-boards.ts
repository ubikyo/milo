// Les tableaux du mode Projet. Ils ne dépendent d'aucune société : un tableau
// rassemble des projets de plusieurs sociétés, et porte ses catégories.
//
// La règle de visibilité est celle des tableaux de tâches (repositories/
// boards.ts), et vaut pour tout ce qui pend au tableau : ses catégories, ses
// étiquettes, ses projets.

import { mutation, scalar, selection } from "../db/query.js";
import type { CategoryRow, NextRow, ProjectBoardRow, UserRow } from "../db/rows.js";
import { HttpError } from "../lib/http.js";

export const TABLEAU_PROJETS_INTROUVABLE = "Tableau introuvable";

export const projectBoards = {
  byId: selection<ProjectBoardRow>("SELECT * FROM project_boards WHERE id = ?"),
  visibleTo: selection<ProjectBoardRow>(
    `SELECT * FROM project_boards
     WHERE is_private = 0 OR owner_id = ?
     ORDER BY position, id`,
  ),
  nextPosition: scalar<NextRow>(
    "SELECT COALESCE(MAX(position), -1) + 1 AS next FROM project_boards",
  ),
  create: mutation(
    `INSERT INTO project_boards (name, position, is_private, owner_id, created_at)
     VALUES (?, ?, ?, ?, ?)`,
  ),
  update: mutation(
    "UPDATE project_boards SET name = ?, is_private = ?, owner_id = ? WHERE id = ?",
  ),
};

/**
 * Un tableau privé n'est qu'à son auteur. Les tableaux d'avant l'option n'ont
 * pas d'auteur connu : ils restent ouverts à tous.
 */
export const projectBoardLisible = (
  board: ProjectBoardRow | undefined,
  user: UserRow,
): boolean => Boolean(board) && (!board?.is_private || board.owner_id === user.id);

/**
 * Le tableau demandé, s'il existe et que cette personne peut le voir. Sinon
 * « introuvable » : dire « interdit » reviendrait à confirmer son existence.
 */
export const projectBoardOuvert = (id: unknown, user: UserRow): ProjectBoardRow => {
  const board = projectBoards.byId.get(id);
  if (!projectBoardLisible(board, user) || !board) {
    throw new HttpError(404, TABLEAU_PROJETS_INTROUVABLE);
  }
  return board;
};

/** La clause qui, dans une requête sur les projets, écarte les tableaux fermés. */
export const CLAUSE_TABLEAUX_VISIBLES =
  "projects.board_id IN (SELECT id FROM project_boards WHERE is_private = 0 OR owner_id = @me)";

export const categories = {
  byId: selection<CategoryRow>("SELECT * FROM categories WHERE id = ?"),
  byName: selection<CategoryRow>(
    "SELECT * FROM categories WHERE board_id = ? AND name = ? COLLATE NOCASE AND id != ?",
  ),
  create: mutation("INSERT INTO categories (board_id, name) VALUES (?, ?)"),
  rename: mutation("UPDATE categories SET name = ? WHERE id = ?"),
};
