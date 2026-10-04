// Ce que Milo note dans le fil d'un élément quand on le modifie : qui, quand,
// et ce qui a bougé, champ par champ. La création a déjà son mot
// (repositories/comments.ts, `motDeCreation`) ; celui-ci le prolonge.
//
// Le mot tient en un entête — « Projet modifié le … par … » — suivi d'une
// ligne par champ. Le fil le montre plié, entête seul : c'est le client qui
// déplie le détail.
//
// Pour ne pas saturer le fil, les retouches d'une même personne qui se
// suivent de près s'ajoutent au dernier mot au lieu d'en écrire un autre : la
// carte créée puis aussitôt complétée par son tiroir n'en porte qu'un, et un
// nom corrigé deux fois de suite dit « A → C », pas « A → B » puis « B → C ».

import type { Id } from "@milo/shared";
import { mutation, selection } from "../db/query.js";
import { sameDescription } from "./html.js";
import { timestamp, now } from "./time.js";

/** Qui modifie : de quoi le nommer dans l'entête. */
export interface Editor {
  name: string;
  email: string;
}

/** Un champ tel qu'on le lit, avant et après l'écriture. */
export interface Field {
  label: string;
  /** Sa valeur affichée, déjà mise en forme (voir `cite`, `liste`, `date`). */
  value: string;
  /**
   * Une description : trop longue pour être recopiée, on dit seulement
   * qu'elle a changé. Elle se compare comme le fait la fiche, sans égard aux
   * retouches de forme de l'éditeur.
   */
  opaque?: boolean;
}

/** Une ligne du mot, et le champ qu'elle concerne. */
export interface ChangeLine {
  label: string;
  row: string;
}

// --- Mise en forme des valeurs ----------------------------------------------

const EMPTY = "—";

/** Un texte libre, entre guillemets. */
export const quote = (text: string | null | undefined): string =>
  text ? `« ${text} »` : EMPTY;

/** Des noms — acteurs, étiquettes —, dans l'ordre alphabétique. */
export const list = (names: string[]): string =>
  names.length ? [...names].sort((a, b) => a.localeCompare(b, "fr")).join(", ") : EMPTY;

/** Une échéance. */
export const date = (iso: string | null | undefined): string => (iso ? timestamp(iso) : EMPTY);

// --- Ce qui a changé --------------------------------------------------------

const ARROW = " → ";
const bullet = (label: string, rest: string): string => `• ${label} : ${rest}`;

/**
 * Une ligne qui ne compare pas deux valeurs mais dit ce qui s'est passé :
 * « • Fusion : HLP-2, HLP-3 fusionnées ici ».
 */
export const eventLine = (label: string, text: string): ChangeLine => ({
  label,
  row: bullet(label, text),
});

/** Les champs qui ont bougé entre deux lectures, dans l'ordre de la fiche. */
export const changes = (before: Field[], after: Field[]): ChangeLine[] => {
  const previous = new Map(before.map((c) => [c.label, c]));
  const rows: ChangeLine[] = [];
  for (const field of after) {
    const old = previous.get(field.label);
    if (!old) continue;
    if (field.opaque) {
      if (!sameDescription(field.value, old.value)) {
        rows.push({ label: field.label, row: bullet(field.label, "modifiée") });
      }
    } else if (field.value !== old.value) {
      rows.push({
        label: field.label,
        row: bullet(field.label, `${old.value}${ARROW}${field.value}`),
      });
    }
  }
  return rows;
};

/** « a modifié la fiche (nom, échéance) » : ce que disent les notifications. */
export const editMessage = (rows: ChangeLine[]): string =>
  `a modifié la fiche (${rows.map((l) => l.label.toLocaleLowerCase("fr")).join(", ")})`;

/**
 * Ajoute de nouvelles lignes à celles d'un mot déjà écrit. Un champ déjà
 * noté garde sa valeur de départ et prend la nouvelle valeur d'arrivée ; s'il
 * revient à son point de départ, sa ligne disparaît.
 */
