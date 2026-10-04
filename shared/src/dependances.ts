// Les dépendances entre cartes : une liaison se lit des deux côtés. Elle
// s'enregistre une fois, de sa carte « source » vers sa carte « cible » ; la
// cible la lit à l'envers — ce qui bloque l'une est bloqué par l'autre.

import type { Id } from "./domain.js";

/** Ce qu'une liaison enregistre, lu depuis sa carte source. */
export const SORTES_DE_LIAISON = ["blocks", "parent_of", "related", "duplicate"] as const;
export type SorteDeLiaison = (typeof SORTES_DE_LIAISON)[number];

/** Ce qu'une carte dit d'une autre, telle que sa fiche la montre. */
export const RELATIONS = [
  { value: "blocked_by", label: "est bloqué par" },
  { value: "blocks", label: "bloque" },
  { value: "child_of", label: "est un enfant de" },
  { value: "parent_of", label: "est le parent de" },
  { value: "related", label: "est lié à" },
  { value: "duplicate", label: "est un doublon de" },
] as const;
export type Relation = (typeof RELATIONS)[number]["value"];

export const isRelation = (valeur: unknown): valeur is Relation =>
  RELATIONS.some((r) => r.value === valeur);

/**
 * Comment s'enregistre une relation posée sur une carte : sa sorte, et si la
 * carte en est la source. « est bloqué par Y » s'écrit « Y bloque X ». Le lien
 * et le doublon se lisent pareil des deux côtés.
 */
export const enregistrement = (
  relation: Relation,
): { sorte: SorteDeLiaison; source: boolean } => {
  switch (relation) {
    case "blocked_by":
      return { sorte: "blocks", source: false };
    case "child_of":
      return { sorte: "parent_of", source: false };
    default:
      return { sorte: relation, source: true };
  }
};

/** La relation qu'une carte lit d'une liaison, selon qu'elle en est la source ou la cible. */
export const relationLue = (sorte: SorteDeLiaison, source: boolean): Relation => {
  if (source) return sorte;
  if (sorte === "blocks") return "blocked_by";
  if (sorte === "parent_of") return "child_of";
  return sorte;
};

/** L'autre carte d'une dépendance : elle peut vivre sur un autre tableau. */
export interface LinkedCard {
  id: Id;
  text: string;
  number: number;
  board_id: Id;
  board_name: string;
}

/** Une dépendance, depuis la carte dont la fiche est ouverte. */
export interface CardLink {
  id: Id;
  relation: Relation;
  /** L'autre carte. */
  card: LinkedCard;
}

/**
 * Une page des cartes qu'une dépendance peut relier : celles du tableau de la
 * carte d'abord, puis celles des autres tableaux visibles.
 */
export interface LinkCandidates {
  items: (LinkedCard & { same_board: boolean })[];
  /** Vrai s'il reste des cartes après cette page. */
  more: boolean;
}

/** Combien de cartes une page de la recherche rend. */
export const PAGE_DE_LIAISONS = 10;

/** Ce qu'on envoie pour poser ou changer une dépendance d'une carte. */
export interface CardLinkInput {
  relation: Relation;
  target_id: Id;
}
