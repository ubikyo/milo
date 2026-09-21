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
  CREATE TABLE IF NOT EXISTS categories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE
  );

  CREATE TABLE IF NOT EXISTS companies (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE
  );

  CREATE TABLE IF NOT EXISTS projects (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    category_id INTEGER NOT NULL REFERENCES categories(id),
    company_id INTEGER REFERENCES companies(id),
    building_id INTEGER REFERENCES buildings(id),
    status INTEGER NOT NULL DEFAULT 0 CHECK (status >= 0 AND status <= 100),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
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

  CREATE TABLE IF NOT EXISTS comments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    text TEXT NOT NULL,
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

const seedIfEmpty = () => {
  const { count } = db.prepare("SELECT COUNT(*) AS count FROM categories").get();
  if (count > 0) return;

  const insertCategory = db.prepare("INSERT INTO categories (name) VALUES (?)");
  const categoryIds = {};
  for (const name of ["Web", "Mobile", "Interne", "Client"]) {
    const { lastInsertRowid } = insertCategory.run(name);
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
    INSERT INTO projects (name, description, category_id, company_id, status, created_at, updated_at)
    VALUES (@name, @description, @category_id, @company_id, @status, @created_at, @updated_at)
  `);
  const insertComment = db.prepare(`
    INSERT INTO comments (project_id, text, created_at, updated_at)
    VALUES (@project_id, @text, @created_at, @updated_at)
  `);

  const p1 = insertProject.run({
    name: "Refonte site vitrine",
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
