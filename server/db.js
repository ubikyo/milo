import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// En production, la base doit vivre hors du dossier déployé : un déploiement
// remplace le code, il ne doit pas emporter les données.
// MILO_DB_PATH=/var/lib/milo/data.db par exemple.
const dbPath = process.env.MILO_DB_PATH || path.join(__dirname, "data.db");
fs.mkdirSync(path.dirname(dbPath), { recursive: true });

const db = new Database(dbPath);

db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

db.exec(`
  -- Tableaux du mode Projet. Ils ne dépendent d'aucune société : un tableau
  -- rassemble des projets de plusieurs sociétés. Chacun porte ses catégories.
  CREATE TABLE IF NOT EXISTS project_boards (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    position INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL
  );

  -- Les catégories sont propres à un tableau : deux tableaux peuvent nommer
  -- une catégorie de la même façon.
  CREATE TABLE IF NOT EXISTS categories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    board_id INTEGER NOT NULL REFERENCES project_boards(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    UNIQUE (board_id, name)
  );

  CREATE TABLE IF NOT EXISTS companies (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE
  );

  CREATE TABLE IF NOT EXISTS projects (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    board_id INTEGER NOT NULL REFERENCES project_boards(id) ON DELETE CASCADE,
    category_id INTEGER NOT NULL REFERENCES categories(id),
    company_id INTEGER REFERENCES companies(id),
    building_id INTEGER REFERENCES buildings(id),
    status INTEGER NOT NULL DEFAULT 0 CHECK (status >= 0 AND status <= 100),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL DEFAULT '',
    first_name TEXT NOT NULL DEFAULT '',
    last_name TEXT NOT NULL DEFAULT '',
    email TEXT NOT NULL UNIQUE,
    -- Vide tant que la première connexion n'a pas défini le mot de passe.
    password_hash TEXT NOT NULL DEFAULT '',
    -- Mode ouvert à la connexion : chacun choisit le sien.
    default_mode TEXT NOT NULL DEFAULT 'projects',
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS sessions (
    token TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS buildings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    UNIQUE (company_id, name)
  );

  -- Acteurs d'un projet : association vers les utilisateurs.
  CREATE TABLE IF NOT EXISTS project_actors (
    project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    PRIMARY KEY (project_id, user_id)
  );

  -- Étiquettes d'un tableau de projets : un nom et une couleur, posés sur ses
  -- projets. Jumelles de celles des cartes (« labels »), mais rattachées à un
  -- tableau de projets : les deux modes ne partagent pas leurs étiquettes.
  CREATE TABLE IF NOT EXISTS project_labels (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    board_id INTEGER NOT NULL REFERENCES project_boards(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    -- « teinte.nuance » de la palette Mantine, par exemple « red.6 ».
    color TEXT NOT NULL DEFAULT 'blue.6',
    position INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS project_label_links (
    project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    label_id INTEGER NOT NULL REFERENCES project_labels(id) ON DELETE CASCADE,
    PRIMARY KEY (project_id, label_id)
  );

  -- Tableaux du mode Tâche. Une société en compte autant qu'elle veut ;
  -- chacun porte ses propres listes.
  CREATE TABLE IF NOT EXISTS boards (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    position INTEGER NOT NULL DEFAULT 0,
    -- Le numéro des cartes se montre par défaut ; chaque tableau peut le taire.
    show_card_numbers INTEGER NOT NULL DEFAULT 1,
    -- L'auteur du tableau : celui qui l'a créé. Le compte supprimé laisse le
    -- tableau sans auteur, et donc ouvert à tous.
    owner_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    -- Privé : le tableau ne se montre qu'à son auteur.
    is_private INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL
  );

  -- Listes d'un tableau (ses colonnes).
  CREATE TABLE IF NOT EXISTS task_lists (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    board_id INTEGER NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    position INTEGER NOT NULL DEFAULT 0,
    -- Couleur d'arrière-plan choisie dans le menu de la liste ; vide = aucune.
    color TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL
  );

  -- Cartes d'une liste du mode Tâche. Elles disparaissent avec leur liste
  -- (ON DELETE CASCADE) ; « position » porte leur ordre dans la liste.
  CREATE TABLE IF NOT EXISTS task_cards (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    list_id INTEGER NOT NULL REFERENCES task_lists(id) ON DELETE CASCADE,
    text TEXT NOT NULL,
    position INTEGER NOT NULL DEFAULT 0,
    -- Numéro affiché sur la carte. Attribué à la création et compté par
    -- tableau (donc par société), pas sur l'identifiant global. Un séparateur
    -- n'en porte pas : il reste à zéro.
    number INTEGER NOT NULL DEFAULT 0,
    -- « card » pour une carte, « separator » pour un séparateur : un simple
    -- intitulé posé entre deux cartes, qui se déplace comme elles.
    kind TEXT NOT NULL DEFAULT 'card',
    -- Description longue, saisie en texte enrichi et conservée en HTML. Vide
    -- pour un séparateur, qui n'a pas de fiche.
    description TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL
  );

  -- Membres d'une carte : les mêmes utilisateurs que les acteurs d'un projet.
  CREATE TABLE IF NOT EXISTS card_members (
    card_id INTEGER NOT NULL REFERENCES task_cards(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    PRIMARY KEY (card_id, user_id)
  );

  -- Étiquettes d'un tableau : un nom et une couleur, posés sur ses cartes.
  -- Elles appartiennent au tableau, comme les catégories d'un tableau de
  -- projets : deux tableaux peuvent nommer la même étiquette.
  CREATE TABLE IF NOT EXISTS labels (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    board_id INTEGER NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    -- « teinte.nuance » de la palette Mantine, par exemple « red.6 ».
    color TEXT NOT NULL DEFAULT 'blue.6',
    position INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS card_labels (
    card_id INTEGER NOT NULL REFERENCES task_cards(id) ON DELETE CASCADE,
    label_id INTEGER NOT NULL REFERENCES labels(id) ON DELETE CASCADE,
    PRIMARY KEY (card_id, label_id)
  );

  -- Checklists d'une carte : une carte en porte autant qu'elle veut, chacune
  -- avec son titre et ses éléments. « position » range les checklists entre
  -- elles, sous la fiche de la carte.
  CREATE TABLE IF NOT EXISTS card_checklists (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    card_id INTEGER NOT NULL REFERENCES task_cards(id) ON DELETE CASCADE,
    title TEXT NOT NULL DEFAULT 'Checklist',
    position INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL
  );

  -- Éléments d'une checklist : un libellé, une case cochée ou non, une date
  -- d'échéance facultative (« AAAA-MM-JJ », comme les sélecteurs de Mantine)
  -- et des membres. Ils se glissent pour être réordonnés : « position » porte
  -- cet ordre.
  CREATE TABLE IF NOT EXISTS checklist_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    checklist_id INTEGER NOT NULL REFERENCES card_checklists(id) ON DELETE CASCADE,
    text TEXT NOT NULL DEFAULT '',
    done INTEGER NOT NULL DEFAULT 0,
    -- Vide plutôt que NULL : une date absente se lit de la même façon partout.
    due_date TEXT NOT NULL DEFAULT '',
    position INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL
  );

  -- Membres d'un élément de checklist : les mêmes utilisateurs que les membres
  -- d'une carte, choisis élément par élément.
  CREATE TABLE IF NOT EXISTS checklist_item_members (
    item_id INTEGER NOT NULL REFERENCES checklist_items(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    PRIMARY KEY (item_id, user_id)
  );

  -- Commentaires d'une carte. Table à part de ceux des projets : les deux
  -- fils ne se mélangent pas, et « comments » garde son projet obligatoire.
  CREATE TABLE IF NOT EXISTS card_comments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    card_id INTEGER NOT NULL REFERENCES task_cards(id) ON DELETE CASCADE,
    -- Le commentaire perd son auteur, mais pas son texte, si le compte est
    -- supprimé.
    user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    text TEXT NOT NULL,
    -- Voir « comments.system ».
    system INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  -- « system » marque les mots que l'application écrit elle-même, comme celui
  -- qui note la création : ils content un fait, ils ne se modifient ni ne se
  -- suppriment.
  CREATE TABLE IF NOT EXISTS comments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    -- Auteur du commentaire. Il perd son auteur, mais pas son texte, si le
    -- compte est supprimé ; il est vide pour les commentaires d'avant.
    user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    text TEXT NOT NULL,
    system INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
`);

