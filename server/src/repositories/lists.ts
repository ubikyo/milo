// List widgets own their items: two "Projets" of the same board do not show
// the same projects. Each carries in its configuration a list key (shared,
// LIST_KEY), which its projects, task lists, requests and workstations carry
// too.
//
// The key is born with the widget and never changes. Items go away with the
// last widget holding their key.

import { randomUUID } from "node:crypto";
import db from "../db/index.js";
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
import { badRequest } from "../lib/http.js";

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

/**
 * What a list widget owns besides its items — its labels, its categories,
 * its tables: its board, and its key.
 */
export interface ListScope {
  board: Id;
  list: string;
}

/**
 * The list a request names on this board: a widget of this type must hold
 * its key. Refused otherwise — a list's settings are its own.
 */
export const listInBoard = (boardId: Id, type: string, received: unknown): ListScope => {
  const held = boardKeys.all(boardId, type).some((l) => l.key && l.key === received);
  if (!held) badRequest("Widget inconnu");
  return { board: boardId, list: received as string };
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
  products: mutation(
    `DELETE FROM products
     WHERE list_key != '' AND NOT ${holdsKey("product.list", "products.board_id", "products.list_key")}`,
  ),
  orders: mutation(
    `DELETE FROM orders
     WHERE list_key != '' AND NOT ${holdsKey("order.list", "orders.board_id", "orders.list_key")}`,
  ),
  warehouses: mutation(
    `DELETE FROM warehouses
     WHERE list_key != '' AND NOT ${holdsKey("warehouse.list", "warehouses.board_id", "warehouses.list_key")}`,
  ),
  locations: mutation(
    `DELETE FROM locations
     WHERE list_key != '' AND NOT ${holdsKey("location.list", "locations.board_id", "locations.list_key")}`,
  ),
  ...declaredOrphans,
} as const;

/**
 * What a list widget owns besides its items, table by table with the type of
 * its widget — labels before their groups, which they point to.
 */
const OWNED: [table: string, type: string][] = [
  ["labels", "task.list"],
  ["label_groups", "task.list"],
  ["project_labels", "project.list"],
  ["project_label_groups", "project.list"],
  ["categories", "project.list"],
  ["milestone_types", "project.list"],
  ["support_labels", "support.list"],
  ["support_label_groups", "support.list"],
  ["support_contents", "support.list"],
  ["support_replies", "support.list"],
  ["support_mail_templates", "support.list"],
  ["managed_device_asset_labels", "managed_device_asset.list"],
  ["managed_device_asset_label_groups", "managed_device_asset.list"],
  ["board_managed_device_asset_settings", "managed_device_asset.list"],
  ["contact_labels", "contact.list"],
  ["contact_label_groups", "contact.list"],
  ["board_contact_settings", "contact.list"],
  ["product_labels", "product.list"],
  ["product_label_groups", "product.list"],
  ["board_product_settings", "product.list"],
  ["order_labels", "order.list"],
  ["order_label_groups", "order.list"],
  ["board_order_settings", "order.list"],
  ["warehouse_labels", "warehouse.list"],
  ["warehouse_label_groups", "warehouse.list"],
  ["board_warehouse_settings", "warehouse.list"],
  ["board_tax_settings", "tax.list"],
  ["board_value_lists", "value.list"],
  ["location_labels", "location.list"],
  ["location_label_groups", "location.list"],
  ...DECLARED_ASSET_KINDS.flatMap((kind): [string, string][] => {
    const t = declaredAssetTables(kind);
    const type = declaredAssetListType(kind);
    return [
      [t.labels, type],
      [t.labelGroups, type],
      [t.settings, type],
    ];
  }),
];

// Rows kept without a key belong to no widget either: a board's, from before
// each widget had its own (db/settings-per-list.ts).
const ownedOrphans: Mutation[] = [
  ...OWNED.map(([table, type]) =>
    mutation(
      `DELETE FROM ${table}
       WHERE board_id IS NOT NULL AND NOT ${holdsKey(type, `${table}.board_id`, `${table}.list_key`)}`,
    ),
  ),
  // The templates name their asset kind, and so their widget's type.
  ...["board_label_templates", "board_asset_number_templates"].map((table) =>
    mutation(
      `DELETE FROM ${table}
       WHERE NOT EXISTS (SELECT 1 FROM board_widgets w JOIN board_sections s ON s.id = w.section_id
                         WHERE s.board_id = ${table}.board_id AND w.type = ${table}.kind || '.list'
                           AND json_valid(w.config)
                           AND json_extract(w.config, '$.${LIST_KEY}') = ${table}.list_key)`,
    ),
  ),
];

/**
 * What no widget holds anymore goes away: the items of a deleted widget —
 * alone, with its section, or with the personal copy that carried it —, then
 * its labels, categories and tables. Returns the affected resources.
 */
export const cleanLists = (): (keyof typeof orphans)[] => {
  const touched = (Object.keys(orphans) as (keyof typeof orphans)[]).filter(
    (resource) => orphans[resource].run().changes > 0,
  );
  for (const statement of ownedOrphans) statement.run();
  return touched;
};

/**
 * The tables whose rows belong to a list by its key, and to a board: its
 * items, its labels, its categories, its tables, its templates. Read once
 * from the schema: a table added later follows on its own.
 */
let keyedTables: { name: string; context: boolean }[] | null = null;

const tablesWithKey = () => {
  keyedTables ??= (
    db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'")
      .all() as { name: string }[]
  ).flatMap(({ name }) => {
    const columns = new Set(
      (db.prepare(`PRAGMA table_info("${name}")`).all() as { name: string }[]).map((c) => c.name),
    );
    return columns.has("list_key") && columns.has("board_id")
      ? [{ name, context: columns.has("context_id") }]
      : [];
  });
  return keyedTables;
};

/**
 * A list widget cut from a board and pasted into another: what it owns
 * follows it — its items and everything that carries its key. The contexts
 * stay with their board: the items leave theirs. To call within the
 * transaction that moves the widget.
 */
export const moveList = (type: string, config: string, from: Id, to: Id): void => {
  if (!isListWidgetType(type) || from === to) return;
  const key = read(config)[LIST_KEY];
  if (typeof key !== "string" || !key) return;
  for (const table of tablesWithKey()) {
    if (table.context) {
      db.prepare(
        `UPDATE "${table.name}" SET context_id = NULL WHERE board_id = ? AND list_key = ?`,
      ).run(from, key);
    }
    db.prepare(`UPDATE "${table.name}" SET board_id = ? WHERE board_id = ? AND list_key = ?`).run(
      to,
      from,
      key,
    );
  }
};
