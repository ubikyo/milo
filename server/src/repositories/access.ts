// Les catégories du mode Accès. Elles ne dépendent ni d'une société ni d'un
// tableau : c'est le premier niveau du mode.
//
// La règle de visibilité est celle des tableaux (repositories/boards.ts et
// project-boards.ts) : une catégorie fermée ne se montre qu'à son auteur.

import { mutation, scalar, selection } from "../db/query.js";
import type {
  AccessBlockRow,
  AccessCategoryRow,
  AccessSectionRow,
  NextRow,
  UserRow,
} from "../db/rows.js";
import type { AccessBlock } from "@milo/shared";
import { HttpError } from "../lib/http.js";

export const CATEGORIE_ACCES_INTROUVABLE = "Catégorie introuvable";

export const accessCategories = {
  byId: selection<AccessCategoryRow>("SELECT * FROM access_categories WHERE id = ?"),
  visibleTo: selection<AccessCategoryRow>(
    `SELECT * FROM access_categories
     WHERE is_private = 0 OR owner_id = ?
     ORDER BY position, id`,
  ),
  nextPosition: scalar<NextRow>(
    "SELECT COALESCE(MAX(position), -1) + 1 AS next FROM access_categories",
  ),
  create: mutation(
    `INSERT INTO access_categories (name, position, is_private, owner_id, created_at)
     VALUES (?, ?, ?, ?, ?)`,
  ),
  update: mutation(
    "UPDATE access_categories SET name = ?, is_private = ?, owner_id = ? WHERE id = ?",
  ),
  remove: mutation("DELETE FROM access_categories WHERE id = ?"),
};

/**
 * Une catégorie privée n'est qu'à son auteur. Celle dont le compte de l'auteur
 * a été supprimé n'en a plus : elle reste ouverte à tous.
 */
export const accessCategorieLisible = (
  categorie: AccessCategoryRow | undefined,
  user: UserRow,
): boolean => Boolean(categorie) && (!categorie?.is_private || categorie.owner_id === user.id);

/**
 * La catégorie demandée, si elle existe et que cette personne peut la voir.
 * Sinon « introuvable » : dire « interdit » reviendrait à confirmer son
 * existence.
 */
export const accessCategorieOuverte = (id: unknown, user: UserRow): AccessCategoryRow => {
  const categorie = accessCategories.byId.get(id);
  if (!accessCategorieLisible(categorie, user) || !categorie) {
    throw new HttpError(404, CATEGORIE_ACCES_INTROUVABLE);
  }
  return categorie;
};

/**
 * Les sections d'une catégorie : ses colonnes. Elles suivent la visibilité de
 * la catégorie qui les porte — il n'y a donc rien à filtrer ici, les routes
 * passent d'abord par « accessCategorieOuverte ».
 */
export const accessSections = {
  byId: selection<AccessSectionRow>("SELECT * FROM access_sections WHERE id = ?"),
  byCategory: selection<AccessSectionRow>(
    "SELECT * FROM access_sections WHERE category_id = ? ORDER BY position, id",
  ),
  nextPosition: scalar<NextRow>(
    "SELECT COALESCE(MAX(position), -1) + 1 AS next FROM access_sections WHERE category_id = ?",
  ),
  create: mutation(
    `INSERT INTO access_sections
       (category_id, width_unit, width_value, position, created_at)
     VALUES (?, ?, ?, ?, ?)`,
  ),
  update: mutation("UPDATE access_sections SET width_unit = ?, width_value = ? WHERE id = ?"),
  remove: mutation("DELETE FROM access_sections WHERE id = ?"),
};

/**
 * Ce que les sections portent. Comme les sections, les éléments n'ont pas de
 * visibilité propre : elle vient de la catégorie, et les routes l'ouvrent
 * d'abord.
 */
export const accessBlocks = {
  byId: selection<AccessBlockRow>("SELECT * FROM access_blocks WHERE id = ?"),
  bySection: selection<AccessBlockRow>(
    "SELECT * FROM access_blocks WHERE section_id = ? ORDER BY position, id",
  ),
  /** Tous ceux d'une catégorie, d'un coup : la page les lit par colonne. */
  byCategory: selection<AccessBlockRow>(
    `SELECT access_blocks.* FROM access_blocks
     JOIN access_sections ON access_sections.id = access_blocks.section_id
     WHERE access_sections.category_id = ?
     ORDER BY access_sections.position, access_blocks.position, access_blocks.id`,
  ),
  nextPosition: scalar<NextRow>(
    "SELECT COALESCE(MAX(position), -1) + 1 AS next FROM access_blocks WHERE section_id = ?",
  ),
  create: mutation(
    "INSERT INTO access_blocks (section_id, type, config, position, created_at) VALUES (?, ?, ?, ?, ?)",
  ),
  update: mutation("UPDATE access_blocks SET config = ? WHERE id = ?"),
  remove: mutation("DELETE FROM access_blocks WHERE id = ?"),
};

/**
 * La ligne telle que l'API la rend : sa configuration redevient un objet. Un
 * JSON illisible — écrit à la main dans la base, ou par une version qui n'est
 * plus — ne fait pas tomber la lecture : l'élément sort sans configuration, et
 * le greffon posera la sienne par défaut.
 */
export const blocRendu = (row: AccessBlockRow): AccessBlock => {
  let config: Record<string, unknown> = {};
  try {
    const lu: unknown = JSON.parse(row.config);
    if (lu && typeof lu === "object" && !Array.isArray(lu)) {
      config = lu as Record<string, unknown>;
    }
  } catch {
    /* configuration illisible : le greffon reprendra la sienne */
  }
  return { ...row, config };
};
