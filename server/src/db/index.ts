// La base : une connexion, son schéma, ses rattrapages, ses index.

import Database from "better-sqlite3";
import type { Database as SqliteDatabase } from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import { env } from "../env.js";
import { migrate, numeroterReferences } from "./migrations.js";
import { seedIfEmpty } from "./seed.js";
import { INDEXES, SCHEMA } from "./schema.js";

fs.mkdirSync(path.dirname(env.dbPath), { recursive: true });

const db: SqliteDatabase = new Database(env.dbPath);

db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");
// Le journal WAL est synchronisé au checkpoint et non à chaque écriture : sur
// une base à un seul processus, c'est sûr en cas de plantage de l'application
// et nettement plus rapide.
db.pragma("synchronous = NORMAL");
// Laisse SQLite attendre plutôt que de rendre « database is locked » : le flux
// d'événements et les écritures se croisent.
db.pragma("busy_timeout = 5000");

db.exec(SCHEMA);
migrate(db);
db.exec(INDEXES);
seedIfEmpty(db);
// Les projets de démonstration n'ont pas de référence : ils en reçoivent une.
numeroterReferences(db);

export default db;
