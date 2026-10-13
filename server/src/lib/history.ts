// What Milo notes in an item's thread when it is modified: who, when, and
// what changed, field by field. Creation already has its note
// (repositories/comments.ts, `creationNote`); this one extends it.
//
// The note consists of a header — "Projet modifié le … par …" — followed by
// one line per field. The thread shows it folded, header only: it is the
// client that unfolds the detail.
//
// To avoid flooding the thread, edits by the same person that follow closely
// are added to the last note instead of writing another: a card created and
// then immediately completed through its drawer carries only one, and a name
// corrected twice in a row says "A → C", not "A → B" then "B → C".

import type { Id } from "@milo/shared";
import { mutation, selection } from "../db/query.js";
import { sameDescription } from "./html.js";
import { timestamp, now } from "./time.js";

/** Who modifies: enough to name them in the header. */
export interface Editor {
  name: string;
  email: string;
}

/** A field as read, before and after the write. */
export interface Field {
  label: string;
  /** Its displayed value, already formatted (see `quote`, `list`, `date`). */
  value: string;
  /**
   * A description: too long to be copied over, we only say that it changed.
   * It is compared as the record does, regardless of the editor's formatting
   * touch-ups.
   */
  opaque?: boolean;
}

/** A line of the note, and the field it concerns. */
export interface ChangeLine {
  label: string;
  row: string;
}

// --- Value formatting -------------------------------------------------------

const EMPTY = "—";

/** Free text, in quotes. */
export const quote = (text: string | null | undefined): string =>
  text ? `« ${text} »` : EMPTY;

/** Names — actors, labels —, in alphabetical order. */
export const list = (names: string[]): string =>
  names.length ? [...names].sort((a, b) => a.localeCompare(b, "fr")).join(", ") : EMPTY;

/** A due date. */
export const date = (iso: string | null | undefined): string => (iso ? timestamp(iso) : EMPTY);

// --- What changed -----------------------------------------------------------

const ARROW = " → ";
const bullet = (label: string, rest: string): string => `• ${label} : ${rest}`;

/**
 * A line that does not compare two values but says what happened:
 * "• Fusion : HLP-2, HLP-3 fusionnées ici".
 */
export const eventLine = (label: string, text: string): ChangeLine => ({
  label,
  row: bullet(label, text),
});

/** The fields that moved between two reads, in the record's order. */
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

/** "a modifié la fiche (nom, échéance)": what notifications say. */
export const editMessage = (rows: ChangeLine[]): string =>
  `a modifié la fiche (${rows.map((l) => l.label.toLocaleLowerCase("fr")).join(", ")})`;

/**
 * Appends new lines to those of a note already written. A field already
 * noted keeps its starting value and takes the new end value; if it returns
 * to its starting point, its line disappears.
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
    // A line without an arrow — a modified description, a merge — does not
    // combine: identical, it is not repeated; new, it is appended after the
    // others.
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

// --- Each item's thread -----------------------------------------------------

/** The items whose thread receives these notes. */
export type Historized = "project" | "card" | "support" | "product" | "contact" | "order";

interface LastWord {
  id: Id;
  text: string;
  system: number;
  user_id: Id | null;
  updated_at: string;
}

/**
 * Each item's thread. A ticket's has two tabs: the exchanges with the
 * sender, and the team's comments. These notes go in the second — they are
 * none of the sender's business.
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
  product: {
    ...thread("product_comments", "product_id", false),
    modified: "Produit modifié",
    created: "Produit créé",
  },
  contact: {
    ...thread("contact_comments", "contact_id", false),
    modified: "Contact modifié",
    created: "Contact créé",
  },
  order: {
    ...thread("order_comments", "order_id", false),
    modified: "Commande modifiée",
    created: "Commande créée",
  },
};

/** How long a person's edits keep joining the same note. */
const GROUPING_WINDOW = 10 * 60 * 1000;

/**
 * Notes in the item's thread what has just changed there. Nothing is written
 * when nothing moved: saving a record without touching it leaves no trace.
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

  // The last note in the thread, if it is Milo's, on an action by the same
  // person, and recent: we complete it.
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
