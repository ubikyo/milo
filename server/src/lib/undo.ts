// Undoing a deletion: a widget, a section, a board, a view.
//
// Just before deleting, the route takes a picture of everything the deletion
// carries away — the rows themselves, and those that follow them through the
// foreign keys ("ON DELETE CASCADE"), as far as they go. The rows that only
// pointed at them ("ON DELETE SET NULL") keep their own life: what is noted
// is the value they lose. Undoing puts the rows back as they were, with their
// ids: whatever designated them without a foreign key — a follow, a tab
// order, a feed read by a widget — designates them again.
//
// The picture is kept in memory, under a token returned to the page, for the
// account that deleted: a restart of the server forgets it, and undoing is
// then no longer possible — which is what the page is told.

import { randomUUID } from "node:crypto";
import type { Id } from "@milo/shared";
import db from "../db/index.js";
import { selection, transaction } from "../db/query.js";
import { badRequest } from "./http.js";

type Row = Record<string, unknown>;

/** A foreign key pointing at a table: the table that holds it, its column, what it points at. */
interface Reference {
  table: string;
  from: string;
  to: string;
  onDelete: string;
}

/** A row put back as it was. */
interface Picture {
  table: string;
  row: Row;
}

/** A column a deletion set to null, and the value it held. */
interface Lost {
  table: string;
  rowid: number;
  column: string;
  value: unknown;
}

interface Snapshot {
  userId: Id;
  rows: Picture[];
  lost: Lost[];
  takenAt: number;
}

/** How long a deletion can be undone. */
const LIFETIME_MS = 60 * 60 * 1000;

const snapshots = new Map<string, Snapshot>();

const quote = (name: string) => `"${name.replace(/"/g, '""')}"`;

/** The foreign keys pointing at each table, read once from the schema. */
let referencesByTable: Map<string, Reference[]> | null = null;

const referencesTo = (table: string): Reference[] => {
  if (!referencesByTable) {
    referencesByTable = new Map();
    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'")
      .all() as { name: string }[];
    for (const { name } of tables) {
      const keys = db.prepare(`PRAGMA foreign_key_list(${quote(name)})`).all() as {
        table: string;
        from: string;
        to: string | null;
        on_delete: string;
      }[];
      for (const k of keys) {
        const list = referencesByTable.get(k.table) ?? [];
        list.push({ table: name, from: k.from, to: k.to ?? "id", onDelete: k.on_delete });
        referencesByTable.set(k.table, list);
      }
    }
  }
  return referencesByTable.get(table) ?? [];
};

/** What a deletion is about to carry away, starting from its roots. */
export interface Roots {
  /** The table, and the column whose values designate the rows to delete. */
  table: string;
  column: string;
  values: unknown[];
}

/**
 * The picture of what deleting these rows will carry away. The roots are given
 * in the order the route deletes them — or, failing that, parents first.
 */
const take = (roots: Roots[]): Omit<Snapshot, "userId" | "takenAt"> => {
  const rows: Picture[] = [];
  const lost: Lost[] = [];
  const seen = new Set<string>();

  const visit = (table: string, column: string, values: unknown[]) => {
    if (values.length === 0) return;
    const marks = values.map(() => "?").join(", ");
    const found = db
      .prepare(`SELECT rowid AS __rowid, * FROM ${quote(table)} WHERE ${quote(column)} IN (${marks})`)
      .all(...values) as Row[];
    const fresh = found.filter((r) => {
      const key = `${table}:${String(r.__rowid)}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    if (fresh.length === 0) return;
    for (const r of fresh) {
      const { __rowid: _rowid, ...row } = r;
      rows.push({ table, row });
    }
    for (const ref of referencesTo(table)) {
      const targets = fresh.map((r) => r[ref.to]).filter((v) => v !== null && v !== undefined);
      if (targets.length === 0) continue;
      if (ref.onDelete === "CASCADE") {
        visit(ref.table, ref.from, targets);
      } else if (ref.onDelete === "SET NULL" || ref.onDelete === "SET DEFAULT") {
        const marks = targets.map(() => "?").join(", ");
        const pointing = db
          .prepare(
            `SELECT rowid AS __rowid, ${quote(ref.from)} AS value FROM ${quote(ref.table)}
              WHERE ${quote(ref.from)} IN (${marks})`,
          )
          .all(...targets) as { __rowid: number; value: unknown }[];
        for (const p of pointing) {
          lost.push({ table: ref.table, rowid: p.__rowid, column: ref.from, value: p.value });
        }
      }
    }
  };

  for (const root of roots) visit(root.table, root.column, root.values);
  return { rows, lost };
};

const forget = () => {
  const limit = Date.now() - LIFETIME_MS;
  for (const [token, s] of snapshots) if (s.takenAt < limit) snapshots.delete(token);
};

/**
 * Takes the picture of what deleting these rows will carry away, then
 * deletes ("remove"). Returns the token that undoes it.
 */
export const deleteWithUndo = (userId: Id, roots: Roots[], remove: () => void): string => {
  forget();
  const picture = take(roots);
  remove();
  const token = randomUUID();
  snapshots.set(token, { userId, ...picture, takenAt: Date.now() });
  return token;
};

/** Shorthand: a row of a table, by its id. */
export const byId = (table: string, id: Id): Roots => ({ table, column: "id", values: [id] });

/**
 * Puts the rows back. The foreign keys are checked at the end only: a project
 * names its category, which may come after it in the picture. Refused when
 * one of the rows exists again, or when what it pointed at is gone since.
 */
const putBack = transaction((snapshot: Snapshot) => {
  db.pragma("defer_foreign_keys = ON");
  for (const { table, row } of snapshot.rows) {
    const columns = Object.keys(row);
    db.prepare(
      `INSERT INTO ${quote(table)} (${columns.map(quote).join(", ")})
       VALUES (${columns.map(() => "?").join(", ")})`,
    ).run(...columns.map((c) => row[c]));
  }
  for (const l of snapshot.lost) {
    db.prepare(
      `UPDATE ${quote(l.table)} SET ${quote(l.column)} = ? WHERE rowid = ? AND ${quote(l.column)} IS NULL`,
    ).run(l.value, l.rowid);
  }
});

/** The board a widget's section belongs to. */
const sectionBoard = selection<{ board_id: Id }>("SELECT board_id FROM board_sections WHERE id = ?");

/**
 * Undoes the deletion this token names, for the account that made it.
 * Returns the boards what came back belongs to — a board brought back is
 * one of them.
 */
export const undoDeletion = (userId: Id, token: string): Id[] => {
  const snapshot = snapshots.get(token);
  if (!snapshot || snapshot.userId !== userId) {
    badRequest("Cette suppression ne peut plus être annulée");
  }
  try {
    putBack(snapshot!);
  } catch {
    badRequest("Cette suppression ne peut plus être annulée");
  }
  snapshots.delete(token);
  const boards = new Set<Id>();
  for (const { table, row } of snapshot!.rows) {
    const board =
      table === "boards"
        ? row["id"]
        : table === "board_widgets"
          ? sectionBoard.get(row["section_id"])?.board_id
          : row["board_id"];
    if (typeof board === "number") boards.add(board);
  }
  return [...boards];
};
