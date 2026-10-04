// What access widgets poll themselves, server side: RSS feeds (lib/feed.ts).
// The widgets themselves live in board sections (repositories/board-widgets.ts).

import { mutation, selection } from "../db/query.js";
import type { AccessFeedRow } from "../db/rows.js";

/**
 * The RSS item feeds, as the last poll left them (lib/feed.ts). They are
 * stored by address: two items following the same source share the row.
 */
export const accessFeeds = {
  byUrl: selection<AccessFeedRow>("SELECT * FROM access_feeds WHERE url = ?"),
  all: selection<AccessFeedRow>("SELECT * FROM access_feeds"),
  /** Each RSS widget's configuration: it is what says what to poll. */
  configurations: selection<{ config: string }>(
    "SELECT config FROM board_widgets WHERE type = 'rss'",
  ),
  /** A successful poll: the articles replace the previous ones. */
  store: mutation(
    `INSERT INTO access_feeds (url, articles, quantity, fetched_at, tried_at, error)
     VALUES (?, ?, ?, ?, ?, '')
     ON CONFLICT(url) DO UPDATE SET
       articles = excluded.articles, quantity = excluded.quantity,
       fetched_at = excluded.fetched_at, tried_at = excluded.tried_at, error = ''`,
  ),
  /** A failed poll: the previous articles stay, the error is added. */
  fail: mutation(
    `INSERT INTO access_feeds (url, tried_at, error) VALUES (?, ?, ?)
     ON CONFLICT(url) DO UPDATE SET tried_at = excluded.tried_at, error = excluded.error`,
  ),
  remove: mutation("DELETE FROM access_feeds WHERE url = ?"),
};
