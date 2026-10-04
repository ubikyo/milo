// Catch-up migrations for databases created before this or that addition.
// Each one is recognized by a missing column or table, and does nothing on a
// new database: the schema has already created it complete.
//
// None runs twice, and none is ever removed: a production database can be of
// any age.

import type { Database } from "better-sqlite3";
import {
  QUERY_PARAMS,
  SUPPORT_CHANNEL_LABELS,
  SUPPORT_NEW_MESSAGE_DUE_DAYS,
  SUPPORT_NEW_MESSAGE_LABELS,
  SUPPORT_URGENCY_LABELS,
  migrateSupportTemplate,
  migrateWidgetConfig,
  panelType,
  validWidgetRights,
  widgetRightsEverywhere,
} from "@milo/shared";
import { parisTime } from "../lib/time.js";

/** The milestones all projects shared before they followed the category. */
const HISTORICAL_MILESTONES = [
  { value: 10, label: "Étude" },
  { value: 20, label: "Devis" },
  { value: 30, label: "Commande" },
  { value: 50, label: "Déploiement" },
  { value: 80, label: "Tests" },
];

interface ColumnInfo {
  name: string;
}

const columns = (db: Database, table: string): string[] =>
  (db.prepare(`PRAGMA table_info(${table})`).all() as ColumnInfo[]).map((c) => c.name);

/** Foreign keys are suspended for the duration of a table swap. */
const withoutForeignKeys = (db: Database, action: () => void): void => {
  db.pragma("foreign_keys = OFF");
  try {
    action();
  } finally {
    db.pragma("foreign_keys = ON");
  }
};

/**
 * Indicators without a section — stored before the statistics panels had any,
 * or coming back from a backup of that time — go together into a first
 * automatic-width section, keeping their order: without it, the panel would no
 * longer show them. Reapplied after a backup restore, like the Administrateur
 * role.
 */
export const attachIndicators = (db: Database): void => {
  for (const [table, panel] of [
    ["support_indicators", "support"],
    ["asset_indicators", "assets"],
  ] as const) {
    if (!db.prepare(`SELECT 1 FROM ${table} WHERE section_id IS NULL`).get()) continue;
    db.transaction(() => {
      const { lastInsertRowid } = db
        .prepare(
          `INSERT INTO indicator_sections (panel, position, created_at)
           VALUES (?, (SELECT COALESCE(MIN(position), 0) - 1 FROM indicator_sections WHERE panel = ?), ?)`,
        )
        .run(panel, panel, new Date().toISOString());
      db.prepare(`UPDATE ${table} SET section_id = ? WHERE section_id IS NULL`).run(
        lastInsertRowid,
      );
    })();
  }
};

/** Set once the projects' and cards' references have been given by the shared counter. */
const SHARED_REFERENCES = "shared_references";
/** The references counter (repositories/references.ts). */
const REFERENCE_COUNTER = "support_ticket_counter";

const readSetting = (db: Database, key: string): unknown => {
  const row = db.prepare("SELECT value FROM settings WHERE key = ?").get(key) as
    { value: string } | undefined;
  try {
    return row ? JSON.parse(row.value) : undefined;
  } catch {
    return undefined;
  }
};

