// Les vues : ce que le sélecteur du bas propose. Chacune porte ses tableaux
// (repositories/boards.ts). Une vue privée ne se montre qu'à son auteur ; ses
// tableaux, avec elle. Une vue ne se voit que depuis son workspace : c'est ce
// qui les isole, tout ce qu'un tableau porte suivant sa vue.

import type { Id } from "@milo/shared";
import { mutation, scalar, selection } from "../db/query.js";
import type { NextRow, UserRow, ViewRow } from "../db/rows.js";
import { HttpError } from "../lib/http.js";

export const VIEW_NOT_FOUND = "Vue introuvable";

export const views = {
  byId: selection<ViewRow>("SELECT * FROM views WHERE id = ?"),
  /** Celles d'un workspace que ce compte voit : (workspace, compte). */
  visibleTo: selection<ViewRow>(
    `SELECT * FROM views WHERE workspace_id = ? AND (is_private = 0 OR owner_id = ?)
     ORDER BY position, id`,
  ),
  nextPosition: scalar<NextRow>(
    "SELECT COALESCE(MAX(position), -1) + 1 AS next FROM views WHERE workspace_id = ?",
  ),
  create: mutation(
    `INSERT INTO views (workspace_id, name, position, is_private, owner_id, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
  ),
  update: mutation("UPDATE views SET name = ?, is_private = ?, owner_id = ? WHERE id = ?"),
  remove: mutation("DELETE FROM views WHERE id = ?"),
};

/**
 * Une vue se voit depuis son workspace seulement. Privée, elle n'est qu'à son
 * auteur ; sans auteur, elle est ouverte à tous.
 */
export const isViewVisible = (view: ViewRow | undefined, user: UserRow): boolean =>
  Boolean(view) &&
  view?.workspace_id === user.workspace_id &&
  (!view?.is_private || view.owner_id === user.id);

/**
 * La vue demandée, si elle existe et que cette personne peut la voir. Sinon
 * « introuvable » : dire « interdit » reviendrait à confirmer son existence.
 */
export const openView = (id: unknown, user: UserRow): ViewRow => {
  const view = views.byId.get(id);
  if (!isViewVisible(view, user) || !view) throw new HttpError(404, VIEW_NOT_FOUND);
  return view;
};

/** L'identifiant d'une vue que ce compte voit, ou « null ». */
export const visibleView = (id: Id, user: UserRow): boolean => isViewVisible(views.byId.get(id), user);
