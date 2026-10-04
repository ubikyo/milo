// Tab order, specific to each account (user_tab_orders): the selector's
// modes, boards, access categories, the fixed Support and Assets tabs.
// Without an order of its own, an account sees the shared order — the
// "position" column, or the fixed-tabs setting.

import type { Id } from "@milo/shared";
import { mutation, selection } from "../db/query.js";

const row = selection<{ ids: string }>(
  "SELECT ids FROM user_tab_orders WHERE user_id = ? AND scope = ?",
);
const insertRow = mutation(
  `INSERT INTO user_tab_orders (user_id, scope, ids) VALUES (?, ?, ?)
   ON CONFLICT(user_id, scope) DO UPDATE SET ids = excluded.ids`,
);

export const userTabOrders = {
  /** The order saved by this account, or "null" if it has none. */
  read: (userId: Id, scope: string): string[] | null => {
    const found = row.get(userId, scope);
    if (!found) return null;
    try {
      const readValue: unknown = JSON.parse(found.ids);
      return Array.isArray(readValue) ? readValue.map(String) : null;
    } catch {
      return null;
    }
  },
  store: (userId: Id, scope: string, ids: (string | number)[]): void => {
    insertRow.run(userId, scope, JSON.stringify(ids.map(String)));
  },
};

/**
 * Rows in the order this account arranged. Those it doesn't mention —
 * a tab created since — keep the shared order, at the end: the sort is
 * stable, and rows already arrive in the shared order.
 */
export const inOrderOf = <T extends { id: Id }>(userId: Id, scope: string, rows: T[]): T[] => {
  const order = userTabOrders.read(userId, scope);
  if (!order) return rows;
  const rank = new Map(order.map((id, i) => [id, i]));
  return [...rows].sort(
    (a, b) => (rank.get(String(a.id)) ?? Infinity) - (rank.get(String(b.id)) ?? Infinity),
  );
};