const writeSetting = (db: Database, key: string, value: unknown): void => {
  db.prepare(
    `INSERT INTO settings (key, value) VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
  ).run(key, JSON.stringify(value));
};

/**
 * Projects and cards receive their "HLP-" reference from the tickets counter.
 * Those from before the shared counter — cards were then numbered per board,
 * projects not at all — are renumbered once, in creation order, following the
 * last ticket. Afterwards, only what has no reference gets one: a project
 * placed by the demo database. Reapplied after a backup restore, like the
 * Administrateur role: a backup from before the shared counter gets
 * renumbered.
 */
export const numberReferences = (db: Database): void => {
  const common = readSetting(db, SHARED_REFERENCES) === true;
  const withoutReference = common ? "number = 0" : "1";
  const items = db
    .prepare(
      `SELECT 'project' AS kind, id, created_at FROM projects WHERE ${withoutReference}
       UNION ALL
       SELECT 'card' AS kind, id, created_at FROM task_cards WHERE kind = 'card' AND ${withoutReference}
       ORDER BY created_at, id`,
    )
    .all() as { kind: "project" | "card"; id: number }[];
  if (common && items.length === 0) return;

  db.transaction(() => {
    const counter = readSetting(db, REFERENCE_COUNTER);
    const { max } = db
      .prepare(
        common
          ? `SELECT MAX(
               (SELECT COALESCE(MAX(number), 0) FROM support_requests),
               (SELECT COALESCE(MAX(number), 0) FROM projects),
               (SELECT COALESCE(MAX(number), 0) FROM task_cards)
             ) AS max`
          : "SELECT COALESCE(MAX(number), 0) AS max FROM support_requests",
      )
      .get() as { max: number };
    let phoneNumber = Math.max(typeof counter === "number" ? counter : 0, max);
    const project = db.prepare("UPDATE projects SET number = ? WHERE id = ?");
    const card = db.prepare("UPDATE task_cards SET number = ? WHERE id = ?");
    for (const { kind, id } of items) {
      phoneNumber += 1;
      (kind === "project" ? project : card).run(phoneNumber, id);
    }
    // A separator carries no reference.
    if (!common) db.exec("UPDATE task_cards SET number = 0 WHERE kind = 'separator'");
    writeSetting(db, REFERENCE_COUNTER, phoneNumber);
    writeSetting(db, SHARED_REFERENCES, true);
  })();
};

/**
 * The Project and Task modes used to show their list by default: moved to
 * sections, they receive a first one, which carries the list, so as not to
 * open empty. Set once — the setting remembers it: a panel that was emptied on
 * purpose stays empty. Reapplied after a restore of a backup from before the
 * sections of these modes.
 */
export const setDefaultSections = (db: Database): void => {
  for (const [table, panel] of [
    ["project_indicators", "projects"],
    ["task_indicators", "tasks"],
  ] as const) {
    const key = `${panel}_sections_seeded`;
    if (readSetting(db, key) === true) continue;
    db.transaction(() => {
      if (!db.prepare("SELECT 1 FROM indicator_sections WHERE panel = ?").get(panel)) {
        const currentTime = new Date().toISOString();
        const { lastInsertRowid } = db
          .prepare("INSERT INTO indicator_sections (panel, position, created_at) VALUES (?, 0, ?)")
          .run(panel, currentTime);
        db.prepare(
          `INSERT INTO ${table} (section_id, type, config, position, created_at)
           VALUES (?, 'list', '{}', 0, ?)`,
        ).run(lastInsertRowid, currentTime);
      }
      writeSetting(db, key, true);
    })();
  }
};

/**
 * The catch-up migrations, then the switch to views. A database that already
 * knows views — new, or already converted — has nothing left to catch up: the
 * earlier catch-ups talk about tables it no longer has.
 */
export const migrate = (db: Database): void => {
  // First of all: the catch-up markers take their English name, which each
  // of them now looks for.
  renameSettingKeys(db);
  // Then the access that follows is placed in the first workspace.
  workspaces(db);
  if (!columns(db, "boards").includes("view_id")) catchUpBeforeViews(db);
  // Accounts from before the opening view: the conversion derives it from their mode.
  if (!columns(db, "users").includes("default_view")) {
    db.exec("ALTER TABLE users ADD COLUMN default_view TEXT NOT NULL DEFAULT ''");
  }
  viewsAndBoards(db);
  splitSettings(db);
  permissionsByWidgetType(db);
  contexts(db);
  listsPerWidget(db);
  optionalContexts(db);
  confirmedMailboxes(db);
  // One request per list that receives the mailbox: the email's uniqueness
  // moves to the list (idx_support_requests_mailbox_list, schema.ts).
  db.exec("DROP INDEX IF EXISTS idx_support_requests_mailbox");
  // Confirmation goes through the code alone: the link's token goes away.
  if (columns(db, "list_mailbox_optins").includes("token")) {
    db.exec("ALTER TABLE list_mailbox_optins DROP COLUMN token");
  }
  // After all the access catch-ups: they may have set a Settings right.
  workspaceManagement(db);
  globalAdministration(db);
  withoutUptimeWith365(db);
  sortedCategories(db);
  // Cards created before the period, the recurrence and the due-date reminder.
  const cardColumns = columns(db, "task_cards");
  for (const column of ["start_date", "recurrence", "reminder", "reminded_for"]) {
    if (!cardColumns.includes(column)) {
      db.exec(`ALTER TABLE task_cards ADD COLUMN ${column} TEXT NOT NULL DEFAULT ''`);
    }
  }
  // Attachments from before their order: the most recent stays first.
  if (!columns(db, "card_attachments").includes("position")) {
    db.exec("ALTER TABLE card_attachments ADD COLUMN position INTEGER NOT NULL DEFAULT 0");
    db.exec("UPDATE card_attachments SET position = -id");
  }
  if (!cardColumns.includes("overdue_for")) {
    db.exec("ALTER TABLE task_cards ADD COLUMN overdue_for TEXT NOT NULL DEFAULT ''");
  }
  if (!columns(db, "checklist_items").includes("overdue_for")) {
    db.exec("ALTER TABLE checklist_items ADD COLUMN overdue_for TEXT NOT NULL DEFAULT ''");
  }
  if (!cardColumns.includes("due_form")) {
    db.exec("ALTER TABLE task_cards ADD COLUMN due_form TEXT NOT NULL DEFAULT 'date'");
    // A due date that had a start was a period.
    db.exec("UPDATE task_cards SET due_form = 'period' WHERE start_date != ''");
  }
  if (!cardColumns.includes("cover_interval")) {
    db.exec("ALTER TABLE task_cards ADD COLUMN cover_interval INTEGER NOT NULL DEFAULT 0");
  }
  // Covers from before their name and size.
  const coverColumns = columns(db, "card_covers");
  if (coverColumns.length > 0 && !coverColumns.includes("name")) {
    db.exec("ALTER TABLE card_covers ADD COLUMN name TEXT NOT NULL DEFAULT ''");
    db.exec("ALTER TABLE card_covers ADD COLUMN size INTEGER NOT NULL DEFAULT 0");
  }
  // Views without a workspace — those from before workspaces, those a new
  // database has just received (viewsAndBoards) — go into the first one.
  db.prepare("UPDATE views SET workspace_id = ? WHERE workspace_id IS NULL").run(
    firstWorkspace(db),
  );
  // The follows index, renamed (idx_follows_target, schema.ts).
  db.exec("DROP INDEX IF EXISTS idx_follows_cible");
  // Last: values stored in French, translated once the earlier catch-ups,
  // which read them, have run.
  englishValues(db);
};

/**
 * Categories get ordered: from before their position, they take within each
 * board the order of their name, the one they had on screen.
 */
const sortedCategories = (db: Database): void => {
  if (columns(db, "categories").includes("position")) return;
  db.transaction(() => {
    db.exec("ALTER TABLE categories ADD COLUMN position INTEGER NOT NULL DEFAULT 0");
    db.exec(`
      UPDATE categories SET position = (
        SELECT COUNT(*) FROM categories AS earlier
        WHERE earlier.board_id = categories.board_id
          AND (earlier.name < categories.name COLLATE NOCASE
            OR (earlier.name = categories.name COLLATE NOCASE AND earlier.id < categories.id))
      )
    `);
  })();
};

/** The name of the workspace a database receives when it has none. */
const STARTING_WORKSPACE = "Milo";

/** The first workspace, created if there is none: there is always one. */
export const firstWorkspace = (db: Database): number => {
  const row = db.prepare("SELECT id FROM workspaces ORDER BY position, id LIMIT 1").get() as
    | { id: number }
    | undefined;
  if (row) return row.id;
  return Number(
    db
      .prepare("INSERT INTO workspaces (name, position, created_at) VALUES (?, 0, ?)")
      .run(STARTING_WORKSPACE, new Date().toISOString()).lastInsertRowid,
  );
};

/** Set once workspace management has been given to whoever edited Settings. */
const WORKSPACE_MANAGEMENT = "workspace_management";

/**
 * Whoever edited Settings before workspaces manages them straight away:
 * otherwise only the "admin" account could create them and give out their
 * management.
 */
const workspaceManagement = (db: Database): void => {
  if (readSetting(db, WORKSPACE_MANAGEMENT)) return;
  db.exec("UPDATE principal_permissions SET workspaces = 'update' WHERE settings = 'update'");
  writeSetting(db, WORKSPACE_MANAGEMENT, true);
};

/** Set once administration has moved out of the workspaces' access. */
const GLOBAL_ADMINISTRATION = "global_administration";

/**
 * Settings and workspace management apply to the whole application: they
 * leave the workspaces' access for administration (principal_admin). Each
 * keeps the broadest of what they had here or there. Access that no longer
 * reads any widget type is deleted: it only opened the workspace through
 * Settings.
 */
const globalAdministration = (db: Database): void => {
  if (readSetting(db, GLOBAL_ADMINISTRATION)) return;
  db.transaction(() => {
    db.exec(
      `INSERT OR REPLACE INTO principal_admin
         (principal_type, principal_id, principal_name, principal_email, settings, workspaces)
       SELECT principal_type, principal_id, MAX(principal_name), MAX(principal_email),
              CASE MAX(CASE settings WHEN 'update' THEN 2 WHEN 'view' THEN 1 ELSE 0 END)
                WHEN 2 THEN 'update' WHEN 1 THEN 'view' ELSE '' END,
              MAX(workspaces)
         FROM principal_permissions
        WHERE settings != '' OR workspaces != ''
        GROUP BY principal_type, principal_id`,
    );
    db.exec("UPDATE principal_permissions SET settings = '', workspaces = ''");
    const rows = db.prepare("SELECT rowid, widgets FROM principal_permissions").all() as {
      rowid: number;
      widgets: string;
    }[];
    const forget = db.prepare("DELETE FROM principal_permissions WHERE rowid = ?");
    for (const { rowid, widgets } of rows) {
      let readValue: unknown = {};
      try {
        readValue = JSON.parse(widgets);
      } catch {
        // Unreadable: granted nothing.
      }
      if (!Object.values(validWidgetRights(readValue)).some((access) => access !== "")) forget.run(rowid);
    }
    writeSetting(db, GLOBAL_ADMINISTRATION, true);
  })();
};

/** Set once Uptime has been removed and the "365" type granted. */
const WITHOUT_UPTIME_WITH_365 = "uptime_removed_m365_added";

/**
 * The Uptime widget goes away, with the machines it checked — and the
 * "Télémétrie" type, which was only its own. Calendar and mail move from the
 * "Commun" type to the "365" type: each receives there the permission it had
 * on "Commun", so as to lose neither.
 */
const withoutUptimeWith365 = (db: Database): void => {
  if (readSetting(db, WITHOUT_UPTIME_WITH_365)) return;
  db.transaction(() => {
    db.exec("DELETE FROM board_widgets WHERE type = 'uptime'");
    db.exec("DROP TABLE IF EXISTS access_uptime");
    const rows = db.prepare("SELECT rowid, widgets FROM principal_permissions").all() as {
      rowid: number;
      widgets: string;
    }[];
    const write = db.prepare("UPDATE principal_permissions SET widgets = ? WHERE rowid = ?");
    for (const { rowid, widgets } of rows) {
      let readValue: Record<string, unknown> = {};
      try {
        const raw = JSON.parse(widgets) as unknown;
        if (raw && typeof raw === "object") readValue = raw as Record<string, unknown>;
      } catch {
        // Unreadable: granted nothing, and still grants nothing.
      }
      const { telemetry: _telemetry, ...rest } = readValue;
      write.run(JSON.stringify({ ...rest, m365: rest["m365"] ?? rest["common"] ?? "" }), rowid);
    }
    writeSetting(db, WITHOUT_UPTIME_WITH_365, true);
  })();
};

/** The first workspace, in a query: where the access from before workspaces is placed. */
const FIRST_WORKSPACE = "(SELECT id FROM workspaces ORDER BY position, id LIMIT 1)";

/**
 * Workspaces: views and accounts receive one, and access moves workspace by
 * workspace. Those from before go into the first one, created for the
 * occasion — views, for their part, at the end of the catch-ups (migrate).
 */
const workspaces = (db: Database): void => {
  if (!columns(db, "views").includes("workspace_id")) {
    db.exec(
      "ALTER TABLE views ADD COLUMN workspace_id INTEGER REFERENCES workspaces(id) ON DELETE CASCADE",
    );
  }
  if (!columns(db, "users").includes("workspace_id")) {
    db.exec(
      "ALTER TABLE users ADD COLUMN workspace_id INTEGER REFERENCES workspaces(id) ON DELETE SET NULL",
    );
  }
  const first = firstWorkspace(db);
  if (!columns(db, "principal_permissions").includes("workspace_id")) {
    withoutForeignKeys(db, () =>
      db.transaction(() =>
        rebuildTable(
          db,
          "principal_permissions",
          (sql) =>
            sql.replace(
              /PRIMARY KEY\s*\(\s*principal_type\s*,\s*principal_id\s*\)/,
              `workspace_id INTEGER NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    workspaces TEXT NOT NULL DEFAULT '' CHECK (workspaces IN ('', 'update')),
    PRIMARY KEY (workspace_id, principal_type, principal_id)`,
            ),
          { workspace_id: String(first) },
        ),
      )(),
    );
  }
};

/** The catch-ups for databases from before views, in the order they came. */
const catchUpBeforeViews = (db: Database): void => {
  // Databases from before Entra: accounts keep their row — they are actors,
  // authors, members — and attach to it by their email on their first
  // Microsoft sign-in. Their passwords are no longer used.
  const accountColumns = columns(db, "users");
  if (accountColumns.length > 0 && !accountColumns.includes("entra_id")) {
    db.exec("ALTER TABLE users ADD COLUMN entra_id TEXT NOT NULL DEFAULT ''");
    db.exec("ALTER TABLE users ADD COLUMN entra_groups TEXT NOT NULL DEFAULT '[]'");
    db.exec("ALTER TABLE users ADD COLUMN system INTEGER NOT NULL DEFAULT 0");
    db.exec("UPDATE users SET password_hash = ''");
    db.exec("DELETE FROM sessions");
  }
  // Per-account roles preceded those per Entra user or group.
  db.exec("DROP TABLE IF EXISTS user_company_roles");

  // Databases from before company support: its email address and its site.
  const companyColumns = columns(db, "companies");
  if (!companyColumns.includes("support_email")) {
    db.exec("ALTER TABLE companies ADD COLUMN support_email TEXT NOT NULL DEFAULT ''");
  }
  if (!companyColumns.includes("support_url")) {
    db.exec("ALTER TABLE companies ADD COLUMN support_url TEXT NOT NULL DEFAULT ''");
  }

  // Databases created before companies were added: the missing column is added.
  const projectColumns = columns(db, "projects");
  if (!projectColumns.includes("company_id")) {
    db.exec("ALTER TABLE projects ADD COLUMN company_id INTEGER REFERENCES companies(id)");
  }

  // Databases created before the first name / last name split: the columns are
  // added and the existing name is split at the first space.
  const userColumns = columns(db, "users");
  if (userColumns.length > 0 && !userColumns.includes("first_name")) {
    db.exec("ALTER TABLE users ADD COLUMN first_name TEXT NOT NULL DEFAULT ''");
    db.exec("ALTER TABLE users ADD COLUMN last_name TEXT NOT NULL DEFAULT ''");

    db.transaction(() => {
      const update = db.prepare("UPDATE users SET first_name = ?, last_name = ? WHERE id = ?");
      const rows = db.prepare("SELECT id, name FROM users").all() as {
        id: number;
        name: string;
      }[];
      for (const user of rows) {
        const parts = String(user.name ?? "").trim().split(/\s+/).filter(Boolean);
        update.run(parts[0] ?? "", parts.slice(1).join(" "), user.id);
      }
    })();
  }

  // Accounts created before the choice of an opening mode: they open on
  // projects, as before.
  if (userColumns.length > 0 && !userColumns.includes("default_mode")) {
    db.exec("ALTER TABLE users ADD COLUMN default_mode TEXT NOT NULL DEFAULT 'projects'");
  }

  // Accounts from before the list became a section widget: the statistics
  // panel was shown or hidden only through them. There is no separate panel
  // anymore, so the setting goes away.
  for (const column of ["support_stats", "asset_stats"]) {
    if (columns(db, "users").includes(column)) {
      db.exec(`ALTER TABLE users DROP COLUMN ${column}`);
    }
  }

  // Sessions opened before they expired: they were valid only through their
  // presence in the database, indefinitely. They are given an end date,
  // counted from now rather than from their creation — otherwise all current
  // sessions would close at once on restart.
  const sessionColumns = columns(db, "sessions");
  if (sessionColumns.length > 0 && !sessionColumns.includes("expires_at")) {
    db.exec("ALTER TABLE sessions ADD COLUMN last_seen_at TEXT NOT NULL DEFAULT ''");
    db.exec("ALTER TABLE sessions ADD COLUMN expires_at TEXT NOT NULL DEFAULT ''");
  }

  const listColumns = columns(db, "task_lists");
  // A database from before boards: its lists still hang from a company.
  // The catch-ups that follow concern only it, never a new database.
  const listsBeforeBoards = listColumns.length > 0 && !listColumns.includes("board_id");

  // Lists created before being attached to a company: they are assigned to
  // the first known company. This column then gives way to "board_id" (next
  // migration), but the catch-up is still needed to get through it.
  if (listsBeforeBoards && !listColumns.includes("company_id")) {
    db.exec(
      "ALTER TABLE task_lists ADD COLUMN company_id INTEGER REFERENCES companies(id) ON DELETE CASCADE",
    );
    const first = db.prepare("SELECT id FROM companies ORDER BY id LIMIT 1").get() as
      { id: number } | undefined;
    if (first) {
      db.prepare("UPDATE task_lists SET company_id = ? WHERE company_id IS NULL").run(first.id);
    }
  }

  // Lists created before the choice of a color: no color, hence empty.
  if (listsBeforeBoards && !listColumns.includes("color")) {
    db.exec("ALTER TABLE task_lists ADD COLUMN color TEXT NOT NULL DEFAULT ''");
  }

  // Lists attached directly to a company, before boards arrived: each company
  // that had lists receives a board that collects them. SQLite cannot drop
  // "company_id" (it carries a foreign key): the table is rebuilt, keeping the
  // identifiers so that cards stay attached to their list.
  if (listsBeforeBoards) {
    const migrateItem = db.transaction(() => {
      db.exec(`
        CREATE TABLE task_lists_migration (
          id INTEGER PRIMARY KEY,
          board_id INTEGER NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
          name TEXT NOT NULL,
          position INTEGER NOT NULL DEFAULT 0,
          color TEXT NOT NULL DEFAULT '',
          created_at TEXT NOT NULL
        );
      `);

      const createBoard = db.prepare(
        "INSERT INTO boards (company_id, name, position, created_at) VALUES (?, 'Tableau', 0, ?)",
      );
      const copyOver = db.prepare(
        `INSERT INTO task_lists_migration (id, board_id, name, position, color, created_at)
         SELECT id, ?, name, position, color, created_at
         FROM task_lists WHERE company_id IS ?`,
      );

      // A list without a company (company deleted along the way) has no
      // natural board: it joins the first company's rather than disappearing
      // with its cards.
      const fallback = db.prepare("SELECT id FROM companies ORDER BY id LIMIT 1").get() as
        { id: number } | undefined;
      const companies = (
        db.prepare("SELECT DISTINCT company_id FROM task_lists").all() as {
          company_id: number | null;
        }[]
      ).map(({ company_id }) => company_id);

      for (const company of companies) {
        const owner = company ?? fallback?.id;
        if (!owner) continue;
        const { lastInsertRowid } = createBoard.run(owner, new Date().toISOString());
        copyOver.run(lastInsertRowid, company);
      }

      db.exec("DROP TABLE task_lists");
      db.exec("ALTER TABLE task_lists_migration RENAME TO task_lists");
    });

    withoutForeignKeys(db, migrateItem);
  }

  // Databases created before project boards: categories were global and
  // unique by name. A first board collects them, along with the existing
  // projects. SQLite cannot drop the UNIQUE constraint on the name: the table
  // is rebuilt, keeping the identifiers so that projects stay attached to
  // their category.
  const categoryColumns = columns(db, "categories");
  if (categoryColumns.length > 0 && !categoryColumns.includes("board_id")) {
    const migrateItem = db.transaction(() => {
      const { lastInsertRowid: board } = db
        .prepare("INSERT INTO project_boards (name, position, created_at) VALUES (?, 0, ?)")
        .run("Tableau", new Date().toISOString());

      db.exec(`
        CREATE TABLE categories_migration (
          id INTEGER PRIMARY KEY,
          board_id INTEGER NOT NULL REFERENCES project_boards(id) ON DELETE CASCADE,
          name TEXT NOT NULL,
          UNIQUE (board_id, name)
        );
      `);
      db.prepare(
        "INSERT INTO categories_migration (id, board_id, name) SELECT id, ?, name FROM categories",
      ).run(board);
      db.exec("DROP TABLE categories");
      db.exec("ALTER TABLE categories_migration RENAME TO categories");

      if (!columns(db, "projects").includes("board_id")) {
        db.exec(
          "ALTER TABLE projects ADD COLUMN board_id INTEGER REFERENCES project_boards(id) ON DELETE CASCADE",
        );
      }
      db.prepare("UPDATE projects SET board_id = ? WHERE board_id IS NULL").run(board);
    });

    withoutForeignKeys(db, migrateItem);
  }

  // Comments written before their author was recorded: the column is added
  // empty, these comments will remain without a known author.
  const commentColumns = columns(db, "comments");
  if (commentColumns.length > 0 && !commentColumns.includes("user_id")) {
    db.exec(
      "ALTER TABLE comments ADD COLUMN user_id INTEGER REFERENCES users(id) ON DELETE SET NULL",
    );
  }

  // Cards created before their numbering: each board is numbered separately,
  // in the creation order of its cards.
  const cardColumns = columns(db, "task_cards");
  if (cardColumns.length > 0 && !cardColumns.includes("number")) {
    db.exec("ALTER TABLE task_cards ADD COLUMN number INTEGER NOT NULL DEFAULT 0");

    db.transaction(() => {
      const update = db.prepare("UPDATE task_cards SET number = ? WHERE id = ?");
      const byBoard = db.prepare(
        `SELECT task_cards.id
         FROM task_cards
         JOIN task_lists ON task_lists.id = task_cards.list_id
         WHERE task_lists.board_id = ?
         ORDER BY task_cards.id`,
      );
      for (const { id } of db.prepare("SELECT id FROM boards").all() as {
        id: number;
      }[]) {
        (byBoard.all(id) as { id: number }[]).forEach((card, index) =>
          update.run(index + 1, card.id),
        );
      }
    })();
  }

  // Cards created before separators: they are all cards.
  if (cardColumns.length > 0 && !cardColumns.includes("kind")) {
    db.exec("ALTER TABLE task_cards ADD COLUMN kind TEXT NOT NULL DEFAULT 'card'");
  }

  // Threads opened before the application's own notes were distinguished: we
  // find those that logged a creation by their text, written by us alone.
  for (const table of ["comments", "card_comments"]) {
    const columnNames = columns(db, table);
    if (columnNames.length > 0 && !columnNames.includes("system")) {
      db.exec(`ALTER TABLE ${table} ADD COLUMN system INTEGER NOT NULL DEFAULT 0`);
      db.prepare(
        `UPDATE ${table} SET system = 1
         WHERE text LIKE 'Carte créée le %' OR text LIKE 'Projet créé le %'`,
      ).run();
    }
  }

  // Boards created before the card number setting: they show it.
  const boardColumns = columns(db, "boards");
  if (boardColumns.length > 0 && !boardColumns.includes("show_card_numbers")) {
    db.exec("ALTER TABLE boards ADD COLUMN show_card_numbers INTEGER NOT NULL DEFAULT 1");
  }

  // Boards created before the "Privé" option: they stay visible to all, and
  // without a known author — the first to close one becomes its author.
  if (boardColumns.length > 0 && !boardColumns.includes("owner_id")) {
    db.exec(
      "ALTER TABLE boards ADD COLUMN owner_id INTEGER REFERENCES users(id) ON DELETE SET NULL",
    );
  }
  if (boardColumns.length > 0 && !boardColumns.includes("is_private")) {
    db.exec("ALTER TABLE boards ADD COLUMN is_private INTEGER NOT NULL DEFAULT 0");
  }

  // Boards created before the "Verrouillé" option: their lists stay free.
  if (boardColumns.length > 0 && !boardColumns.includes("is_locked")) {
    db.exec("ALTER TABLE boards ADD COLUMN is_locked INTEGER NOT NULL DEFAULT 0");
  }

  // Project boards created before the "Privé" option: same rule as for the
  // task ones — open to all, without a known author.
  const projectBoardColumns = columns(db, "project_boards");
  if (projectBoardColumns.length > 0 && !projectBoardColumns.includes("owner_id")) {
    db.exec(
      "ALTER TABLE project_boards ADD COLUMN owner_id INTEGER REFERENCES users(id) ON DELETE SET NULL",
    );
  }
  if (projectBoardColumns.length > 0 && !projectBoardColumns.includes("is_private")) {
    db.exec("ALTER TABLE project_boards ADD COLUMN is_private INTEGER NOT NULL DEFAULT 0");
  }

  // Cards created before their detail page: they have no description yet.
  if (cardColumns.length > 0 && !cardColumns.includes("description")) {
    db.exec("ALTER TABLE task_cards ADD COLUMN description TEXT NOT NULL DEFAULT ''");
  }

  // Cards created before the due date: they carry none.
  if (cardColumns.length > 0 && !cardColumns.includes("due_date")) {
    db.exec("ALTER TABLE task_cards ADD COLUMN due_date TEXT NOT NULL DEFAULT ''");
  }

  // Access categories created before the lock: they stay open.
  const accessCategoryColumns = columns(db, "access_categories");
  if (accessCategoryColumns.length > 0 && !accessCategoryColumns.includes("is_locked")) {
    db.exec("ALTER TABLE access_categories ADD COLUMN is_locked INTEGER NOT NULL DEFAULT 0");
  }

  // Sections created when they still carried a name: the width alone defines
  // them now, the column goes away.
  const accessSectionColumns = columns(db, "access_sections");
  if (accessSectionColumns.includes("name")) {
    db.exec("ALTER TABLE access_sections DROP COLUMN name");
  }

  // Sections from before each one's own gap: they take the one their category
  // set for all its columns, if there was one, and the category no longer
  // carries it.
  if (accessSectionColumns.length > 0 && !accessSectionColumns.includes("gap")) {
    db.exec("ALTER TABLE access_sections ADD COLUMN gap INTEGER NOT NULL DEFAULT 20");
    if (accessCategoryColumns.includes("gap")) {
      db.exec(
        `UPDATE access_sections
         SET gap = (SELECT gap FROM access_categories WHERE id = access_sections.category_id)`,
      );
    }
  }
  if (accessCategoryColumns.includes("gap")) {
    db.exec("ALTER TABLE access_categories DROP COLUMN gap");
  }

  // Tickets created when they had only one actor: it moves into the actors
  // table, and the column goes away. SQLite refuses to drop a column that is
  // indexed or cited by a foreign key: the index is dropped first, and the
  // foreign keys are suspended for the duration of the removal.
  if (columns(db, "support_requests").includes("actor_id")) {
    db.exec(
      `INSERT OR IGNORE INTO support_request_actors (request_id, user_id)
       SELECT id, actor_id FROM support_requests WHERE actor_id IS NOT NULL`,
    );
    withoutForeignKeys(db, () => {
      db.exec("DROP INDEX IF EXISTS idx_support_requests_actor");
      db.exec("ALTER TABLE support_requests DROP COLUMN actor_id");
    });
  }

  // Requests from before email import: no subject, no sender, no "Ouvert"
  // status. SQLite cannot modify a CHECK constraint: the table is rebuilt,
  // keeping the identifiers so that actors, labels and threads stay attached
  // to their request.
  if (!columns(db, "support_requests").includes("mail_id")) {
    withoutForeignKeys(
      db,
      db.transaction(() => {
        db.exec(`
          CREATE TABLE support_requests_migration (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
            subject TEXT NOT NULL DEFAULT '',
            status TEXT NOT NULL DEFAULT 'open'
              CHECK (status IN ('open', 'unresolved', 'pending', 'resolved', 'closed')),
            due_date TEXT NOT NULL DEFAULT '',
            sender_name TEXT NOT NULL DEFAULT '',
            sender_email TEXT NOT NULL DEFAULT '',
            mail_id TEXT NOT NULL DEFAULT '',
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
          );
          INSERT INTO support_requests_migration (id, company_id, status, due_date, created_at, updated_at)
            SELECT id, company_id, status, due_date, created_at, updated_at FROM support_requests;
          DROP TABLE support_requests;
          ALTER TABLE support_requests_migration RENAME TO support_requests;
        `);
      }),
    );
  }
  // Requests from before ticket numbers: they are numbered in the order they
  // arrived, and the counter restarts from the last one.
  if (!columns(db, "support_requests").includes("number")) {
    db.transaction(() => {
      db.exec("ALTER TABLE support_requests ADD COLUMN number INTEGER NOT NULL DEFAULT 0");
      const requests = db
        .prepare("SELECT id FROM support_requests ORDER BY created_at, id")
        .all() as { id: number }[];
      const numberItems = db.prepare("UPDATE support_requests SET number = ? WHERE id = ?");
      requests.forEach(({ id }, i) => numberItems.run(i + 1, id));
      db.prepare(
        `INSERT INTO settings (key, value) VALUES ('support_ticket_counter', ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
      ).run(String(requests.length));
    })();
  }
  // Support labels from before they were pooled: each company had its own.
  // Those with the same name become one — the oldest, which takes over the
  // others' requests —, and the table loses its company column. SQLite cannot
  // drop a column cited by a foreign key: the table is rebuilt, identifiers
  // kept.
  if (columns(db, "support_labels").includes("company_id")) {
    withoutForeignKeys(
      db,
      db.transaction(() => {
        const labels = db
          .prepare("SELECT id, name FROM support_labels ORDER BY company_id, position, id")
          .all() as { id: number; name: string }[];
        const keptByKey = new Map<string, number>();
        const copyOver = db.prepare(
          `INSERT OR IGNORE INTO support_request_labels (request_id, label_id)
           SELECT request_id, ? FROM support_request_labels WHERE label_id = ?`,
        );
        const forget = db.prepare("DELETE FROM support_request_labels WHERE label_id = ?");
        const remove = db.prepare("DELETE FROM support_labels WHERE id = ?");
        for (const { id, name } of labels) {
          const key = name.trim().toLowerCase();
          const already = keptByKey.get(key);
          if (already === undefined) {
            keptByKey.set(key, id);
            continue;
          }
          copyOver.run(already, id);
          forget.run(id);
          remove.run(id);
        }
        db.exec(`
          DROP INDEX IF EXISTS idx_support_labels_company;
          CREATE TABLE support_labels_migration (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            color TEXT NOT NULL DEFAULT 'blue.6',
            position INTEGER NOT NULL DEFAULT 0,
            created_at TEXT NOT NULL
          );
          INSERT INTO support_labels_migration (id, name, color, position, created_at)
            SELECT id, name, color, position, created_at FROM support_labels;
          DROP TABLE support_labels;
          ALTER TABLE support_labels_migration RENAME TO support_labels;
        `);
        // A single list now: the ranks restart from zero, in the order they
        // followed one another.
        const store = db.prepare("UPDATE support_labels SET position = ? WHERE id = ?");
        (
          db.prepare("SELECT id FROM support_labels ORDER BY position, id").all() as {
            id: number;
          }[]
        ).forEach(({ id }, rank) => store.run(rank, id));
      }),
    );
  }

  // Labels from before weight: all weigh zero, except urgency ones, which
  // take theirs back.
  if (!columns(db, "support_labels").includes("weight")) {
    db.transaction(() => {
      db.exec("ALTER TABLE support_labels ADD COLUMN weight INTEGER NOT NULL DEFAULT 0");
      const setWeight = db.prepare(
        "UPDATE support_labels SET weight = ? WHERE name = ? COLLATE NOCASE",
      );
      for (const { name, weight } of SUPPORT_URGENCY_LABELS) setWeight.run(weight, name);
    })();
  }

  // Project labels from before weight: all weigh zero.
  if (!columns(db, "project_labels").includes("weight")) {
    db.exec("ALTER TABLE project_labels ADD COLUMN weight INTEGER NOT NULL DEFAULT 0");
  }

  // New installation: Support receives its labels — urgency, then channel —,
  // and an incoming email automatically receives "Sans urgence", "E-mail" and
  // fifteen working days of due date. The urgency labels marker, absent, says
  // the database is new; an older database that has none either already has
  // labels, and moves on to the next step.
  const empty =
    !db.prepare("SELECT 1 FROM settings WHERE key = 'support_urgency_labels'").get() &&
    !db.prepare("SELECT 1 FROM support_labels LIMIT 1").get();
  if (empty) {
    db.transaction(() => {
      const create = db.prepare(
        "INSERT INTO support_labels (name, color, weight, position, created_at) VALUES (?, ?, ?, ?, ?)",
      );
      const instant = new Date().toISOString();
      const ids = new Map<string, number>();
      [...SUPPORT_URGENCY_LABELS, ...SUPPORT_CHANNEL_LABELS].forEach(
        ({ name, color, weight }, rank) => {
          ids.set(name, Number(create.run(name, color, weight, rank, instant).lastInsertRowid));
        },
      );
      const setting = db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)");
      setting.run(
        "support_default_label_ids",
        JSON.stringify(SUPPORT_NEW_MESSAGE_LABELS.map((name) => ids.get(name))),
      );
      setting.run("support_default_due_days", JSON.stringify(SUPPORT_NEW_MESSAGE_DUE_DAYS));
    })();
  }

  // Databases from before urgency labels: Support receives them once. The
  // setting records it — a label deleted afterwards does not come back at
  // every startup.
  const URGENCIES = "support_urgency_labels";
  if (!db.prepare("SELECT 1 FROM settings WHERE key = ?").get(URGENCIES)) {
    db.transaction(() => {
      const exists = db.prepare("SELECT 1 FROM support_labels WHERE name = ? COLLATE NOCASE");
      const rank = db.prepare("SELECT COALESCE(MAX(position), -1) + 1 AS next FROM support_labels");
      const create = db.prepare(
        "INSERT INTO support_labels (name, color, weight, position, created_at) VALUES (?, ?, ?, ?, ?)",
      );
      const instant = new Date().toISOString();
      for (const { name, color, weight } of SUPPORT_URGENCY_LABELS) {
        if (exists.get(name)) continue;
        create.run(name, color, weight, (rank.get() as { next: number }).next, instant);
      }
      db.prepare("INSERT INTO settings (key, value) VALUES (?, 'true')").run(URGENCIES);
    })();
  }

  const supportCommentColumns = columns(db, "support_comments");
  if (!supportCommentColumns.includes("sender_email")) {
    db.exec("ALTER TABLE support_comments ADD COLUMN sender_name TEXT NOT NULL DEFAULT ''");
    db.exec("ALTER TABLE support_comments ADD COLUMN sender_email TEXT NOT NULL DEFAULT ''");
  }
  // The note "Demande reçue par e-mail le …" opened the thread of imported
  // requests: the email that follows already says it all, so it goes away —
  // merge copies included.
  db.prepare(
    `DELETE FROM support_comments
     WHERE system = 1 AND user_id IS NULL AND text LIKE 'Demande reçue par e-mail le %'`,
  ).run();

  // Threads from before internal comments: everything in them was an exchange.
  if (!columns(db, "support_comments").includes("internal")) {
    db.exec("ALTER TABLE support_comments ADD COLUMN internal INTEGER NOT NULL DEFAULT 0");
  }

  // Messages from before email replies: none was sent.
  if (!columns(db, "support_comments").includes("mail_status")) {
    db.exec("ALTER TABLE support_comments ADD COLUMN mail_status TEXT NOT NULL DEFAULT ''");
    db.exec("ALTER TABLE support_comments ADD COLUMN mail_to TEXT NOT NULL DEFAULT ''");
  }

  // Messages from before emails were shown as is: the editor's HTML, without
  // a file or an email identifier.
  if (!columns(db, "support_comments").includes("format")) {
    db.exec("ALTER TABLE support_comments ADD COLUMN mail_id TEXT NOT NULL DEFAULT ''");
    db.exec("ALTER TABLE support_comments ADD COLUMN format TEXT NOT NULL DEFAULT ''");
    db.exec("ALTER TABLE support_comments ADD COLUMN attachments TEXT NOT NULL DEFAULT '[]'");
  }
  // Replies from before the copy: nobody was in copy.
  if (!columns(db, "support_comments").includes("mail_cc")) {
    db.exec("ALTER TABLE support_comments ADD COLUMN mail_cc TEXT NOT NULL DEFAULT ''");
    db.exec("ALTER TABLE support_comments ADD COLUMN mail_bcc TEXT NOT NULL DEFAULT ''");
  }
  // Messages from before default replies: none was sent automatically.
  if (!columns(db, "support_comments").includes("auto_event")) {
    db.exec("ALTER TABLE support_comments ADD COLUMN auto_event TEXT NOT NULL DEFAULT ''");
  }
  // Default replies from before events: none is sent automatically. Those
  // that carried a list of them keep the first one.
  if (!columns(db, "support_replies").includes("event")) {
    db.exec("ALTER TABLE support_replies ADD COLUMN event TEXT NOT NULL DEFAULT ''");
    if (columns(db, "support_replies").includes("events")) {
      db.exec(
        `UPDATE support_replies SET event = COALESCE(json_extract(events, '$[0]'), '')
         WHERE json_valid(events)`,
      );
    }
  }
  if (!columns(db, "support_requests").includes("conversation_id")) {
    db.exec("ALTER TABLE support_requests ADD COLUMN conversation_id TEXT NOT NULL DEFAULT ''");
  }

  // Workstations inventoried before we displayed who connects to them: the
  // column is added empty, and each workstation's next inventory fills it.
  const assetColumns = columns(db, "assets");
  if (assetColumns.length > 0 && !assetColumns.includes("last_user")) {
    db.exec("ALTER TABLE assets ADD COLUMN last_user TEXT NOT NULL DEFAULT ''");
  }

  // Workstations dated from the receipt of their inventory, before we took
  // the time the agent writes in it (ACCESSLOG/LOGDATE). Only this value is
  // extracted from the JSON: rereading whole inventories at every startup
  // would cost for nothing. A workstation already up to date is not rewritten.
  if (assetColumns.length > 0) {
    const inventoryDates = db
      .prepare(
        `SELECT id, last_inventory, json_extract(content, '$.ACCESSLOG.LOGDATE') AS logdate
         FROM assets WHERE json_valid(content)`,
      )
      .all() as { id: number; last_inventory: string; logdate: unknown }[];
    const updateDate = db.prepare("UPDATE assets SET last_inventory = ? WHERE id = ?");
    for (const { id, last_inventory, logdate } of inventoryDates) {
      const date = typeof logdate === "string" ? parisTime(logdate) : null;
      if (date && date !== last_inventory) updateDate.run(date, id);
    }
  }

  // The notion of building has been removed: a project no longer cites one,
  // and the table goes away with the column. SQLite refuses to drop a column
  // that is indexed or cited by a foreign key: the index is dropped first,
  // and the foreign keys are suspended for the duration of the removal.
  if (projectColumns.includes("building_id")) {
    withoutForeignKeys(db, () => {
      db.exec("DROP INDEX IF EXISTS idx_projects_building");
      db.exec("ALTER TABLE projects DROP COLUMN building_id");
    });
  }
  db.exec("DROP INDEX IF EXISTS idx_buildings_company");
  db.exec("DROP TABLE IF EXISTS buildings");

  // Categories from before milestones of their own: they take those that the
  // progress slider displayed until then for all projects.
  const categoryColumnNames = columns(db, "categories");
  if (categoryColumnNames.length > 0 && !categoryColumnNames.includes("milestones")) {
    db.exec("ALTER TABLE categories ADD COLUMN milestones TEXT NOT NULL DEFAULT '[]'");
    db.prepare("UPDATE categories SET milestones = ?").run(JSON.stringify(HISTORICAL_MILESTONES));
  }

  // Databases from before milestone types: milestones lived on the category.
  // Each distinct milestone list becomes a type, and projects receive that of
  // their category: each one's slider keeps the marks it showed. Categories
  // that carry the same list share the type — those left on the historical
  // milestones, almost all, end up under "Standard"; an edited list takes its
  // category's name.
  if (!columns(db, "projects").includes("milestone_type_id")) {
    db.exec(
      "ALTER TABLE projects ADD COLUMN milestone_type_id INTEGER REFERENCES milestone_types(id) ON DELETE SET NULL",
    );
    db.transaction(() => {
      const old = db
        .prepare(
          "SELECT id, name, milestones FROM categories WHERE milestones NOT IN ('', '[]') ORDER BY id",
        )
        .all() as { id: number; name: string; milestones: string }[];
      const byName = db.prepare("SELECT id FROM milestone_types WHERE name = ?");
      const create = db.prepare("INSERT INTO milestone_types (name, milestones) VALUES (?, ?)");
      const attach = db.prepare(
        "UPDATE projects SET milestone_type_id = ? WHERE category_id = ?",
      );
      const historical = JSON.stringify(HISTORICAL_MILESTONES);
      const byList = new Map<string, number>();

      for (const category of old) {
        let list: string;
        try {
          list = JSON.stringify(JSON.parse(category.milestones));
        } catch {
          continue;
        }
        let typeId = byList.get(list);
        if (typeId === undefined) {
          const desired = list === historical ? "Standard" : category.name;
          // A name already taken by another list gets a number.
          let name = desired;
          for (let n = 2; byName.get(name); n += 1) name = `${desired} ${n}`;
          typeId = Number(create.run(name, list).lastInsertRowid);
          byList.set(list, typeId);
        }
        attach.run(typeId, category.id);
      }
    })();
  }

  // Databases from before deletion notifications.
  if (!columns(db, "notifications").includes("deleted")) {
    db.exec("ALTER TABLE notifications ADD COLUMN deleted INTEGER NOT NULL DEFAULT 0");
  }

  // Statuses from before "Nouveau": "Non résolu" disappears. Its requests
  // become "Ouvert" — they had been seen, they are not new — and the CHECK
  // constraint is rewritten. SQLite cannot modify it: the table is rebuilt
  // from its own definition, identifiers kept; its indexes are put back
  // afterwards (db/index.ts, INDEXES).
  const definition = (
    db
      .prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'support_requests'")
      .get() as { sql: string } | undefined
  )?.sql;
  if (definition && !definition.includes("'new'")) {
    withoutForeignKeys(
      db,
      db.transaction(() => {
        db.exec("UPDATE support_requests SET status = 'open' WHERE status = 'unresolved'");
        const newRow = definition
          .replace(
            /CREATE TABLE\s+"?support_requests"?/i,
            "CREATE TABLE support_requests_migration",
          )
          .replace(
            /CHECK\s*\(\s*status IN \([^)]*\)\s*\)/i,
            "CHECK (status IN ('new', 'open', 'pending', 'resolved', 'closed'))",
          )
          .replace(/status TEXT NOT NULL DEFAULT 'open'/i, "status TEXT NOT NULL DEFAULT 'new'");
        const list = columns(db, "support_requests").map((c) => `"${c}"`).join(", ");
        db.exec(newRow);
        db.exec(
          `INSERT INTO support_requests_migration (${list}) SELECT ${list} FROM support_requests`,
        );
        db.exec("DROP TABLE support_requests");
        db.exec("ALTER TABLE support_requests_migration RENAME TO support_requests");

        // A stored tab order loses "Non résolu" and receives "Nouveau" at the
        // head: that is where requests arrive.
        const existingRow = db
          .prepare("SELECT value FROM settings WHERE key = 'tab_order_support'")
          .get() as { value: string } | undefined;
        if (existingRow) {
          let order: unknown;
          try {
            order = JSON.parse(existingRow.value);
          } catch {
            order = [];
          }
          const values = Array.isArray(order) ? order.filter((v) => v !== "unresolved" && v !== "new") : [];
          db.prepare("UPDATE settings SET value = ? WHERE key = 'tab_order_support'").run(
            JSON.stringify(["new", ...values]),
          );
        }
      }),
    );
  }

  // Indicators from before the statistics panels' sections: the column is
  // added, then they join a first section.
  for (const table of ["support_indicators", "asset_indicators"]) {
    if (!columns(db, table).includes("section_id")) {
      db.exec(
        `ALTER TABLE ${table} ADD COLUMN section_id INTEGER REFERENCES indicator_sections(id) ON DELETE CASCADE`,
      );
    }
  }
  attachIndicators(db);

  // Sections from before the Project and Task modes: the CHECK constraint of
  // their panel only knows Support and Assets. SQLite cannot modify it: the
  // table is rebuilt from its own definition, identifiers kept; its indexes
  // are put back afterwards (INDEXES).
  const sections = (
    db
      .prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'indicator_sections'")
      .get() as { sql: string } | undefined
  )?.sql;
  if (sections && !sections.includes("'projects'")) {
    withoutForeignKeys(
      db,
      db.transaction(() => {
        const newRow = sections
          .replace(
            /CREATE TABLE\s+"?indicator_sections"?/i,
            "CREATE TABLE indicator_sections_migration",
          )
          .replace(
            /CHECK\s*\(\s*panel IN \([^)]*\)\s*\)/i,
            "CHECK (panel IN ('support', 'assets', 'projects', 'tasks'))",
          );
        const list = columns(db, "indicator_sections").map((c) => `"${c}"`).join(", ");
        db.exec(newRow);
        db.exec(
          `INSERT INTO indicator_sections_migration (${list}) SELECT ${list} FROM indicator_sections`,
        );
        db.exec("DROP TABLE indicator_sections");
        db.exec("ALTER TABLE indicator_sections_migration RENAME TO indicator_sections");
      }),
    );
  }

  // Panel sections from before each one's own gap: they take the one their
  // panel set in its settings, which goes away.
  if (!columns(db, "indicator_sections").includes("gap")) {
    db.exec("ALTER TABLE indicator_sections ADD COLUMN gap INTEGER NOT NULL DEFAULT 50");
    for (const panel of ["support", "assets", "projects", "tasks"]) {
      const key = `${panel}_sections_gap`;
      const setting = db.prepare("SELECT value FROM settings WHERE key = ?").get(key) as
        { value: string } | undefined;
      let gap: unknown;
      try {
        gap = setting ? JSON.parse(setting.value) : undefined;
      } catch {
        gap = undefined;
      }
      if (typeof gap === "number" && Number.isFinite(gap)) {
        db.prepare("UPDATE indicator_sections SET gap = ? WHERE panel = ?").run(
          Math.round(gap),
          panel,
        );
      }
      db.prepare("DELETE FROM settings WHERE key = ?").run(key);
    }
  }

  // Databases from before project references.
  if (!columns(db, "projects").includes("number")) {
    db.exec("ALTER TABLE projects ADD COLUMN number INTEGER NOT NULL DEFAULT 0");
  }
  numberReferences(db);
  setDefaultSections(db);

  // Databases from before "Hérité": all sections were public. The earlier
  // indexes did not cover the owner: they are rebuilt.
  for (const [table, index] of [
    ["access_sections", "idx_access_sections_category"],
    ["indicator_sections", "idx_indicator_sections_panel"],
  ] as const) {
    if (!columns(db, table).includes("owner_id")) {
      db.exec(
        `ALTER TABLE ${table} ADD COLUMN owner_id INTEGER REFERENCES users(id) ON DELETE CASCADE`,
      );
      db.exec(`DROP INDEX IF EXISTS ${index}`);
    }
  }

  // A tab has an owner only when private: those from before this rule kept
  // their author even when open to all, and only that author could then close
  // them. They no longer have one.
  for (const table of ["boards", "project_boards", "access_categories"]) {
    if (columns(db, table).includes("owner_id")) {
      db.exec(`UPDATE ${table} SET owner_id = NULL WHERE is_private = 0`);
    }
  }

  // A thread's opening words were signed by whoever had created the element:
  // they are now signed by Milo, that is, by no account, and the creator
  // moves into the text.
  for (const [table, start] of [
    ["comments", "Projet créé le %"],
    ["card_comments", "Carte créée le %"],
    ["support_comments", "Demande créée le %"],
  ] as const) {
    db.prepare(
      `UPDATE ${table}
       SET text = text || COALESCE(
             ' par ' || (SELECT NULLIF(COALESCE(NULLIF(u.name, ''), u.email), '')
                         FROM users u WHERE u.id = ${table}.user_id),
             ''),
           user_id = NULL
       WHERE system = 1 AND user_id IS NOT NULL AND text LIKE ?`,
    ).run(start);
  }

  splitSettings(db);
  permissionsByWidgetType(db);
};

