// Le rangement des onglets d'un mode : les tableaux du mode Tâche, ceux du
// mode Projet, les catégories du mode Accès.
//
// L'ordre est global — il vaut pour tout le monde, comme celui des listes d'un
// tableau —, mais chacun ne voit pas la même chose : un tableau privé
// n'apparaît qu'à son auteur. Celui qui range ne peut donc nommer que ce qu'il
// voit, et le rangement ne doit pas pour autant déplacer le reste.
//
// D'où la règle : les onglets rangés reprennent, dans leur nouvel ordre, les
// places qu'ils occupaient ensemble ; ceux que la personne ne voit pas gardent
// la leur. Un tableau privé posé entre le deuxième et le troisième onglet y
// reste, quoi que son auteur fasse des autres.

import { mutation, selection, transaction } from "../db/query.js";
import type { IdRow } from "../db/rows.js";
import { badRequest, toIds } from "../lib/http.js";
import type { Id } from "@milo/shared";

/**
 * Fabrique le rangement d'une table. « scope » nomme la colonne qui borne
 * l'ensemble — « company_id » pour les tableaux du mode Tâche — ou reste vide
 * quand la table entière ne fait qu'un seul ensemble.
 *
 * Les requêtes sont préparées ici, au chargement du module : le nom de la
 * table et celui de la colonne viennent de l'appel, jamais d'une requête HTTP.
 */
const rangement = (table: string, scope?: string) => {
  const ou = scope ? ` WHERE ${scope} = ?` : "";
  const toutes = selection<IdRow>(`SELECT id FROM ${table}${ou} ORDER BY position, id`);
  const poser = mutation(`UPDATE ${table} SET position = ? WHERE id = ?`);

  return transaction((ids: Id[], scopeValue?: unknown) => {
    // L'ensemble entier, tel qu'il est rangé aujourd'hui — y compris ce que
    // celui qui range ne voit pas.
    const tous = (scope ? toutes.all(scopeValue) : toutes.all()).map((ligne) => ligne.id);

    // Les places tenues par les onglets rangés sont redistribuées dans l'ordre
    // reçu ; les autres lignes ne bougent pas de la leur.
    const restants = [...ids];
    const vus = new Set(ids);
    const final = tous.map((id) => (vus.has(id) ? (restants.shift() ?? id) : id));

    // Tout est renuméroté de 0 à n-1, et pas seulement ce qui a bougé : les
    // lignes d'avant la colonne « position » sont toutes à zéro, et sans cette
    // remise à plat leur ordre resterait celui de leur identifiant.
    final.forEach((id, place) => poser.run(place, id));
  });
};

/** Les tableaux du mode Tâche se rangent société par société. */
export const rangerBoards = rangement("boards", "company_id");

/** Les tableaux du mode Projet ne dépendent d'aucune société : un seul ordre. */
export const rangerProjectBoards = rangement("project_boards");

/** Les catégories du mode Accès, de même : elles ne pendent à rien. */
export const rangerAccessCategories = rangement("access_categories");

/** Les étiquettes du support : communes à toutes les sociétés, un seul ordre. */
export const rangerSupportLabels = rangement("support_labels");

/**
 * L'ordre reçu, vérifié : il doit nommer exactement les onglets que cette
 * personne voit, chacun une fois. Un onglet omis garderait une place devenue
 * fausse, un onglet nommé deux fois en prendrait une qui n'est pas à lui.
 */
export const ordreRecu = (ids: unknown, visibles: IdRow[], message: string): Id[] => {
  if (!Array.isArray(ids)) badRequest("ids doit être un tableau");
  const ordre = toIds(ids);
  const connus = new Set(visibles.map((ligne) => ligne.id));
  const dits = new Set(ordre);
  if (dits.size !== ordre.length || dits.size !== connus.size) badRequest(message);
  if (ordre.some((id) => !connus.has(id))) badRequest(message);
  return ordre;
};
