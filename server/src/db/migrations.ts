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
  typeDuPanneau,
  validWidgetRights,
  widgetRightsPartout,
} from "@milo/shared";
import { heureDeParis } from "../lib/time.js";

/** Les jalons que tous les projets partageaient avant qu'ils suivent la catégorie. */
const JALONS_HISTORIQUES = [
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
const sansClesEtrangeres = (db: Database, action: () => void): void => {
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
export const rattacherIndicateurs = (db: Database): void => {
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
const REFERENCES_COMMUNES = "references_communes";
/** Le compteur des références (repositories/references.ts). */
const COMPTEUR_REFERENCES = "support_ticket_counter";

const lireReglage = (db: Database, cle: string): unknown => {
  const ligne = db.prepare("SELECT value FROM settings WHERE key = ?").get(cle) as
    { value: string } | undefined;
  try {
    return ligne ? JSON.parse(ligne.value) : undefined;
  } catch {
    return undefined;
  }
};

const ecrireReglage = (db: Database, cle: string, valeur: unknown): void => {
  db.prepare(
    `INSERT INTO settings (key, value) VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
  ).run(cle, JSON.stringify(valeur));
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
export const numeroterReferences = (db: Database): void => {
  const communes = lireReglage(db, REFERENCES_COMMUNES) === true;
  const sansReference = communes ? "number = 0" : "1";
  const elements = db
    .prepare(
      `SELECT 'project' AS sorte, id, created_at FROM projects WHERE ${sansReference}
       UNION ALL
       SELECT 'card' AS sorte, id, created_at FROM task_cards WHERE kind = 'card' AND ${sansReference}
       ORDER BY created_at, id`,
    )
    .all() as { sorte: "project" | "card"; id: number }[];
  if (communes && elements.length === 0) return;

  db.transaction(() => {
    const compteur = lireReglage(db, COMPTEUR_REFERENCES);
    const { max } = db
      .prepare(
        communes
          ? `SELECT MAX(
               (SELECT COALESCE(MAX(number), 0) FROM support_requests),
               (SELECT COALESCE(MAX(number), 0) FROM projects),
               (SELECT COALESCE(MAX(number), 0) FROM task_cards)
             ) AS max`
          : "SELECT COALESCE(MAX(number), 0) AS max FROM support_requests",
      )
      .get() as { max: number };
    let numero = Math.max(typeof compteur === "number" ? compteur : 0, max);
    const projet = db.prepare("UPDATE projects SET number = ? WHERE id = ?");
    const carte = db.prepare("UPDATE task_cards SET number = ? WHERE id = ?");
    for (const { sorte, id } of elements) {
      numero += 1;
      (sorte === "project" ? projet : carte).run(numero, id);
    }
    // Un séparateur ne porte pas de référence.
    if (!communes) db.exec("UPDATE task_cards SET number = 0 WHERE kind = 'separator'");
    ecrireReglage(db, COMPTEUR_REFERENCES, numero);
    ecrireReglage(db, REFERENCES_COMMUNES, true);
  })();
};

/**
 * Les modes Projet et Tâche montraient leur liste d'office : passés aux
 * sections, ils en reçoivent une première, qui porte la liste, pour ne pas
 * s'ouvrir vides. Posée une fois — le réglage s'en souvient : un panneau
 * qu'on a vidé exprès le reste. Reposée après la restauration d'une
 * sauvegarde d'avant les sections de ces modes.
 */
export const poserSectionsParDefaut = (db: Database): void => {
  for (const [table, panel] of [
    ["project_indicators", "projects"],
    ["task_indicators", "tasks"],
  ] as const) {
    const cle = `${panel}_sections_posees`;
    if (lireReglage(db, cle) === true) continue;
    db.transaction(() => {
      if (!db.prepare("SELECT 1 FROM indicator_sections WHERE panel = ?").get(panel)) {
        const maintenant = new Date().toISOString();
        const { lastInsertRowid } = db
          .prepare("INSERT INTO indicator_sections (panel, position, created_at) VALUES (?, 0, ?)")
          .run(panel, maintenant);
        db.prepare(
          `INSERT INTO ${table} (section_id, type, config, position, created_at)
           VALUES (?, 'list', '{}', 0, ?)`,
        ).run(lastInsertRowid, maintenant);
      }
      ecrireReglage(db, cle, true);
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
  if (!columns(db, "boards").includes("view_id")) rattraperAvantLesVues(db);
  // Comptes d'avant la vue d'ouverture : la conversion la tire de leur mode.
  if (!columns(db, "users").includes("default_view")) {
    db.exec("ALTER TABLE users ADD COLUMN default_view TEXT NOT NULL DEFAULT ''");
  }
  vuesEtTableaux(db);
  separerParametrage(db);
  permissionsParTypeDeWidget(db);
  contextes(db);
  listesParWidget(db);
  contextesFacultatifs(db);
  boitesConfirmees(db);
  // Une demande par liste qui reçoit la boîte : l'unicité de l'e-mail passe
  // à la liste (idx_support_requests_mailbox_list, schema.ts).
  db.exec("DROP INDEX IF EXISTS idx_support_requests_mailbox");
  // La confirmation passe par le seul code : le jeton du lien s'en va.
  if (columns(db, "list_mailbox_optins").includes("token")) {
    db.exec("ALTER TABLE list_mailbox_optins DROP COLUMN token");
  }
  // Après tous les rattrapages des accès : ils ont pu poser un Paramétrage.
  gestionDesWorkspaces(db);
  administrationGlobale(db);
  sansUptimeAvec365(db);
  categoriesRangees(db);
  // Cartes créées avant la période, la récurrence et le rappel de l'échéance.
  const colonnesDesCartes = columns(db, "task_cards");
  for (const colonne of ["start_date", "recurrence", "reminder", "reminded_for"]) {
    if (!colonnesDesCartes.includes(colonne)) {
      db.exec(`ALTER TABLE task_cards ADD COLUMN ${colonne} TEXT NOT NULL DEFAULT ''`);
    }
  }
  // Pièces jointes d'avant leur ordre : la plus récente reste en tête.
  if (!columns(db, "card_attachments").includes("position")) {
    db.exec("ALTER TABLE card_attachments ADD COLUMN position INTEGER NOT NULL DEFAULT 0");
    db.exec("UPDATE card_attachments SET position = -id");
  }
  if (!colonnesDesCartes.includes("overdue_for")) {
    db.exec("ALTER TABLE task_cards ADD COLUMN overdue_for TEXT NOT NULL DEFAULT ''");
  }
  if (!columns(db, "checklist_items").includes("overdue_for")) {
    db.exec("ALTER TABLE checklist_items ADD COLUMN overdue_for TEXT NOT NULL DEFAULT ''");
  }
  if (!colonnesDesCartes.includes("due_form")) {
    db.exec("ALTER TABLE task_cards ADD COLUMN due_form TEXT NOT NULL DEFAULT 'date'");
    // Une échéance qui avait un début était une période.
    db.exec("UPDATE task_cards SET due_form = 'periode' WHERE start_date != ''");
  }
  if (!colonnesDesCartes.includes("cover_interval")) {
    db.exec("ALTER TABLE task_cards ADD COLUMN cover_interval INTEGER NOT NULL DEFAULT 0");
  }
  // Couvertures d'avant leur nom et leur taille.
  const colonnesDesCouvertures = columns(db, "card_covers");
  if (colonnesDesCouvertures.length > 0 && !colonnesDesCouvertures.includes("name")) {
    db.exec("ALTER TABLE card_covers ADD COLUMN name TEXT NOT NULL DEFAULT ''");
    db.exec("ALTER TABLE card_covers ADD COLUMN size INTEGER NOT NULL DEFAULT 0");
  }
  // Les vues sans workspace — celles d'avant eux, celles qu'une base neuve
  // vient de recevoir (vuesEtTableaux) — vont dans le premier.
  db.prepare("UPDATE views SET workspace_id = ? WHERE workspace_id IS NULL").run(
    premierWorkspace(db),
  );
};

/**
 * Les catégories se rangent : d'avant leur position, elles prennent dans
 * chaque tableau l'ordre de leur nom, celui qu'elles avaient à l'écran.
 */
const categoriesRangees = (db: Database): void => {
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
const WORKSPACE_DE_DEPART = "Milo";

/** Le premier workspace, créé s'il n'y en a aucun : il en existe toujours un. */
export const premierWorkspace = (db: Database): number => {
  const ligne = db.prepare("SELECT id FROM workspaces ORDER BY position, id LIMIT 1").get() as
    | { id: number }
    | undefined;
  if (ligne) return ligne.id;
  return Number(
    db
      .prepare("INSERT INTO workspaces (name, position, created_at) VALUES (?, 0, ?)")
      .run(WORKSPACE_DE_DEPART, new Date().toISOString()).lastInsertRowid,
  );
};

/** Posé une fois la gestion des workspaces donnée à qui modifiait le Paramétrage. */
const GESTION_DES_WORKSPACES = "gestion_des_workspaces";

/**
 * Qui modifiait le Paramétrage avant les workspaces les gère d'emblée : sans
 * quoi seul le compte « admin » pourrait les créer et en donner la gestion.
 */
const gestionDesWorkspaces = (db: Database): void => {
  if (lireReglage(db, GESTION_DES_WORKSPACES)) return;
  db.exec("UPDATE principal_permissions SET workspaces = 'update' WHERE settings = 'update'");
  ecrireReglage(db, GESTION_DES_WORKSPACES, true);
};

/** Posé une fois l'administration sortie des accès des workspaces. */
const ADMINISTRATION_GLOBALE = "administration_globale";

/**
 * Le Paramétrage et la gestion des workspaces valent pour toute
 * l'application : ils quittent les accès des workspaces pour l'administration
 * (principal_admin). Chacun garde le plus large de ce qu'il avait ici ou là.
 * Les accès qui ne lisent plus aucun type de widget s'effacent : ils
 * n'ouvraient le workspace que par le Paramétrage.
 */
const administrationGlobale = (db: Database): void => {
  if (lireReglage(db, ADMINISTRATION_GLOBALE)) return;
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
    const lignes = db.prepare("SELECT rowid, widgets FROM principal_permissions").all() as {
      rowid: number;
      widgets: string;
    }[];
    const oublier = db.prepare("DELETE FROM principal_permissions WHERE rowid = ?");
    for (const { rowid, widgets } of lignes) {
      let lu: unknown = {};
      try {
        lu = JSON.parse(widgets);
      } catch {
        // Illisible : n'accordait rien.
      }
      if (!Object.values(validWidgetRights(lu)).some((acces) => acces !== "")) oublier.run(rowid);
    }
    ecrireReglage(db, ADMINISTRATION_GLOBALE, true);
  })();
};

/** Posé une fois Uptime retiré et le type « 365 » accordé. */
const SANS_UPTIME_AVEC_365 = "sans_uptime_avec_365";

/**
 * Le widget Uptime s'en va, avec les machines qu'il vérifiait — et le type
 * « Télémétrie », qui n'était qu'à lui. Le calendrier et le courrier passent
 * du type « Commun » au type « 365 » : chacun y reçoit la permission qu'il
 * avait sur « Commun », pour ne perdre aucun des deux.
 */
const sansUptimeAvec365 = (db: Database): void => {
  if (lireReglage(db, SANS_UPTIME_AVEC_365)) return;
  db.transaction(() => {
    db.exec("DELETE FROM board_widgets WHERE type = 'uptime'");
    db.exec("DROP TABLE IF EXISTS access_uptime");
    const lignes = db.prepare("SELECT rowid, widgets FROM principal_permissions").all() as {
      rowid: number;
      widgets: string;
    }[];
    const ecrire = db.prepare("UPDATE principal_permissions SET widgets = ? WHERE rowid = ?");
    for (const { rowid, widgets } of lignes) {
      let lu: Record<string, unknown> = {};
      try {
        const brut = JSON.parse(widgets) as unknown;
        if (brut && typeof brut === "object") lu = brut as Record<string, unknown>;
      } catch {
        // Illisible : n'accordait rien, et n'accorde toujours rien.
      }
      const { telemetry: _telemetrie, ...reste } = lu;
      ecrire.run(JSON.stringify({ ...reste, m365: reste["m365"] ?? reste["common"] ?? "" }), rowid);
    }
    ecrireReglage(db, SANS_UPTIME_AVEC_365, true);
  })();
};

/** Le premier workspace, dans une requête : là où se posent les accès d'avant eux. */
const PREMIER_WORKSPACE = "(SELECT id FROM workspaces ORDER BY position, id LIMIT 1)";

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
  const premier = premierWorkspace(db);
  if (!columns(db, "principal_permissions").includes("workspace_id")) {
    sansClesEtrangeres(db, () =>
      db.transaction(() =>
        refaireLaTable(
          db,
          "principal_permissions",
          (sql) =>
            sql.replace(
              /PRIMARY KEY\s*\(\s*principal_type\s*,\s*principal_id\s*\)/,
              `workspace_id INTEGER NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    workspaces TEXT NOT NULL DEFAULT '' CHECK (workspaces IN ('', 'update')),
    PRIMARY KEY (workspace_id, principal_type, principal_id)`,
            ),
          { workspace_id: String(premier) },
        ),
      )(),
    );
  }
};

/** Les rattrapages des bases d'avant les vues, dans l'ordre où ils sont venus. */
const rattraperAvantLesVues = (db: Database): void => {
  // Bases d'avant Entra : les comptes gardent leur ligne — ils sont acteurs,
  // auteurs, membres — et s'y rattachent par leur e-mail à leur première
  // connexion par Microsoft. Leurs mots de passe ne servent plus.
  const colonnesComptes = columns(db, "users");
  if (colonnesComptes.length > 0 && !colonnesComptes.includes("entra_id")) {
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
  for (const colonne of ["support_stats", "asset_stats"]) {
    if (columns(db, "users").includes(colonne)) {
      db.exec(`ALTER TABLE users DROP COLUMN ${colonne}`);
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
  const listesAvantTableaux = listColumns.length > 0 && !listColumns.includes("board_id");

  // Listes créées avant leur rattachement à une société : on les affecte à la
  // première société connue. Cette colonne cède ensuite la place à
  // « board_id » (migration suivante), mais le rattrapage reste nécessaire
  // pour la traverser.
  if (listesAvantTableaux && !listColumns.includes("company_id")) {
    db.exec(
      "ALTER TABLE task_lists ADD COLUMN company_id INTEGER REFERENCES companies(id) ON DELETE CASCADE",
    );
    const premiere = db.prepare("SELECT id FROM companies ORDER BY id LIMIT 1").get() as
      { id: number } | undefined;
    if (premiere) {
      db.prepare("UPDATE task_lists SET company_id = ? WHERE company_id IS NULL").run(premiere.id);
    }
  }

  // Listes créées avant le choix d'une couleur : sans couleur, donc vide.
  if (listesAvantTableaux && !listColumns.includes("color")) {
    db.exec("ALTER TABLE task_lists ADD COLUMN color TEXT NOT NULL DEFAULT ''");
  }

  // Listes rattachées directement à une société, avant l'arrivée des tableaux :
  // chaque société qui avait des listes reçoit un tableau qui les recueille.
  // SQLite ne sait pas retirer « company_id » (elle porte une clé étrangère) :
  // la table est reconstruite, en conservant les identifiants pour que les
  // cartes restent accrochées à leur liste.
  if (listesAvantTableaux) {
    const migrer = db.transaction(() => {
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

      const creerTableau = db.prepare(
        "INSERT INTO boards (company_id, name, position, created_at) VALUES (?, 'Tableau', 0, ?)",
      );
      const reprendre = db.prepare(
        `INSERT INTO task_lists_migration (id, board_id, name, position, color, created_at)
         SELECT id, ?, name, position, color, created_at
         FROM task_lists WHERE company_id IS ?`,
      );

      // Une liste sans société (société supprimée en cours de route) n'a pas
      // de tableau naturel : elle rejoint celui de la première société plutôt
      // que de disparaître avec ses cartes.
      const secours = db.prepare("SELECT id FROM companies ORDER BY id LIMIT 1").get() as
        { id: number } | undefined;
      const societes = (
        db.prepare("SELECT DISTINCT company_id FROM task_lists").all() as {
          company_id: number | null;
        }[]
      ).map(({ company_id }) => company_id);

      for (const societe of societes) {
        const proprietaire = societe ?? secours?.id;
        if (!proprietaire) continue;
        const { lastInsertRowid } = creerTableau.run(proprietaire, new Date().toISOString());
        reprendre.run(lastInsertRowid, societe);
      }

      db.exec("DROP TABLE task_lists");
      db.exec("ALTER TABLE task_lists_migration RENAME TO task_lists");
    });

    sansClesEtrangeres(db, migrer);
  }

  // Bases créées avant les tableaux de projets : les catégories étaient
  // globales et uniques par nom. Un premier tableau les recueille, ainsi que
  // les projets existants. SQLite ne sait pas retirer la contrainte UNIQUE sur
  // le nom : la table est reconstruite, en conservant les identifiants pour
  // que les projets restent accrochés à leur catégorie.
  const categoryColumns = columns(db, "categories");
  if (categoryColumns.length > 0 && !categoryColumns.includes("board_id")) {
    const migrer = db.transaction(() => {
      const { lastInsertRowid: tableau } = db
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
      ).run(tableau);
      db.exec("DROP TABLE categories");
      db.exec("ALTER TABLE categories_migration RENAME TO categories");

      if (!columns(db, "projects").includes("board_id")) {
        db.exec(
          "ALTER TABLE projects ADD COLUMN board_id INTEGER REFERENCES project_boards(id) ON DELETE CASCADE",
        );
      }
      db.prepare("UPDATE projects SET board_id = ? WHERE board_id IS NULL").run(tableau);
    });

    sansClesEtrangeres(db, migrer);
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
      const parTableau = db.prepare(
        `SELECT task_cards.id
         FROM task_cards
         JOIN task_lists ON task_lists.id = task_cards.list_id
         WHERE task_lists.board_id = ?
         ORDER BY task_cards.id`,
      );
      for (const { id } of db.prepare("SELECT id FROM boards").all() as {
        id: number;
      }[]) {
        (parTableau.all(id) as { id: number }[]).forEach((card, index) =>
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
    const colonnes = columns(db, table);
    if (colonnes.length > 0 && !colonnes.includes("system")) {
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
    sansClesEtrangeres(db, () => {
      db.exec("DROP INDEX IF EXISTS idx_support_requests_actor");
      db.exec("ALTER TABLE support_requests DROP COLUMN actor_id");
    });
  }

  // Demandes d'avant l'import des e-mails : ni objet, ni expéditeur, ni
  // statut « Ouvert ». SQLite ne sait pas retoucher une contrainte CHECK : la
  // table est reconstruite, en conservant les identifiants pour que les
  // acteurs, les étiquettes et les fils restent accrochés à leur demande.
  if (!columns(db, "support_requests").includes("mail_id")) {
    sansClesEtrangeres(
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
      const demandes = db
        .prepare("SELECT id FROM support_requests ORDER BY created_at, id")
        .all() as { id: number }[];
      const numeroter = db.prepare("UPDATE support_requests SET number = ? WHERE id = ?");
      demandes.forEach(({ id }, i) => numeroter.run(i + 1, id));
      db.prepare(
        `INSERT INTO settings (key, value) VALUES ('support_ticket_counter', ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
      ).run(String(demandes.length));
    })();
  }
  // Étiquettes du support d'avant leur mise en commun : chaque société avait
  // les siennes. Celles qui portent le même nom n'en font plus qu'une — la
  // plus ancienne, qui reprend les demandes des autres —, et la table perd sa
  // colonne de société. SQLite ne sait pas retirer une colonne citée par une
  // clé étrangère : la table est reconstruite, identifiants conservés.
  if (columns(db, "support_labels").includes("company_id")) {
    sansClesEtrangeres(
      db,
      db.transaction(() => {
        const etiquettes = db
          .prepare("SELECT id, name FROM support_labels ORDER BY company_id, position, id")
          .all() as { id: number; name: string }[];
        const gardee = new Map<string, number>();
        const reprendre = db.prepare(
          `INSERT OR IGNORE INTO support_request_labels (request_id, label_id)
           SELECT request_id, ? FROM support_request_labels WHERE label_id = ?`,
        );
        const oublier = db.prepare("DELETE FROM support_request_labels WHERE label_id = ?");
        const retirer = db.prepare("DELETE FROM support_labels WHERE id = ?");
        for (const { id, name } of etiquettes) {
          const cle = name.trim().toLowerCase();
          const deja = gardee.get(cle);
          if (deja === undefined) {
            gardee.set(cle, id);
            continue;
          }
          reprendre.run(deja, id);
          oublier.run(id);
          retirer.run(id);
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
        const ranger = db.prepare("UPDATE support_labels SET position = ? WHERE id = ?");
        (
          db.prepare("SELECT id FROM support_labels ORDER BY position, id").all() as {
            id: number;
          }[]
        ).forEach(({ id }, rang) => ranger.run(rang, id));
      }),
    );
  }

  // Étiquettes d'avant le poids : toutes pèsent zéro, sauf celles d'urgence,
  // qui reprennent le leur.
  if (!columns(db, "support_labels").includes("weight")) {
    db.transaction(() => {
      db.exec("ALTER TABLE support_labels ADD COLUMN weight INTEGER NOT NULL DEFAULT 0");
      const peser = db.prepare(
        "UPDATE support_labels SET weight = ? WHERE name = ? COLLATE NOCASE",
      );
      for (const { name, weight } of SUPPORT_URGENCY_LABELS) peser.run(weight, name);
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
  const vides =
    !db.prepare("SELECT 1 FROM settings WHERE key = 'support_urgency_labels'").get() &&
    !db.prepare("SELECT 1 FROM support_labels LIMIT 1").get();
  if (vides) {
    db.transaction(() => {
      const creer = db.prepare(
        "INSERT INTO support_labels (name, color, weight, position, created_at) VALUES (?, ?, ?, ?, ?)",
      );
      const instant = new Date().toISOString();
      const ids = new Map<string, number>();
      [...SUPPORT_URGENCY_LABELS, ...SUPPORT_CHANNEL_LABELS].forEach(
        ({ name, color, weight }, rang) => {
          ids.set(name, Number(creer.run(name, color, weight, rang, instant).lastInsertRowid));
        },
      );
      const reglage = db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)");
      reglage.run(
        "support_default_label_ids",
        JSON.stringify(SUPPORT_NEW_MESSAGE_LABELS.map((name) => ids.get(name))),
      );
      reglage.run("support_default_due_days", JSON.stringify(SUPPORT_NEW_MESSAGE_DUE_DAYS));
    })();
  }

  // Bases d'avant les étiquettes d'urgence : le support les reçoit une fois.
  // Le réglage le note — une étiquette supprimée ensuite ne revient pas à
  // chaque démarrage.
  const URGENCES = "support_urgency_labels";
  if (!db.prepare("SELECT 1 FROM settings WHERE key = ?").get(URGENCES)) {
    db.transaction(() => {
      const existe = db.prepare("SELECT 1 FROM support_labels WHERE name = ? COLLATE NOCASE");
      const rang = db.prepare("SELECT COALESCE(MAX(position), -1) + 1 AS next FROM support_labels");
      const creer = db.prepare(
        "INSERT INTO support_labels (name, color, weight, position, created_at) VALUES (?, ?, ?, ?, ?)",
      );
      const instant = new Date().toISOString();
      for (const { name, color, weight } of SUPPORT_URGENCY_LABELS) {
        if (existe.get(name)) continue;
        creer.run(name, color, weight, (rang.get() as { next: number }).next, instant);
      }
      db.prepare("INSERT INTO settings (key, value) VALUES (?, 'true')").run(URGENCES);
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
    const datations = db
      .prepare(
        `SELECT id, last_inventory, json_extract(content, '$.ACCESSLOG.LOGDATE') AS logdate
         FROM assets WHERE json_valid(content)`,
      )
      .all() as { id: number; last_inventory: string; logdate: unknown }[];
    const dater = db.prepare("UPDATE assets SET last_inventory = ? WHERE id = ?");
    for (const { id, last_inventory, logdate } of datations) {
      const date = typeof logdate === "string" ? heureDeParis(logdate) : null;
      if (date && date !== last_inventory) dater.run(date, id);
    }
  }

  // La notion de bâtiment a été retirée : un projet n'en cite plus, et la
  // table s'en va avec la colonne. SQLite refuse de retirer une colonne
  // indexée ou citée par une clé étrangère : l'index tombe d'abord, et les
  // clés étrangères sont suspendues le temps du retrait.
  if (projectColumns.includes("building_id")) {
    sansClesEtrangeres(db, () => {
      db.exec("DROP INDEX IF EXISTS idx_projects_building");
      db.exec("ALTER TABLE projects DROP COLUMN building_id");
    });
  }
  db.exec("DROP INDEX IF EXISTS idx_buildings_company");
  db.exec("DROP TABLE IF EXISTS buildings");

  // Catégories d'avant les jalons propres à chacune : elles reprennent ceux
  // que le curseur d'avancement affichait jusque-là pour tous les projets.
  const colonnesCategories = columns(db, "categories");
  if (colonnesCategories.length > 0 && !colonnesCategories.includes("milestones")) {
    db.exec("ALTER TABLE categories ADD COLUMN milestones TEXT NOT NULL DEFAULT '[]'");
    db.prepare("UPDATE categories SET milestones = ?").run(JSON.stringify(JALONS_HISTORIQUES));
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
      const anciennes = db
        .prepare(
          "SELECT id, name, milestones FROM categories WHERE milestones NOT IN ('', '[]') ORDER BY id",
        )
        .all() as { id: number; name: string; milestones: string }[];
      const parNom = db.prepare("SELECT id FROM milestone_types WHERE name = ?");
      const creer = db.prepare("INSERT INTO milestone_types (name, milestones) VALUES (?, ?)");
      const rattacher = db.prepare(
        "UPDATE projects SET milestone_type_id = ? WHERE category_id = ?",
      );
      const historiques = JSON.stringify(JALONS_HISTORIQUES);
      const parListe = new Map<string, number>();

      for (const categorie of anciennes) {
        let liste: string;
        try {
          liste = JSON.stringify(JSON.parse(categorie.milestones));
        } catch {
          continue;
        }
        let typeId = parListe.get(liste);
        if (typeId === undefined) {
          const voulu = liste === historiques ? "Standard" : categorie.name;
          // Un nom déjà pris par une autre liste reçoit un numéro.
          let nom = voulu;
          for (let n = 2; parNom.get(nom); n += 1) nom = `${voulu} ${n}`;
          typeId = Number(creer.run(nom, liste).lastInsertRowid);
          parListe.set(liste, typeId);
        }
        rattacher.run(typeId, categorie.id);
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
    sansClesEtrangeres(
      db,
      db.transaction(() => {
        db.exec("UPDATE support_requests SET status = 'open' WHERE status = 'unresolved'");
        const nouvelle = definition
          .replace(
            /CREATE TABLE\s+"?support_requests"?/i,
            "CREATE TABLE support_requests_migration",
          )
          .replace(
            /CHECK\s*\(\s*status IN \([^)]*\)\s*\)/i,
            "CHECK (status IN ('new', 'open', 'pending', 'resolved', 'closed'))",
          )
          .replace(/status TEXT NOT NULL DEFAULT 'open'/i, "status TEXT NOT NULL DEFAULT 'new'");
        const liste = columns(db, "support_requests").map((c) => `"${c}"`).join(", ");
        db.exec(nouvelle);
        db.exec(
          `INSERT INTO support_requests_migration (${liste}) SELECT ${liste} FROM support_requests`,
        );
        db.exec("DROP TABLE support_requests");
        db.exec("ALTER TABLE support_requests_migration RENAME TO support_requests");

        // Un ordre d'onglets rangé perd « Non résolu » et reçoit « Nouveau » en
        // tête : c'est là qu'arrivent les demandes.
        const rangee = db
          .prepare("SELECT value FROM settings WHERE key = 'tab_order_support'")
          .get() as { value: string } | undefined;
        if (rangee) {
          let ordre: unknown;
          try {
            ordre = JSON.parse(rangee.value);
          } catch {
            ordre = [];
          }
          const valeurs = Array.isArray(ordre) ? ordre.filter((v) => v !== "unresolved" && v !== "new") : [];
          db.prepare("UPDATE settings SET value = ? WHERE key = 'tab_order_support'").run(
            JSON.stringify(["new", ...valeurs]),
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
  rattacherIndicateurs(db);

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
    sansClesEtrangeres(
      db,
      db.transaction(() => {
        const nouvelle = sections
          .replace(
            /CREATE TABLE\s+"?indicator_sections"?/i,
            "CREATE TABLE indicator_sections_migration",
          )
          .replace(
            /CHECK\s*\(\s*panel IN \([^)]*\)\s*\)/i,
            "CHECK (panel IN ('support', 'assets', 'projects', 'tasks'))",
          );
        const liste = columns(db, "indicator_sections").map((c) => `"${c}"`).join(", ");
        db.exec(nouvelle);
        db.exec(
          `INSERT INTO indicator_sections_migration (${liste}) SELECT ${liste} FROM indicator_sections`,
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
      const cle = `${panel}_sections_gap`;
      const reglage = db.prepare("SELECT value FROM settings WHERE key = ?").get(cle) as
        { value: string } | undefined;
      let ecart: unknown;
      try {
        ecart = reglage ? JSON.parse(reglage.value) : undefined;
      } catch {
        ecart = undefined;
      }
      if (typeof ecart === "number" && Number.isFinite(ecart)) {
        db.prepare("UPDATE indicator_sections SET gap = ? WHERE panel = ?").run(
          Math.round(ecart),
          panel,
        );
      }
      db.prepare("DELETE FROM settings WHERE key = ?").run(cle);
    }
  }

  // Bases d'avant les références des projets.
  if (!columns(db, "projects").includes("number")) {
    db.exec("ALTER TABLE projects ADD COLUMN number INTEGER NOT NULL DEFAULT 0");
  }
  numeroterReferences(db);
  poserSectionsParDefaut(db);

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
  for (const [table, debut] of [
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
    ).run(debut);
  }

  separerParametrage(db);
  permissionsParTypeDeWidget(db);
};

/** Posé une fois le Paramétrage sorti des rôles. */
const PARAMETRAGE_HORS_ROLES = "parametrage_hors_roles";

/**
 * Le Paramétrage se réglait dans les rôles, société par société ; il se règle
 * désormais pour l'application, par utilisateur ou groupe. Chacun garde ce
 * qu'il avait : « Modifier » s'il était administrateur quelque part ou si l'un
 * de ses rôles le cochait, sinon « Voir » si l'un le cochait. Tous les modes
 * lui restent ouverts. Puis la case disparaît des rôles.
 */
export const separerParametrage = (db: Database): void => {
  if (lireReglage(db, PARAMETRAGE_HORS_ROLES)) return;
  // Une base neuve n'a jamais eu de rôles : il n'y a rien à en sortir.
  if (columns(db, "role_assignments").length === 0) {
    ecrireReglage(db, PARAMETRAGE_HORS_ROLES, true);
    return;
  }
  db.transaction(() => {
    const lignes = db
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
    const parPrincipal = new Map<string, { ligne: (typeof lignes)[number]; acces: number }>();
    for (const ligne of lignes) {
      let coches: unknown = [];
      try {
        coches = (JSON.parse(ligne.permissions) as Record<string, unknown>)["settings"] ?? [];
      } catch {
        // Un JSON illisible n'accordait rien.
      }
      const liste = Array.isArray(coches) ? coches : [];
      const acces = ligne.is_admin || liste.includes("update") ? 2 : liste.includes("view") ? 1 : 0;
      const cle = `${ligne.principal_type}:${ligne.principal_id}`;
      const deja = parPrincipal.get(cle);
      if (!deja || acces > deja.acces) parPrincipal.set(cle, { ligne, acces });
    }
    const poser = db.prepare(
      `INSERT OR IGNORE INTO principal_permissions
         (workspace_id, principal_type, principal_id, principal_name, principal_email, settings, modes)
       VALUES (${PREMIER_WORKSPACE}, ?, ?, ?, ?, ?, ?)`,
    );
    // Les modes ouverts ne servent plus : les types de widgets les remplacent
    // (permissionsParTypeDeWidget).
    const modes = "[]";
    for (const { ligne, acces } of parPrincipal.values()) {
      poser.run(
        ligne.principal_type,
        ligne.principal_id,
        ligne.principal_name,
        ligne.principal_email,
        ["", "view", "update"][acces],
        modes,
      );
    }
    db.exec(
      "UPDATE roles SET permissions = json_remove(permissions, '$.settings') WHERE json_valid(permissions)",
    );
    ecrireReglage(db, PARAMETRAGE_HORS_ROLES, true);
  })();
};

/** Posé une fois les permissions passées aux types de widgets. */
const PERMISSIONS_PAR_TYPE = "permissions_par_type_de_widget";

/**
 * Les rôles, société par société, et les modes ouverts laissent la place à
 * une permission par type de widget, commune à toutes les sociétés. Chacun de
 * ceux qui avaient un accès — une permission réglée, ou un rôle quelque part —
 * reçoit « Modifier » pour tous les types et garde son Paramétrage. Puis les
 * rôles s'en vont.
 */
export const permissionsParTypeDeWidget = (db: Database): void => {
  if (!columns(db, "principal_permissions").includes("widgets")) {
    db.exec("ALTER TABLE principal_permissions ADD COLUMN widgets TEXT NOT NULL DEFAULT '{}'");
  }
  if (lireReglage(db, PERMISSIONS_PAR_TYPE)) return;
  db.transaction(() => {
    if (columns(db, "role_assignments").length > 0) {
      db.exec(
        `INSERT OR IGNORE INTO principal_permissions
           (workspace_id, principal_type, principal_id, principal_name, principal_email)
         SELECT ${PREMIER_WORKSPACE}, principal_type, principal_id, MAX(principal_name),
                MAX(principal_email)
         FROM role_assignments GROUP BY principal_type, principal_id`,
      );
    }
    db.prepare("UPDATE principal_permissions SET widgets = ?").run(
      JSON.stringify(widgetRightsPartout("update")),
    );
    db.exec("DROP TABLE IF EXISTS role_assignments");
    db.exec("DROP TABLE IF EXISTS roles");
    ecrireReglage(db, PERMISSIONS_PAR_TYPE, true);
  })();
};

/** Posé une fois les modes devenus des vues. */
const VUES_ET_TABLEAUX = "vues_et_tableaux";

/** Les modes d'avant les vues, dans l'ordre de leur sélecteur, et le nom de leur vue. */
const VUES_DE_DEPART = [
  ["access", "Accès"],
  ["projects", "Projets"],
  ["tasks", "Tâches"],
  ["support", "Support"],
  ["assets", "Assets"],
] as const;

type ModeDAvant = (typeof VUES_DE_DEPART)[number][0];

/**
 * Une table refaite d'après son propre CREATE, retouché par « retouche » —
 * pour changer la table qu'une clé étrangère désigne. Les lignes et leurs
 * identifiants passent tels quels. Les clés étrangères doivent être
 * suspendues (sansClesEtrangeres).
 */
const refaireLaTable = (
  db: Database,
  table: string,
  retouche: (sql: string) => string,
  calculees: Record<string, string> = {},
): void => {
  const ligne = db
    .prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = ?")
    .get(table) as { sql: string } | undefined;
  if (!ligne) return;
  const nouvelle = retouche(ligne.sql).replace(
    new RegExp(`CREATE TABLE\\s+"?${table}"?`, "i"),
    `CREATE TABLE ${table}_migration`,
  );
  db.exec(nouvelle);
  // Les colonnes de la nouvelle table : reprises de l'ancienne, ou calculées
  // d'après elle (« calculees ») ; celles qui disparaissent restent derrière.
  const anciennes = new Set(columns(db, table));
  const gardees = columns(db, `${table}_migration`).filter(
    (c) => c in calculees || anciennes.has(c),
  );
  const liste = gardees.map((c) => `"${c}"`).join(", ");
  const valeurs = gardees.map((c) => calculees[c] ?? `"${c}"`).join(", ");
  db.exec(`INSERT INTO ${table}_migration (${liste}) SELECT ${valeurs} FROM ${table} AS ancienne`);
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
export const vuesEtTableaux = (db: Database): void => {
  if (lireReglage(db, VUES_ET_TABLEAUX)) return;
  const ancienne = !columns(db, "boards").includes("view_id");
  sansClesEtrangeres(db, () =>
    db.transaction(() => {
      const maintenant = new Date().toISOString();
      const creerVue = db.prepare(
        "INSERT INTO views (name, position, created_at) VALUES (?, ?, ?)",
      );
      const vues = Object.fromEntries(
        VUES_DE_DEPART.map(([mode, nom], rang) => [
          mode,
          Number(creerVue.run(nom, rang, maintenant).lastInsertRowid),
        ]),
      ) as Record<ModeDAvant, number>;

      if (!ancienne) {
        poserLesTableauxDeDepart(db, vues, maintenant);
      } else {
        convertirLesModes(db, vues, maintenant);
      }
      ecrireReglage(db, VUES_ET_TABLEAUX, true);
    })(),
  );
};

/** Une base neuve : un tableau par vue, avec la liste de la vue. */
const poserLesTableauxDeDepart = (
  db: Database,
  vues: Record<ModeDAvant, number>,
  maintenant: string,
): void => {
  const creerTableau = db.prepare(
    "INSERT INTO boards (view_id, name, position, created_at) VALUES (?, ?, 0, ?)",
  );
  const creerSection = db.prepare(
    "INSERT INTO board_sections (board_id, position, created_at) VALUES (?, 0, ?)",
  );
  const creerWidget = db.prepare(
    "INSERT INTO board_widgets (section_id, type, config, position, created_at) VALUES (?, ?, '{}', 0, ?)",
  );
  const listes: Record<ModeDAvant, [string, string | null]> = {
    access: ["Liens", null],
    projects: ["Projets", "project.list"],
    tasks: ["Tâches", "task.list"],
    support: ["Demandes", "support.list"],
    assets: ["Postes", "asset.list"],
  };
  for (const [mode, [nom, liste]] of Object.entries(listes) as [
    ModeDAvant,
    [string, string | null],
  ][]) {
    const tableau = Number(creerTableau.run(vues[mode], nom, maintenant).lastInsertRowid);
    const section = Number(creerSection.run(tableau, maintenant).lastInsertRowid);
    if (liste) creerWidget.run(section, liste, maintenant);
  }
};

/** Une base d'avant les vues : chaque mode devient la sienne. */
const convertirLesModes = (
  db: Database,
  vues: Record<ModeDAvant, number>,
  maintenant: string,
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
  ).run(vues.tasks);
  const tableauxDeTaches = (
    db.prepare("SELECT id FROM boards_migration ORDER BY id").all() as {
      id: number;
    }[]
  ).map((l) => l.id);

  const creerTableau = db.prepare(
    `INSERT INTO boards_migration (view_id, name, position, owner_id, is_private, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
  );
  type Onglet = {
    id: number;
    name: string;
    position: number;
    owner_id: number | null;
    is_private: number;
    created_at: string;
  };
  const versTableaux = (table: string, vue: number): Map<number, number> => {
    const correspondance = new Map<number, number>();
    if (columns(db, table).length === 0) return correspondance;
    for (const o of db.prepare(`SELECT * FROM ${table} ORDER BY position, id`).all() as Onglet[]) {
      correspondance.set(
        o.id,
        Number(
          creerTableau.run(vue, o.name, o.position, o.owner_id, o.is_private, o.created_at)
            .lastInsertRowid,
        ),
      );
    }
    return correspondance;
  };
  const tableauxDeProjets = versTableaux("project_boards", vues.projects);
  const tableauxDAcces = versTableaux("access_categories", vues.access);
  const tableauSupport = Number(
    creerTableau.run(vues.support, "Demandes", 0, null, 0, maintenant).lastInsertRowid,
  );
  const tableauAssets = Number(
    creerTableau.run(vues.assets, "Postes", 0, null, 0, maintenant).lastInsertRowid,
  );
  db.exec("DROP TABLE boards");
  db.exec("ALTER TABLE boards_migration RENAME TO boards");

  // Les projets, leurs catégories et leurs étiquettes suivent leur tableau,
  // et désignent désormais la table de tous les tableaux.
  for (const table of ["categories", "projects", "project_labels"]) {
    const deplacer = db.prepare(`UPDATE ${table} SET board_id = ? WHERE board_id = ?`);
    // Du plus grand identifiant au plus petit n'aiderait pas : les nouveaux
    // identifiants viennent après tous les anciens, aucun ne se recouvre.
    for (const [ancien, nouveau] of tableauxDeProjets) deplacer.run(nouveau, ancien);
    refaireLaTable(db, table, (sql) =>
      sql.replace(/REFERENCES\s+"?project_boards"?\s*\(id\)/gi, "REFERENCES boards(id)"),
    );
  }

  // --- Les sections et les widgets -----------------------------------------
  const creerSection = db.prepare(
    `INSERT INTO board_sections (board_id, width_unit, width_value, gap, position, owner_id, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  );
  const creerWidget = db.prepare(
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
  const poserSection = (tableau: number, s: Section): number =>
    Number(
      creerSection.run(
        tableau,
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
    const blocs = db.prepare(
      "SELECT * FROM access_blocks WHERE section_id = ? ORDER BY position, id",
    );
    for (const section of sections) {
      const tableau = tableauxDAcces.get(section.category_id);
      if (tableau === undefined) continue;
      const nouvelle = poserSection(tableau, section);
      for (const w of blocs.all(section.id) as Widget[]) {
        creerWidget.run(nouvelle, w.type, w.config, w.position, w.created_at);
      }
    }
  }

  // Les panneaux : leurs sections vont à chacun des tableaux qui les montrait.
  const panneaux = [
    ["support", "support_indicators", [tableauSupport]],
    ["assets", "asset_indicators", [tableauAssets]],
    ["projects", "project_indicators", [...tableauxDeProjets.values()]],
    ["tasks", "task_indicators", tableauxDeTaches],
  ] as const;
  if (columns(db, "indicator_sections").length > 0) {
    for (const [panneau, table, tableaux] of panneaux) {
      const sections = db
        .prepare("SELECT * FROM indicator_sections WHERE panel = ? ORDER BY position, id")
        .all(panneau) as Section[];
      const widgets =
        columns(db, table).length > 0
          ? db.prepare(`SELECT * FROM ${table} WHERE section_id = ? ORDER BY position, id`)
          : null;
      for (const tableau of tableaux) {
        for (const section of sections) {
          const nouvelle = poserSection(tableau, section);
          for (const w of (widgets?.all(section.id) ?? []) as Widget[]) {
            creerWidget.run(
              nouvelle,
              typeDuPanneau(panneau, w.type),
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
  const portees: [string, number[]][] = [
    ["support", [tableauSupport]],
    ["assets", [tableauAssets]],
    ["projects", [...tableauxDeProjets.values()]],
    ["tasks", tableauxDeTaches],
    ...[...tableauxDAcces].map(([categorie, tableau]): [string, number[]] => [
      `access:${categorie}`,
      [tableau],
    ]),
  ];
  const personnelles = db.prepare("SELECT user_id FROM personal_layouts WHERE scope = ?");
  const poserPersonnelle = db.prepare(
    "INSERT OR IGNORE INTO personal_layouts (user_id, scope, created_at) VALUES (?, ?, ?)",
  );
  for (const [ancienne, tableaux] of portees) {
    for (const { user_id } of personnelles.all(ancienne) as {
      user_id: number;
    }[]) {
      for (const tableau of tableaux) poserPersonnelle.run(user_id, `board:${tableau}`, maintenant);
    }
  }
  db.exec("DELETE FROM personal_layouts WHERE scope NOT LIKE 'board:%'");

  // L'ordre des onglets : celui des modes devient celui des vues, ceux des
  // tableaux suivent leur nouvel identifiant. Les onglets fixes du Support et
  // des Assets n'existent plus.
  const ordres = db.prepare("SELECT user_id, scope, ids FROM user_tab_orders").all() as {
    user_id: number;
    scope: string;
    ids: string;
  }[];
  const lire = (texte: string): string[] => {
    try {
      const lu: unknown = JSON.parse(texte);
      return Array.isArray(lu) ? lu.map(String) : [];
    } catch {
      return [];
    }
  };
  const parCompte = new Map<number, Map<string, string[]>>();
  const ajouter = (compte: number, portee: string, ids: string[]) => {
    const deja = parCompte.get(compte) ?? new Map<string, string[]>();
    deja.set(portee, [...(deja.get(portee) ?? []), ...ids]);
    parCompte.set(compte, deja);
  };
  const traduire = (ids: string[], correspondance: Map<number, number>): string[] =>
    ids.flatMap((id) => {
      const nouveau = correspondance.get(Number(id));
      return nouveau === undefined ? [] : [String(nouveau)];
    });
  for (const { user_id, scope, ids } of ordres) {
    const liste = lire(ids);
    if (scope === "modes") {
      ajouter(
        user_id,
        "views",
        liste.flatMap((mode) => (mode in vues ? [String(vues[mode as ModeDAvant])] : [])),
      );
    } else if (scope === "project-boards") {
      ajouter(user_id, `boards:${vues.projects}`, traduire(liste, tableauxDeProjets));
    } else if (scope === "access-categories") {
      ajouter(user_id, `boards:${vues.access}`, traduire(liste, tableauxDAcces));
    } else if (scope.startsWith("boards:")) {
      // Les tableaux de tâches se rangeaient société par société : ils se
      // rangent désormais ensemble, dans la vue Tâches.
      ajouter(user_id, `boards:${vues.tasks}`, liste);
    }
  }
  db.exec("DELETE FROM user_tab_orders");
  const poserOrdre = db.prepare(
    "INSERT INTO user_tab_orders (user_id, scope, ids) VALUES (?, ?, ?)",
  );
  for (const [compte, portees2] of parCompte) {
    for (const [portee, ids] of portees2) poserOrdre.run(compte, portee, JSON.stringify(ids));
  }

  // La vue d'ouverture : celle du mode d'ouverture.
  for (const [mode, vue] of Object.entries(vues)) {
    db.prepare("UPDATE users SET default_view = ? WHERE default_mode = ?").run(String(vue), mode);
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

const CONTEXTES = "contextes";

/** L'ordre des contextes nés des sociétés ; les autres suivent, par nom. */
const ORDRE_DES_CONTEXTES = [
  "Les manufactures",
  "Arco Marketing",
  "SAMB",
  "M3P",
  "Maison Hamon",
  "Monot",
];

interface SocieteDAvant {
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
export const contextes = (db: Database): void => {
  if (lireReglage(db, CONTEXTES)) return;
  const existe = (table: string): boolean =>
    Boolean(db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(table));
  sansClesEtrangeres(db, () =>
    db.transaction(() => {
      const maintenant = new Date().toISOString();
      const rang = (nom: string): number => {
        const i = ORDRE_DES_CONTEXTES.findIndex(
          (n) => n.localeCompare(nom, "fr", { sensitivity: "base" }) === 0,
        );
        return i < 0 ? ORDRE_DES_CONTEXTES.length : i;
      };
      const societes = (
        existe("companies")
          ? (db.prepare("SELECT id, name, support_email FROM companies").all() as SocieteDAvant[])
          : []
      ).sort((a, b) => rang(a.name) - rang(b.name) || a.name.localeCompare(b.name, "fr"));

      // Les contextes de chaque tableau, et la correspondance des sociétés.
      db.exec(
        "CREATE TEMP TABLE correspondance (board_id INTEGER, company_id INTEGER, context_id INTEGER)",
      );
      const creerContexte = db.prepare(
        "INSERT INTO contexts (board_id, name, position, created_at) VALUES (?, ?, ?, ?)",
      );
      const correspond = db.prepare("INSERT INTO temp.correspondance VALUES (?, ?, ?)");
      const tableaux = db.prepare("SELECT id FROM boards").all() as {
        id: number;
      }[];
      for (const { id } of tableaux) {
        const dejaLa = db.prepare("SELECT 1 FROM contexts WHERE board_id = ?").get(id);
        if (dejaLa) continue;
        // Sans société, le tableau n'a pas de contexte : on en ajoute depuis
        // sa liste.
        if (societes.length === 0) continue;
        societes.forEach((societe, position) => {
          const contexte = creerContexte.run(
            id,
            societe.name,
            position,
            maintenant,
          ).lastInsertRowid;
          correspond.run(id, societe.id, contexte);
        });
      }
      const premier = (tableau: string) =>
        `(SELECT id FROM contexts WHERE board_id = ${tableau} ORDER BY position, id LIMIT 1)`;
      const contexteDe = (tableau: string, societe: string) =>
        `COALESCE((SELECT context_id FROM temp.correspondance c
                   WHERE c.board_id = ${tableau} AND c.company_id = ${societe}), ${premier(tableau)})`;

      // Le tableau qui reçoit les demandes, celui qui reçoit les postes : celui
      // de la première liste posée en public.
      const tableauDuWidget = (type: string): number | null =>
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
      const tableauDesDemandes = tableauDuWidget("support.list");
      const tableauDesPostes = tableauDuWidget("asset.list");

      const colonnesDesTableaux = columns(db, "boards");
      const filtreDesTableaux = colonnesDesTableaux.includes("company_id");

      // Les projets.
      if (columns(db, "projects").includes("company_id"))
        refaireLaTable(
          db,
          "projects",
          (sql) =>
            sql.replace(
              /company_id INTEGER[^,]*,/,
              "context_id INTEGER REFERENCES contexts(id) ON DELETE CASCADE,",
            ),
          {
            context_id: contexteDe("ancienne.board_id", "ancienne.company_id"),
          },
        );

      // Les cartes : le contexte de la société qui filtrait leur tableau.
      if (!columns(db, "task_cards").includes("context_id")) {
        db.exec(
          "ALTER TABLE task_cards ADD COLUMN context_id INTEGER REFERENCES contexts(id) ON DELETE CASCADE",
        );
      }
      const tableauDeLaCarte =
        "(SELECT l.board_id FROM task_lists l WHERE l.id = task_cards.list_id)";
      db.exec(
        `UPDATE task_cards SET context_id = ${
          filtreDesTableaux
            ? contexteDe(
                tableauDeLaCarte,
                `(SELECT b.company_id FROM boards b WHERE b.id = ${tableauDeLaCarte})`,
              )
            : premier(tableauDeLaCarte)
        } WHERE context_id IS NULL`,
      );

      // Les demandes : le contexte de leur société, dans le tableau des demandes.
      const colonnesDesDemandes = columns(db, "support_requests");
      if (colonnesDesDemandes.includes("company_id")) {
        // Sans tableau où aller, une demande n'a plus où se montrer.
        if (tableauDesDemandes === null) db.exec("DELETE FROM support_requests");
        refaireLaTable(
          db,
          "support_requests",
          (sql) =>
            sql.replace(
              /company_id INTEGER[^,]*,/,
              `context_id INTEGER REFERENCES contexts(id) ON DELETE CASCADE,
            mailbox TEXT NOT NULL DEFAULT '',`,
            ),
          {
            context_id: contexteDe(String(tableauDesDemandes), "ancienne.company_id"),
            mailbox: existe("companies")
              ? "COALESCE((SELECT support_email FROM companies s WHERE s.id = ancienne.company_id), '')"
              : "''",
          },
        );
      }

      // Les postes : le contexte de leur société, dans le tableau des postes.
      if (columns(db, "assets").includes("company_id")) {
        refaireLaTable(
          db,
          "assets",
          (sql) =>
            sql.replace(
              /company_id INTEGER[^,]*,/,
              "context_id INTEGER REFERENCES contexts(id) ON DELETE CASCADE,",
            ),
          {
            context_id: `CASE WHEN ancienne.company_id IS NULL THEN NULL ELSE (SELECT context_id
              FROM temp.correspondance c WHERE c.board_id = ${tableauDesPostes ?? "NULL"}
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
      const contexteDeLaSociete = db.prepare(
        "SELECT context_id FROM temp.correspondance WHERE board_id = ? AND company_id = ?",
      );
      const tagsReconnus = columns(db, "assets").includes("context_id")
        ? (db
            .prepare(
              `SELECT DISTINCT a.tag, c.company_id FROM assets a
                 JOIN temp.correspondance c ON c.context_id = a.context_id
                 WHERE a.tag != ''`,
            )
            .all() as { tag: string; company_id: number }[])
        : [];
      const ecrireConfig = db.prepare("UPDATE board_widgets SET config = ? WHERE id = ?");
      for (const widget of configs) {
        let config: Record<string, unknown> = {};
        try {
          config = JSON.parse(widget.config) as Record<string, unknown>;
        } catch {
          // Une configuration illisible repart de zéro.
        }
        const contexteDuTableau = (societe: number): number | null =>
          (contexteDeLaSociete.get(widget.board_id, societe) as { context_id: number } | undefined)
            ?.context_id ?? null;
        if (widget.type === "support.list") {
          const seule = config.boite ? Number(config.boite) : null;
          config.boites = societes
            .filter((s) => s.support_email && (seule === null || s.id === seule))
            .map((s) => ({
              email: s.support_email,
              contexte: contexteDuTableau(s.id),
            }))
            .filter((b) => b.contexte !== null);
          delete config.boite;
        } else {
          const seul = typeof config.tag === "string" && config.tag ? config.tag : null;
          config.tags = tagsReconnus
            .filter((t) => seul === null || t.tag === seul)
            .map((t) => ({
              tag: t.tag,
              contexte: contexteDuTableau(t.company_id),
            }))
            .filter((t) => t.contexte !== null);
          delete config.tag;
        }
        ecrireConfig.run(JSON.stringify(config), widget.id);
      }

      // L'adresse d'envoi commune.
      const entra = (lireReglage(db, "entra") ?? null) as Record<string, unknown> | null;
      if (entra && !entra.mail_sender) {
        const expediteur =
          societes.find((s) => s.name === "Arco Marketing" && s.support_email) ??
          societes.find((s) => s.support_email);
        if (expediteur)
          ecrireReglage(db, "entra", {
            ...entra,
            mail_sender: expediteur.support_email,
          });
      }

      // Le filtre des tableaux et les sociétés disparaissent.
      if (filtreDesTableaux) {
        refaireLaTable(db, "boards", (sql) =>
          sql.replace(
            /company_id INTEGER[^,]*,/,
            "all_contexts_label TEXT NOT NULL DEFAULT 'Tous les contextes',",
          ),
        );
      } else if (!colonnesDesTableaux.includes("all_contexts_label")) {
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
      ecrireReglage(db, CONTEXTES, true);
    })(),
  );
};

const LISTES_PAR_WIDGET = "listes_par_widget";

interface WidgetDeListe {
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
export const listesParWidget = (db: Database): void => {
  if (lireReglage(db, LISTES_PAR_WIDGET)) return;
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
      .all() as WidgetDeListe[];
    const lire = (config: string): Record<string, unknown> => {
      try {
        return (JSON.parse(config) as Record<string, unknown>) ?? {};
      } catch {
        return {};
      }
    };
    const ecrire = db.prepare("UPDATE board_widgets SET config = ? WHERE id = ?");
    // Les clés des widgets publics, par tableau et par type, dans l'ordre.
    const publiques = new Map<string, string[]>();
    // Le rang atteint, par compte, tableau et type, pour les copies.
    const rangs = new Map<string, number>();
    const configs = new Map<number, Record<string, unknown>>();
    for (const widget of widgets) {
      const config = lire(widget.config);
      const groupe = `${widget.board_id}:${widget.type}`;
      if (typeof config.liste !== "string" || !config.liste) {
        if (widget.owner_id === null) {
          config.liste = crypto.randomUUID();
        } else {
          const cle = `${widget.owner_id}:${groupe}`;
          const rang = rangs.get(cle) ?? 0;
          rangs.set(cle, rang + 1);
          config.liste = publiques.get(groupe)?.[rang] ?? crypto.randomUUID();
        }
        ecrire.run(JSON.stringify(config), widget.id);
      }
      if (widget.owner_id === null) {
        publiques.set(groupe, [...(publiques.get(groupe) ?? []), config.liste as string]);
      }
      configs.set(widget.id, config);
    }
    const premiere = (boardId: number, type: string): string =>
      publiques.get(`${boardId}:${type}`)?.[0] ?? "";

    const poser = (table: string, type: string, tableau: string) => {
      const lignes = db
        .prepare(`SELECT id, ${tableau} AS board_id FROM ${table} WHERE list_key = ''`)
        .all() as { id: number; board_id: number | null }[];
      const maj = db.prepare(`UPDATE ${table} SET list_key = ? WHERE id = ?`);
      for (const { id, board_id } of lignes) {
        if (board_id !== null) maj.run(premiere(board_id, type), id);
      }
    };
    poser("projects", "project.list", "board_id");
    poser("task_lists", "task.list", "board_id");

    // Le widget public d'un tableau qui reçoit cette valeur, sinon le premier.
    const receveur = (boardId: number, type: string, champ: string, cle: string, valeur: string) =>
      widgets.find((w) => {
        if (w.owner_id !== null || w.board_id !== boardId || w.type !== type) return false;
        const liste = configs.get(w.id)?.[champ];
        return (
          Array.isArray(liste) &&
          (liste as Record<string, unknown>[]).some(
            (r) => typeof r?.[cle] === "string" && (r[cle] as string).toLowerCase() === valeur,
          )
        );
      });
    const demandes = db
      .prepare(
        `SELECT r.id, r.mailbox, c.board_id FROM support_requests r
         JOIN contexts c ON c.id = r.context_id WHERE r.list_key = ''`,
      )
      .all() as { id: number; mailbox: string; board_id: number }[];
    const majDemande = db.prepare("UPDATE support_requests SET list_key = ? WHERE id = ?");
    for (const d of demandes) {
      const w = d.mailbox
        ? receveur(d.board_id, "support.list", "boites", "email", d.mailbox.toLowerCase())
        : undefined;
      majDemande.run(
        w ? (configs.get(w.id)!.liste as string) : premiere(d.board_id, "support.list"),
        d.id,
      );
    }
    if (columns(db, "assets").length === 0) {
      ecrireReglage(db, LISTES_PAR_WIDGET, true);
      return;
    }
    const postes = db
      .prepare(
        `SELECT a.id, a.tag, c.board_id FROM assets a
         JOIN contexts c ON c.id = a.context_id WHERE a.list_key = ''`,
      )
      .all() as { id: number; tag: string; board_id: number }[];
    const majPoste = db.prepare("UPDATE assets SET list_key = ? WHERE id = ?");
    for (const a of postes) {
      const w = receveur(a.board_id, "asset.list", "tags", "tag", a.tag.trim().toLowerCase());
      majPoste.run(
        w ? (configs.get(w.id)!.liste as string) : premiere(a.board_id, "asset.list"),
        a.id,
      );
    }
    ecrireReglage(db, LISTES_PAR_WIDGET, true);
  })();
};

const CONTEXTES_FACULTATIFS = "contextes_facultatifs";

interface ColonneDetaillee {
  name: string;
  notnull: number;
}

/**
 * Un tableau peut n'avoir aucun contexte : ses projets et ses demandes n'en
 * ont pas non plus. Le contexte devient facultatif, et une demande comme un
 * poste portent leur tableau — c'était leur contexte qui le disait.
 */
export const contextesFacultatifs = (db: Database): void => {
  if (lireReglage(db, CONTEXTES_FACULTATIFS)) return;
  const obligatoire = (table: string, colonne: string): boolean =>
    (db.prepare(`PRAGMA table_info(${table})`).all() as ColonneDetaillee[]).some(
      (c) => c.name === colonne && c.notnull === 1,
    );
  const tableauDuContexte = "(SELECT board_id FROM contexts WHERE id = ancienne.context_id)";
  sansClesEtrangeres(db, () =>
    db.transaction(() => {
      if (obligatoire("projects", "context_id")) {
        refaireLaTable(db, "projects", (sql) =>
          sql.replace(/context_id INTEGER NOT NULL/, "context_id INTEGER"),
        );
      }
      if (!columns(db, "support_requests").includes("board_id")) {
        refaireLaTable(
          db,
          "support_requests",
          (sql) =>
            sql.replace(
              /context_id INTEGER( NOT NULL)?/,
              "board_id INTEGER NOT NULL REFERENCES boards(id) ON DELETE CASCADE,\n            context_id INTEGER",
            ),
          { board_id: tableauDuContexte },
        );
      }
      const postes = columns(db, "assets");
      if (postes.length > 0 && !postes.includes("board_id")) {
        db.exec(
          "ALTER TABLE assets ADD COLUMN board_id INTEGER REFERENCES boards(id) ON DELETE CASCADE",
        );
        db.exec(
          "UPDATE assets SET board_id = (SELECT board_id FROM contexts WHERE id = assets.context_id)",
        );
      }
      ecrireReglage(db, CONTEXTES_FACULTATIFS, true);
    })(),
  );
};

const BOITES_CONFIRMEES = "boites_confirmees_par_liste";

/**
 * Les boîtes de support se confirment liste par liste (lib/optin.ts). Celles
 * qu'une liste relevait avant la confirmation le restent, confirmées d'office
 * — depuis toujours, pour que leur relève ne s'arrête ni ne saute rien. Une
 * base passée par la confirmation par adresse (mailbox_optins) en garde
 * l'état, recopié pour chaque liste qui dit l'adresse.
 */
export const boitesConfirmees = (db: Database): void => {
  if (lireReglage(db, BOITES_CONFIRMEES)) return;
  const parAdresse = columns(db, "mailbox_optins").length > 0;
  db.transaction(() => {
    const avant = new Map<string, string>(
      parAdresse
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
    const poser = db.prepare(
      `INSERT OR IGNORE INTO list_mailbox_optins (list_key, email, confirmed_at, created_at)
       VALUES (?, ?, ?, ?)`,
    );
    const maintenant = new Date().toISOString();
    for (const { config } of configs) {
      let lu: { boites?: { email?: unknown }[]; liste?: unknown } = {};
      try {
        lu = JSON.parse(config) as typeof lu;
      } catch {
        continue;
      }
      const liste = typeof lu.liste === "string" ? lu.liste : "";
      if (!liste) continue;
      for (const boite of Array.isArray(lu.boites) ? lu.boites : []) {
        const email = typeof boite?.email === "string" ? boite.email.trim().toLowerCase() : "";
        if (!email) continue;
        // Par adresse, seules celles qui étaient confirmées le restent ; sans
        // confirmation du tout, toutes l'étaient de fait.
        const confirmee = parAdresse ? (avant.get(email) ?? "") : "1970-01-01T00:00:00.000Z";
        poser.run(liste, email, confirmee, maintenant);
      }
    }
    if (parAdresse) db.exec("DROP TABLE mailbox_optins");
    ecrireReglage(db, BOITES_CONFIRMEES, true);
  })();
};
