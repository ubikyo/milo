// The tables of the declared assets (shared, declared-assets.ts): the same
// set for each kind — the declared equipment, the applications —, under its
// own names. Every name comes from here, never from a request.

import {
  DECLARED_ASSET_EXTRAS,
  DECLARED_ASSET_EXTRA_LISTS,
  DECLARED_ASSET_EXTRA_LIST_DEFAULTS,
  DECLARED_ASSET_KINDS,
} from "@milo/shared";
import type {
  DeclaredAssetExtraField,
  DeclaredAssetExtraList,
  DeclaredAssetKind,
} from "@milo/shared";

export interface DeclaredAssetTables {
  /** The assets: "unmanaged_device_assets", "application_assets". */
  assets: string;
  /** Their actors, as a project's. */
  actors: string;
  /** Their labels — those of their board —, the links to them. */
  labelLinks: string;
  labels: string;
  labelGroups: string;
  /** Their photos and documents: files of the media folder. */
  photos: string;
  attachments: string;
  /** The board's lists, as JSON: categories, suppliers, makers, products. */
  settings: string;
}

/** How each extra field is stored: the typed values, as a JSON list. */
export const EXTRA_COLUMNS: Record<DeclaredAssetExtraField, string> = {
  identifications: "TEXT NOT NULL DEFAULT '[]'",
  location: "TEXT NOT NULL DEFAULT ''",
  version: "TEXT NOT NULL DEFAULT ''",
  website: "TEXT NOT NULL DEFAULT ''",
  license_infos: "TEXT NOT NULL DEFAULT '[]'",
};

/** The extra fields stored as JSON lists of typed values. */
export const JSON_EXTRAS: readonly DeclaredAssetExtraField[] = ["identifications", "license_infos"];

/**
 * How each extra list of the board is stored: JSON, its defaults until the
 * board records its own — they fill the rows of the boards that had none.
 */
export const EXTRA_LIST_COLUMNS = Object.fromEntries(
  Object.entries(DECLARED_ASSET_EXTRA_LIST_DEFAULTS).map(([list, defaults]) => [
    list,
    `TEXT NOT NULL DEFAULT '${JSON.stringify(defaults).replace(/'/g, "''")}'`,
  ]),
) as Record<DeclaredAssetExtraList, string>;

export const declaredAssetTables = (kind: DeclaredAssetKind): DeclaredAssetTables => ({
  assets: `${kind}s`,
  actors: `${kind}_actors`,
  labelLinks: `${kind}_label_links`,
  labels: `${kind}_labels`,
  labelGroups: `${kind}_label_groups`,
  photos: `${kind}_photos`,
  attachments: `${kind}_attachments`,
  settings: `board_${kind}_settings`,
});

/**
 * One kind's tables. An asset's category, supplier, maker and product are
 * names from its board's lists — a device type, a brand and a model; a
 * software type, a publisher and an application —; price NULL: not given.
 * Its labels, in their groups, are its board's own: they name no GLPI tag.
 * Some kinds carry more: a device, its identifications and its location — a
 * place of its board's locations tree —; an application, its version,
 * website and license information — and its board's lists, a device's
 * identification types and locations tree, an application's license
 * information types.
 */
const schemaOf = (kind: DeclaredAssetKind): string => {
  const t = declaredAssetTables(kind);
  return `
  CREATE TABLE IF NOT EXISTS ${t.labelGroups} (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    board_id INTEGER NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    position INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS ${t.labels} (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    board_id INTEGER NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
    group_id INTEGER REFERENCES ${t.labelGroups}(id),
    name TEXT NOT NULL,
    color TEXT NOT NULL DEFAULT 'blue.6',
    position INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS ${t.assets} (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    board_id INTEGER NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
    list_key TEXT NOT NULL DEFAULT '',
    name TEXT NOT NULL,
    category TEXT NOT NULL DEFAULT '',
    supplier TEXT NOT NULL DEFAULT '',
    maker TEXT NOT NULL DEFAULT '',
    product TEXT NOT NULL DEFAULT '',
    quantity INTEGER NOT NULL DEFAULT 1,
    price REAL,
    description TEXT NOT NULL DEFAULT '',
    notes TEXT NOT NULL DEFAULT '',
${DECLARED_ASSET_EXTRAS[kind].map((column) => `    ${column} ${EXTRA_COLUMNS[column]},\n`).join("")}    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS ${t.actors} (
    asset_id INTEGER NOT NULL REFERENCES ${t.assets}(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    PRIMARY KEY (asset_id, user_id)
  );

  CREATE TABLE IF NOT EXISTS ${t.labelLinks} (
    asset_id INTEGER NOT NULL REFERENCES ${t.assets}(id) ON DELETE CASCADE,
    label_id INTEGER NOT NULL REFERENCES ${t.labels}(id) ON DELETE CASCADE,
    PRIMARY KEY (asset_id, label_id)
  );

  CREATE TABLE IF NOT EXISTS ${t.photos} (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    asset_id INTEGER NOT NULL REFERENCES ${t.assets}(id) ON DELETE CASCADE,
    file TEXT NOT NULL,
    name TEXT NOT NULL DEFAULT '',
    size INTEGER NOT NULL DEFAULT 0,
    position INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS ${t.attachments} (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    asset_id INTEGER NOT NULL REFERENCES ${t.assets}(id) ON DELETE CASCADE,
    file TEXT NOT NULL,
    name TEXT NOT NULL,
    mime TEXT NOT NULL DEFAULT '',
    size INTEGER NOT NULL DEFAULT 0,
    user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    position INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS ${t.settings} (
    board_id INTEGER PRIMARY KEY REFERENCES boards(id) ON DELETE CASCADE,
    categories TEXT NOT NULL DEFAULT '[]',
    suppliers TEXT NOT NULL DEFAULT '[]',
    makers TEXT NOT NULL DEFAULT '[]',
    products TEXT NOT NULL DEFAULT '[]'${DECLARED_ASSET_EXTRA_LISTS[kind]
      .map((list) => `,\n    ${list} ${EXTRA_LIST_COLUMNS[list]}`)
      .join("")}
  );
`;
};

const indexesOf = (kind: DeclaredAssetKind): string => {
  const t = declaredAssetTables(kind);
  return `
  CREATE INDEX IF NOT EXISTS idx_${t.labels}_board ON ${t.labels}(board_id, position, id);
  CREATE INDEX IF NOT EXISTS idx_${t.labels}_group ON ${t.labels}(group_id);
  CREATE INDEX IF NOT EXISTS idx_${t.assets}_board ON ${t.assets}(board_id, list_key);
  CREATE INDEX IF NOT EXISTS idx_${t.actors}_user ON ${t.actors}(user_id);
  CREATE INDEX IF NOT EXISTS idx_${t.labelLinks}_label ON ${t.labelLinks}(label_id);
  CREATE INDEX IF NOT EXISTS idx_${t.photos}_asset ON ${t.photos}(asset_id, position, id);
  CREATE INDEX IF NOT EXISTS idx_${t.attachments}_asset ON ${t.attachments}(asset_id, position, id);
`;
};

export const DECLARED_ASSET_SCHEMA = DECLARED_ASSET_KINDS.map(schemaOf).join("");
export const DECLARED_ASSET_INDEXES = DECLARED_ASSET_KINDS.map(indexesOf).join("");
