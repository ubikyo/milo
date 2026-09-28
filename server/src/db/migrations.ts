// Rattrapages pour les bases créées avant tel ou tel ajout. Chacun se
// reconnaît à une colonne ou une table manquante, et ne fait rien sur une base
// neuve : le schéma l'a déjà créée complète.
//
// Aucune ne s'exécute deux fois, et aucune ne se retire : une base de
// production peut avoir n'importe quel âge.

import type { Database } from "better-sqlite3";

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

export const migrate = (db: Database): void => {
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
      const rows = db.prepare("SELECT id, name FROM users").all() as { id: number; name: string }[];
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
      | { id: number }
      | undefined;
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
        | { id: number }
        | undefined;
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
      for (const { id } of db.prepare("SELECT id FROM boards").all() as { id: number }[]) {
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
    db.exec("ALTER TABLE boards ADD COLUMN owner_id INTEGER REFERENCES users(id) ON DELETE SET NULL");
  }
  if (boardColumns.length > 0 && !boardColumns.includes("is_private")) {
    db.exec("ALTER TABLE boards ADD COLUMN is_private INTEGER NOT NULL DEFAULT 0");
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
};