/** Set once Settings has been moved out of the roles. */
const SETTINGS_OUTSIDE_ROLES = "settings_out_of_roles";

/**
 * Settings used to be set in the roles, company by company; it is now set for
 * the application, per user or group. Each keeps what they had: "Modifier" if
 * they were an administrator somewhere or if one of their roles ticked it,
 * otherwise "Voir" if one ticked it. All modes remain open to them. Then the
 * checkbox disappears from the roles.
 */
export const splitSettings = (db: Database): void => {
  if (readSetting(db, SETTINGS_OUTSIDE_ROLES)) return;
  // A new database never had roles: there is nothing to move out of them.
  if (columns(db, "role_assignments").length === 0) {
    writeSetting(db, SETTINGS_OUTSIDE_ROLES, true);
    return;
  }
  db.transaction(() => {
    const rows = db
      .prepare(
        `SELECT a.principal_type, a.principal_id, a.principal_name, a.principal_email,
                r.is_admin, r.permissions
         FROM role_assignments a JOIN roles r ON r.id = a.role_id`,
      )
      .all() as {
      principal_type: string;
      principal_id: string;
      principal_name: string;
      principal_email: string;
      is_admin: number;
      permissions: string;
    }[];
    const byPrincipal = new Map<string, { row: (typeof rows)[number]; access: number }>();
    for (const row of rows) {
      let checkedItems: unknown = [];
      try {
        checkedItems = (JSON.parse(row.permissions) as Record<string, unknown>)["settings"] ?? [];
      } catch {
        // An unreadable JSON granted nothing.
      }
      const list = Array.isArray(checkedItems) ? checkedItems : [];
      const access = row.is_admin || list.includes("update") ? 2 : list.includes("view") ? 1 : 0;
      const key = `${row.principal_type}:${row.principal_id}`;
      const already = byPrincipal.get(key);
      if (!already || access > already.access) byPrincipal.set(key, { row, access });
    }
    const insertRow = db.prepare(
      `INSERT OR IGNORE INTO principal_permissions
         (workspace_id, principal_type, principal_id, principal_name, principal_email, settings, modes)
       VALUES (${FIRST_WORKSPACE}, ?, ?, ?, ?, ?, ?)`,
    );
    // The open modes are no longer used: widget types replace them
    // (permissionsByWidgetType).
    const modes = "[]";
    for (const { row, access } of byPrincipal.values()) {
      insertRow.run(
        row.principal_type,
        row.principal_id,
        row.principal_name,
        row.principal_email,
        ["", "view", "update"][access],
        modes,
      );
    }
    db.exec(
      "UPDATE roles SET permissions = json_remove(permissions, '$.settings') WHERE json_valid(permissions)",
    );
    writeSetting(db, SETTINGS_OUTSIDE_ROLES, true);
  })();
};