// --- Migrations ------------------------------------------------------------
// Bases créées avant l'ajout des sociétés : on ajoute la colonne manquante.
const projectColumns = db.prepare("PRAGMA table_info(projects)").all();
if (!projectColumns.some((c) => c.name === "company_id")) {
  db.exec("ALTER TABLE projects ADD COLUMN company_id INTEGER REFERENCES companies(id)");
}
if (!projectColumns.some((c) => c.name === "building_id")) {
  db.exec("ALTER TABLE projects ADD COLUMN building_id INTEGER REFERENCES buildings(id)");
}

// Bases créées avant la séparation prénom / nom : on ajoute les colonnes et on
// découpe le nom existant au premier espace.
const userColumns = db.prepare("PRAGMA table_info(users)").all();
if (userColumns.length > 0 && !userColumns.some((c) => c.name === "first_name")) {
  db.exec("ALTER TABLE users ADD COLUMN first_name TEXT NOT NULL DEFAULT ''");
  db.exec("ALTER TABLE users ADD COLUMN last_name TEXT NOT NULL DEFAULT ''");

  const split = db.transaction(() => {
    const update = db.prepare("UPDATE users SET first_name = ?, last_name = ? WHERE id = ?");
    for (const user of db.prepare("SELECT id, name FROM users").all()) {
      const parts = String(user.name || "").trim().split(/\s+/).filter(Boolean);
      update.run(parts[0] || "", parts.slice(1).join(" "), user.id);
    }
  });
  split();
}

