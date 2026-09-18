import Database from "better-sqlite3";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const db = new Database(path.join(__dirname, "data.db"));

db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

db.exec(`
  CREATE TABLE IF NOT EXISTS categories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE
  );

  CREATE TABLE IF NOT EXISTS projects (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    category_id INTEGER NOT NULL REFERENCES categories(id),
    status INTEGER NOT NULL DEFAULT 0 CHECK (status >= 0 AND status <= 100),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS comments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    text TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
`);

const seedIfEmpty = () => {
  const { count } = db.prepare("SELECT COUNT(*) AS count FROM categories").get();
  if (count > 0) return;

  const insertCategory = db.prepare("INSERT INTO categories (name) VALUES (?)");
  const categoryIds = {};
  for (const name of ["Web", "Mobile", "Interne", "Client"]) {
    const { lastInsertRowid } = insertCategory.run(name);
    categoryIds[name] = lastInsertRowid;
  }

  const now = new Date();
  const iso = (daysAgo) => {
    const d = new Date(now);
    d.setDate(d.getDate() - daysAgo);
    return d.toISOString();
  };

  const insertProject = db.prepare(`
    INSERT INTO projects (name, description, category_id, status, created_at, updated_at)
    VALUES (@name, @description, @category_id, @status, @created_at, @updated_at)
  `);
  const insertComment = db.prepare(`
    INSERT INTO comments (project_id, text, created_at, updated_at)
    VALUES (@project_id, @text, @created_at, @updated_at)
  `);

  const p1 = insertProject.run({
    name: "Refonte site vitrine",
    description: "Nouvelle version du site institutionnel avec Mantine.",
    category_id: categoryIds.Web,
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
    description: "App interne de gestion des congés.",
    category_id: categoryIds.Mobile,
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
    description: "Bascule des serveurs sur la nouvelle infra.",
    category_id: categoryIds.Interne,
    status: 10,
    created_at: iso(3),
    updated_at: iso(3),
  });
};

seedIfEmpty();

export default db;