const merge = (old: string[], newItems: ChangeLine[]): string[] => {
  const rows = [...old];
  for (const { label, row } of newItems) {
    const prefix = `• ${label} : `;
    const i = rows.findIndex((l) => l.startsWith(prefix));
    if (i < 0) {
      rows.push(row);
      continue;
    }
    const old = rows[i]!.slice(prefix.length);
    const newRow = row.slice(prefix.length);
    const end = old.indexOf(ARROW);
    const start = newRow.indexOf(ARROW);
    // Une ligne sans flèche — une description modifiée, une fusion — ne se
    // combine pas : identique, elle n'est pas répétée ; nouvelle, elle
    // s'ajoute à la suite.
    if (end < 0 || start < 0) {
      if (!rows.includes(row)) rows.push(row);
      continue;
    }
    const fromValue = old.slice(0, end);
    const toValue = newRow.slice(start + ARROW.length);
    if (fromValue === toValue) rows.splice(i, 1);
    else rows[i] = bullet(label, `${fromValue}${ARROW}${toValue}`);
  }
  return rows;
};

// --- Le fil de chaque élément -----------------------------------------------

/** Les éléments dont le fil reçoit ces mots. */
export type Historized = "project" | "card" | "support";

interface LastWord {
  id: Id;
  text: string;
  system: number;
  user_id: Id | null;
  updated_at: string;
}

/**
 * Le fil de chaque élément. Celui d'un ticket a deux onglets :
 * les échanges avec l'expéditeur, et les commentaires de l'équipe. Ces mots
 * vont dans le second — ils ne regardent pas l'expéditeur.
 */
const thread = (table: string, column: string, isInternal: boolean) => ({
  last: selection<LastWord>(
    `SELECT id, text, system, user_id, updated_at FROM ${table}
      WHERE ${column} = ?${isInternal ? " AND internal = 1" : ""}
      ORDER BY created_at DESC, id DESC LIMIT 1`,
  ),
  write: mutation(
    `INSERT INTO ${table} (${column}, user_id, text, system${isInternal ? ", internal" : ""}, created_at, updated_at)
     VALUES (?, NULL, ?, 1${isInternal ? ", 1" : ""}, ?, ?)`,
  ),
  completeText: mutation(`UPDATE ${table} SET text = ?, updated_at = ? WHERE id = ?`),
});

const THREADS: Record<Historized, ReturnType<typeof thread> & { modified: string; created: string }> = {
  project: { ...thread("comments", "project_id", false), modified: "Projet modifié", created: "Projet créé" },
  card: { ...thread("card_comments", "card_id", false), modified: "Carte modifiée", created: "Carte créée" },
  support: {
    ...thread("support_comments", "request_id", true),
    modified: "Demande modifiée",
    created: "Demande créée",
  },
};

/** Le temps pendant lequel les retouches d'une personne rejoignent le même mot. */
const GROUPING_WINDOW = 10 * 60 * 1000;

/**
 * Note dans le fil de l'élément ce qui vient d'y changer. Rien n'est écrit
 * quand rien n'a bougé : enregistrer une fiche sans y toucher ne laisse pas
 * de trace.
 */
export const logAction = (
  kind: Historized,
  itemId: Id,
  author: Editor,
  rows: ChangeLine[],
): void => {
  if (rows.length === 0) return;
  const { last, write, completeText, modified, created } = THREADS[kind];
  const whenLabel = now();
  const name = author.name || author.email;

  // Le dernier mot du fil, s'il est de Milo, sur un geste de la même
  // personne, et récent : on le complète.
  const word = last.get(itemId);
  if (word && word.system && word.user_id === null && name) {
    const [header = "", ...old] = word.text.split("\n");
    const isSame =
      (header.startsWith(`${modified} le `) || header.startsWith(`${created} le `)) &&
      header.endsWith(` par ${name}`);
    if (isSame && Date.parse(whenLabel) - Date.parse(word.updated_at) < GROUPING_WINDOW) {
      const remaining = merge(old, rows);
      completeText.run([header, ...remaining].join("\n"), whenLabel, word.id);
      return;
    }
  }

  const header = `${modified} le ${timestamp(whenLabel)}${name ? ` par ${name}` : ""}`;
  write.run(itemId, [header, ...rows.map((l) => l.row)].join("\n"), whenLabel, whenLabel);
};
