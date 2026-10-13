// Migrations only: opens the database at MILO_DB_PATH, brings it to today's
// schema — catch-up migrations and indexes, as at startup (db/index.ts) — and
// stops. Nothing else starts: no mailbox polling, no reminders, no listening.
//
// The deployment runs it on a copy of the production database before
// replacing the code: a migration that fails on the real data stops the
// deployment, and the running version keeps going.

import db from "./db/index.js";

const problems = db.pragma("integrity_check") as { integrity_check: string }[];
const foreignKeys = db.pragma("foreign_key_check") as unknown[];
db.close();

if (problems.length !== 1 || problems[0]?.integrity_check !== "ok") {
  console.error("Intégrité de la base :", problems);
  process.exit(1);
}
// Orphan rows are reported, not fatal: an old database may carry some that
// nothing reads any more.
if (foreignKeys.length > 0) {
  console.warn("Lignes orphelines (clés étrangères) :", foreignKeys.length);
}
console.log("Migrations OK");
