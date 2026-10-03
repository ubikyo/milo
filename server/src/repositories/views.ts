// Les vues : ce que le sélecteur du bas propose. Chacune porte ses tableaux
// (repositories/boards.ts). Une vue privée ne se montre qu'à son auteur ; ses
// tableaux, avec elle. Une vue ne se voit que depuis son workspace : c'est ce
// qui les isole, tout ce qu'un tableau porte suivant sa vue.

import type { Id } from "@milo/shared";
import { mutation, scalar, selection } from "../db/query.js";
import type { NextRow, UserRow, ViewRow } from "../db/rows.js";
import { HttpError } from "../lib/http.js";

export const VUE_INTROUVABLE = "Vue introuvable";

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
export const vueLisible = (vue: ViewRow | undefined, user: UserRow): boolean =>
  Boolean(vue) &&
  vue?.workspace_id === user.workspace_id &&
  (!vue?.is_private || vue.owner_id === user.id);

/**
 * La vue demandée, si elle existe et que cette personne peut la voir. Sinon
 * « introuvable » : dire « interdit » reviendrait à confirmer son existence.
 */
export const vueOuverte = (id: unknown, user: UserRow): ViewRow => {
  const vue = views.byId.get(id);
  if (!vueLisible(vue, user) || !vue) throw new HttpError(404, VUE_INTROUVABLE);
  return vue;
};

/** L'identifiant d'une vue que ce compte voit, ou « null ». */
export const vueVisible = (id: Id, user: UserRow): boolean => vueLisible(views.byId.get(id), user);
