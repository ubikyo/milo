// La sauvegarde et la restauration : la base et les fichiers déposés, en une
// archive unique.
//
// Deux partis pris expliquent le reste du fichier.
//
//   1. La base n'est pas recopiée octet à octet depuis le disque : elle est
//      écrite par SQLite lui-même (VACUUM INTO), ce qui donne un instantané
//      cohérent même pendant qu'on écrit, et sans le journal WAL à côté. Une
//      copie de `data.db` prise à la main, elle, peut manquer les écritures
//      restées dans le journal.
//
//   2. La restauration ne remplace pas le fichier de la base. Le serveur tient
//      une connexion ouverte et quelques centaines de requêtes préparées
//      dessus : échanger le fichier sous leurs pieds demanderait de tout
//      redémarrer. Les données sont donc recopiées table par table dans la
//      base en place, qui garde son schéma — celui d'aujourd'hui, migrations
//      comprises. Une sauvegarde plus ancienne est d'abord migrée dans son
//      propre fichier (migrerLaSauvegarde) : elle arrive au schéma
//      d'aujourd'hui, et ses données se recopient telles quelles.

import Database from "better-sqlite3";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { BackupInfo, RestoreResult } from "@milo/shared";
import { migrate, numberReferences } from "../db/migrations.js";
import { INDEXES, SCHEMA } from "../db/schema.js";
import { db, transaction } from "../db/query.js";
import { env } from "../env.js";
import { unpack, pack } from "./archive.js";
import type { Entry } from "./archive.js";
import { badRequest } from "./http.js";
import { mediaPath } from "./medias.js";
import { ticketPathFor } from "./ticket-files.js";
import { now } from "./time.js";
import { readSetting, writeSetting } from "../repositories/settings.js";

/** Les deux noms que porte une archive de Milo. */
const DATABASE_FILE = "milo.db";
const MEDIA_FOLDER = "medias/";
/** Les fichiers des e-mails du support, à part des médias (lib/ticket-files.ts). */
const TICKET_FOLDER = "tickets/";

const RESTORE_KEY = "last_restore";

/**
 * Sans ces tables, ce n'est pas une base de Milo. Trois suffisent à écarter
 * une base SQLite quelconque déposée par erreur ; la vérification d'intégrité,
 * elle, écarte un fichier tronqué.
 */
const EXPECTED_TABLES = ["users", "projects", "task_cards"];

interface NameRow {
  name: string;
}

/** Les fichiers du dossier des médias qui sont bien les nôtres. */
const presentMedia = (): string[] =>
  fs.readdirSync(env.mediaPath).filter((file) => mediaPath(file) !== null);

const size = (relativePath: string): number => {
  try {
    return fs.statSync(relativePath).size;
  } catch {
    return 0;
  }
};

/** Un dossier de travail, et son ménage quoi qu'il advienne. */
const inTemporaryFolder = <T>(action: (folder: string) => T): T => {
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), "milo-sauvegarde-"));
  try {
    return action(folder);
  } finally {
    fs.rmSync(folder, { recursive: true, force: true });
  }
};

/** Ce que la sauvegarde va peser, pour l'annoncer avant de la demander. */
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
    // VACUUM INTO exige un fichier qui n'existe pas : le dossier vient d'être
    // créé pour nous seuls.
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

/** Les colonnes d'une table, dans l'une ou l'autre des deux bases ouvertes. */
const columns = (base: string, table: string): string[] =>
  (db.pragma(`${base}.table_info("${table}")`) as NameRow[]).map((c) => c.name);

const verifyDatabase = (relativePath: string): void => {
  let tables = new Set<string>();

  // SQLite dit ce qui ne va pas — fichier tronqué, chiffré, ou qui n'est pas
  // une base — en levant, et en anglais. Tout cela se ramène ici à une seule
  // réponse : ce fichier ne se restaure pas.
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
 * La sauvegarde, mise au schéma d'aujourd'hui dans son propre fichier : une
 * base d'avant les vues ne se recopie pas telle quelle — ses tableaux n'ont
 * pas de vue, ses catégories d'accès n'existent plus. Ses rattrapages et sa
 * conversion se font donc chez elle, avant d'en recopier quoi que ce soit.
 */
const migrateBackup = (relativePath: string): void => {
  const base = new Database(relativePath);
  try {
    base.pragma("foreign_keys = ON");
    base.exec(SCHEMA);
    migrate(base);
    base.exec(INDEXES);
    numberReferences(base);
  } finally {
    base.close();
  }
};

/**
 * Le contenu de nos tables, remplacé par celui de la sauvegarde. Tout ou rien :
 * une seule transaction, et la base d'avant si quoi que ce soit échoue.
 *
 * Les clés étrangères sont suspendues le temps de l'opération — les tables se
 * vident et se remplissent dans l'ordre de `sqlite_master`, qui n'est pas
 * celui des dépendances. Le pragma ne se change pas depuis l'intérieur d'une
 * transaction : il se pose avant, et se relève après.
 */
const replaceData = (relativePath: string): { tables: number; rows: number } => {
  db.pragma("foreign_keys = OFF");
  db.prepare("ATTACH DATABASE ? AS sauvegarde").run(relativePath);

  try {
    return transaction(() => {
      const backupNames = new Set(
        (
          db
            .prepare(
              "SELECT name FROM sauvegarde.sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'",
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
        // Une table que la sauvegarde ne connaît pas est vidée quand même :
        // ses lignes parleraient d'un état que la sauvegarde ignore.
        db.prepare(`DELETE FROM main."${table}"`).run();
        if (!backupNames.has(table)) continue;

        // L'intersection des colonnes : celles que la sauvegarde ignore
        // prennent la valeur par défaut du schéma d'aujourd'hui, celles
        // qu'elle a en trop sont laissées.
        const common = columns("main", table).filter((c) =>
          columns("sauvegarde", table).includes(c),
        );
        if (common.length === 0) continue;

        const list = common.map((c) => `"${c}"`).join(", ");
        const { changes } = db
          .prepare(`INSERT INTO main."${table}" (${list}) SELECT ${list} FROM sauvegarde."${table}"`)
          .run();

        tables += 1;
        rows += changes;
      }

      return { tables, rows };
    })();
  } finally {
    db.exec("DETACH DATABASE sauvegarde");
    db.pragma("foreign_keys = ON");
  }
};

/**
 * Les fichiers déposés, remis en place. Ce qui était là et que la sauvegarde
 * ignore n'est pas effacé : plus rien ne le cite, et le ménage des orphelins
 * (lib/medias.ts) s'en charge le moment venu.
 */
const restoreMedia = (files: Map<string, Buffer>): number => {
  let restored = 0;

  for (const [name, content] of files) {
    // Les fichiers des tickets, sous la même garde : un nom des nôtres, dans
    // leur seul dossier.
    if (name.startsWith(TICKET_FOLDER)) {
      const ticketPath = ticketPathFor(name.slice(TICKET_FOLDER.length));
      if (ticketPath) {
        fs.writeFileSync(ticketPath, content);
        restored += 1;
      }
      continue;
    }
    if (!name.startsWith(MEDIA_FOLDER)) continue;
    // Le nom est recontrôlé, pas seulement raccourci : une archive fabriquée
    // à la main ne doit pas pouvoir écrire ailleurs que dans le dossier des
    // médias.
    const relativePath = mediaPath(name.slice(MEDIA_FOLDER.length));
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

    // Écrit après coup : la restauration vient de remplacer la table des
    // réglages, et cette trace-ci parle de maintenant, pas de la sauvegarde.
    writeSetting(RESTORE_KEY, now());

    return { tables, rows, media };
  });
};
