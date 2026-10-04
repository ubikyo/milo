// L'ordre des onglets, propre à chaque compte (user_tab_orders) : les modes du
// sélecteur, les tableaux, les catégories d'accès, les onglets fixes du
// Support et des Assets. Sans ordre à lui, un compte voit l'ordre commun —
// la colonne « position », ou le réglage des onglets fixes.

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
  /** L'ordre rangé par ce compte, ou « null » s'il n'en a pas. */
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
 * Des lignes dans l'ordre que ce compte a rangé. Celles qu'il ne cite pas —
 * un onglet créé depuis — gardent l'ordre commun, à la suite : le tri est
 * stable, et les lignes arrivent déjà dans l'ordre commun.
 */
export const inOrderOf = <T extends { id: Id }>(userId: Id, scope: string, rows: T[]): T[] => {
  const order = userTabOrders.read(userId, scope);
  if (!order) return rows;
  const rank = new Map(order.map((id, i) => [id, i]));
  return [...rows].sort(
    (a, b) => (rank.get(String(a.id)) ?? Infinity) - (rank.get(String(b.id)) ?? Infinity),
  );
};
