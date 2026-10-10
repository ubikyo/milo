// List widgets own their items: two "Projets" of the same board do not show
// the same projects. Each carries in its configuration a list key (shared,
// LIST_KEY), which its projects, task lists, requests and workstations carry
// too.
//
// The key is born with the widget and never changes. Items go away with the
// last widget holding their key.

import { randomUUID } from "node:crypto";
import {
  CALENDAR_KEY,
  DECLARED_ASSET_KINDS,
  DECLARED_ASSET_RESOURCES,
  LIST_KEY,
  MAIL_KEY,
  declaredAssetListType,
  isListWidgetType,
} from "@milo/shared";
import type { DeclaredAssetKind, Id } from "@milo/shared";
import { declaredAssetTables } from "../db/declared-asset-tables.js";
import { mutation, selection } from "../db/query.js";
import type { Mutation } from "../db/query.js";

const read = (config: string): Record<string, unknown> => {
  try {
    const readValue = JSON.parse(config) as unknown;
    return readValue && typeof readValue === "object" ? (readValue as Record<string, unknown>) : {};
  } catch {
    return {};
  }
};

/**
 * The key a widget of this type carries, if it carries one: a list's, or a
 * Calendar or Mail widget's (CALENDAR_KEY, MAIL_KEY), whose consents are its
 * own.
 */
const keyFieldOf = (type: string): string | null =>
  isListWidgetType(type)
    ? LIST_KEY
    : type === "calendar"
      ? CALENDAR_KEY
      : type === "mail"
        ? MAIL_KEY
        : null;

/** A new widget's configuration: a list widget, or a calendar, receives its key there. */
export const withNewKey = (type: string, config: string): string => {
  const field = keyFieldOf(type);
  return field ? JSON.stringify({ ...read(config), [field]: randomUUID() }) : config;
};

/** A modified configuration keeps the old one's key: it cannot be changed. */
export const keepKey = (type: string, before: string, after: string): string => {
  const field = keyFieldOf(type);
  if (!field) return after;
  const key = read(before)[field];
  return JSON.stringify({ ...read(after), [field]: typeof key === "string" && key ? key : randomUUID() });
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

/** The declared assets of each kind no widget holds anymore (shared, declared-assets.ts). */
const declaredOrphans = Object.fromEntries(
  DECLARED_ASSET_KINDS.map((kind) => {
    const { assets } = declaredAssetTables(kind);
    return [
      DECLARED_ASSET_RESOURCES[kind],
      mutation(
        `DELETE FROM ${assets}
         WHERE list_key != '' AND NOT ${holdsKey(
           declaredAssetListType(kind),
           `${assets}.board_id`,
           `${assets}.list_key`,
         )}`,
      ),
    ];
  }),
) as Record<(typeof DECLARED_ASSET_RESOURCES)[DeclaredAssetKind], Mutation>;

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
  "managed-device-assets": mutation(
    `DELETE FROM managed_device_assets
     WHERE list_key != '' AND NOT ${holdsKey(
       "managed_device_asset.list",
       "managed_device_assets.board_id",
       "managed_device_assets.list_key",
     )}`,
  ),
  contacts: mutation(
    `DELETE FROM contacts
     WHERE list_key != '' AND NOT ${holdsKey("contact.list", "contacts.board_id", "contacts.list_key")}`,
  ),
  ...declaredOrphans,
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