/** Set once permissions have moved to widget types. */
const PERMISSIONS_BY_TYPE = "permissions_by_widget_kind";

/**
 * Roles, company by company, and open modes give way to one permission per
 * widget type, shared by all companies. Each of those who had access — a set
 * permission, or a role somewhere — receives "Modifier" for all types and
 * keeps their Settings. Then the roles go away.
 */
export const permissionsByWidgetType = (db: Database): void => {
  if (!columns(db, "principal_permissions").includes("widgets")) {
    db.exec("ALTER TABLE principal_permissions ADD COLUMN widgets TEXT NOT NULL DEFAULT '{}'");
  }
  if (readSetting(db, PERMISSIONS_BY_TYPE)) return;
  db.transaction(() => {
    if (columns(db, "role_assignments").length > 0) {
      db.exec(
        `INSERT OR IGNORE INTO principal_permissions
           (workspace_id, principal_type, principal_id, principal_name, principal_email)
         SELECT ${FIRST_WORKSPACE}, principal_type, principal_id, MAX(principal_name),
                MAX(principal_email)
         FROM role_assignments GROUP BY principal_type, principal_id`,
      );
    }
    db.prepare("UPDATE principal_permissions SET widgets = ?").run(
      JSON.stringify(widgetRightsEverywhere("update")),
    );
    db.exec("DROP TABLE IF EXISTS role_assignments");
    db.exec("DROP TABLE IF EXISTS roles");
    writeSetting(db, PERMISSIONS_BY_TYPE, true);
  })();
};

