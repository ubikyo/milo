// Rattrapages pour les bases créées avant tel ou tel ajout. Chacun se
// reconnaît à une colonne ou une table manquante, et ne fait rien sur une base
// neuve : le schéma l'a déjà créée complète.
//
// Aucune ne s'exécute deux fois, et aucune ne se retire : une base de
// production peut avoir n'importe quel âge.

import type { Database } from "better-sqlite3";
import {
  SUPPORT_CHANNEL_LABELS,
  SUPPORT_NEW_MESSAGE_DUE_DAYS,
  SUPPORT_NEW_MESSAGE_LABELS,
  SUPPORT_URGENCY_LABELS,
  panelType,
  validWidgetRights,
  widgetRightsEverywhere,
} from "@milo/shared";
import { parisTime } from "../lib/time.js";

/** Les jalons que tous les projets partageaient avant qu'ils suivent la catégorie. */
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

/** Les clés étrangères sont suspendues le temps d'un échange de table. */
const withoutForeignKeys = (db: Database, action: () => void): void => {
  db.pragma("foreign_keys = OFF");
  try {
    action();
  } finally {
    db.pragma("foreign_keys = ON");
  }
};

/**
 * Les indicateurs sans section — rangés avant que les panneaux des
 * statistiques en aient, ou revenus d'une sauvegarde de ce temps-là — passent
 * ensemble dans une première section à largeur automatique, en gardant leur
 * ordre : sans elle, le panneau ne les montrerait plus. Reposé après la
 * restauration d'une sauvegarde, comme le rôle Administrateur.
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

/** Posé une fois les références des projets et des cartes données par le compteur commun. */
const SHARED_REFERENCES = "references_communes";
/** Le compteur des références (repositories/references.ts). */
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
 * Les projets et les cartes reçoivent leur référence « HLP- » du compteur des
 * tickets. Ceux d'avant le compteur commun — les cartes se numérotaient alors
 * par tableau, les projets pas du tout — sont renumérotés une fois, dans
 * l'ordre de leur création, à la suite du dernier ticket. Ensuite, seul ce
 * qui n'a pas de référence en reçoit une : un projet posé par la base de
 * démonstration. Reposé après la restauration d'une sauvegarde, comme le rôle
 * Administrateur : une sauvegarde d'avant le compteur commun se renumérote.
 */
