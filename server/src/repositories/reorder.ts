// Shared ordering of a table: support labels. Tabs — boards, access
// categories — are ordered, for their part, account by account
// (repositories/tab-orders.ts); "receivedOrder" still serves them to validate
// the received order.
//
// The shared order applies to everyone, but not everyone necessarily sees the
// same thing. Hence the rule: the ordered rows take back, in their new order,
// the places they occupied together; those the person does not see keep
// theirs.

import { mutation, selection, transaction } from "../db/query.js";
import type { IdRow } from "../db/rows.js";
import { badRequest, toIds } from "../lib/http.js";
import type { Id } from "@milo/shared";

/**
 * Builds a table's ordering. "scope" names the column bounding the set —
 * "board_id" for a board's contexts — or stays empty when the whole table
 * is a single set.
 *
 * Queries are prepared here, at module load: the table and column names come
 * from the call, never from an HTTP request.
 */
const arrangement = (table: string, scope?: string) => {
  const or = scope ? ` WHERE ${scope} = ?` : "";
  const selectAll = selection<IdRow>(`SELECT id FROM ${table}${or} ORDER BY position, id`);
  const insertRow = mutation(`UPDATE ${table} SET position = ? WHERE id = ?`);

  return transaction((ids: Id[], scopeValue?: unknown) => {
    // The whole set, as currently ordered — including what the person
    // ordering does not see.
    const allIds = (scope ? selectAll.all(scopeValue) : selectAll.all()).map((row) => row.id);

    // The places held by the ordered tabs are redistributed in the received
    // order; the other rows do not move from theirs.
    const remaining = [...ids];
    const seen = new Set(ids);
    const final = allIds.map((id) => (seen.has(id) ? (remaining.shift() ?? id) : id));

    // Everything is renumbered from 0 to n-1, and not only what moved: rows
    // predating the "position" column are all at zero, and without this
    // flattening their order would stay that of their identifier.
    final.forEach((id, place) => insertRow.run(place, id));
  });
};

/** Support labels: shared by all contexts, a single order. */
export const arrangeSupportLabels = arrangement("support_labels");

/** A board's contexts: a shared order, board by board. */
export const arrangeContexts = arrangement("contexts", "board_id");

/** The categories of a projects board. */
export const arrangeCategories = arrangement("categories", "board_id");

/** A board's labels: those of cards, those of projects. */
export const arrangeLabels = arrangement("labels", "board_id");
export const arrangeProjectLabels = arrangement("project_labels", "board_id");

/**
 * The received order, validated: it must name exactly the tabs that person
 * sees, each once. An omitted tab would keep a place that has become wrong, a
 * tab named twice would take one that is not its own.
 */
export const receivedOrder = (ids: unknown, visibleItems: IdRow[], message: string): Id[] => {
  if (!Array.isArray(ids)) badRequest("ids doit être un tableau");
  const order = toIds(ids);
  const known = new Set(visibleItems.map((row) => row.id));
  const listed = new Set(order);
  if (listed.size !== order.length || listed.size !== known.size) badRequest(message);
  if (order.some((id) => !known.has(id))) badRequest(message);
  return order;
};
