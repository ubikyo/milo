// Ce que les widgets d'accès relèvent eux-mêmes, côté serveur : les flux RSS
// (lib/feed.ts). Les widgets, eux, vivent dans les sections des tableaux
// (repositories/board-widgets.ts).

import { mutation, selection } from "../db/query.js";
import type { AccessFeedRow } from "../db/rows.js";

/**
 * Les flux des éléments RSS, tels que la dernière relève les a laissés
 * (lib/feed.ts). Ils se rangent par adresse : deux éléments qui suivent la
 * même source se partagent la ligne.
 */
export const accessFeeds = {
  byUrl: selection<AccessFeedRow>("SELECT * FROM access_feeds WHERE url = ?"),
  all: selection<AccessFeedRow>("SELECT * FROM access_feeds"),
  /** La configuration de chaque widget RSS : c'est elle qui dit quoi relever. */
  configurations: selection<{ config: string }>(
    "SELECT config FROM board_widgets WHERE type = 'rss'",
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