/** Set once the modes have become views. */
const VIEWS_AND_BOARDS = "views_and_boards";

/** The modes from before views, in the order of their switch, and the name of their view. */
const STARTING_VIEWS = [
  ["access", "Accès"],
  ["projects", "Projets"],
  ["tasks", "Tâches"],
  ["support", "Support"],
  ["assets", "Assets"],
] as const;

type PreviousMode = (typeof STARTING_VIEWS)[number][0];

/**
 * A table rebuilt from its own CREATE, patched by "patch" — to change the
 * table a foreign key points to. The rows and their identifiers pass as is.
 * Foreign keys must be suspended (withoutForeignKeys).
 */
const rebuildTable = (
  db: Database,
  table: string,
  patch: (sql: string) => string,
  computed: Record<string, string> = {},
): void => {
  const row = db
    .prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = ?")
    .get(table) as { sql: string } | undefined;
  if (!row) return;
  const newRow = patch(row.sql).replace(
    new RegExp(`CREATE TABLE\\s+"?${table}"?`, "i"),
    `CREATE TABLE ${table}_migration`,
  );
  db.exec(newRow);
  // The new table's columns: taken from the old one, or computed from it
  // ("computed"); those that disappear stay behind.
  const old = new Set(columns(db, table));
  const keptKeys = columns(db, `${table}_migration`).filter(
    (c) => c in computed || old.has(c),
  );
  const list = keptKeys.map((c) => `"${c}"`).join(", ");
  const values = keptKeys.map((c) => computed[c] ?? `"${c}"`).join(", ");
  db.exec(`INSERT INTO ${table}_migration (${list}) SELECT ${values} FROM ${table} AS ancienne`);
  db.exec(`DROP TABLE ${table}`);
  db.exec(`ALTER TABLE ${table}_migration RENAME TO ${table}`);
};

/**
 * Modes become views, and their tabs become boards:
 *
 * - Access: each category becomes a board, its columns and elements its
 *   sections and widgets;
 * - Projects: each project board becomes a board, with its categories, its
 *   labels and its projects;
 * - Tasks: each task board stays one, and its company becomes its filter;
 * - Support and Assets: one board each, "Demandes" and "Postes".
 *
 * The panel sections of Projects and Tasks, shared by all their boards, are
 * copied into each; those of Support and Assets go to their single board.
 * Personal structures ("Hérité" unticked), each one's own tab orders and the
 * opening view follow.
 *
 * On a new database, the five views are born with one board each, and the
 * list that goes with it.
 */
export const viewsAndBoards = (db: Database): void => {
  if (readSetting(db, VIEWS_AND_BOARDS)) return;
  const old = !columns(db, "boards").includes("view_id");
  withoutForeignKeys(db, () =>
    db.transaction(() => {
      const currentTime = new Date().toISOString();
      const createView = db.prepare(
        "INSERT INTO views (name, position, created_at) VALUES (?, ?, ?)",
      );
      const views = Object.fromEntries(
        STARTING_VIEWS.map(([mode, name], rank) => [
          mode,
          Number(createView.run(name, rank, currentTime).lastInsertRowid),
        ]),
      ) as Record<PreviousMode, number>;

      if (!old) {
        setStartingBoards(db, views, currentTime);
      } else {
        convertModes(db, views, currentTime);
      }
      writeSetting(db, VIEWS_AND_BOARDS, true);
    })(),
  );
};

