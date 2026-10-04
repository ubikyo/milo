// The database: a connection, its schema, its catch-up migrations, its indexes.

import Database from "better-sqlite3";
import type { Database as SqliteDatabase } from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import { env } from "../env.js";
import { migrate, numberReferences } from "./migrations.js";
import { seedIfEmpty } from "./seed.js";
import { INDEXES, SCHEMA } from "./schema.js";

fs.mkdirSync(path.dirname(env.dbPath), { recursive: true });

const db: SqliteDatabase = new Database(env.dbPath);

db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");
// The WAL journal is synced at checkpoint rather than on every write: on a
// single-process database, this is safe in case of an application crash and
// noticeably faster.
db.pragma("synchronous = NORMAL");
// Let SQLite wait rather than return "database is locked": the event stream
// and the writes cross paths.
db.pragma("busy_timeout = 5000");

db.exec(SCHEMA);
migrate(db);
db.exec(INDEXES);
seedIfEmpty(db);
// Demo projects have no reference: they are given one.
numberReferences(db);

export default db;
