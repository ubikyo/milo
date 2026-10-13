// What a list widget owns besides its items — its labels and their groups,
// its project categories, its milestone types, its tables (contacts',
// products', assets'), its label and asset number templates — was its
// board's, shared by every widget of the kind on it; the milestone types,
// the whole application's. Each widget now has its own (repositories/lists.ts,
// ListScope): every row carries the list key of the widget that owns it.
//
// The catch-up gives what existed to the board's first widget of the kind —
// public first, in the board's order — and a copy to each of the others. Their
// items follow: a project, a card, a request… carries the copy of its labels,
// its category and its milestone type in its own widget, and the widgets'
// configurations the copies of the ids they named. A row of a board with no
// widget of its kind stays without a key: it is shown nowhere, and goes with
// the next cleaning (cleanLists).
//
// All at once, in one transaction, guarded by a marker: a backup restored
// from before goes through it too (lib/backup.ts).

import type { Database } from "better-sqlite3";
import { DECLARED_ASSET_KINDS, SOURCES, ownKeyOf, sourceTypeOf } from "@milo/shared";

/** Set once every list widget owns its settings. */
const SETTINGS_PER_LIST = "settings_per_list";

type Row = Record<string, unknown>;

const columns = (db: Database, table: string): string[] =>
  (db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[]).map((c) => c.name);

const tableExists = (db: Database, table: string): boolean =>
  Boolean(db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(table));

const readConfig = (config: unknown): Row => {
  try {
    const value = JSON.parse(String(config)) as unknown;
    return value && typeof value === "object" && !Array.isArray(value) ? (value as Row) : {};
  } catch {
    return {};
  }
};

/** A family of labels: its tables, and what carries them. */
interface LabelFamily {
  /** The list widget type that owns them. */
  type: string;
  labels: string;
  groups: string;
  /** The link table, its item column, and the items of a list (board, key). */
  links?: { table: string; item: string; itemsOfList: string };
}

const LABEL_FAMILIES: LabelFamily[] = [
  {
    type: "task.list",
    labels: "labels",
    groups: "label_groups",
    links: {
      table: "card_labels",
      item: "card_id",
      itemsOfList: `SELECT c.id FROM task_cards c JOIN task_lists l ON l.id = c.list_id
                    WHERE l.board_id = ? AND l.list_key = ?`,
    },
  },
  {
    type: "project.list",
    labels: "project_labels",
    groups: "project_label_groups",
    links: {
      table: "project_label_links",
      item: "project_id",
      itemsOfList: "SELECT id FROM projects WHERE board_id = ? AND list_key = ?",
    },
  },
  {
    type: "support.list",
    labels: "support_labels",
    groups: "support_label_groups",
    links: {
      table: "support_request_labels",
      item: "request_id",
      itemsOfList: "SELECT id FROM support_requests WHERE board_id = ? AND list_key = ?",
    },
  },
  // Asset labels name GLPI tags: nothing links to them.
  {
    type: "managed_device_asset.list",
    labels: "managed_device_asset_labels",
    groups: "managed_device_asset_label_groups",
  },
  {
    type: "contact.list",
    labels: "contact_labels",
    groups: "contact_label_groups",
    links: {
      table: "contact_label_links",
      item: "contact_id",
      itemsOfList: "SELECT id FROM contacts WHERE board_id = ? AND list_key = ?",
    },
  },
  {
    type: "product.list",
    labels: "product_labels",
    groups: "product_label_groups",
    links: {
      table: "product_label_links",
      item: "product_id",
      itemsOfList: "SELECT id FROM products WHERE board_id = ? AND list_key = ?",
    },
  },
  ...DECLARED_ASSET_KINDS.map((kind) => ({
    type: `${kind}.list`,
    labels: `${kind}_labels`,
    groups: `${kind}_label_groups`,
    links: {
      table: `${kind}_label_links`,
      item: "asset_id",
      itemsOfList: `SELECT id FROM ${kind}s WHERE board_id = ? AND list_key = ?`,
    },
  })),
];

