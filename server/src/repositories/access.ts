// Les catégories du mode Accès. Elles ne dépendent ni d'une société ni d'un
// tableau : c'est le premier niveau du mode.
//
// La règle de visibilité est celle des tableaux (repositories/boards.ts et
// project-boards.ts) : une catégorie fermée ne se montre qu'à son auteur.

import { mutation, scalar, selection } from "../db/query.js";
import type {
  AccessBlockRow,
  AccessCategoryRow,
  AccessFeedRow,
  AccessSectionRow,
  AccessUptimeRow,
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
    `INSERT INTO access_categories
       (name, position, is_private, is_locked, gap, owner_id, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ),
  update: mutation(
    `UPDATE access_categories
     SET name = ?, is_private = ?, is_locked = ?, gap = ?, owner_id = ?
     WHERE id = ?`,
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
  placer: mutation("UPDATE access_sections SET position = ? WHERE id = ?"),
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
  convertir: mutation("UPDATE access_blocks SET type = ? WHERE id = ?"),
  /** Le rangement : un élément change de place, et parfois de colonne. */
  placer: mutation("UPDATE access_blocks SET section_id = ?, position = ? WHERE id = ?"),
  remove: mutation("DELETE FROM access_blocks WHERE id = ?"),
};

/**
 * Les flux des éléments RSS, tels que la dernière relève les a laissés
 * (lib/feed.ts). Ils se rangent par adresse : deux éléments qui suivent la
 * même source se partagent la ligne.
 */
export const accessFeeds = {
  byUrl: selection<AccessFeedRow>("SELECT * FROM access_feeds WHERE url = ?"),
  all: selection<AccessFeedRow>("SELECT * FROM access_feeds"),
  /** La configuration de chaque élément RSS : c'est elle qui dit quoi relever. */
  configurations: selection<{ config: string }>(
    "SELECT config FROM access_blocks WHERE type = 'rss'",
  ),
  /** Une relève réussie : les articles remplacent ceux d'avant. */
  ranger: mutation(
    `INSERT INTO access_feeds (url, articles, quantity, fetched_at, tried_at, error)
     VALUES (?, ?, ?, ?, ?, '')
     ON CONFLICT(url) DO UPDATE SET
       articles = excluded.articles, quantity = excluded.quantity,
       fetched_at = excluded.fetched_at, tried_at = excluded.tried_at, error = ''`,
  ),
  /** Une relève manquée : les articles d'avant restent, l'erreur s'ajoute. */
  echouer: mutation(
    `INSERT INTO access_feeds (url, tried_at, error) VALUES (?, ?, ?)
     ON CONFLICT(url) DO UPDATE SET tried_at = excluded.tried_at, error = excluded.error`,
  ),
  remove: mutation("DELETE FROM access_feeds WHERE url = ?"),
};

/**
 * Les machines des éléments Uptime, telles que la dernière vérification les a
 * laissées (lib/uptime.ts). Elles se rangent par ce qui les vérifie : deux
 * éléments qui surveillent la même chose se partagent la ligne.
 */
export const accessUptime = {
  byKey: selection<AccessUptimeRow>("SELECT * FROM access_uptime WHERE key = ?"),
  all: selection<AccessUptimeRow>("SELECT * FROM access_uptime"),
  /**
   * Chaque élément Uptime, avec la catégorie qui le porte : c'est elle qui dit
   * qui peut être prévenu d'un changement d'état.
   */
  configurations: selection<{
    config: string;
    category_id: number;
    category_name: string;
    is_private: number;
    owner_id: number | null;
  }>(
    `SELECT b.config, c.id AS category_id, c.name AS category_name, c.is_private, c.owner_id
       FROM access_blocks b
       JOIN access_sections s ON s.id = b.section_id
       JOIN access_categories c ON c.id = s.category_id
      WHERE b.type = 'uptime'`,
  ),
  /** Une vérification : l'état, et depuis quand il dure. */
  ranger: mutation(
    `INSERT INTO access_uptime (key, state, since, checked_at, detail) VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET
       state = excluded.state, since = excluded.since,
       checked_at = excluded.checked_at, detail = excluded.detail`,
  ),
  remove: mutation("DELETE FROM access_uptime WHERE key = ?"),
};

/**
 * La ligne telle que l'API la rend : sa configuration redevient un objet. Un
 * JSON illisible — écrit à la main dans la base, ou par une version qui n'est
 * plus — ne fait pas tomber la lecture : l'élément sort sans configuration, et
 * le widget posera la sienne par défaut.
 */
export const blocRendu = (row: AccessBlockRow): AccessBlock => {
  let config: Record<string, unknown> = {};
  try {
    const lu: unknown = JSON.parse(row.config);
    if (lu && typeof lu === "object" && !Array.isArray(lu)) {
      config = lu as Record<string, unknown>;
    }
  } catch {
    /* configuration illisible : le widget reprendra la sienne */
  }
  return { ...row, config };
};
