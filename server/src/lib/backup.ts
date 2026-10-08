// Backup and restore: the database and the uploaded files, in a single
// archive.
//
// Two design choices explain the rest of the file.
//
//   1. The database is not copied byte for byte from disk: it is written by
//      SQLite itself (VACUUM INTO), which gives a consistent snapshot even
//      while writes are happening, and without the WAL journal alongside. A
//      copy of `data.db` taken by hand, on the other hand, can miss writes
//      still sitting in the journal.
//
//   2. The restore does not replace the database file. The server holds an
//      open connection and a few hundred prepared statements on it: swapping
//      the file from under them would require restarting everything. The data
//      is therefore copied table by table into the database in place, which
//      keeps its schema — today's, migrations included. An older backup is
//      first migrated in its own file (migrateBackup): it reaches today's
//      schema, and its data is copied as is.

import Database from "better-sqlite3";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { BackupInfo, RestoreResult } from "@milo/shared";
import { migrate, numberReferences, renameTables } from "../db/migrations.js";
import { INDEXES, SCHEMA } from "../db/schema.js";
import { db, transaction } from "../db/query.js";
import { env } from "../env.js";
import { unpack, pack } from "./archive.js";
import type { Entry } from "./archive.js";
import { badRequest } from "./http.js";
import { mediaPath } from "./media.js";
import { ticketPathFor } from "./ticket-files.js";
import { now } from "./time.js";
import { readSetting, writeSetting } from "../repositories/settings.js";

/** The two names a Milo archive carries. */
const DATABASE_FILE = "milo.db";
const MEDIA_FOLDER = "media/";
/** The media folder in earlier archives: they can still be restored. */
const LEGACY_MEDIA_FOLDER = "medias/";
/** Support e-mail files, apart from the media (lib/ticket-files.ts). */
const TICKET_FOLDER = "tickets/";

const RESTORE_KEY = "last_restore";

/**
 * Without these tables, it is not a Milo database. Three are enough to rule
 * out an arbitrary SQLite database dropped in by mistake; the integrity
 * check, for its part, rules out a truncated file.
 */
const EXPECTED_TABLES = ["users", "projects", "task_cards"];

interface NameRow {
  name: string;
}

/** The files in the media folder that really are ours. */
const presentMedia = (): string[] =>
  fs.readdirSync(env.mediaPath).filter((file) => mediaPath(file) !== null);

const size = (relativePath: string): number => {
  try {
    return fs.statSync(relativePath).size;
  } catch {
    return 0;
  }
};

/** A working folder, and its cleanup whatever happens. */
const inTemporaryFolder = <T>(action: (folder: string) => T): T => {
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), "milo-backup-"));
  try {
    return action(folder);
  } finally {
    fs.rmSync(folder, { recursive: true, force: true });
  }
};

/** What the backup will weigh, to announce it before it is requested. */
export const backupInfo = (): BackupInfo => {
  const media = presentMedia();
  return {
    database_size: size(env.dbPath),
    media_count: media.length,
    media_size: media.reduce((sum, file) => sum + size(mediaPath(file)!), 0),
    last_restore: readSetting(RESTORE_KEY, ""),
  };
};

export const buildBackup = (): Buffer =>
  inTemporaryFolder((folder) => {
    const copy = path.join(folder, DATABASE_FILE);
    // VACUUM INTO requires a file that does not exist: the folder has just
    // been created for us alone.
    db.prepare("VACUUM INTO ?").run(copy);

    const entries: Entry[] = [{ name: DATABASE_FILE, content: fs.readFileSync(copy) }];
    for (const file of presentMedia()) {
      entries.push({
        name: `${MEDIA_FOLDER}${file}`,
        content: fs.readFileSync(mediaPath(file)!),
      });
    }
    for (const file of fs.readdirSync(env.ticketsPath)) {
      const relativePath = ticketPathFor(file);
      if (relativePath) entries.push({ name: `${TICKET_FOLDER}${file}`, content: fs.readFileSync(relativePath) });
    }
    return pack(entries);
  });

/** A table's columns, in either of the two open databases. */
const columns = (base: string, table: string): string[] =>
  (db.pragma(`${base}.table_info("${table}")`) as NameRow[]).map((c) => c.name);

const verifyDatabase = (relativePath: string): void => {
  let tables = new Set<string>();

  // SQLite reports what is wrong — truncated or encrypted file, or not a
  // database — by throwing, and in English. All of this boils down here to a
  // single answer: this file cannot be restored.
  try {
    const base = new Database(relativePath, { readonly: true });
    try {
      if (base.pragma("integrity_check", { simple: true }) !== "ok") {
        throw new Error("integrity_check");
      }
      tables = new Set(
        (base.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all() as NameRow[]).map(
          (t) => t.name,
        ),
      );
    } finally {
      base.close();
    }
  } catch {
    badRequest("La base de cette sauvegarde est illisible ou abîmée");
  }

  for (const expected of EXPECTED_TABLES) {
    if (!tables.has(expected)) badRequest("Cette sauvegarde ne vient pas de Milo");
  }
};

