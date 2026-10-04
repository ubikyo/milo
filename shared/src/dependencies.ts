// Dependencies between cards: a link is read from both sides. It
// is recorded once, from its "source" card to its "target" card; the
// target reads it in reverse — what blocks one is blocked by the other.

import type { Id } from "./domain.js";

/** What a link records, read from its source card. */
export const LINK_KINDS = ["blocks", "parent_of", "related", "duplicate"] as const;
export type LinkKind = (typeof LINK_KINDS)[number];

/** What a card says about another, as its record shows it. */
export const RELATIONS = [
  { value: "blocked_by", label: "est bloqué par" },
  { value: "blocks", label: "bloque" },
  { value: "child_of", label: "est un enfant de" },
  { value: "parent_of", label: "est le parent de" },
  { value: "related", label: "est lié à" },
  { value: "duplicate", label: "est un doublon de" },
] as const;
export type Relation = (typeof RELATIONS)[number]["value"];

export const isRelation = (value: unknown): value is Relation =>
  RELATIONS.some((r) => r.value === value);

/**
 * How a relation set on a card is recorded: its kind, and whether the
 * card is the source. "is blocked by Y" is written "Y blocks X". The link
 * and the duplicate read the same from both sides.
 */
export const registration = (
  relation: Relation,
): { kind: LinkKind; source: boolean } => {
  switch (relation) {
    case "blocked_by":
      return { kind: "blocks", source: false };
    case "child_of":
      return { kind: "parent_of", source: false };
    default:
      return { kind: relation, source: true };
  }
};

/** The relation a card reads from a link, depending on whether it is the source or the target. */
export const relationFromSide = (kind: LinkKind, source: boolean): Relation => {
  if (source) return kind;
  if (kind === "blocks") return "blocked_by";
  if (kind === "parent_of") return "child_of";
  return kind;
};

/** The other card of a dependency: it may live on another board. */
export interface LinkedCard {
  id: Id;
  text: string;
  number: number;
  board_id: Id;
  board_name: string;
}

/** A dependency, from the card whose record is open. */
export interface CardLink {
  id: Id;
  relation: Relation;
  /** The other card. */
  card: LinkedCard;
}

/**
 * A page of the cards a dependency can link: those of the card's
 * board first, then those of the other visible boards.
 */
export interface LinkCandidates {
  items: (LinkedCard & { same_board: boolean })[];
  /** True if there are cards left after this page. */
  more: boolean;
}

/** How many cards one page of the search returns. */
export const LINKS_PAGE_SIZE = 10;

/** What is sent to set or change a card's dependency. */
export interface CardLinkInput {
  relation: Relation;
  target_id: Id;
}
