// What a new declared asset widget brings besides its labels
// (declared-asset-labels.ts): its categories tree and identification types
// (shared, DECLARED_ASSET_DEFAULT_CATEGORIES), its asset number template, and
// its columns — its status labels among them. Each widget has its own; one
// that already has them — a copy, an import — keeps its own.

import { randomUUID } from "node:crypto";
import {
  DECLARED_ASSET_DEFAULT_CATEGORIES,
  DECLARED_ASSET_DEFAULT_COLUMNS,
  DECLARED_ASSET_EXTRA_LISTS,
  DECLARED_ASSET_EXTRA_LIST_DEFAULTS,
  DEFAULT_ASSET_NUMBER_CODE,
  DEFAULT_ASSET_NUMBER_TEMPLATE_NAME,
} from "@milo/shared";
import type { DeclaredAssetKind, DeclaredAssetLocation } from "@milo/shared";
import { declaredAssetTables } from "../db/declared-asset-tables.js";
import { mutation, transaction } from "../db/query.js";
import { declaredAssetLabelGroups } from "./label-groups.js";
import type { ListScope } from "./lists.js";

/** The default tree, its nodes drawn their ids — a parent before its children. */
const defaultCategories = (kind: DeclaredAssetKind): DeclaredAssetLocation[] => {
  const ids = new Map<string, string>();
  return DECLARED_ASSET_DEFAULT_CATEGORIES[kind].map((path) => {
    const id = randomUUID();
    ids.set(path.join("\n"), id);
    const parent = path.length > 1 ? (ids.get(path.slice(0, -1).join("\n")) ?? null) : null;
    return { id, parent, name: path[path.length - 1]! };
  });
};

const insertTemplates = mutation(
  `INSERT OR IGNORE INTO board_asset_number_templates (board_id, list_key, kind, templates)
   VALUES (?, ?, ?, ?)`,
);

const statements = (kind: DeclaredAssetKind) => {
  const { settings } = declaredAssetTables(kind);
  // The column names come from DECLARED_ASSET_EXTRA_LISTS, never from a request.
  const extras = DECLARED_ASSET_EXTRA_LISTS[kind];
  return {
    extras,
    insertSettings: mutation(
      `INSERT OR IGNORE INTO ${settings} (board_id, list_key, categories${extras
        .map((l) => `, ${l}`)
        .join("")})
       VALUES (?, ?, ?${extras.map(() => ", ?").join("")})`,
    ),
  };
};

const BY_KIND = {
  unmanaged_device_asset: statements("unmanaged_device_asset"),
  application_asset: statements("application_asset"),
};

/**
 * A new widget's lists — its categories tree, its extra lists' defaults — and
 * its asset number template, unless it already has them.
 */
export const ensureDeclaredAssetDefaults = transaction(
  (kind: DeclaredAssetKind, scope: ListScope): void => {
    if (!scope.list) return;
    const { extras, insertSettings } = BY_KIND[kind];
    insertSettings.run(
      scope.board,
      scope.list,
      JSON.stringify(defaultCategories(kind)),
      ...extras.map((l) => JSON.stringify(DECLARED_ASSET_EXTRA_LIST_DEFAULTS[l])),
    );
    insertTemplates.run(
      scope.board,
      scope.list,
      kind,
      JSON.stringify([{ name: DEFAULT_ASSET_NUMBER_TEMPLATE_NAME, code: DEFAULT_ASSET_NUMBER_CODE }]),
    );
  },
);

/**
 * A new widget's columns, its status labels among them. "undefined" when its
 * configuration already names its own (a copy, an import).
 */
export const withDeclaredAssetColumns = (
  kind: DeclaredAssetKind,
  config: unknown,
  scope: ListScope,
): Record<string, unknown> | undefined => {
  const current = (config ?? {}) as Record<string, unknown>;
  if (Array.isArray(current.columns)) return undefined;
  return {
    ...current,
    columns: DECLARED_ASSET_DEFAULT_COLUMNS[kind].map(({ groupName, ...c }) =>
      groupName ? { ...c, group: declaredAssetLabelGroups[kind].named(scope, groupName) } : c,
    ),
  };
};
