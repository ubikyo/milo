// The names of the items of "Liste" widgets (shared, value-lists.ts), read
// by what takes a list from them — a declared asset widget's brands
// (declared-asset-settings.ts) —, and added to from it: a brand added from an
// asset's drawer joins the Liste. A Liste widget is named by its key, on any
// board: its items are those of the board that holds it.

import { randomUUID } from "node:crypto";
import { LIST_KEY, VALUE_ITEMS_MAX, VALUE_LIST_TYPE, VALUE_NAME_MAX } from "@milo/shared";
import type { Id } from "@milo/shared";
import { mutation, selection } from "../db/query.js";
import { badRequest } from "../lib/http.js";

const boardOf = selection<{ board_id: Id }>(
  `SELECT s.board_id FROM board_widgets w JOIN board_sections s ON s.id = w.section_id
   WHERE w.type = '${VALUE_LIST_TYPE}' AND json_valid(w.config)
     AND json_extract(w.config, '$.${LIST_KEY}') = ?
   ORDER BY w.id LIMIT 1`,
);
const itemsOf = selection<{ items: string }>(
  "SELECT items FROM board_value_lists WHERE board_id = ? AND list_key = ?",
);

/** One Liste widget's names, in their order; none for a widget gone, or unreadable items. */
const namesOf = (key: string): string[] => {
  const board = boardOf.get(key)?.board_id;
  const row = board === undefined ? undefined : itemsOf.get(board, key);
  if (!row) return [];
  try {
    const items = JSON.parse(row.items) as unknown;
    if (!Array.isArray(items)) return [];
    // Items saved before they had an id still read by their name.
    return items.map((i) => String((i as Record<string, unknown> | null)?.name ?? "").trim()).filter(Boolean);
  } catch {
    return [];
  }
};

/** The names of these Liste widgets' items, in their order, each once — case aside. */
export const valueListNames = (keys: string[]): string[] => {
  const seen = new Set<string>();
  return keys.flatMap(namesOf).filter((name) => {
    const key = name.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

const writeItems = mutation(
  `INSERT INTO board_value_lists (board_id, list_key, items) VALUES (?, ?, ?)
   ON CONFLICT (board_id, list_key) DO UPDATE SET items = excluded.items`,
);

/**
 * Names added from what takes its list from a Liste widget — a brand added
 * from a declared asset's drawer —: those it does not hold yet, trimmed and
 * case aside, join its items at the end, within the Liste's own limits. True
 * when it changed.
 */
export const addValueListNames = (key: string, names: string[]): boolean => {
  const board = boardOf.get(key)?.board_id;
  if (board === undefined) return false;
  const row = itemsOf.get(board, key);
  let items: unknown[] = [];
  try {
    const read = row ? (JSON.parse(row.items) as unknown) : [];
    items = Array.isArray(read) ? read : [];
  } catch {
    items = [];
  }
  const held = new Set(
    items.map((i) => String((i as Record<string, unknown> | null)?.name ?? "").trim().toLowerCase()),
  );
  const added = names
    .map((name) => name.trim())
    .filter((name) => {
      const lower = name.toLowerCase();
      if (!name || held.has(lower)) return false;
      held.add(lower);
      return true;
    });
  if (!added.length) return false;
  // The Liste's own messages (routes/value-lists.ts).
  if (added.some((name) => name.length > VALUE_NAME_MAX)) {
    badRequest(`Un nom tient en ${VALUE_NAME_MAX} caractères`);
  }
  if (items.length + added.length > VALUE_ITEMS_MAX) {
    badRequest(`Une liste tient en ${VALUE_ITEMS_MAX} lignes`);
  }
  writeItems.run(board, key, JSON.stringify([...items, ...added.map((name) => ({ id: randomUUID(), name }))]));
  return true;
};