export const numberReferences = (db: Database): void => {
  const common = readSetting(db, SHARED_REFERENCES) === true;
  const withoutReference = common ? "number = 0" : "1";
  const items = db
    .prepare(
      `SELECT 'project' AS sorte, id, created_at FROM projects WHERE ${withoutReference}
       UNION ALL
       SELECT 'card' AS sorte, id, created_at FROM task_cards WHERE kind = 'card' AND ${withoutReference}
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
    // Un séparateur ne porte pas de référence.
    if (!common) db.exec("UPDATE task_cards SET number = 0 WHERE kind = 'separator'");
    writeSetting(db, REFERENCE_COUNTER, phoneNumber);
    writeSetting(db, SHARED_REFERENCES, true);
  })();
};

/**
 * Les modes Projet et Tâche montraient leur liste d'office : passés aux
 * sections, ils en reçoivent une première, qui porte la liste, pour ne pas
 * s'ouvrir vides. Posée une fois — le réglage s'en souvient : un panneau
 * qu'on a vidé exprès le reste. Reposée après la restauration d'une
 * sauvegarde d'avant les sections de ces modes.
 */
export const setDefaultSections = (db: Database): void => {
  for (const [table, panel] of [
    ["project_indicators", "projects"],
    ["task_indicators", "tasks"],
  ] as const) {
    const key = `${panel}_sections_posees`;
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
 * Les rattrapages, puis le passage aux vues. Une base qui connaît déjà les
 * vues — neuve, ou déjà convertie — n'a plus rien à rattraper : les
 * rattrapages d'avant parlent de tables qu'elle n'a plus.
 */
export const migrate = (db: Database): void => {
  // D'abord : les accès qui suivent se posent dans le premier workspace.
  workspaces(db);
  if (!columns(db, "boards").includes("view_id")) catchUpBeforeViews(db);
  // Comptes d'avant la vue d'ouverture : la conversion la tire de leur mode.
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
  // Une demande par liste qui reçoit la boîte : l'unicité de l'e-mail passe
  // à la liste (idx_support_requests_mailbox_list, schema.ts).
  db.exec("DROP INDEX IF EXISTS idx_support_requests_mailbox");
  // La confirmation passe par le seul code : le jeton du lien s'en va.
  if (columns(db, "list_mailbox_optins").includes("token")) {
    db.exec("ALTER TABLE list_mailbox_optins DROP COLUMN token");
  }
  // Après tous les rattrapages des accès : ils ont pu poser un Paramétrage.
  workspaceManagement(db);
  globalAdministration(db);
  withoutUptimeWith365(db);
  sortedCategories(db);
  // Cartes créées avant la période, la récurrence et le rappel de l'échéance.
  const cardColumns = columns(db, "task_cards");
  for (const column of ["start_date", "recurrence", "reminder", "reminded_for"]) {
    if (!cardColumns.includes(column)) {
      db.exec(`ALTER TABLE task_cards ADD COLUMN ${column} TEXT NOT NULL DEFAULT ''`);
    }
  }
  // Pièces jointes d'avant leur ordre : la plus récente reste en tête.
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
    // Une échéance qui avait un début était une période.
    db.exec("UPDATE task_cards SET due_form = 'periode' WHERE start_date != ''");
  }
  if (!cardColumns.includes("cover_interval")) {
    db.exec("ALTER TABLE task_cards ADD COLUMN cover_interval INTEGER NOT NULL DEFAULT 0");
  }
  // Couvertures d'avant leur nom et leur taille.
  const coverColumns = columns(db, "card_covers");
  if (coverColumns.length > 0 && !coverColumns.includes("name")) {
    db.exec("ALTER TABLE card_covers ADD COLUMN name TEXT NOT NULL DEFAULT ''");
    db.exec("ALTER TABLE card_covers ADD COLUMN size INTEGER NOT NULL DEFAULT 0");
  }
  // Les vues sans workspace — celles d'avant eux, celles qu'une base neuve
  // vient de recevoir (vuesEtTableaux) — vont dans le premier.
  db.prepare("UPDATE views SET workspace_id = ? WHERE workspace_id IS NULL").run(
    firstWorkspace(db),
  );
};

/**
 * Les catégories se rangent : d'avant leur position, elles prennent dans
 * chaque tableau l'ordre de leur nom, celui qu'elles avaient à l'écran.
 */
const sortedCategories = (db: Database): void => {
  if (columns(db, "categories").includes("position")) return;
  db.transaction(() => {
    db.exec("ALTER TABLE categories ADD COLUMN position INTEGER NOT NULL DEFAULT 0");
    db.exec(`
      UPDATE categories SET position = (
        SELECT COUNT(*) FROM categories AS avant
        WHERE avant.board_id = categories.board_id
          AND (avant.name < categories.name COLLATE NOCASE
            OR (avant.name = categories.name COLLATE NOCASE AND avant.id < categories.id))
      )
    `);
  })();
};

/** Le nom du workspace qu'une base reçoit quand elle n'en a aucun. */
const STARTING_WORKSPACE = "Milo";

/** Le premier workspace, créé s'il n'y en a aucun : il en existe toujours un. */
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

/** Posé une fois la gestion des workspaces donnée à qui modifiait le Paramétrage. */
const WORKSPACE_MANAGEMENT = "gestion_des_workspaces";

/**
 * Qui modifiait le Paramétrage avant les workspaces les gère d'emblée : sans
 * quoi seul le compte « admin » pourrait les créer et en donner la gestion.
 */
const workspaceManagement = (db: Database): void => {
  if (readSetting(db, WORKSPACE_MANAGEMENT)) return;
  db.exec("UPDATE principal_permissions SET workspaces = 'update' WHERE settings = 'update'");
  writeSetting(db, WORKSPACE_MANAGEMENT, true);
};

/** Posé une fois l'administration sortie des accès des workspaces. */
const GLOBAL_ADMINISTRATION = "administration_globale";

/**
 * Le Paramétrage et la gestion des workspaces valent pour toute
 * l'application : ils quittent les accès des workspaces pour l'administration
 * (principal_admin). Chacun garde le plus large de ce qu'il avait ici ou là.
 * Les accès qui ne lisent plus aucun type de widget s'effacent : ils
 * n'ouvraient le workspace que par le Paramétrage.
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
        // Illisible : n'accordait rien.
      }
      if (!Object.values(validWidgetRights(readValue)).some((access) => access !== "")) forget.run(rowid);
    }
    writeSetting(db, GLOBAL_ADMINISTRATION, true);
  })();
};

/** Posé une fois Uptime retiré et le type « 365 » accordé. */
const WITHOUT_UPTIME_WITH_365 = "sans_uptime_avec_365";

/**
 * Le widget Uptime s'en va, avec les machines qu'il vérifiait — et le type
 * « Télémétrie », qui n'était qu'à lui. Le calendrier et le courrier passent
 * du type « Commun » au type « 365 » : chacun y reçoit la permission qu'il
 * avait sur « Commun », pour ne perdre aucun des deux.
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
        // Illisible : n'accordait rien, et n'accorde toujours rien.
      }
      const { telemetry: _telemetry, ...rest } = readValue;
      write.run(JSON.stringify({ ...rest, m365: rest["m365"] ?? rest["common"] ?? "" }), rowid);
    }
    writeSetting(db, WITHOUT_UPTIME_WITH_365, true);
  })();
};

/** Le premier workspace, dans une requête : là où se posent les accès d'avant eux. */
const FIRST_WORKSPACE = "(SELECT id FROM workspaces ORDER BY position, id LIMIT 1)";

/**
 * Les workspaces : les vues et les comptes en reçoivent un, et les accès
 * passent workspace par workspace. Ceux d'avant vont dans le premier, créé
 * pour l'occasion — les vues, elles, à la fin des rattrapages (migrate).
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

/** Les rattrapages des bases d'avant les vues, dans l'ordre où ils sont venus. */
const catchUpBeforeViews = (db: Database): void => {
  // Bases d'avant Entra : les comptes gardent leur ligne — ils sont acteurs,
  // auteurs, membres — et s'y rattachent par leur e-mail à leur première
  // connexion par Microsoft. Leurs mots de passe ne servent plus.
  const accountColumns = columns(db, "users");
  if (accountColumns.length > 0 && !accountColumns.includes("entra_id")) {
    db.exec("ALTER TABLE users ADD COLUMN entra_id TEXT NOT NULL DEFAULT ''");
    db.exec("ALTER TABLE users ADD COLUMN entra_groups TEXT NOT NULL DEFAULT '[]'");
    db.exec("ALTER TABLE users ADD COLUMN system INTEGER NOT NULL DEFAULT 0");
    db.exec("UPDATE users SET password_hash = ''");
    db.exec("DELETE FROM sessions");
  }
  // Les rôles par compte ont précédé ceux par utilisateur ou groupe Entra.
  db.exec("DROP TABLE IF EXISTS user_company_roles");

  // Bases d'avant le support des sociétés : son adresse e-mail et son site.
  const companyColumns = columns(db, "companies");
  if (!companyColumns.includes("support_email")) {
    db.exec("ALTER TABLE companies ADD COLUMN support_email TEXT NOT NULL DEFAULT ''");
  }
  if (!companyColumns.includes("support_url")) {
    db.exec("ALTER TABLE companies ADD COLUMN support_url TEXT NOT NULL DEFAULT ''");
  }

  // Bases créées avant l'ajout des sociétés : on ajoute la colonne manquante.
  const projectColumns = columns(db, "projects");
  if (!projectColumns.includes("company_id")) {
    db.exec("ALTER TABLE projects ADD COLUMN company_id INTEGER REFERENCES companies(id)");
  }

  // Bases créées avant la séparation prénom / nom : on ajoute les colonnes et
  // on découpe le nom existant au premier espace.
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

  // Comptes créés avant le choix d'un mode d'ouverture : ils ouvrent sur les
  // projets, comme avant.
  if (userColumns.length > 0 && !userColumns.includes("default_mode")) {
    db.exec("ALTER TABLE users ADD COLUMN default_mode TEXT NOT NULL DEFAULT 'projects'");
  }

  // Comptes d'avant que la liste devienne un widget des sections : le
  // panneau des statistiques ne se montrait ou ne se cachait que par eux. Il
  // n'y a plus de panneau à part, le réglage s'en va.
  for (const column of ["support_stats", "asset_stats"]) {
    if (columns(db, "users").includes(column)) {
      db.exec(`ALTER TABLE users DROP COLUMN ${column}`);
    }
  }

  // Sessions ouvertes avant qu'elles expirent : elles ne valaient que par leur
  // présence en base, indéfiniment. On leur donne une date de fin, comptée à
  // partir de maintenant plutôt que de leur création — sinon toutes les
  // sessions en cours se fermeraient d'un coup au redémarrage.
  const sessionColumns = columns(db, "sessions");
  if (sessionColumns.length > 0 && !sessionColumns.includes("expires_at")) {
    db.exec("ALTER TABLE sessions ADD COLUMN last_seen_at TEXT NOT NULL DEFAULT ''");
    db.exec("ALTER TABLE sessions ADD COLUMN expires_at TEXT NOT NULL DEFAULT ''");
  }

  const listColumns = columns(db, "task_lists");
  // Une base d'avant les tableaux : ses listes pendent encore à une société.
  // Les rattrapages qui suivent ne concernent qu'elle, jamais une base neuve.
  const listsBeforeBoards = listColumns.length > 0 && !listColumns.includes("board_id");

  // Listes créées avant leur rattachement à une société : on les affecte à la
  // première société connue. Cette colonne cède ensuite la place à
  // « board_id » (migration suivante), mais le rattrapage reste nécessaire
  // pour la traverser.
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

  // Listes créées avant le choix d'une couleur : sans couleur, donc vide.
  if (listsBeforeBoards && !listColumns.includes("color")) {
    db.exec("ALTER TABLE task_lists ADD COLUMN color TEXT NOT NULL DEFAULT ''");
  }

  // Listes rattachées directement à une société, avant l'arrivée des tableaux :
  // chaque société qui avait des listes reçoit un tableau qui les recueille.
  // SQLite ne sait pas retirer « company_id » (elle porte une clé étrangère) :
  // la table est reconstruite, en conservant les identifiants pour que les
  // cartes restent accrochées à leur liste.
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

      // Une liste sans société (société supprimée en cours de route) n'a pas
      // de tableau naturel : elle rejoint celui de la première société plutôt
      // que de disparaître avec ses cartes.
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

  // Bases créées avant les tableaux de projets : les catégories étaient
  // globales et uniques par nom. Un premier tableau les recueille, ainsi que
  // les projets existants. SQLite ne sait pas retirer la contrainte UNIQUE sur
  // le nom : la table est reconstruite, en conservant les identifiants pour
  // que les projets restent accrochés à leur catégorie.
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

  // Commentaires écrits avant qu'on retienne leur auteur : la colonne est
  // ajoutée vide, ces commentaires resteront sans auteur connu.
  const commentColumns = columns(db, "comments");
  if (commentColumns.length > 0 && !commentColumns.includes("user_id")) {
    db.exec(
      "ALTER TABLE comments ADD COLUMN user_id INTEGER REFERENCES users(id) ON DELETE SET NULL",
    );
  }

  // Cartes créées avant leur numérotation : on numérote chaque tableau à part,
  // dans l'ordre de création de ses cartes.
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

  // Cartes créées avant les séparateurs : elles sont toutes des cartes.
  if (cardColumns.length > 0 && !cardColumns.includes("kind")) {
    db.exec("ALTER TABLE task_cards ADD COLUMN kind TEXT NOT NULL DEFAULT 'card'");
  }

  // Fils ouverts avant qu'on distingue les mots de l'application : on retrouve
  // ceux qui notaient une création à leur texte, écrit par nous seuls.
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

  // Tableaux créés avant le réglage du numéro des cartes : ils le montrent.
  const boardColumns = columns(db, "boards");
  if (boardColumns.length > 0 && !boardColumns.includes("show_card_numbers")) {
    db.exec("ALTER TABLE boards ADD COLUMN show_card_numbers INTEGER NOT NULL DEFAULT 1");
  }

  // Tableaux créés avant l'option « Privé » : ils restent visibles de tous, et
  // sans auteur connu — le premier à fermer l'un d'eux en devient l'auteur.
  if (boardColumns.length > 0 && !boardColumns.includes("owner_id")) {
    db.exec(
      "ALTER TABLE boards ADD COLUMN owner_id INTEGER REFERENCES users(id) ON DELETE SET NULL",
    );
  }
  if (boardColumns.length > 0 && !boardColumns.includes("is_private")) {
    db.exec("ALTER TABLE boards ADD COLUMN is_private INTEGER NOT NULL DEFAULT 0");
  }

  // Tableaux créés avant l'option « Verrouillé » : leurs listes restent libres.
  if (boardColumns.length > 0 && !boardColumns.includes("is_locked")) {
    db.exec("ALTER TABLE boards ADD COLUMN is_locked INTEGER NOT NULL DEFAULT 0");
  }

  // Tableaux de projets créés avant l'option « Privé » : même règle que pour
  // ceux des tâches — ouverts à tous, sans auteur connu.
  const projectBoardColumns = columns(db, "project_boards");
  if (projectBoardColumns.length > 0 && !projectBoardColumns.includes("owner_id")) {
    db.exec(
      "ALTER TABLE project_boards ADD COLUMN owner_id INTEGER REFERENCES users(id) ON DELETE SET NULL",
    );
  }
  if (projectBoardColumns.length > 0 && !projectBoardColumns.includes("is_private")) {
    db.exec("ALTER TABLE project_boards ADD COLUMN is_private INTEGER NOT NULL DEFAULT 0");
  }

  // Cartes créées avant leur fiche : elles n'ont pas encore de description.
  if (cardColumns.length > 0 && !cardColumns.includes("description")) {
    db.exec("ALTER TABLE task_cards ADD COLUMN description TEXT NOT NULL DEFAULT ''");
  }

  // Cartes créées avant l'échéance : elles n'en portent pas.
  if (cardColumns.length > 0 && !cardColumns.includes("due_date")) {
    db.exec("ALTER TABLE task_cards ADD COLUMN due_date TEXT NOT NULL DEFAULT ''");
  }

  // Catégories d'accès créées avant le verrou : elles restent ouvertes.
  const accessCategoryColumns = columns(db, "access_categories");
  if (accessCategoryColumns.length > 0 && !accessCategoryColumns.includes("is_locked")) {
    db.exec("ALTER TABLE access_categories ADD COLUMN is_locked INTEGER NOT NULL DEFAULT 0");
  }

  // Sections créées quand elles portaient encore un nom : la largeur seule les
  // définit désormais, la colonne s'en va.
  const accessSectionColumns = columns(db, "access_sections");
  if (accessSectionColumns.includes("name")) {
    db.exec("ALTER TABLE access_sections DROP COLUMN name");
  }

  // Sections d'avant l'écart propre à chacune : elles reprennent celui que
  // leur catégorie fixait pour toutes ses colonnes, s'il y en avait un, et la
  // catégorie ne le porte plus.
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

  // Tickets créés quand ils n'avaient qu'un acteur : il passe
  // dans la table des acteurs, et la colonne s'en va. SQLite refuse de retirer
  // une colonne indexée ou citée par une clé étrangère : l'index tombe
  // d'abord, et les clés étrangères sont suspendues le temps du retrait.
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

  // Demandes d'avant l'import des e-mails : ni objet, ni expéditeur, ni
  // statut « Ouvert ». SQLite ne sait pas retoucher une contrainte CHECK : la
  // table est reconstruite, en conservant les identifiants pour que les
  // acteurs, les étiquettes et les fils restent accrochés à leur demande.
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
  // Demandes d'avant les numéros de ticket : elles sont numérotées dans
  // l'ordre où elles sont arrivées, et le compteur repart du dernier.
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
  // Étiquettes du support d'avant leur mise en commun : chaque société avait
  // les siennes. Celles qui portent le même nom n'en font plus qu'une — la
  // plus ancienne, qui reprend les demandes des autres —, et la table perd sa
  // colonne de société. SQLite ne sait pas retirer une colonne citée par une
  // clé étrangère : la table est reconstruite, identifiants conservés.
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
        // Une seule liste désormais : les rangs repartent de zéro, dans
        // l'ordre où elles se suivaient.
        const store = db.prepare("UPDATE support_labels SET position = ? WHERE id = ?");
        (
          db.prepare("SELECT id FROM support_labels ORDER BY position, id").all() as {
            id: number;
          }[]
        ).forEach(({ id }, rank) => store.run(rank, id));
      }),
    );
  }

  // Étiquettes d'avant le poids : toutes pèsent zéro, sauf celles d'urgence,
  // qui reprennent le leur.
  if (!columns(db, "support_labels").includes("weight")) {
    db.transaction(() => {
      db.exec("ALTER TABLE support_labels ADD COLUMN weight INTEGER NOT NULL DEFAULT 0");
      const setWeight = db.prepare(
        "UPDATE support_labels SET weight = ? WHERE name = ? COLLATE NOCASE",
      );
      for (const { name, weight } of SUPPORT_URGENCY_LABELS) setWeight.run(weight, name);
    })();
  }

  // Étiquettes de projets d'avant le poids : toutes pèsent zéro.
  if (!columns(db, "project_labels").includes("weight")) {
    db.exec("ALTER TABLE project_labels ADD COLUMN weight INTEGER NOT NULL DEFAULT 0");
  }

  // Installation neuve : le support reçoit ses étiquettes — l'urgence, puis le
  // canal —, et un e-mail entrant reçoit d'office « Sans urgence », « E-mail »
  // et quinze jours ouvrés d'échéance. Le marqueur des étiquettes d'urgence,
  // absent, dit que la base est neuve ; une base plus ancienne qui n'en a pas
  // non plus a déjà des étiquettes, et passe à l'étape suivante.
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

  // Bases d'avant les étiquettes d'urgence : le support les reçoit une fois.
  // Le réglage le note — une étiquette supprimée ensuite ne revient pas à
  // chaque démarrage.
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
  // La note « Demande reçue par e-mail le … » ouvrait le fil des demandes
  // importées : l'e-mail qui suit dit déjà tout, elle s'en va — copies des
  // fusions comprises.
  db.prepare(
    `DELETE FROM support_comments
     WHERE system = 1 AND user_id IS NULL AND text LIKE 'Demande reçue par e-mail le %'`,
  ).run();

  // Fils d'avant les commentaires internes : tout y était échange.
  if (!columns(db, "support_comments").includes("internal")) {
    db.exec("ALTER TABLE support_comments ADD COLUMN internal INTEGER NOT NULL DEFAULT 0");
  }

  // Messages d'avant les réponses par e-mail : aucun n'est parti.
  if (!columns(db, "support_comments").includes("mail_status")) {
    db.exec("ALTER TABLE support_comments ADD COLUMN mail_status TEXT NOT NULL DEFAULT ''");
    db.exec("ALTER TABLE support_comments ADD COLUMN mail_to TEXT NOT NULL DEFAULT ''");
  }

  // Messages d'avant les e-mails montrés tels quels : du HTML de l'éditeur,
  // sans fichier ni identifiant d'e-mail.
  if (!columns(db, "support_comments").includes("format")) {
    db.exec("ALTER TABLE support_comments ADD COLUMN mail_id TEXT NOT NULL DEFAULT ''");
    db.exec("ALTER TABLE support_comments ADD COLUMN format TEXT NOT NULL DEFAULT ''");
    db.exec("ALTER TABLE support_comments ADD COLUMN attachments TEXT NOT NULL DEFAULT '[]'");
  }
  // Réponses d'avant la copie : personne n'y était en copie.
  if (!columns(db, "support_comments").includes("mail_cc")) {
    db.exec("ALTER TABLE support_comments ADD COLUMN mail_cc TEXT NOT NULL DEFAULT ''");
    db.exec("ALTER TABLE support_comments ADD COLUMN mail_bcc TEXT NOT NULL DEFAULT ''");
  }
  // Messages d'avant les réponses par défaut : aucun n'est parti d'office.
  if (!columns(db, "support_comments").includes("auto_event")) {
    db.exec("ALTER TABLE support_comments ADD COLUMN auto_event TEXT NOT NULL DEFAULT ''");
  }
  // Réponses par défaut d'avant les évènements : aucune ne part d'office. Celles
  // qui en portaient une liste gardent le premier.
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

  // Postes inventoriés avant qu'on affiche qui s'y connecte : la colonne
  // s'ajoute vide, et le prochain inventaire de chaque poste la remplit.
  const assetColumns = columns(db, "assets");
  if (assetColumns.length > 0 && !assetColumns.includes("last_user")) {
    db.exec("ALTER TABLE assets ADD COLUMN last_user TEXT NOT NULL DEFAULT ''");
  }

  // Postes datés de la réception de leur inventaire, avant qu'on prenne
  // l'heure que l'agent y inscrit (ACCESSLOG/LOGDATE). Seule cette valeur est
  // extraite du JSON : relire les inventaires entiers à chaque démarrage
  // coûterait pour rien. Un poste déjà à jour n'est pas réécrit.
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

  // La notion de bâtiment a été retirée : un projet n'en cite plus, et la
  // table s'en va avec la colonne. SQLite refuse de retirer une colonne
  // indexée ou citée par une clé étrangère : l'index tombe d'abord, et les
  // clés étrangères sont suspendues le temps du retrait.
  if (projectColumns.includes("building_id")) {
    withoutForeignKeys(db, () => {
      db.exec("DROP INDEX IF EXISTS idx_projects_building");
      db.exec("ALTER TABLE projects DROP COLUMN building_id");
    });
  }
  db.exec("DROP INDEX IF EXISTS idx_buildings_company");
  db.exec("DROP TABLE IF EXISTS buildings");

  // Catégories d'avant les jalons propres à chacune : elles reprennent ceux
  // que le curseur d'avancement affichait jusque-là pour tous les projets.
  const categoryColumnNames = columns(db, "categories");
  if (categoryColumnNames.length > 0 && !categoryColumnNames.includes("milestones")) {
    db.exec("ALTER TABLE categories ADD COLUMN milestones TEXT NOT NULL DEFAULT '[]'");
    db.prepare("UPDATE categories SET milestones = ?").run(JSON.stringify(HISTORICAL_MILESTONES));
  }

  // Bases d'avant les types de jalons : les jalons vivaient sur la catégorie.
  // Chaque liste de jalons distincte devient un type, et les projets reçoivent
  // celui de leur catégorie : le curseur de chacun garde les marques qu'il
  // montrait. Les catégories qui portent la même liste partagent le type —
  // celles restées sur les jalons historiques, presque toutes, se retrouvent
  // sous « Standard » ; une liste retouchée prend le nom de sa catégorie.
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
          // Un nom déjà pris par une autre liste reçoit un numéro.
          let name = desired;
          for (let n = 2; byName.get(name); n += 1) name = `${desired} ${n}`;
          typeId = Number(create.run(name, list).lastInsertRowid);
          byList.set(list, typeId);
        }
        attach.run(typeId, category.id);
      }
    })();
  }

  // Bases d'avant les notifications de suppression.
  if (!columns(db, "notifications").includes("deleted")) {
    db.exec("ALTER TABLE notifications ADD COLUMN deleted INTEGER NOT NULL DEFAULT 0");
  }

  // Statuts d'avant « Nouveau » : « Non résolu » disparaît. Ses demandes
  // passent « Ouvert » — elles avaient été vues, elles ne sont pas nouvelles —
  // et la contrainte CHECK est réécrite. SQLite ne sait pas la retoucher : la
  // table est reconstruite depuis sa propre définition, identifiants
  // conservés ; ses index sont reposés ensuite (db/index.ts, INDEXES).
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

        // Un ordre d'onglets rangé perd « Non résolu » et reçoit « Nouveau » en
        // tête : c'est là qu'arrivent les demandes.
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

  // Indicateurs d'avant les sections des panneaux des statistiques : la
  // colonne s'ajoute, puis ils rejoignent une première section.
  for (const table of ["support_indicators", "asset_indicators"]) {
    if (!columns(db, table).includes("section_id")) {
      db.exec(
        `ALTER TABLE ${table} ADD COLUMN section_id INTEGER REFERENCES indicator_sections(id) ON DELETE CASCADE`,
      );
    }
  }
  attachIndicators(db);

  // Sections d'avant les modes Projet et Tâche : la contrainte CHECK de leur
  // panneau ne connaît que le Support et les Assets. SQLite ne sait pas la
  // retoucher : la table est reconstruite depuis sa propre définition,
  // identifiants conservés ; ses index sont reposés ensuite (INDEXES).
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

  // Sections des panneaux d'avant l'écart propre à chacune : elles reprennent
  // celui que leur panneau fixait dans ses réglages, qui s'en va.
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

  // Bases d'avant les références des projets.
  if (!columns(db, "projects").includes("number")) {
    db.exec("ALTER TABLE projects ADD COLUMN number INTEGER NOT NULL DEFAULT 0");
  }
  numberReferences(db);
  setDefaultSections(db);

  // Bases d'avant « Hérité » : toutes les sections étaient publiques. Les
  // index d'avant ne couvraient pas le propriétaire : ils sont refaits.
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

  // Un onglet n'a de propriétaire que privé : ceux d'avant cette règle
  // retenaient leur auteur même ouverts à tous, et seul cet auteur pouvait
  // alors les fermer. Ils n'en ont plus.
  for (const table of ["boards", "project_boards", "access_categories"]) {
    if (columns(db, table).includes("owner_id")) {
      db.exec(`UPDATE ${table} SET owner_id = NULL WHERE is_private = 0`);
    }
  }

  // Les mots d'ouverture d'un fil étaient signés de qui avait créé l'élément :
  // ils le sont désormais de Milo, c'est-à-dire d'aucun compte, et le
  // créateur passe dans le texte.
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

/** Posé une fois le Paramétrage sorti des rôles. */
const SETTINGS_OUTSIDE_ROLES = "parametrage_hors_roles";

/**
 * Le Paramétrage se réglait dans les rôles, société par société ; il se règle
 * désormais pour l'application, par utilisateur ou groupe. Chacun garde ce
 * qu'il avait : « Modifier » s'il était administrateur quelque part ou si l'un
 * de ses rôles le cochait, sinon « Voir » si l'un le cochait. Tous les modes
 * lui restent ouverts. Puis la case disparaît des rôles.
 */
export const splitSettings = (db: Database): void => {
  if (readSetting(db, SETTINGS_OUTSIDE_ROLES)) return;
  // Une base neuve n'a jamais eu de rôles : il n'y a rien à en sortir.
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
        // Un JSON illisible n'accordait rien.
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
    // Les modes ouverts ne servent plus : les types de widgets les remplacent
    // (permissionsParTypeDeWidget).
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

/** Posé une fois les permissions passées aux types de widgets. */
const PERMISSIONS_BY_TYPE = "permissions_par_type_de_widget";

/**
 * Les rôles, société par société, et les modes ouverts laissent la place à
 * une permission par type de widget, commune à toutes les sociétés. Chacun de
 * ceux qui avaient un accès — une permission réglée, ou un rôle quelque part —
 * reçoit « Modifier » pour tous les types et garde son Paramétrage. Puis les
 * rôles s'en vont.
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

/** Posé une fois les modes devenus des vues. */
const VIEWS_AND_BOARDS = "vues_et_tableaux";

/** Les modes d'avant les vues, dans l'ordre de leur sélecteur, et le nom de leur vue. */
const STARTING_VIEWS = [
  ["access", "Accès"],
  ["projects", "Projets"],
  ["tasks", "Tâches"],
  ["support", "Support"],
  ["assets", "Assets"],
] as const;

type PreviousMode = (typeof STARTING_VIEWS)[number][0];

/**
 * Une table refaite d'après son propre CREATE, retouché par « retouche » —
 * pour changer la table qu'une clé étrangère désigne. Les lignes et leurs
 * identifiants passent tels quels. Les clés étrangères doivent être
 * suspendues (sansClesEtrangeres).
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
  // Les colonnes de la nouvelle table : reprises de l'ancienne, ou calculées
  // d'après elle (« calculees ») ; celles qui disparaissent restent derrière.
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
 * Les modes deviennent des vues, et leurs onglets des tableaux :
 *
 * - Accès : chaque catégorie devient un tableau, ses colonnes et ses
 *   éléments ses sections et ses widgets ;
 * - Projets : chaque tableau de projets devient un tableau, avec ses
 *   catégories, ses étiquettes et ses projets ;
 * - Tâches : chaque tableau de tâches le reste, et sa société devient son
 *   filtre ;
 * - Support et Assets : un tableau chacun, « Demandes » et « Postes ».
 *
 * Les sections des panneaux de Projets et de Tâches, communes à tous leurs
 * tableaux, sont recopiées dans chacun ; celles du Support et des Assets vont
 * à leur unique tableau. Les structures personnelles (« Hérité » décoché), les
 * ordres d'onglets propres à chacun et la vue d'ouverture suivent.
 *
 * Sur une base neuve, les cinq vues naissent avec un tableau chacun, et la
 * liste qui va avec.
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

/** Une base neuve : un tableau par vue, avec la liste de la vue. */
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

/** Une base d'avant les vues : chaque mode devient la sienne. */
const convertModes = (
  db: Database,
  views: Record<PreviousMode, number>,
  currentTime: string,
): void => {
  // --- Les tableaux ---------------------------------------------------------
  // La table des tableaux de tâches devient celle de tous les tableaux : ses
  // lignes gardent leur identifiant, les listes et les étiquettes de tâches
  // n'ont donc pas à bouger.
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

  // Les projets, leurs catégories et leurs étiquettes suivent leur tableau,
  // et désignent désormais la table de tous les tableaux.
  for (const table of ["categories", "projects", "project_labels"]) {
    const move = db.prepare(`UPDATE ${table} SET board_id = ? WHERE board_id = ?`);
    // Du plus grand identifiant au plus petit n'aiderait pas : les nouveaux
    // identifiants viennent après tous les anciens, aucun ne se recouvre.
    for (const [old, newValue] of projectBoards) move.run(newValue, old);
    rebuildTable(db, table, (sql) =>
      sql.replace(/REFERENCES\s+"?project_boards"?\s*\(id\)/gi, "REFERENCES boards(id)"),
    );
  }

  // --- Les sections et les widgets -----------------------------------------
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

  // Accès : les colonnes de chaque catégorie, et ce qu'elles portent.
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

  // Les panneaux : leurs sections vont à chacun des tableaux qui les montrait.
  const panels = [
    ["support", "support_indicators", [supportBoard]],
    ["assets", "asset_indicators", [assetsBoard]],
    ["projects", "project_indicators", [...projectBoards.values()]],
    ["tasks", "task_indicators", taskBoards],
  ] as const;
  if (columns(db, "indicator_sections").length > 0) {
    for (const [panel, table, tableaux] of panels) {
      const sections = db
        .prepare("SELECT * FROM indicator_sections WHERE panel = ? ORDER BY position, id")
        .all(panel) as Section[];
      const widgets =
        columns(db, table).length > 0
          ? db.prepare(`SELECT * FROM ${table} WHERE section_id = ? ORDER BY position, id`)
          : null;
      for (const board of tableaux) {
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

  // --- Ce qui est propre à chaque compte -----------------------------------
  // « Hérité » décoché : la portée d'un panneau ou d'une catégorie devient
  // celle de chacun de ses tableaux.
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
  for (const [old, tableaux] of scopes) {
    for (const { user_id } of personal.all(old) as {
      user_id: number;
    }[]) {
      for (const board of tableaux) setPersonal.run(user_id, `board:${board}`, currentTime);
    }
  }
  db.exec("DELETE FROM personal_layouts WHERE scope NOT LIKE 'board:%'");

  // L'ordre des onglets : celui des modes devient celui des vues, ceux des
  // tableaux suivent leur nouvel identifiant. Les onglets fixes du Support et
  // des Assets n'existent plus.
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
      // Les tableaux de tâches se rangeaient société par société : ils se
      // rangent désormais ensemble, dans la vue Tâches.
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

  // La vue d'ouverture : celle du mode d'ouverture.
  for (const [mode, view] of Object.entries(views)) {
    db.prepare("UPDATE users SET default_view = ? WHERE default_mode = ?").run(String(view), mode);
  }

  // --- Ce qui ne sert plus --------------------------------------------------
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

const CONTEXTS = "contextes";

/** L'ordre des contextes nés des sociétés ; les autres suivent, par nom. */
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
 * Les sociétés deviennent des contextes, propres à chaque tableau :
 *
 * - chaque tableau reçoit un contexte par société, dans l'ordre dit ; une
 *   base sans société n'en reçoit aucun ;
 * - un projet passe au contexte de sa société dans son tableau, une carte à
 *   celui de la société qui filtrait son tableau — à défaut, au premier ;
 * - les demandes et les postes vont au tableau de la première liste de
 *   demandes, ou de postes, posée en public, au contexte de leur société ;
 *   une demande garde la boîte de sa société, d'où partent ses réponses ;
 * - les listes de demandes reçoivent les boîtes des sociétés, chacune vers
 *   son contexte ; les listes de postes, les tags déjà reconnus ;
 * - l'adresse d'envoi commune est celle d'Arco Marketing, à défaut la
 *   première boîte connue.
 *
 * Les sociétés et le filtre des tableaux disparaissent.
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

      // Les contextes de chaque tableau, et la correspondance des sociétés.
      db.exec(
        "CREATE TEMP TABLE correspondance (board_id INTEGER, company_id INTEGER, context_id INTEGER)",
      );
      const createContext = db.prepare(
        "INSERT INTO contexts (board_id, name, position, created_at) VALUES (?, ?, ?, ?)",
      );
      const matches = db.prepare("INSERT INTO temp.correspondance VALUES (?, ?, ?)");
      const tableaux = db.prepare("SELECT id FROM boards").all() as {
        id: number;
      }[];
      for (const { id } of tableaux) {
        const alreadyThere = db.prepare("SELECT 1 FROM contexts WHERE board_id = ?").get(id);
        if (alreadyThere) continue;
        // Sans société, le tableau n'a pas de contexte : on en ajoute depuis
        // sa liste.
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

      // Le tableau qui reçoit les demandes, celui qui reçoit les postes : celui
      // de la première liste posée en public.
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

      // Les projets.
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

      // Les cartes : le contexte de la société qui filtrait leur tableau.
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

      // Les demandes : le contexte de leur société, dans le tableau des demandes.
      const requestColumns = columns(db, "support_requests");
      if (requestColumns.includes("company_id")) {
        // Sans tableau où aller, une demande n'a plus où se montrer.
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

      // Les postes : le contexte de leur société, dans le tableau des postes.
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

      // Les listes de demandes reçoivent les boîtes des sociétés ; celle qui
      // n'en recevait qu'une la garde seule.
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
          // Une configuration illisible repart de zéro.
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
              context: boardContext(s.id),
            }))
            .filter((b) => b.context !== null);
          delete config.boite;
        } else {
          const only = typeof config.tag === "string" && config.tag ? config.tag : null;
          config.tags = knownTags
            .filter((t) => only === null || t.tag === only)
            .map((t) => ({
              tag: t.tag,
              context: boardContext(t.company_id),
            }))
            .filter((t) => t.context !== null);
          delete config.tag;
        }
        writeConfig.run(JSON.stringify(config), widget.id);
      }

      // L'adresse d'envoi commune.
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

      // Le filtre des tableaux et les sociétés disparaissent.
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

const LISTS_PER_WIDGET = "listes_par_widget";

interface ListWidget {
  id: number;
  type: string;
  config: string;
  board_id: number;
  owner_id: number | null;
}

/**
 * Chaque widget de liste possède ses éléments : il reçoit une clé, que ses
 * projets, ses listes de tâches, ses demandes et ses postes portent aussi.
 *
 * Les copies personnelles (« Hérité » décoché) gardent la clé du widget
 * public dont elles sont la copie — le même type, au même rang dans le
 * tableau. Les éléments vont au premier widget public de leur tableau ; une
 * demande va d'abord à celui qui reçoit sa boîte, un poste à celui qui
 * reçoit son tag.
 */
export const listsPerWidget = (db: Database): void => {
  if (readSetting(db, LISTS_PER_WIDGET)) return;
  db.transaction(() => {
    for (const table of ["projects", "task_lists", "support_requests", "assets"]) {
      // Une base neuve n'a pas encore ses postes : leur table naît après les
      // migrations, avec la colonne (schema.ts).
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
    // Les clés des widgets publics, par tableau et par type, dans l'ordre.
    const publicIds = new Map<string, string[]>();
    // Le rang atteint, par compte, tableau et type, pour les copies.
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

    // Le widget public d'un tableau qui reçoit cette valeur, sinon le premier.
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

const OPTIONAL_CONTEXTS = "contextes_facultatifs";

interface DetailedColumn {
  name: string;
  notnull: number;
}

/**
 * Un tableau peut n'avoir aucun contexte : ses projets et ses demandes n'en
 * ont pas non plus. Le contexte devient facultatif, et une demande comme un
 * poste portent leur tableau — c'était leur contexte qui le disait.
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

const CONFIRMED_MAILBOXES = "boites_confirmees_par_liste";

/**
 * Les boîtes de support se confirment liste par liste (lib/optin.ts). Celles
 * qu'une liste relevait avant la confirmation le restent, confirmées d'office
 * — depuis toujours, pour que leur relève ne s'arrête ni ne saute rien. Une
 * base passée par la confirmation par adresse (mailbox_optins) en garde
 * l'état, recopié pour chaque liste qui dit l'adresse.
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
      let readValue: { mailboxes?: { email?: unknown }[]; list?: unknown } = {};
      try {
        readValue = JSON.parse(config) as typeof readValue;
      } catch {
        continue;
      }
      const list = typeof readValue.list === "string" ? readValue.list : "";
      if (!list) continue;
      for (const mailbox of Array.isArray(readValue.mailboxes) ? readValue.mailboxes : []) {
        const email = typeof mailbox?.email === "string" ? mailbox.email.trim().toLowerCase() : "";
        if (!email) continue;
        // Par adresse, seules celles qui étaient confirmées le restent ; sans
        // confirmation du tout, toutes l'étaient de fait.
        const confirmed = byAddress ? (before.get(email) ?? "") : "1970-01-01T00:00:00.000Z";
        insertRow.run(list, email, confirmed, currentTime);
      }
    }
    if (byAddress) db.exec("DROP TABLE mailbox_optins");
    writeSetting(db, CONFIRMED_MAILBOXES, true);
  })();
};