// Comptes créés avant le choix d'un mode d'ouverture : ils ouvrent sur les
// projets, comme avant.
if (userColumns.length > 0 && !userColumns.some((c) => c.name === "default_mode")) {
  db.exec("ALTER TABLE users ADD COLUMN default_mode TEXT NOT NULL DEFAULT 'projects'");
}

const listColumns = db.prepare("PRAGMA table_info(task_lists)").all();
// Une base d'avant les tableaux : ses listes pendent encore à une société.
// Les rattrapages qui suivent ne concernent qu'elle, jamais une base neuve.
const listesAvantTableaux = listColumns.length > 0 && !listColumns.some((c) => c.name === "board_id");

// Listes créées avant leur rattachement à une société : on les affecte à la
// première société connue. Cette colonne cède ensuite la place à « board_id »
// (migration suivante), mais le rattrapage reste nécessaire pour la traverser.
if (listesAvantTableaux && !listColumns.some((c) => c.name === "company_id")) {
  db.exec("ALTER TABLE task_lists ADD COLUMN company_id INTEGER REFERENCES companies(id) ON DELETE CASCADE");
  const premiere = db.prepare("SELECT id FROM companies ORDER BY id LIMIT 1").get();
  if (premiere) {
    db.prepare("UPDATE task_lists SET company_id = ? WHERE company_id IS NULL").run(premiere.id);
  }
}

// Listes créées avant le choix d'une couleur : sans couleur, donc vide.
if (listesAvantTableaux && !listColumns.some((c) => c.name === "color")) {
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
      "INSERT INTO boards (company_id, name, position, created_at) VALUES (?, 'Tableau', 0, ?)"
    );
    const reprendre = db.prepare(
      `INSERT INTO task_lists_migration (id, board_id, name, position, color, created_at)
       SELECT id, ?, name, position, color, created_at
       FROM task_lists WHERE company_id IS ?`
    );

    // Une liste sans société (société supprimée en cours de route) n'a pas de
    // tableau naturel : elle rejoint celui de la première société plutôt que
    // de disparaître avec ses cartes.
    const secours = db.prepare("SELECT id FROM companies ORDER BY id LIMIT 1").get();
    const societes = db
      .prepare("SELECT DISTINCT company_id FROM task_lists")
      .all()
      .map(({ company_id }) => company_id);

    for (const societe of societes) {
      const proprietaire = societe ?? secours?.id;
      if (!proprietaire) continue;
      const { lastInsertRowid } = creerTableau.run(proprietaire, new Date().toISOString());
      reprendre.run(lastInsertRowid, societe);
    }

    db.exec("DROP TABLE task_lists");
    db.exec("ALTER TABLE task_lists_migration RENAME TO task_lists");
  });

  // Les clés étrangères sont suspendues le temps de l'échange : les cartes
  // pointent un instant vers une table en cours de remplacement.
  db.pragma("foreign_keys = OFF");
  try {
    migrer();
  } finally {
    db.pragma("foreign_keys = ON");
  }
}