/** The settings tables, one row per board — now per widget —, with the type that owns them. */
const SETTINGS_TABLES: { table: string; type: string }[] = [
  { table: "board_contact_settings", type: "contact.list" },
  { table: "board_product_settings", type: "product.list" },
  { table: "board_managed_device_asset_settings", type: "managed_device_asset.list" },
  ...DECLARED_ASSET_KINDS.map((kind) => ({ table: `board_${kind}_settings`, type: `${kind}.list` })),
];

/** The templates tables: one row per board and asset kind — now per widget. */
const TEMPLATE_TABLES = ["board_label_templates", "board_asset_number_templates"];

/** The indicators that count by a label group, and the groups they name. */
const LABEL_INDICATORS: Record<string, string> = {
  "project.labels": "project_label_groups",
  "task.labels": "label_groups",
  "support.labels": "support_label_groups",
};

/**
 * A table keyed by its board — or its board and kind — rebuilt keyed by its
 * board and list key, from its own columns: their types, constraints and
 * defaults pass as they are.
 */
const keyedByList = (db: Database, table: string, withKind: boolean): void => {
  const info = db.prepare(`PRAGMA table_info(${table})`).all() as {
    name: string;
    type: string;
    notnull: number;
    dflt_value: string | null;
  }[];
  const definitions = info.flatMap((c) => {
    if (c.name === "board_id") {
      return [
        "board_id INTEGER NOT NULL REFERENCES boards(id) ON DELETE CASCADE",
        "list_key TEXT NOT NULL DEFAULT ''",
      ];
    }
    return [
      `"${c.name}" ${c.type}${c.notnull ? " NOT NULL" : ""}${
        c.dflt_value === null ? "" : ` DEFAULT ${c.dflt_value}`
      }`,
    ];
  });
  const key = withKind ? "board_id, list_key, kind" : "board_id, list_key";
  db.exec(
    `CREATE TABLE ${table}_migration (${definitions.join(", ")}, PRIMARY KEY (${key}))`,
  );
  const names = info.map((c) => `"${c.name}"`).join(", ");
  db.exec(`INSERT INTO ${table}_migration (${names}) SELECT ${names} FROM ${table}`);
  db.exec(`DROP TABLE ${table}`);
  db.exec(`ALTER TABLE ${table}_migration RENAME TO ${table}`);
};

