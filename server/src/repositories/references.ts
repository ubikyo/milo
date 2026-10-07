// "PRJ-12", "TSK-12", "HLP-12" references. Each list widget numbers its own
// items from 1: two "Tâches" widgets each have their TSK-1. A widget is
// designated by its board and its list key — the personal copies of a widget
// share its key, and so its numbering.
//
// An item that changes widget takes the next number of the one it arrives
// in: within a widget, a number designates only one item.

import type { Id } from "@milo/shared";
import { mutation, scalar, selection } from "../db/query.js";

export type ReferenceKind = "project" | "card" | "support";

/** The key of a widget's counter. */
export const referenceScope = (kind: ReferenceKind, boardId: Id, listKey: string): string =>
  `${kind}:${boardId}:${listKey}`;

const lastGiven = selection<{ last: number }>(
  "SELECT last FROM reference_counters WHERE scope = ?",
);

const writeLast = mutation(
  `INSERT INTO reference_counters (scope, last) VALUES (?, ?)
   ON CONFLICT(scope) DO UPDATE SET last = excluded.last`,
);

/** The largest number in the widget, by kind. */
const largest: Record<ReferenceKind, (boardId: Id, listKey: string) => { max: number }> = {
  project: scalar(
    "SELECT COALESCE(MAX(number), 0) AS max FROM projects WHERE board_id = ? AND list_key = ?",
  ),
  card: scalar(
    `SELECT COALESCE(MAX(c.number), 0) AS max
     FROM task_cards c JOIN task_lists l ON l.id = c.list_id
     WHERE l.board_id = ? AND l.list_key = ?`,
  ),
  support: scalar(
    "SELECT COALESCE(MAX(number), 0) AS max FROM support_requests WHERE board_id = ? AND list_key = ?",
  ),
};

/**
 * The widget's next reference, with its counter advanced accordingly. The
 * counter keeps a deleted item's number from being given again — a reply to
 * an old ticket must not land on a new one —; the largest in the database
 * counts too: a restored backup never causes the same one to be given twice.
 *
 * To be called in the transaction that creates or moves the item: if it
 * fails, the number is not consumed.
 */
export const nextReference = (kind: ReferenceKind, boardId: Id, listKey: string): number => {
  const scope = referenceScope(kind, boardId, listKey);
  const next = Math.max(lastGiven.get(scope)?.last ?? 0, largest[kind](boardId, listKey).max) + 1;
  writeLast.run(scope, next);
  return next;
};

const listWidget = selection<{ board_id: Id; list_key: string }>(
  "SELECT board_id, list_key FROM task_lists WHERE id = ?",
);

/** The counter key of the widget a task list is in. */
export const listScope = (listId: Id): string => {
  const list = listWidget.get(listId);
  return list ? referenceScope("card", list.board_id, list.list_key) : "";
};

/** The next reference of a card placed in this list: that of its widget. */
export const nextCardReference = (listId: Id): number => {
  const list = listWidget.get(listId);
  if (!list) throw new Error(`Liste ${listId} introuvable`);
  return nextReference("card", list.board_id, list.list_key);
};

const cardsToNumber = selection<{ id: Id }>(
  "SELECT id FROM task_cards WHERE list_id = ? AND kind != 'separator' ORDER BY position, id",
);
const setCardNumber = mutation("UPDATE task_cards SET number = ? WHERE id = ?");

/**
 * A list that has just changed widget: its cards take the next numbers of
 * the one it arrives in, in their order. Their old numbers are cleared
 * first: they would otherwise count as the widget's largest.
 */
export const renumberListCards = (listId: Id): void => {
  const cards = cardsToNumber.all(listId);
  for (const { id } of cards) setCardNumber.run(0, id);
  for (const { id } of cards) setCardNumber.run(nextCardReference(listId), id);
};