// Bases créées avant les tableaux de projets : les catégories étaient
// globales et uniques par nom. Un premier tableau les recueille, ainsi que les
// projets existants. SQLite ne sait pas retirer la contrainte UNIQUE sur le
// nom : la table est reconstruite, en conservant les identifiants pour que les
// projets restent accrochés à leur catégorie.
const categoryColumns = db.prepare("PRAGMA table_info(categories)").all();
if (categoryColumns.length > 0 && !categoryColumns.some((c) => c.name === "board_id")) {
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
      "INSERT INTO categories_migration (id, board_id, name) SELECT id, ?, name FROM categories"
    ).run(tableau);
    db.exec("DROP TABLE categories");
    db.exec("ALTER TABLE categories_migration RENAME TO categories");

    if (!db.prepare("PRAGMA table_info(projects)").all().some((c) => c.name === "board_id")) {
      db.exec(
        "ALTER TABLE projects ADD COLUMN board_id INTEGER REFERENCES project_boards(id) ON DELETE CASCADE"
      );
    }
    db.prepare("UPDATE projects SET board_id = ? WHERE board_id IS NULL").run(tableau);
  });

  // Les clés étrangères sont suspendues le temps de l'échange : les projets
  // pointent un instant vers une table en cours de remplacement.
  db.pragma("foreign_keys = OFF");
  try {
    migrer();
  } finally {
    db.pragma("foreign_keys = ON");
  }
}

// Commentaires écrits avant qu'on retienne leur auteur : la colonne est
// ajoutée vide, ces commentaires resteront sans auteur connu.
const commentColumns = db.prepare("PRAGMA table_info(comments)").all();
if (commentColumns.length > 0 && !commentColumns.some((c) => c.name === "user_id")) {
  db.exec("ALTER TABLE comments ADD COLUMN user_id INTEGER REFERENCES users(id) ON DELETE SET NULL");
}

// Cartes créées avant leur numérotation : on numérote chaque tableau à part,
// dans l'ordre de création de ses cartes.
const cardColumns = db.prepare("PRAGMA table_info(task_cards)").all();
if (cardColumns.length > 0 && !cardColumns.some((c) => c.name === "number")) {
  db.exec("ALTER TABLE task_cards ADD COLUMN number INTEGER NOT NULL DEFAULT 0");

  const numeroter = db.transaction(() => {
    const update = db.prepare("UPDATE task_cards SET number = ? WHERE id = ?");
    const parTableau = db.prepare(
      `SELECT task_cards.id
       FROM task_cards
       JOIN task_lists ON task_lists.id = task_cards.list_id
       WHERE task_lists.board_id = ?
       ORDER BY task_cards.id`
    );
    for (const { id } of db.prepare("SELECT id FROM boards").all()) {
      parTableau.all(id).forEach((card, index) => update.run(index + 1, card.id));
    }
  });
  numeroter();
}

// Cartes créées avant les séparateurs : elles sont toutes des cartes.
if (cardColumns.length > 0 && !cardColumns.some((c) => c.name === "kind")) {
  db.exec("ALTER TABLE task_cards ADD COLUMN kind TEXT NOT NULL DEFAULT 'card'");
}

