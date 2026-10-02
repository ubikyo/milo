// L'ordre des onglets, propre à chaque compte (user_tab_orders) : les modes du
// sélecteur, les tableaux, les catégories d'accès, les onglets fixes du
// Support et des Assets. Sans ordre à lui, un compte voit l'ordre commun —
// la colonne « position », ou le réglage des onglets fixes.

import type { Id } from "@milo/shared";
import { mutation, selection } from "../db/query.js";

const ligne = selection<{ ids: string }>(
  "SELECT ids FROM user_tab_orders WHERE user_id = ? AND scope = ?",
);
const poser = mutation(
  `INSERT INTO user_tab_orders (user_id, scope, ids) VALUES (?, ?, ?)
   ON CONFLICT(user_id, scope) DO UPDATE SET ids = excluded.ids`,
);

export const userTabOrders = {
  /** L'ordre rangé par ce compte, ou « null » s'il n'en a pas. */
  lire: (userId: Id, scope: string): string[] | null => {
    const trouve = ligne.get(userId, scope);
    if (!trouve) return null;
    try {
      const lu: unknown = JSON.parse(trouve.ids);
      return Array.isArray(lu) ? lu.map(String) : null;
    } catch {
      return null;
    }
  },
  ranger: (userId: Id, scope: string, ids: (string | number)[]): void => {
    poser.run(userId, scope, JSON.stringify(ids.map(String)));
  },
};

/**
 * Des lignes dans l'ordre que ce compte a rangé. Celles qu'il ne cite pas —
 * un onglet créé depuis — gardent l'ordre commun, à la suite : le tri est
 * stable, et les lignes arrivent déjà dans l'ordre commun.
 */
export const dansLOrdreDe = <T extends { id: Id }>(userId: Id, scope: string, lignes: T[]): T[] => {
  const ordre = userTabOrders.lire(userId, scope);
  if (!ordre) return lignes;
  const rang = new Map(ordre.map((id, i) => [id, i]));
  return [...lignes].sort(
    (a, b) => (rang.get(String(a.id)) ?? Infinity) - (rang.get(String(b.id)) ?? Infinity),
  );
};
