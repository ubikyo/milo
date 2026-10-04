// Le rangement commun d'une table : les étiquettes du support. Les onglets
// — tableaux, catégories d'accès — se rangent, eux, compte par compte
// (repositories/tab-orders.ts) ; « ordreRecu » leur sert encore à vérifier
// l'ordre reçu.
//
// L'ordre commun vaut pour tout le monde, mais chacun ne voit pas forcément la
// même chose. D'où la règle : les lignes rangées reprennent, dans leur nouvel
// ordre, les places qu'elles occupaient ensemble ; celles que la personne ne
// voit pas gardent la leur.

import { mutation, selection, transaction } from "../db/query.js";
import type { IdRow } from "../db/rows.js";
import { badRequest, toIds } from "../lib/http.js";
import type { Id } from "@milo/shared";

/**
 * Fabrique le rangement d'une table. « scope » nomme la colonne qui borne
 * l'ensemble — « board_id » pour les contextes d'un tableau — ou reste vide
 * quand la table entière ne fait qu'un seul ensemble.
 *
 * Les requêtes sont préparées ici, au chargement du module : le nom de la
 * table et celui de la colonne viennent de l'appel, jamais d'une requête HTTP.
 */
const arrangement = (table: string, scope?: string) => {
  const or = scope ? ` WHERE ${scope} = ?` : "";
  const selectAll = selection<IdRow>(`SELECT id FROM ${table}${or} ORDER BY position, id`);
  const insertRow = mutation(`UPDATE ${table} SET position = ? WHERE id = ?`);

  return transaction((ids: Id[], scopeValue?: unknown) => {
    // L'ensemble entier, tel qu'il est rangé aujourd'hui — y compris ce que
    // celui qui range ne voit pas.
    const allIds = (scope ? selectAll.all(scopeValue) : selectAll.all()).map((row) => row.id);

    // Les places tenues par les onglets rangés sont redistribuées dans l'ordre
    // reçu ; les autres lignes ne bougent pas de la leur.
    const remaining = [...ids];
    const seen = new Set(ids);
    const final = allIds.map((id) => (seen.has(id) ? (remaining.shift() ?? id) : id));

    // Tout est renuméroté de 0 à n-1, et pas seulement ce qui a bougé : les
    // lignes d'avant la colonne « position » sont toutes à zéro, et sans cette
    // remise à plat leur ordre resterait celui de leur identifiant.
    final.forEach((id, place) => insertRow.run(place, id));
  });
};

/** Les étiquettes du support : communes à tous les contextes, un seul ordre. */
export const arrangeSupportLabels = arrangement("support_labels");

/** Les contextes d'un tableau : un ordre commun, tableau par tableau. */
export const arrangeContexts = arrangement("contexts", "board_id");

/** Les catégories d'un tableau de projets. */
export const arrangeCategories = arrangement("categories", "board_id");

/** Les étiquettes d'un tableau : celles des cartes, celles des projets. */
export const arrangeLabels = arrangement("labels", "board_id");
export const arrangeProjectLabels = arrangement("project_labels", "board_id");

/**
 * L'ordre reçu, vérifié : il doit nommer exactement les onglets que cette
 * personne voit, chacun une fois. Un onglet omis garderait une place devenue
 * fausse, un onglet nommé deux fois en prendrait une qui n'est pas à lui.
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
