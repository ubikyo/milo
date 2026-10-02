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
//      comprises. Une sauvegarde plus ancienne se restaure ainsi sans rien de
//      particulier : ses colonnes sont un sous-ensemble des nôtres, et celles
//      qui lui manquent prennent leur valeur par défaut.

import Database from "better-sqlite3";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { BackupInfo, RestoreResult } from "@milo/shared";
import {
  permissionsParTypeDeWidget,
  separerParametrage,
  numeroterReferences,
  poserSectionsParDefaut,
  rattacherIndicateurs,
} from "../db/migrations.js";
import { db, transaction } from "../db/query.js";
import { env } from "../env.js";
import { depaqueter, empaqueter } from "./archive.js";
import type { Entree } from "./archive.js";
import { badRequest } from "./http.js";
import { cheminMedia } from "./medias.js";
import { cheminTicket } from "./ticket-files.js";
import { now } from "./time.js";
import { readSetting, writeSetting } from "../repositories/settings.js";

/** Les deux noms que porte une archive de Milo. */
const FICHIER_BASE = "milo.db";
const DOSSIER_MEDIAS = "medias/";
/** Les fichiers des e-mails du support, à part des médias (lib/ticket-files.ts). */
const DOSSIER_TICKETS = "tickets/";

const CLE_RESTAURATION = "last_restore";

/**
 * Sans ces tables, ce n'est pas une base de Milo. Trois suffisent à écarter
 * une base SQLite quelconque déposée par erreur ; la vérification d'intégrité,
 * elle, écarte un fichier tronqué.
 */
const TABLES_ATTENDUES = ["users", "projects", "task_cards"];

interface NomRow {
  name: string;
}

/** Les fichiers du dossier des médias qui sont bien les nôtres. */
const mediasPresents = (): string[] =>
  fs.readdirSync(env.mediaPath).filter((fichier) => cheminMedia(fichier) !== null);

const taille = (chemin: string): number => {
  try {
    return fs.statSync(chemin).size;
  } catch {
    return 0;
  }
};

/** Un dossier de travail, et son ménage quoi qu'il advienne. */
const dansUnDossierTemporaire = <T>(action: (dossier: string) => T): T => {
  const dossier = fs.mkdtempSync(path.join(os.tmpdir(), "milo-sauvegarde-"));
  try {
    return action(dossier);
  } finally {
    fs.rmSync(dossier, { recursive: true, force: true });
  }
};

/** Ce que la sauvegarde va peser, pour l'annoncer avant de la demander. */
export const infoSauvegarde = (): BackupInfo => {
  const medias = mediasPresents();
  return {
    database_size: taille(env.dbPath),
    media_count: medias.length,
    media_size: medias.reduce((somme, fichier) => somme + taille(cheminMedia(fichier)!), 0),
    last_restore: readSetting(CLE_RESTAURATION, ""),
  };
};

export const construireSauvegarde = (): Buffer =>
  dansUnDossierTemporaire((dossier) => {
    const copie = path.join(dossier, FICHIER_BASE);
    // VACUUM INTO exige un fichier qui n'existe pas : le dossier vient d'être
    // créé pour nous seuls.
    db.prepare("VACUUM INTO ?").run(copie);

    const entrees: Entree[] = [{ nom: FICHIER_BASE, contenu: fs.readFileSync(copie) }];
    for (const fichier of mediasPresents()) {
      entrees.push({
        nom: `${DOSSIER_MEDIAS}${fichier}`,
        contenu: fs.readFileSync(cheminMedia(fichier)!),
      });
    }
    for (const fichier of fs.readdirSync(env.ticketsPath)) {
      const chemin = cheminTicket(fichier);
      if (chemin) entrees.push({ nom: `${DOSSIER_TICKETS}${fichier}`, contenu: fs.readFileSync(chemin) });
    }
    return empaqueter(entrees);
  });

/** Les colonnes d'une table, dans l'une ou l'autre des deux bases ouvertes. */
const colonnes = (base: string, table: string): string[] =>
  (db.pragma(`${base}.table_info("${table}")`) as NomRow[]).map((c) => c.name);