/**
 * The backup, brought to today's schema in its own file: a database from
 * before views cannot be copied as is — its boards have no view, its access
 * categories no longer exist. Its catch-up steps and conversion therefore
 * happen on its side, before anything is copied from it.
 */
const migrateBackup = (relativePath: string): void => {
  const base = new Database(relativePath);
  try {
    base.pragma("foreign_keys = ON");
    renameTables(base);
    base.exec(SCHEMA);
    migrate(base);
    base.exec(INDEXES);
    numberReferences(base);
  } finally {
    base.close();
  }
};

/**
 * The content of our tables, replaced by that of the backup. All or nothing:
 * a single transaction, and the previous database if anything fails.
 *
 * Foreign keys are suspended for the duration of the operation — tables are
 * emptied and filled in `sqlite_master` order, which is not the dependency
 * order. The pragma cannot be changed from inside a transaction: it is set
 * before, and lifted after.
 */
const replaceData = (relativePath: string): { tables: number; rows: number } => {
  db.pragma("foreign_keys = OFF");
  db.prepare("ATTACH DATABASE ? AS backup").run(relativePath);

  try {
    return transaction(() => {
      const backupNames = new Set(
        (
          db
            .prepare(
              "SELECT name FROM backup.sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'",
            )
            .all() as NameRow[]
        ).map((t) => t.name),
      );

      const ourTables = (
        db
          .prepare(
            "SELECT name FROM main.sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'",
          )
          .all() as NameRow[]
      ).map((t) => t.name);

      let tables = 0;
      let rows = 0;

      for (const table of ourTables) {
        // A table the backup does not know is emptied all the same: its rows
        // would describe a state the backup does not know about.
        db.prepare(`DELETE FROM main."${table}"`).run();
        if (!backupNames.has(table)) continue;

        // The intersection of columns: those the backup does not know take
        // the default value of today's schema, those it has in excess are
        // left out.
        const common = columns("main", table).filter((c) =>
          columns("backup", table).includes(c),
        );
        if (common.length === 0) continue;

        const list = common.map((c) => `"${c}"`).join(", ");
        const { changes } = db
          .prepare(`INSERT INTO main."${table}" (${list}) SELECT ${list} FROM backup."${table}"`)
          .run();

        tables += 1;
        rows += changes;
      }

      return { tables, rows };
    })();
  } finally {
    db.exec("DETACH DATABASE backup");
    db.pragma("foreign_keys = ON");
  }
};

/**
 * The uploaded files, put back in place. What was there and the backup does
 * not know is not erased: nothing cites it any more, and the orphan cleanup
 * (lib/media.ts) takes care of it in due course.
 */
const restoreMedia = (files: Map<string, Buffer>): number => {
  let restored = 0;

  for (const [name, content] of files) {
    // Ticket files, under the same guard: one of our names, in their own
    // folder only.
    if (name.startsWith(TICKET_FOLDER)) {
      const ticketPath = ticketPathFor(name.slice(TICKET_FOLDER.length));
      if (ticketPath) {
        fs.writeFileSync(ticketPath, content);
        restored += 1;
      }
      continue;
    }
    const folder = [MEDIA_FOLDER, LEGACY_MEDIA_FOLDER].find((f) => name.startsWith(f));
    if (!folder) continue;
    // The name is checked again, not just shortened: a hand-crafted archive
    // must not be able to write anywhere but in the media folder.
    const relativePath = mediaPath(name.slice(folder.length));
    if (!relativePath) continue;
    fs.writeFileSync(relativePath, content);
    restored += 1;
  }

  return restored;
};

export const restoreFromBackup = (archive: Buffer): RestoreResult => {
  let files: Map<string, Buffer>;
  try {
    files = unpack(archive);
  } catch (error) {
    return badRequest(error instanceof Error ? error.message : "Sauvegarde illisible");
  }

  const base = files.get(DATABASE_FILE);
  if (!base) badRequest("Cette archive ne contient pas de base Milo");

  return inTemporaryFolder((folder) => {
    const relativePath = path.join(folder, DATABASE_FILE);
    fs.writeFileSync(relativePath, base!);
    verifyDatabase(relativePath);

    migrateBackup(relativePath);
    const { tables, rows } = replaceData(relativePath);
    const media = restoreMedia(files);

    // Written afterwards: the restore has just replaced the settings table,
    // and this trace speaks of now, not of the backup.
    writeSetting(RESTORE_KEY, now());

    return { tables, rows, media };
  });
};