export const settingsPerList = (db: Database): void => {
  const done = db.prepare("SELECT value FROM settings WHERE key = ?").get(SETTINGS_PER_LIST);
  if (done) return;

  // A table swap needs the foreign keys off, and they cannot change inside a
  // transaction: off around it.
  db.pragma("foreign_keys = OFF");
  try {
    db.transaction(() => {
      structure(db);
      distribute(db);
      db.prepare(
        `INSERT INTO settings (key, value) VALUES (?, 'true')
         ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
      ).run(SETTINGS_PER_LIST);
    })();
  } finally {
    db.pragma("foreign_keys = ON");
  }
};

/** The columns and keys: a list key everywhere, the settings keyed by it. */
const structure = (db: Database): void => {
  const keyed = [
    "categories",
    ...LABEL_FAMILIES.flatMap((f) => [f.labels, f.groups]),
  ];
  for (const table of keyed) {
    if (tableExists(db, table) && !columns(db, table).includes("list_key")) {
      db.exec(`ALTER TABLE ${table} ADD COLUMN list_key TEXT NOT NULL DEFAULT ''`);
    }
  }
  for (const { table } of SETTINGS_TABLES) {
    if (tableExists(db, table) && !columns(db, table).includes("list_key")) {
      keyedByList(db, table, false);
    }
  }
  for (const table of TEMPLATE_TABLES) {
    if (tableExists(db, table) && !columns(db, table).includes("list_key")) {
      keyedByList(db, table, true);
    }
  }
  // The milestone types were the application's, their names unique: kept
  // aside, to be given to each "Projets" widget, then dropped.
  if (!columns(db, "milestone_types").includes("list_key")) {
    db.exec("CREATE TABLE milestone_types_global AS SELECT id, name, milestones FROM milestone_types");
    db.exec(`CREATE TABLE milestone_types_migration (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      board_id INTEGER NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
      list_key TEXT NOT NULL DEFAULT '',
      name TEXT NOT NULL COLLATE NOCASE,
      milestones TEXT NOT NULL DEFAULT '[]'
    )`);
    db.exec("DROP TABLE milestone_types");
    db.exec("ALTER TABLE milestone_types_migration RENAME TO milestone_types");
  }
};

/** What existed, given to each widget of its board. */
const distribute = (db: Database): void => {
  const widgets = db
    .prepare(
      `SELECT w.id, w.type, w.config, s.board_id FROM board_widgets w
       JOIN board_sections s ON s.id = w.section_id
       ORDER BY s.board_id, s.owner_id IS NOT NULL, s.position, s.id, w.position, w.id`,
    )
    .all() as { id: number; type: string; config: string; board_id: number }[];

  /** The list keys of a type on a board, public first, in the board's order, each once. */
  const keysOf = (boardId: number, type: string): string[] => [
    ...new Set(
      widgets
        .filter((w) => w.board_id === boardId && w.type === type)
        .map((w) => readConfig(w.config).list_key)
        .filter((k): k is string => typeof k === "string" && k !== ""),
    ),
  ];
  const boardsOf = (table: string): number[] =>
    (
      db
        .prepare(`SELECT DISTINCT board_id FROM ${table} WHERE board_id IS NOT NULL AND list_key = ''`)
        .all() as { board_id: number }[]
    ).map((r) => r.board_id);

  const setConfig = db.prepare("UPDATE board_widgets SET config = ? WHERE id = ?");
  /** Rewrites the configuration of the board's widgets of a type holding a key. */
  const rewrite = (boardId: number, type: string, list: string, change: (config: Row) => void) => {
    for (const w of widgets) {
      if (w.board_id !== boardId || w.type !== type) continue;
      const config = readConfig(w.config);
      if (config.list_key !== list) continue;
      change(config);
      w.config = JSON.stringify(config);
      setConfig.run(w.config, w.id);
    }
  };

  // The label indicators name their group by id: they also name it by its
  // name, which a widget of each source finds in its own groups.
  for (const w of widgets) {
    const groups = LABEL_INDICATORS[w.type];
    if (!groups) continue;
    const config = readConfig(w.config);
    const id = Number(config.label_group);
    if (!Number.isInteger(id) || id <= 0) continue;
    const group = db.prepare(`SELECT name FROM ${groups} WHERE id = ?`).get(id) as
      | { name: string }
      | undefined;
    if (!group) continue;
    config.label_group_name = group.name;
    w.config = JSON.stringify(config);
    setConfig.run(w.config, w.id);
  }

  for (const family of LABEL_FAMILIES) {
    if (!tableExists(db, family.labels)) continue;
    const boards = new Set([...boardsOf(family.labels), ...boardsOf(family.groups)]);
    for (const boardId of boards) {
      const [first, ...others] = keysOf(boardId, family.type);
      if (!first) continue;
      const groups = db
        .prepare(`SELECT * FROM ${family.groups} WHERE board_id = ? AND list_key = '' ORDER BY id`)
        .all(boardId) as Row[];
      const labels = db
        .prepare(`SELECT * FROM ${family.labels} WHERE board_id = ? AND list_key = '' ORDER BY id`)
        .all(boardId) as Row[];
      for (const list of others) {
        const groupIds = new Map<number, number>();
        for (const g of groups) {
          const { lastInsertRowid } = db
            .prepare(
              `INSERT INTO ${family.groups} (board_id, list_key, name, position, created_at)
               VALUES (?, ?, ?, ?, ?)`,
            )
            .run(boardId, list, g.name, g.position, g.created_at);
          groupIds.set(Number(g.id), Number(lastInsertRowid));
        }
        const labelIds = new Map<number, number>();
        for (const l of labels) {
          const { lastInsertRowid } = db
            .prepare(
              `INSERT INTO ${family.labels} (board_id, list_key, group_id, name, color, position, created_at)
               VALUES (?, ?, ?, ?, ?, ?, ?)`,
            )
            .run(
              boardId,
              list,
              l.group_id === null ? null : (groupIds.get(Number(l.group_id)) ?? null),
              l.name,
              l.color,
              l.position,
              l.created_at,
            );
          labelIds.set(Number(l.id), Number(lastInsertRowid));
        }
        // The list's items carry the copies: new ids, above every old one,
        // never taken for another's.
        if (family.links) {
          const { table, item, itemsOfList } = family.links;
          const items = (db.prepare(itemsOfList).all(boardId, list) as { id: number }[]).map(
            (r) => r.id,
          );
          const relink = db.prepare(
            `UPDATE OR IGNORE ${table} SET label_id = ? WHERE label_id = ? AND ${item} = ?`,
          );
          for (const id of items) {
            for (const [before, after] of labelIds) relink.run(after, before, id);
          }
        }
        // And the widgets holding the key, the copies of the ids they name.
        rewrite(boardId, family.type, list, (config) => {
          if (Array.isArray(config.columns)) {
            config.columns = (config.columns as Row[]).map((c) =>
              typeof c?.group === "number" && groupIds.has(c.group)
                ? { ...c, group: groupIds.get(c.group) }
                : c,
            );
          }
          if (Array.isArray(config.mailboxes)) {
            config.mailboxes = (config.mailboxes as Row[]).map((m) =>
              typeof m?.label_id === "number" && labelIds.has(m.label_id)
                ? { ...m, label_id: labelIds.get(m.label_id) }
                : m,
            );
          }
          if (Array.isArray(config.new_message_label_ids)) {
            config.new_message_label_ids = (config.new_message_label_ids as unknown[]).map((id) =>
              typeof id === "number" && labelIds.has(id) ? labelIds.get(id) : id,
            );
          }
        });
      }
      db.prepare(`UPDATE ${family.groups} SET list_key = ? WHERE board_id = ? AND list_key = ''`).run(
        first,
        boardId,
      );
      db.prepare(`UPDATE ${family.labels} SET list_key = ? WHERE board_id = ? AND list_key = ''`).run(
        first,
        boardId,
      );
    }
  }

  // The project categories, a tree: parents first.
  for (const boardId of boardsOf("categories")) {
    const [first, ...others] = keysOf(boardId, "project.list");
    if (!first) continue;
    const all = db
      .prepare("SELECT * FROM categories WHERE board_id = ? AND list_key = '' ORDER BY position, id")
      .all(boardId) as Row[];
    const ids = new Set(all.map((c) => Number(c.id)));
    const ordered: Row[] = [];
    const visit = (parent: number | null) => {
      for (const c of all) {
        const at = c.parent_id !== null && ids.has(Number(c.parent_id)) ? Number(c.parent_id) : null;
        if (at !== parent) continue;
        ordered.push(c);
        visit(Number(c.id));
      }
    };
    visit(null);
    for (const list of others) {
      const copies = new Map<number, number>();
      for (const c of ordered) {
        const parent = c.parent_id === null ? null : (copies.get(Number(c.parent_id)) ?? null);
        const { lastInsertRowid } = db
          .prepare(
            `INSERT INTO categories (board_id, list_key, name, milestones, parent_id, position)
             VALUES (?, ?, ?, ?, ?, ?)`,
          )
          .run(boardId, list, c.name, c.milestones ?? "[]", parent, c.position);
        copies.set(Number(c.id), Number(lastInsertRowid));
      }
      const move = db.prepare(
        "UPDATE projects SET category_id = ? WHERE category_id = ? AND board_id = ? AND list_key = ?",
      );
      for (const [before, after] of copies) move.run(after, before, boardId, list);
    }
    db.prepare("UPDATE categories SET list_key = ? WHERE board_id = ? AND list_key = ''").run(
      first,
      boardId,
    );
  }

  // The milestone types, the application's: a copy for each "Projets"
  // widget, and its projects carry theirs.
  if (tableExists(db, "milestone_types_global")) {
    const types = db.prepare("SELECT * FROM milestone_types_global ORDER BY id").all() as Row[];
    const boards = [...new Set(widgets.filter((w) => w.type === "project.list").map((w) => w.board_id))];
    const copies = new Map<string, Map<number, number>>();
    const insert = db.prepare(
      "INSERT INTO milestone_types (board_id, list_key, name, milestones) VALUES (?, ?, ?, ?)",
    );
    for (const boardId of boards) {
      for (const list of keysOf(boardId, "project.list")) {
        const map = new Map<number, number>();
        for (const t of types) {
          map.set(Number(t.id), Number(insert.run(boardId, list, t.name, t.milestones).lastInsertRowid));
        }
        copies.set(`${boardId}\n${list}`, map);
      }
    }
    // Read before rewriting: an old id may equal a new one.
    const carried = db
      .prepare("SELECT id, board_id, list_key, milestone_type_id FROM projects WHERE milestone_type_id IS NOT NULL")
      .all() as { id: number; board_id: number; list_key: string; milestone_type_id: number }[];
    const setType = db.prepare("UPDATE projects SET milestone_type_id = ? WHERE id = ?");
    for (const p of carried) {
      setType.run(copies.get(`${p.board_id}\n${p.list_key}`)?.get(p.milestone_type_id) ?? null, p.id);
    }
    db.exec("DROP TABLE milestone_types_global");
  }

  // The tables, one row per board: a copy for each widget of the board.
  for (const { table, type } of SETTINGS_TABLES) {
    if (!tableExists(db, table)) continue;
    const names = columns(db, table).filter((c) => c !== "list_key");
    const list = names.map((c) => `"${c}"`).join(", ");
    for (const boardId of boardsOf(table)) {
      const keys = keysOf(boardId, type);
      if (keys.length === 0) continue;
      for (const key of keys) {
        db.prepare(
          `INSERT OR IGNORE INTO ${table} (${list}, list_key)
           SELECT ${list}, ? FROM ${table} WHERE board_id = ? AND list_key = ''`,
        ).run(key, boardId);
      }
      db.prepare(`DELETE FROM ${table} WHERE board_id = ? AND list_key = ''`).run(boardId);
    }
  }
  for (const table of TEMPLATE_TABLES) {
    if (!tableExists(db, table)) continue;
    const rows = db.prepare(`SELECT * FROM ${table} WHERE list_key = ''`).all() as Row[];
    for (const row of rows) {
      const keys = keysOf(Number(row.board_id), `${String(row.kind)}.list`);
      if (keys.length === 0) continue;
      for (const key of keys) {
        db.prepare(
          `INSERT OR IGNORE INTO ${table} (board_id, list_key, kind, templates) VALUES (?, ?, ?, ?)`,
        ).run(row.board_id, key, row.kind, row.templates);
      }
      db.prepare(`DELETE FROM ${table} WHERE board_id = ? AND kind = ? AND list_key = ''`).run(
        row.board_id,
        row.kind,
      );
    }
  }
};

/** Set once the counting widgets name the widgets they read by their keys. */
const SOURCES_BY_KEY = "sources_by_key";

/**
 * A counting widget — an indicator, a chart — followed one widget of its
 * board, by its id ("source"), or all of them without one. It now names the
 * widgets it reads by their keys (shared, SOURCES), on any board: the one it
 * followed, or every one of its board it read.
 */
export const sourcesByKey = (db: Database): void => {
  if (db.prepare("SELECT value FROM settings WHERE key = ?").get(SOURCES_BY_KEY)) return;
  const widgets = db
    .prepare(
      `SELECT w.id, w.type, w.config, s.board_id FROM board_widgets w
       JOIN board_sections s ON s.id = w.section_id
       ORDER BY s.board_id, s.position, s.id, w.position, w.id`,
    )
    .all() as { id: number; type: string; config: string; board_id: number }[];
  const setConfig = db.prepare("UPDATE board_widgets SET config = ? WHERE id = ?");
  db.transaction(() => {
    for (const w of widgets) {
      const config = readConfig(w.config);
      const type = sourceTypeOf(w.type, config);
      if (!type || Array.isArray(config[SOURCES])) continue;
      const read = widgets.filter((o) => o.board_id === w.board_id && o.type === type);
      const followed = read.find((o) => o.id === Number(config.source));
      const keys = (followed ? [followed] : read)
        .map((o) => ownKeyOf(o.type, readConfig(o.config)))
        .filter((k) => k !== "");
      delete config.source;
      config[SOURCES] = [...new Set(keys)];
      setConfig.run(JSON.stringify(config), w.id);
    }
    db.prepare(
      `INSERT INTO settings (key, value) VALUES (?, 'true')
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    ).run(SOURCES_BY_KEY);
  })();
};