const verifierLaBase = (chemin: string): void => {
  let tables = new Set<string>();

  // SQLite dit ce qui ne va pas — fichier tronqué, chiffré, ou qui n'est pas
  // une base — en levant, et en anglais. Tout cela se ramène ici à une seule
  // réponse : ce fichier ne se restaure pas.
  try {
    const base = new Database(chemin, { readonly: true });
    try {
      if (base.pragma("integrity_check", { simple: true }) !== "ok") {
        throw new Error("integrity_check");
      }
      tables = new Set(
        (base.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all() as NomRow[]).map(
          (t) => t.name,
        ),
      );
    } finally {
      base.close();
    }
  } catch {
    badRequest("La base de cette sauvegarde est illisible ou abîmée");
  }

  for (const attendue of TABLES_ATTENDUES) {
    if (!tables.has(attendue)) badRequest("Cette sauvegarde ne vient pas de Milo");
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
const remplacerLesDonnees = (chemin: string): { tables: number; rows: number } => {
  db.pragma("foreign_keys = OFF");
  db.prepare("ATTACH DATABASE ? AS sauvegarde").run(chemin);

  try {
    return transaction(() => {
      const nomsSauvegarde = new Set(
        (
          db
            .prepare(
              "SELECT name FROM sauvegarde.sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'",
            )
            .all() as NomRow[]
        ).map((t) => t.name),
      );

      const nosTables = (
        db
          .prepare(
            "SELECT name FROM main.sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'",
          )
          .all() as NomRow[]
      ).map((t) => t.name);

      let tables = 0;
      let rows = 0;

      for (const table of nosTables) {
        // Une table que la sauvegarde ne connaît pas est vidée quand même :
        // ses lignes parleraient d'un état que la sauvegarde ignore.
        db.prepare(`DELETE FROM main."${table}"`).run();
        if (!nomsSauvegarde.has(table)) continue;

        // L'intersection des colonnes : celles que la sauvegarde ignore
        // prennent la valeur par défaut du schéma d'aujourd'hui, celles
        // qu'elle a en trop sont laissées.
        const communes = colonnes("main", table).filter((c) =>
          colonnes("sauvegarde", table).includes(c),
        );
        if (communes.length === 0) continue;

        const liste = communes.map((c) => `"${c}"`).join(", ");
        const { changes } = db
          .prepare(`INSERT INTO main."${table}" (${liste}) SELECT ${liste} FROM sauvegarde."${table}"`)
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
const restaurerLesMedias = (fichiers: Map<string, Buffer>): number => {
  let restaures = 0;

  for (const [nom, contenu] of fichiers) {
    // Les fichiers des tickets, sous la même garde : un nom des nôtres, dans
    // leur seul dossier.
    if (nom.startsWith(DOSSIER_TICKETS)) {
      const cheminT = cheminTicket(nom.slice(DOSSIER_TICKETS.length));
      if (cheminT) {
        fs.writeFileSync(cheminT, contenu);
        restaures += 1;
      }
      continue;
    }
    if (!nom.startsWith(DOSSIER_MEDIAS)) continue;
    // Le nom est recontrôlé, pas seulement raccourci : une archive fabriquée
    // à la main ne doit pas pouvoir écrire ailleurs que dans le dossier des
    // médias.
    const chemin = cheminMedia(nom.slice(DOSSIER_MEDIAS.length));
    if (!chemin) continue;
    fs.writeFileSync(chemin, contenu);
    restaures += 1;
  }

  return restaures;
};

export const restaurerSauvegarde = (archive: Buffer): RestoreResult => {
  let fichiers: Map<string, Buffer>;
  try {
    fichiers = depaqueter(archive);
  } catch (erreur) {
    return badRequest(erreur instanceof Error ? erreur.message : "Sauvegarde illisible");
  }

  const base = fichiers.get(FICHIER_BASE);
  if (!base) badRequest("Cette archive ne contient pas de base Milo");

  return dansUnDossierTemporaire((dossier) => {
    const chemin = path.join(dossier, FICHIER_BASE);
    fs.writeFileSync(chemin, base!);
    verifierLaBase(chemin);

    const { tables, rows } = remplacerLesDonnees(chemin);
    // Une sauvegarde d'avant les sections des statistiques laisse ses
    // indicateurs sans section, celle d'avant les références communes
    // numérote ses cartes par tableau, et celle d'avant les sections des
    // projets et des tâches n'en a pas : on les repose. Celle d'avant les
    // permissions par type de widget ne les a pas : ceux qui avaient un accès
    // reçoivent « Modifier » partout.
    separerParametrage(db);
    permissionsParTypeDeWidget(db);
    rattacherIndicateurs(db);
    numeroterReferences(db);
    poserSectionsParDefaut(db);
    const medias = restaurerLesMedias(fichiers);

    // Écrit après coup : la restauration vient de remplacer la table des
    // réglages, et cette trace-ci parle de maintenant, pas de la sauvegarde.
    writeSetting(CLE_RESTAURATION, now());

    return { tables, rows, medias };
  });
};
