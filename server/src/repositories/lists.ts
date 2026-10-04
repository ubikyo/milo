// List widgets own their items: two "Projets" of the same board do not show
// the same projects. Each carries in its configuration a list key (shared,
// LIST_KEY), which its projects, task lists, requests and workstations carry
// too.
//
// The key is born with the widget and never changes. Items go away with the
// last widget holding their key.

import { randomUUID } from "node:crypto";
import { LIST_KEY, listKey, isListWidgetType } from "@milo/shared";
import type { Id } from "@milo/shared";
import { mutation, selection } from "../db/query.js";

const read = (config: string): Record<string, unknown> => {
  try {
    const readValue = JSON.parse(config) as unknown;
    return readValue && typeof readValue === "object" ? (readValue as Record<string, unknown>) : {};
  } catch {
    return {};
  }
};

/** A new widget's configuration: a list widget receives its key there. */
export const withNewKey = (type: string, config: string): string =>
  isListWidgetType(type)
    ? JSON.stringify({ ...read(config), [LIST_KEY]: randomUUID() })
    : config;

/** A modified configuration keeps the old one's key: it cannot be changed. */
export const keepKey = (type: string, before: string, after: string): string => {
  if (!isListWidgetType(type)) return after;
  const key = listKey(read(before));
  return JSON.stringify({ ...read(after), [LIST_KEY]: key || randomUUID() });
};

const boardKeys = selection<{ key: string | null }>(
  `SELECT json_extract(w.config, '$.${LIST_KEY}') AS key FROM board_widgets w
   JOIN board_sections s ON s.id = w.section_id
   WHERE s.board_id = ? AND w.type = ? AND json_valid(w.config)
   ORDER BY s.position, s.id, w.position, w.id`,
);

/**
 * The list key of an item created in this board: the one given, if a widget
 * of this type holds it; otherwise the first's — public first. Empty when the
 * board carries none.
 */
export const keyInBoard = (boardId: Id, type: string, received: unknown): string => {
  const keys = boardKeys
    .all(boardId, type)
    .map((l) => l.key)
    .filter((c): c is string => Boolean(c));
  if (typeof received === "string" && keys.includes(received)) return received;
  return keys[0] ?? "";
};

/** Does a widget of this type, in this board, hold this key? */
const holdsKey = (type: string, board: string, key: string) =>
  `EXISTS (SELECT 1 FROM board_widgets w JOIN board_sections s ON s.id = w.section_id
           WHERE s.board_id = ${board} AND w.type = '${type}' AND json_valid(w.config)
             AND json_extract(w.config, '$.${LIST_KEY}') = ${key})`;

const orphans = {
  projects: mutation(
    `DELETE FROM projects
     WHERE list_key != '' AND NOT ${holdsKey("project.list", "projects.board_id", "projects.list_key")}`,
  ),
  "task-lists": mutation(
    `DELETE FROM task_lists
     WHERE list_key != '' AND NOT ${holdsKey("task.list", "task_lists.board_id", "task_lists.list_key")}`,
  ),
  "support-requests": mutation(
    `DELETE FROM support_requests
     WHERE list_key != '' AND NOT ${holdsKey(
       "support.list",
       "support_requests.board_id",
       "support_requests.list_key",
     )}`,
  ),
  assets: mutation(
    `DELETE FROM assets
     WHERE list_key != '' AND NOT ${holdsKey(
       "asset.list",
       "assets.board_id",
       "assets.list_key",
     )}`,
  ),
} as const;

/**
 * What no widget holds anymore goes away: the items of a deleted widget —
 * alone, with its section, or with the personal copy that carried it. Returns
 * the affected resources.
 */
export const cleanLists = (): (keyof typeof orphans)[] =>
  (Object.keys(orphans) as (keyof typeof orphans)[]).filter(
    (resource) => orphans[resource].run().changes > 0,
  );