// Fils ouverts avant qu'on distingue les mots de l'application : on retrouve
// ceux qui notaient une création à leur texte, écrit par nous seuls.
for (const table of ["comments", "card_comments"]) {
  const colonnes = db.prepare(`PRAGMA table_info(${table})`).all();
  if (colonnes.length > 0 && !colonnes.some((c) => c.name === "system")) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN system INTEGER NOT NULL DEFAULT 0`);
    db.prepare(
      `UPDATE ${table} SET system = 1
       WHERE text LIKE 'Carte créée le %' OR text LIKE 'Projet créé le %'`
    ).run();
  }
}

// Tableaux créés avant le réglage du numéro des cartes : ils le montrent.
const boardColumns = db.prepare("PRAGMA table_info(boards)").all();
if (boardColumns.length > 0 && !boardColumns.some((c) => c.name === "show_card_numbers")) {
  db.exec("ALTER TABLE boards ADD COLUMN show_card_numbers INTEGER NOT NULL DEFAULT 1");
}

// Tableaux créés avant l'option « Privé » : ils restent visibles de tous, et
// sans auteur connu — le premier à fermer l'un d'eux en devient l'auteur.
if (boardColumns.length > 0 && !boardColumns.some((c) => c.name === "owner_id")) {
  db.exec("ALTER TABLE boards ADD COLUMN owner_id INTEGER REFERENCES users(id) ON DELETE SET NULL");
}
if (boardColumns.length > 0 && !boardColumns.some((c) => c.name === "is_private")) {
  db.exec("ALTER TABLE boards ADD COLUMN is_private INTEGER NOT NULL DEFAULT 0");
}

// Cartes créées avant leur fiche : elles n'ont pas encore de description.
if (cardColumns.length > 0 && !cardColumns.some((c) => c.name === "description")) {
  db.exec("ALTER TABLE task_cards ADD COLUMN description TEXT NOT NULL DEFAULT ''");
}

const seedIfEmpty = () => {
  const { count } = db.prepare("SELECT COUNT(*) AS count FROM categories").get();
  if (count > 0) return;

  // Les catégories appartiennent à un tableau : il vient donc en premier.
  const { lastInsertRowid: boardId } = db
    .prepare("INSERT INTO project_boards (name, position, created_at) VALUES (?, 0, ?)")
    .run("Tableau", new Date().toISOString());

  const insertCategory = db.prepare("INSERT INTO categories (board_id, name) VALUES (?, ?)");
  const categoryIds = {};
  for (const name of ["Web", "Mobile", "Interne", "Client"]) {
    const { lastInsertRowid } = insertCategory.run(boardId, name);
    categoryIds[name] = lastInsertRowid;
  }

  const insertCompany = db.prepare("INSERT INTO companies (name) VALUES (?)");
  const companyIds = {};
  for (const name of ["Arco Marketing", "Arco Digital", "Arco Studio"]) {
    const { lastInsertRowid } = insertCompany.run(name);
    companyIds[name] = lastInsertRowid;
  }

  const now = new Date();
  const iso = (daysAgo) => {
    const d = new Date(now);
    d.setDate(d.getDate() - daysAgo);
    return d.toISOString();
  };

  const insertProject = db.prepare(`
    INSERT INTO projects (name, description, board_id, category_id, company_id, status, created_at, updated_at)
    VALUES (@name, @description, @board_id, @category_id, @company_id, @status, @created_at, @updated_at)
  `);
  const insertComment = db.prepare(`
    INSERT INTO comments (project_id, text, created_at, updated_at)
    VALUES (@project_id, @text, @created_at, @updated_at)
  `);

  const p1 = insertProject.run({
    name: "Refonte site vitrine",
    board_id: boardId,
    description: "Nouvelle version du site institutionnel avec Mantine.",
    category_id: categoryIds.Web,
    company_id: companyIds["Arco Marketing"],
    status: 65,
    created_at: iso(20),
    updated_at: iso(2),
  });
  insertComment.run({
    project_id: p1.lastInsertRowid,
    text: "Maquettes validées par le client.",
    created_at: iso(10),
    updated_at: iso(10),
  });
  insertComment.run({
    project_id: p1.lastInsertRowid,
    text: "Intégration de la page d'accueil terminée.",
    created_at: iso(2),
    updated_at: iso(2),
  });

  const p2 = insertProject.run({
    name: "Application mobile RH",
    board_id: boardId,
    description: "App interne de gestion des congés.",
    category_id: categoryIds.Mobile,
    company_id: companyIds["Arco Digital"],
    status: 100,
    created_at: iso(45),
    updated_at: iso(5),
  });
  insertComment.run({
    project_id: p2.lastInsertRowid,
    text: "Mise en production effectuée.",
    created_at: iso(5),
    updated_at: iso(5),
  });

  insertProject.run({
    name: "Migration serveurs internes",
    board_id: boardId,
    description: "Bascule des serveurs sur la nouvelle infra.",
    category_id: categoryIds.Interne,
    company_id: companyIds["Arco Studio"],
    status: 10,
    created_at: iso(3),
    updated_at: iso(3),
  });
};

seedIfEmpty();

export default db;