/** A new database: one board per view, with the view's list. */
const setStartingBoards = (
  db: Database,
  views: Record<PreviousMode, number>,
  currentTime: string,
): void => {
  const createBoard = db.prepare(
    "INSERT INTO boards (view_id, name, position, created_at) VALUES (?, ?, 0, ?)",
  );
  const createSection = db.prepare(
    "INSERT INTO board_sections (board_id, position, created_at) VALUES (?, 0, ?)",
  );
  const createWidget = db.prepare(
    "INSERT INTO board_widgets (section_id, type, config, position, created_at) VALUES (?, ?, '{}', 0, ?)",
  );
  const lists: Record<PreviousMode, [string, string | null]> = {
    access: ["Liens", null],
    projects: ["Projets", "project.list"],
    tasks: ["Tâches", "task.list"],
    support: ["Demandes", "support.list"],
    assets: ["Postes", "asset.list"],
  };
  for (const [mode, [name, list]] of Object.entries(lists) as [
    PreviousMode,
    [string, string | null],
  ][]) {
    const board = Number(createBoard.run(views[mode], name, currentTime).lastInsertRowid);
    const section = Number(createSection.run(board, currentTime).lastInsertRowid);
    if (list) createWidget.run(section, list, currentTime);
  }
};

/** A database from before views: each mode becomes its own. */
const convertModes = (
  db: Database,
  views: Record<PreviousMode, number>,
  currentTime: string,
): void => {
  // --- The boards -----------------------------------------------------------
  // The task boards table becomes that of all boards: its rows keep their
  // identifier, so the lists and the task labels do not have to move.
  db.exec(`CREATE TABLE boards_migration (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    view_id INTEGER NOT NULL REFERENCES views(id) ON DELETE CASCADE,
    company_id INTEGER REFERENCES companies(id) ON DELETE SET NULL,
    name TEXT NOT NULL,
    position INTEGER NOT NULL DEFAULT 0,
    show_card_numbers INTEGER NOT NULL DEFAULT 1,
    owner_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    is_private INTEGER NOT NULL DEFAULT 0,
    is_locked INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL
  )`);
  db.prepare(
    `INSERT INTO boards_migration
       (id, view_id, company_id, name, position, show_card_numbers, owner_id, is_private, created_at)
     SELECT id, ?, company_id, name, position, show_card_numbers, owner_id, is_private, created_at
     FROM boards`,
  ).run(views.tasks);
  const taskBoards = (
    db.prepare("SELECT id FROM boards_migration ORDER BY id").all() as {
      id: number;
    }[]
  ).map((l) => l.id);

  const createBoard = db.prepare(
    `INSERT INTO boards_migration (view_id, name, position, owner_id, is_private, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
  );
  type Tab = {
    id: number;
    name: string;
    position: number;
    owner_id: number | null;
    is_private: number;
    created_at: string;
  };
  const toBoards = (table: string, view: number): Map<number, number> => {
    const mapping = new Map<number, number>();
    if (columns(db, table).length === 0) return mapping;
    for (const o of db.prepare(`SELECT * FROM ${table} ORDER BY position, id`).all() as Tab[]) {
      mapping.set(
        o.id,
        Number(
          createBoard.run(view, o.name, o.position, o.owner_id, o.is_private, o.created_at)
            .lastInsertRowid,
        ),
      );
    }
    return mapping;
  };
  const projectBoards = toBoards("project_boards", views.projects);
  const accessBoards = toBoards("access_categories", views.access);
  const supportBoard = Number(
    createBoard.run(views.support, "Demandes", 0, null, 0, currentTime).lastInsertRowid,
  );
  const assetsBoard = Number(
    createBoard.run(views.assets, "Postes", 0, null, 0, currentTime).lastInsertRowid,
  );
  db.exec("DROP TABLE boards");
  db.exec("ALTER TABLE boards_migration RENAME TO boards");

  // Projects, their categories and their labels follow their board, and now
  // point to the table of all boards.
  for (const table of ["categories", "projects", "project_labels"]) {
    const move = db.prepare(`UPDATE ${table} SET board_id = ? WHERE board_id = ?`);
    // Going from the largest identifier to the smallest would not help: the new
    // identifiers come after all the old ones, none overlaps.
    for (const [old, newValue] of projectBoards) move.run(newValue, old);
    rebuildTable(db, table, (sql) =>
      sql.replace(/REFERENCES\s+"?project_boards"?\s*\(id\)/gi, "REFERENCES boards(id)"),
    );
  }

  // --- Sections and widgets ------------------------------------------------
  const createSection = db.prepare(
    `INSERT INTO board_sections (board_id, width_unit, width_value, gap, position, owner_id, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  );
  const createWidget = db.prepare(
    `INSERT INTO board_widgets (section_id, type, config, position, created_at)
     VALUES (?, ?, ?, ?, ?)`,
  );
  type Section = {
    id: number;
    width_unit: string;
    width_value: number | null;
    gap: number;
    position: number;
    owner_id: number | null;
    created_at: string;
  };
  type Widget = {
    type: string;
    config: string;
    position: number;
    created_at: string;
  };
  const insertSection = (board: number, s: Section): number =>
    Number(
      createSection.run(
        board,
        s.width_unit,
        s.width_value,
        s.gap ?? 50,
        s.position,
        s.owner_id ?? null,
        s.created_at,
      ).lastInsertRowid,
    );

  // Access: each category's columns, and what they carry.
  if (columns(db, "access_sections").length > 0) {
    const sections = db
      .prepare("SELECT * FROM access_sections ORDER BY position, id")
      .all() as (Section & { category_id: number })[];
    const blocks = db.prepare(
      "SELECT * FROM access_blocks WHERE section_id = ? ORDER BY position, id",
    );
    for (const section of sections) {
      const board = accessBoards.get(section.category_id);
      if (board === undefined) continue;
      const newRow = insertSection(board, section);
      for (const w of blocks.all(section.id) as Widget[]) {
        createWidget.run(newRow, w.type, w.config, w.position, w.created_at);
      }
    }
  }

  // Panels: their sections go to each of the boards that showed them.
  const panels = [
    ["support", "support_indicators", [supportBoard]],
    ["assets", "asset_indicators", [assetsBoard]],
    ["projects", "project_indicators", [...projectBoards.values()]],
    ["tasks", "task_indicators", taskBoards],
  ] as const;
  if (columns(db, "indicator_sections").length > 0) {
    for (const [panel, table, boardIds] of panels) {
      const sections = db
        .prepare("SELECT * FROM indicator_sections WHERE panel = ? ORDER BY position, id")
        .all(panel) as Section[];
      const widgets =
        columns(db, table).length > 0
          ? db.prepare(`SELECT * FROM ${table} WHERE section_id = ? ORDER BY position, id`)
          : null;
      for (const board of boardIds) {
        for (const section of sections) {
          const newRow = insertSection(board, section);
          for (const w of (widgets?.all(section.id) ?? []) as Widget[]) {
            createWidget.run(
              newRow,
              panelType(panel, w.type),
              w.config,
              w.position,
              w.created_at,
            );
          }
        }
      }
    }
  }

  // --- What is specific to each account ------------------------------------
  // "Hérité" unticked: the scope of a panel or a category becomes that of
  // each of its boards.
  const scopes: [string, number[]][] = [
    ["support", [supportBoard]],
    ["assets", [assetsBoard]],
    ["projects", [...projectBoards.values()]],
    ["tasks", taskBoards],
    ...[...accessBoards].map(([category, board]): [string, number[]] => [
      `access:${category}`,
      [board],
    ]),
  ];
  const personal = db.prepare("SELECT user_id FROM personal_layouts WHERE scope = ?");
  const setPersonal = db.prepare(
    "INSERT OR IGNORE INTO personal_layouts (user_id, scope, created_at) VALUES (?, ?, ?)",
  );
  for (const [old, boardIds] of scopes) {
    for (const { user_id } of personal.all(old) as {
      user_id: number;
    }[]) {
      for (const board of boardIds) setPersonal.run(user_id, `board:${board}`, currentTime);
    }
  }
  db.exec("DELETE FROM personal_layouts WHERE scope NOT LIKE 'board:%'");

  // Tab order: the modes' becomes the views', the boards' follow their new
  // identifier. The fixed tabs of Support and Assets no longer exist.
  const orders = db.prepare("SELECT user_id, scope, ids FROM user_tab_orders").all() as {
    user_id: number;
    scope: string;
    ids: string;
  }[];
  const read = (text: string): string[] => {
    try {
      const readValue: unknown = JSON.parse(text);
      return Array.isArray(readValue) ? readValue.map(String) : [];
    } catch {
      return [];
    }
  };
  const byAccount = new Map<number, Map<string, string[]>>();
  const add = (account: number, scope: string, ids: string[]) => {
    const already = byAccount.get(account) ?? new Map<string, string[]>();
    already.set(scope, [...(already.get(scope) ?? []), ...ids]);
    byAccount.set(account, already);
  };
  const translate = (ids: string[], mapping: Map<number, number>): string[] =>
    ids.flatMap((id) => {
      const newValue = mapping.get(Number(id));
      return newValue === undefined ? [] : [String(newValue)];
    });
  for (const { user_id, scope, ids } of orders) {
    const list = read(ids);
    if (scope === "modes") {
      add(
        user_id,
        "views",
        list.flatMap((mode) => (mode in views ? [String(views[mode as PreviousMode])] : [])),
      );
    } else if (scope === "project-boards") {
      add(user_id, `boards:${views.projects}`, translate(list, projectBoards));
    } else if (scope === "access-categories") {
      add(user_id, `boards:${views.access}`, translate(list, accessBoards));
    } else if (scope.startsWith("boards:")) {
      // Task boards used to be ordered company by company: they are now
      // ordered together, in the Tâches view.
      add(user_id, `boards:${views.tasks}`, list);
    }
  }
  db.exec("DELETE FROM user_tab_orders");
  const setOrder = db.prepare(
    "INSERT INTO user_tab_orders (user_id, scope, ids) VALUES (?, ?, ?)",
  );
  for (const [account, scopes2] of byAccount) {
    for (const [scope, ids] of scopes2) setOrder.run(account, scope, JSON.stringify(ids));
  }

  // The opening view: that of the opening mode.
  for (const [mode, view] of Object.entries(views)) {
    db.prepare("UPDATE users SET default_view = ? WHERE default_mode = ?").run(String(view), mode);
  }

  // --- What is no longer used -----------------------------------------------
  for (const table of [
    "access_blocks",
    "access_sections",
    "access_categories",
    "support_indicators",
    "asset_indicators",
    "project_indicators",
    "task_indicators",
    "indicator_sections",
    "project_boards",
  ]) {
    db.exec(`DROP TABLE IF EXISTS ${table}`);
  }
};

const CONTEXTS = "contexts";

/** The order of the contexts born from companies; the others follow, by name. */
const CONTEXTS_ORDER = [
  "Les manufactures",
  "Arco Marketing",
  "SAMB",
  "M3P",
  "Maison Hamon",
  "Monot",
];

interface PreviousCompany {
  id: number;
  name: string;
  support_email: string;
}

/**
 * Companies become contexts, specific to each board:
 *
 * - each board receives one context per company, in the stated order; a
 *   database without companies receives none;
 * - a project moves to its company's context in its board, a card to that of
 *   the company that filtered its board — failing that, to the first;
 * - requests and workstations go to the board of the first list of requests,
 *   or of workstations, set as public, in their company's context; a request
 *   keeps its company's mailbox, from which its replies are sent;
 * - request lists receive the companies' mailboxes, each toward its context;
 *   workstation lists, the already recognized tags;
 * - the shared sending address is Arco Marketing's, failing that the first
 *   known mailbox.
 *
 * Companies and the boards' filter disappear.
 */
export const contexts = (db: Database): void => {
  if (readSetting(db, CONTEXTS)) return;
  const exists = (table: string): boolean =>
    Boolean(db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(table));
  withoutForeignKeys(db, () =>
    db.transaction(() => {
      const currentTime = new Date().toISOString();
      const rank = (name: string): number => {
        const i = CONTEXTS_ORDER.findIndex(
          (n) => n.localeCompare(name, "fr", { sensitivity: "base" }) === 0,
        );
        return i < 0 ? CONTEXTS_ORDER.length : i;
      };
      const companies = (
        exists("companies")
          ? (db.prepare("SELECT id, name, support_email FROM companies").all() as PreviousCompany[])
          : []
      ).sort((a, b) => rank(a.name) - rank(b.name) || a.name.localeCompare(b.name, "fr"));

      // Each board's contexts, and the mapping of companies.
      db.exec(
        "CREATE TEMP TABLE correspondance (board_id INTEGER, company_id INTEGER, context_id INTEGER)",
      );
      const createContext = db.prepare(
        "INSERT INTO contexts (board_id, name, position, created_at) VALUES (?, ?, ?, ?)",
      );
      const matches = db.prepare("INSERT INTO temp.correspondance VALUES (?, ?, ?)");
      const boardRows = db.prepare("SELECT id FROM boards").all() as {
        id: number;
      }[];
      for (const { id } of boardRows) {
        const alreadyThere = db.prepare("SELECT 1 FROM contexts WHERE board_id = ?").get(id);
        if (alreadyThere) continue;
        // Without a company, the board has no context: one is added from its
        // list.
        if (companies.length === 0) continue;
        companies.forEach((company, position) => {
          const context = createContext.run(
            id,
            company.name,
            position,
            currentTime,
          ).lastInsertRowid;
          matches.run(id, company.id, context);
        });
      }
      const first = (board: string) =>
        `(SELECT id FROM contexts WHERE board_id = ${board} ORDER BY position, id LIMIT 1)`;
      const contextOf = (board: string, company: string) =>
        `COALESCE((SELECT context_id FROM temp.correspondance c
                   WHERE c.board_id = ${board} AND c.company_id = ${company}), ${first(board)})`;

      // The board that receives requests, the one that receives workstations:
      // that of the first list set as public.
      const widgetBoard = (type: string): number | null =>
        (
          db
            .prepare(
              `SELECT s.board_id FROM board_widgets w
               JOIN board_sections s ON s.id = w.section_id
               WHERE w.type = ? ORDER BY s.owner_id IS NOT NULL, w.id LIMIT 1`,
            )
            .get(type) as { board_id: number } | undefined
        )?.board_id ??
        (
          db.prepare("SELECT id FROM boards ORDER BY id LIMIT 1").get() as
            { id: number } | undefined
        )?.id ??
        null;
      const requestsBoard = widgetBoard("support.list");
      const workstationsBoard = widgetBoard("asset.list");

      const boardColumns = columns(db, "boards");
      const boardsFilter = boardColumns.includes("company_id");

      // Projects.
      if (columns(db, "projects").includes("company_id"))
        rebuildTable(
          db,
          "projects",
          (sql) =>
            sql.replace(
              /company_id INTEGER[^,]*,/,
              "context_id INTEGER REFERENCES contexts(id) ON DELETE CASCADE,",
            ),
          {
            context_id: contextOf("ancienne.board_id", "ancienne.company_id"),
          },
        );

      // Cards: the context of the company that filtered their board.
      if (!columns(db, "task_cards").includes("context_id")) {
        db.exec(
          "ALTER TABLE task_cards ADD COLUMN context_id INTEGER REFERENCES contexts(id) ON DELETE CASCADE",
        );
      }
      const cardBoard =
        "(SELECT l.board_id FROM task_lists l WHERE l.id = task_cards.list_id)";
      db.exec(
        `UPDATE task_cards SET context_id = ${
          boardsFilter
            ? contextOf(
                cardBoard,
                `(SELECT b.company_id FROM boards b WHERE b.id = ${cardBoard})`,
              )
            : first(cardBoard)
        } WHERE context_id IS NULL`,
      );

      // Requests: their company's context, in the requests board.
      const requestColumns = columns(db, "support_requests");
      if (requestColumns.includes("company_id")) {
        // With no board to go to, a request has nowhere to show.
        if (requestsBoard === null) db.exec("DELETE FROM support_requests");
        rebuildTable(
          db,
          "support_requests",
          (sql) =>
            sql.replace(
              /company_id INTEGER[^,]*,/,
              `context_id INTEGER REFERENCES contexts(id) ON DELETE CASCADE,
            mailbox TEXT NOT NULL DEFAULT '',`,
            ),
          {
            context_id: contextOf(String(requestsBoard), "ancienne.company_id"),
            mailbox: exists("companies")
              ? "COALESCE((SELECT support_email FROM companies s WHERE s.id = ancienne.company_id), '')"
              : "''",
          },
        );
      }

      // Workstations: their company's context, in the workstations board.
      if (columns(db, "assets").includes("company_id")) {
        rebuildTable(
          db,
          "assets",
          (sql) =>
            sql.replace(
              /company_id INTEGER[^,]*,/,
              "context_id INTEGER REFERENCES contexts(id) ON DELETE CASCADE,",
            ),
          {
            context_id: `CASE WHEN ancienne.company_id IS NULL THEN NULL ELSE (SELECT context_id
              FROM temp.correspondance c WHERE c.board_id = ${workstationsBoard ?? "NULL"}
              AND c.company_id = ancienne.company_id) END`,
          },
        );
      }

      // Request lists receive the companies' mailboxes; the one that received
      // only one keeps it alone.
      const configs = db
        .prepare(
          `SELECT w.id, w.type, w.config, s.board_id FROM board_widgets w
           JOIN board_sections s ON s.id = w.section_id
           WHERE w.type IN ('support.list', 'asset.list')`,
        )
        .all() as {
        id: number;
        type: string;
        config: string;
        board_id: number;
      }[];
      const companyContext = db.prepare(
        "SELECT context_id FROM temp.correspondance WHERE board_id = ? AND company_id = ?",
      );
      const knownTags = columns(db, "assets").includes("context_id")
        ? (db
            .prepare(
              `SELECT DISTINCT a.tag, c.company_id FROM assets a
                 JOIN temp.correspondance c ON c.context_id = a.context_id
                 WHERE a.tag != ''`,
            )
            .all() as { tag: string; company_id: number }[])
        : [];
      const writeConfig = db.prepare("UPDATE board_widgets SET config = ? WHERE id = ?");
      for (const widget of configs) {
        let config: Record<string, unknown> = {};
        try {
          config = JSON.parse(widget.config) as Record<string, unknown>;
        } catch {
          // An unreadable configuration starts again from zero.
        }
        const boardContext = (company: number): number | null =>
          (companyContext.get(widget.board_id, company) as { context_id: number } | undefined)
            ?.context_id ?? null;
        if (widget.type === "support.list") {
          const single = config.boite ? Number(config.boite) : null;
          config.boites = companies
            .filter((s) => s.support_email && (single === null || s.id === single))
            .map((s) => ({
              email: s.support_email,
              contexte: boardContext(s.id),
            }))
            .filter((b) => b.contexte !== null);
          delete config.boite;
        } else {
          const only = typeof config.tag === "string" && config.tag ? config.tag : null;
          config.tags = knownTags
            .filter((t) => only === null || t.tag === only)
            .map((t) => ({
              tag: t.tag,
              contexte: boardContext(t.company_id),
            }))
            .filter((t) => t.contexte !== null);
          delete config.tag;
        }
        writeConfig.run(JSON.stringify(config), widget.id);
      }

      // The shared sending address.
      const entra = (readSetting(db, "entra") ?? null) as Record<string, unknown> | null;
      if (entra && !entra.mail_sender) {
        const sender =
          companies.find((s) => s.name === "Arco Marketing" && s.support_email) ??
          companies.find((s) => s.support_email);
        if (sender)
          writeSetting(db, "entra", {
            ...entra,
            mail_sender: sender.support_email,
          });
      }

      // The boards' filter and the companies disappear.
      if (boardsFilter) {
        rebuildTable(db, "boards", (sql) =>
          sql.replace(
            /company_id INTEGER[^,]*,/,
            "all_contexts_label TEXT NOT NULL DEFAULT 'Tous les contextes',",
          ),
        );
      } else if (!boardColumns.includes("all_contexts_label")) {
        db.exec(
          "ALTER TABLE boards ADD COLUMN all_contexts_label TEXT NOT NULL DEFAULT 'Tous les contextes'",
        );
      }
      db.exec("DROP TABLE IF EXISTS companies");
      for (const index of [
        "idx_projects_company",
        "idx_support_requests_company",
        "idx_support_requests_mail",
        "idx_assets_company",
      ]) {
        db.exec(`DROP INDEX IF EXISTS ${index}`);
      }
      db.exec("DROP TABLE temp.correspondance");
      writeSetting(db, CONTEXTS, true);
    })(),
  );
};

const LISTS_PER_WIDGET = "lists_by_widget";

interface ListWidget {
  id: number;
  type: string;
  config: string;
  board_id: number;
  owner_id: number | null;
}

/**
 * Each list widget owns its elements: it receives a key, which its projects,
 * its task lists, its requests and its workstations carry too.
 *
 * Personal copies ("Hérité" unticked) keep the key of the public widget they
 * are a copy of — the same type, at the same rank in the board. Elements go
 * to the first public widget of their board; a request goes first to the one
 * that receives its mailbox, a workstation to the one that receives its tag.
 */
export const listsPerWidget = (db: Database): void => {
  if (readSetting(db, LISTS_PER_WIDGET)) return;
  db.transaction(() => {
    for (const table of ["projects", "task_lists", "support_requests", "assets"]) {
      // A new database does not have its workstations yet: their table is born
      // after the migrations, with the column (schema.ts).
      if (columns(db, table).length === 0) continue;
      if (!columns(db, table).includes("list_key")) {
        db.exec(`ALTER TABLE ${table} ADD COLUMN list_key TEXT NOT NULL DEFAULT ''`);
      }
    }

    const widgets = db
      .prepare(
        `SELECT w.id, w.type, w.config, s.board_id, s.owner_id FROM board_widgets w
         JOIN board_sections s ON s.id = w.section_id
         WHERE w.type IN ('project.list', 'task.list', 'support.list', 'asset.list')
         ORDER BY s.owner_id IS NOT NULL, s.owner_id, s.position, s.id, w.position, w.id`,
      )
      .all() as ListWidget[];
    const read = (config: string): Record<string, unknown> => {
      try {
        return (JSON.parse(config) as Record<string, unknown>) ?? {};
      } catch {
        return {};
      }
    };
    const write = db.prepare("UPDATE board_widgets SET config = ? WHERE id = ?");
    // The keys of the public widgets, by board and by type, in order.
    const publicIds = new Map<string, string[]>();
    // The rank reached, by account, board and type, for the copies.
    const ranks = new Map<string, number>();
    const configs = new Map<number, Record<string, unknown>>();
    for (const widget of widgets) {
      const config = read(widget.config);
      const group = `${widget.board_id}:${widget.type}`;
      if (typeof config.liste !== "string" || !config.liste) {
        if (widget.owner_id === null) {
          config.liste = crypto.randomUUID();
        } else {
          const key = `${widget.owner_id}:${group}`;
          const rank = ranks.get(key) ?? 0;
          ranks.set(key, rank + 1);
          config.liste = publicIds.get(group)?.[rank] ?? crypto.randomUUID();
        }
        write.run(JSON.stringify(config), widget.id);
      }
      if (widget.owner_id === null) {
        publicIds.set(group, [...(publicIds.get(group) ?? []), config.liste as string]);
      }
      configs.set(widget.id, config);
    }
    const first = (boardId: number, type: string): string =>
      publicIds.get(`${boardId}:${type}`)?.[0] ?? "";

    const insertRow = (table: string, type: string, board: string) => {
      const rows = db
        .prepare(`SELECT id, ${board} AS board_id FROM ${table} WHERE list_key = ''`)
        .all() as { id: number; board_id: number | null }[];
      const updateStatement = db.prepare(`UPDATE ${table} SET list_key = ? WHERE id = ?`);
      for (const { id, board_id } of rows) {
        if (board_id !== null) updateStatement.run(first(board_id, type), id);
      }
    };
    insertRow("projects", "project.list", "board_id");
    insertRow("task_lists", "task.list", "board_id");

    // The public widget of a board that receives this value, otherwise the first.
    const receiver = (boardId: number, type: string, field: string, key: string, value: string) =>
      widgets.find((w) => {
        if (w.owner_id !== null || w.board_id !== boardId || w.type !== type) return false;
        const list = configs.get(w.id)?.[field];
        return (
          Array.isArray(list) &&
          (list as Record<string, unknown>[]).some(
            (r) => typeof r?.[key] === "string" && (r[key] as string).toLowerCase() === value,
          )
        );
      });
    const requests = db
      .prepare(
        `SELECT r.id, r.mailbox, c.board_id FROM support_requests r
         JOIN contexts c ON c.id = r.context_id WHERE r.list_key = ''`,
      )
      .all() as { id: number; mailbox: string; board_id: number }[];
    const updateRequest = db.prepare("UPDATE support_requests SET list_key = ? WHERE id = ?");
    for (const d of requests) {
      const w = d.mailbox
        ? receiver(d.board_id, "support.list", "boites", "email", d.mailbox.toLowerCase())
        : undefined;
      updateRequest.run(
        w ? (configs.get(w.id)!.liste as string) : first(d.board_id, "support.list"),
        d.id,
      );
    }
    if (columns(db, "assets").length === 0) {
      writeSetting(db, LISTS_PER_WIDGET, true);
      return;
    }
    const workstations = db
      .prepare(
        `SELECT a.id, a.tag, c.board_id FROM assets a
         JOIN contexts c ON c.id = a.context_id WHERE a.list_key = ''`,
      )
      .all() as { id: number; tag: string; board_id: number }[];
    const updateWorkstation = db.prepare("UPDATE assets SET list_key = ? WHERE id = ?");
    for (const a of workstations) {
      const w = receiver(a.board_id, "asset.list", "tags", "tag", a.tag.trim().toLowerCase());
      updateWorkstation.run(
        w ? (configs.get(w.id)!.liste as string) : first(a.board_id, "asset.list"),
        a.id,
      );
    }
    writeSetting(db, LISTS_PER_WIDGET, true);
  })();
};

const OPTIONAL_CONTEXTS = "optional_contexts";

interface DetailedColumn {
  name: string;
  notnull: number;
}

/**
 * A board may have no context: its projects and requests have none either.
 * The context becomes optional, and a request like a workstation carries its
 * board — it was their context that said it.
 */
export const optionalContexts = (db: Database): void => {
  if (readSetting(db, OPTIONAL_CONTEXTS)) return;
  const isRequired = (table: string, column: string): boolean =>
    (db.prepare(`PRAGMA table_info(${table})`).all() as DetailedColumn[]).some(
      (c) => c.name === column && c.notnull === 1,
    );
  const contextBoard = "(SELECT board_id FROM contexts WHERE id = ancienne.context_id)";
  withoutForeignKeys(db, () =>
    db.transaction(() => {
      if (isRequired("projects", "context_id")) {
        rebuildTable(db, "projects", (sql) =>
          sql.replace(/context_id INTEGER NOT NULL/, "context_id INTEGER"),
        );
      }
      if (!columns(db, "support_requests").includes("board_id")) {
        rebuildTable(
          db,
          "support_requests",
          (sql) =>
            sql.replace(
              /context_id INTEGER( NOT NULL)?/,
              "board_id INTEGER NOT NULL REFERENCES boards(id) ON DELETE CASCADE,\n            context_id INTEGER",
            ),
          { board_id: contextBoard },
        );
      }
      const workstations = columns(db, "assets");
      if (workstations.length > 0 && !workstations.includes("board_id")) {
        db.exec(
          "ALTER TABLE assets ADD COLUMN board_id INTEGER REFERENCES boards(id) ON DELETE CASCADE",
        );
        db.exec(
          "UPDATE assets SET board_id = (SELECT board_id FROM contexts WHERE id = assets.context_id)",
        );
      }
      writeSetting(db, OPTIONAL_CONTEXTS, true);
    })(),
  );
};

const CONFIRMED_MAILBOXES = "mailboxes_confirmed_by_list";

/**
 * Support mailboxes are confirmed list by list (lib/optin.ts). Those a list
 * was fetching before confirmation stay so, confirmed automatically — since
 * always, so that their fetching neither stops nor skips anything. A database
 * that went through confirmation by address (mailbox_optins) keeps its state,
 * copied for each list that states the address.
 */
export const confirmedMailboxes = (db: Database): void => {
  if (readSetting(db, CONFIRMED_MAILBOXES)) return;
  const byAddress = columns(db, "mailbox_optins").length > 0;
  db.transaction(() => {
    const before = new Map<string, string>(
      byAddress
        ? (
            db.prepare("SELECT email, confirmed_at FROM mailbox_optins").all() as {
              email: string;
              confirmed_at: string;
            }[]
          ).map((o) => [o.email, o.confirmed_at])
        : [],
    );
    const configs = db
      .prepare("SELECT config FROM board_widgets WHERE type = 'support.list'")
      .all() as { config: string }[];
    const insertRow = db.prepare(
      `INSERT OR IGNORE INTO list_mailbox_optins (list_key, email, confirmed_at, created_at)
       VALUES (?, ?, ?, ?)`,
    );
    const currentTime = new Date().toISOString();
    for (const { config } of configs) {
      // The keys from before their translation ("liste", "boites"): this step
      // only runs on a database that is not yet translated (englishValues).
      let readValue: { boites?: { email?: unknown }[]; liste?: unknown } = {};
      try {
        readValue = JSON.parse(config) as typeof readValue;
      } catch {
        continue;
      }
      const list = typeof readValue.liste === "string" ? readValue.liste : "";
      if (!list) continue;
      for (const mailbox of Array.isArray(readValue.boites) ? readValue.boites : []) {
        const email = typeof mailbox?.email === "string" ? mailbox.email.trim().toLowerCase() : "";
        if (!email) continue;
        // By address, only those that were confirmed stay so; without any
        // confirmation at all, all of them were in effect.
        const confirmed = byAddress ? (before.get(email) ?? "") : "1970-01-01T00:00:00.000Z";
        insertRow.run(list, email, confirmed, currentTime);
      }
    }
    if (byAddress) db.exec("DROP TABLE mailbox_optins");
    writeSetting(db, CONFIRMED_MAILBOXES, true);
  })();
};

/**
 * The catch-up markers, renamed to English along with the code. Runs first
 * of all (migrate): each catch-up is recognized by its marker, and must not
 * run again on a database that carried it under its old name. A database that
 * already has both keeps the new one.
 */
const LEGACY_SETTING_KEYS: Record<string, string> = {
  references_communes: SHARED_REFERENCES,
  projects_sections_posees: "projects_sections_seeded",
  tasks_sections_posees: "tasks_sections_seeded",
  gestion_des_workspaces: WORKSPACE_MANAGEMENT,
  administration_globale: GLOBAL_ADMINISTRATION,
  sans_uptime_avec_365: WITHOUT_UPTIME_WITH_365,
  parametrage_hors_roles: SETTINGS_OUTSIDE_ROLES,
  permissions_par_type_de_widget: PERMISSIONS_BY_TYPE,
  vues_et_tableaux: VIEWS_AND_BOARDS,
  contextes: CONTEXTS,
  listes_par_widget: LISTS_PER_WIDGET,
  contextes_facultatifs: OPTIONAL_CONTEXTS,
  boites_confirmees_par_liste: CONFIRMED_MAILBOXES,
  // The marker of a step from before per-list confirmation, which no longer exists.
  boites_confirmees: "mailboxes_confirmed",
};

const renameSettingKeys = (db: Database): void => {
  const legacy = db
    .prepare(
      `SELECT key FROM settings WHERE key IN (${Object.keys(LEGACY_SETTING_KEYS)
        .map(() => "?")
        .join(", ")})`,
    )
    .all(...Object.keys(LEGACY_SETTING_KEYS)) as { key: string }[];
  if (legacy.length === 0) return;
  db.transaction(() => {
    const rename = db.prepare(
      "UPDATE settings SET key = ? WHERE key = ? AND NOT EXISTS (SELECT 1 FROM settings WHERE key = ?)",
    );
    const remove = db.prepare("DELETE FROM settings WHERE key = ?");
    for (const { key } of legacy) {
      const renamed = LEGACY_SETTING_KEYS[key]!;
      rename.run(renamed, key, renamed);
      remove.run(key);
    }
  })();
};

/** Set once the values stored in French have been translated (englishValues). */
const ENGLISH_VALUES = "english_values";

/** The parameters of a link to an element, before and after (shared, follow.ts). */
const LEGACY_LINK_PARAMS: Record<string, string> = {
  projet: QUERY_PARAMS.project,
  carte: QUERY_PARAMS.card,
  demande: QUERY_PARAMS.support,
  poste: QUERY_PARAMS.asset,
  acces: QUERY_PARAMS.access,
};

/** The "?carte=12" links of an HTML, rewritten "?card=12". */
const migrateLinks = (html: string): string =>
  html.replace(
    /\?(projet|carte|demande|poste|acces)=(\d+)/g,
    (_match, param: string, id: string) => `?${LEGACY_LINK_PARAMS[param]}=${id}`,
  );

/**
 * The code went from French to English: what it stored in French is now
 * stored in English, and what already was gets translated once.
 *
 *   - The settings: Entra's "deconnecte", the "expire" of the support mailbox
 *     subscriptions.
 *   - Each widget's configuration (migrateWidgetConfig, shared): its keys and
 *     its choice values.
 *   - The "periode" form of a due date, which becomes "period".
 *   - The variables of the Support templates, "{{demande.numero}}" becoming
 *     "{{ticket.number}}" (migrateSupportTemplate, shared).
 *   - The links to an element in descriptions ("?carte=12"), which still
 *     open under their old name, and the media addresses ("/api/medias/…"),
 *     also still served: emails already sent cite them.
 *
 * The earlier catch-ups read and write the old keys: this one runs after
 * them, last.
 */
const englishValues = (db: Database): void => {
  if (readSetting(db, ENGLISH_VALUES)) return;
  db.transaction(() => {
    const entra = readSetting(db, "entra");
    if (entra && typeof entra === "object" && "deconnecte" in entra) {
      const { deconnecte, ...rest } = entra as Record<string, unknown>;
      writeSetting(db, "entra", { ...rest, disconnected: deconnecte === true });
    }

    const subscriptions = readSetting(db, "support_mail_subscriptions");
    if (subscriptions && typeof subscriptions === "object") {
      writeSetting(
        db,
        "support_mail_subscriptions",
        Object.fromEntries(
          Object.entries(subscriptions as Record<string, Record<string, unknown>>).map(
            ([mailbox, s]) => {
              if (!s || typeof s !== "object" || !("expire" in s)) return [mailbox, s];
              const { expire, ...rest } = s;
              return [mailbox, { ...rest, expiresAt: rest.expiresAt ?? expire }];
            },
          ),
        ),
      );
    }

    const widgets = db.prepare("SELECT id, type, config FROM board_widgets").all() as {
      id: number;
      type: string;
      config: string;
    }[];
    const writeConfig = db.prepare("UPDATE board_widgets SET config = ? WHERE id = ?");
    for (const widget of widgets) {
      let config: unknown;
      try {
        config = JSON.parse(widget.config);
      } catch {
        // An unreadable configuration stays as it is: the widget fills it in.
        continue;
      }
      const migrated = JSON.stringify(migrateWidgetConfig(widget.type, config));
      if (migrated !== widget.config) writeConfig.run(migrated, widget.id);
    }

    db.exec("UPDATE task_cards SET due_form = 'period' WHERE due_form = 'periode'");

    for (const table of ["support_replies", "support_contents"]) {
      const rows = db.prepare(`SELECT id, html FROM ${table} WHERE html LIKE '%{{%'`).all() as {
        id: number;
        html: string;
      }[];
      const write = db.prepare(`UPDATE ${table} SET html = ? WHERE id = ?`);
      for (const { id, html } of rows) {
        const migrated = migrateSupportTemplate(html);
        if (migrated !== html) write.run(migrated, id);
      }
    }

    for (const table of ["task_cards", "projects"]) {
      if (!columns(db, table).includes("description")) continue;
      const rows = db
        .prepare(`SELECT id, description FROM ${table} WHERE description LIKE '%?%=%'`)
        .all() as { id: number; description: string }[];
      const write = db.prepare(`UPDATE ${table} SET description = ? WHERE id = ?`);
      for (const { id, description } of rows) {
        const migrated = migrateLinks(description);
        if (migrated !== description) write.run(migrated, id);
      }
    }

    // The media addresses, wherever they are cited: descriptions,
    // comments, templates, Images widget configurations…
    const tables = (
      db
        .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'")
        .all() as { name: string }[]
    ).map((t) => t.name);
    for (const table of tables) {
      const textColumns = (
        db.prepare(`PRAGMA table_info("${table}")`).all() as { name: string; type: string }[]
      )
        .filter((c) => c.type.toUpperCase() === "TEXT")
        .map((c) => c.name);
      for (const column of textColumns) {
        db.prepare(
          `UPDATE "${table}" SET "${column}" = REPLACE("${column}", '/api/medias/', '/api/media/')
           WHERE "${column}" LIKE '%/api/medias/%'`,
        ).run();
      }
    }

    writeSetting(db, ENGLISH_VALUES, true);
  })();
};
