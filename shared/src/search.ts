// La recherche : un champ au bout de la rangée d'onglets, qui fouille tout ce
// que l'application porte — projets, cartes, demandes, postes, accès — et ne
// rend que ce que la personne a le droit de voir.

import type { Id } from "./domain.js";

export type SearchKind = "project" | "card" | "support" | "asset" | "access";

export interface SearchResult {
  kind: SearchKind;
  id: Id;
  /** Ce que la ligne affiche en premier : le nom, le sujet, le libellé. */
  title: string;
  /** Où l'élément se trouve : le contexte, le tableau, la liste… */
  context: string;
  /** Un widget : le tableau qui le porte, qui s'ouvre. */
  board_id?: Id;
  /** Accès : l'adresse d'un lien, qui s'ouvre directement. */
  url?: string;
}

/** En deçà, la recherche ne part pas : une lettre ramènerait tout. */
export const SEARCH_MIN_LENGTH = 2;
