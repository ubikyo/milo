// Following: what a person asks to be notified about when it changes.
//
// Four kinds of items can be followed. A project, a card and a support
// request are followed for themselves; a list is followed for its cards —
// a list is not modified, what it contains is, and that is what
// one wants to be notified about.

import type { Id } from "./domain.js";

export const FOLLOW_KINDS = ["project", "card", "list", "support"] as const;

export type FollowKind = (typeof FOLLOW_KINDS)[number];

export const isFollowKind = (value: unknown): value is FollowKind =>
  FOLLOW_KINDS.includes(value as FollowKind);

/**
 * What the client keeps up to date: what the person follows, by kind. A
 * single read at startup, then the list tracks the clicks — there is no
 * reason to query the server each time a drawer is opened.
 */
export type Follows = Record<FollowKind, Id[]>;

export const emptyFollows = (): Follows => ({ project: [], card: [], list: [], support: [] });

/**
 * The address that opens an item in the application. A single definition, read
 * by the client which interprets it at startup and by the server which puts it
 * in its emails.
 *
 * A list has none: what is notified for a list is always one of
 * its cards, and the link points to that card.
 */
export type LinkTargetKind = "project" | "card" | "support" | "asset" | "access";

/**
 * A machine opens by its id; an item of the Access mode, by its
 * category — that is what opens, the item has no record.
 */
export const QUERY_PARAMS: Record<LinkTargetKind, string> = {
  project: "project",
  card: "card",
  support: "ticket",
  asset: "asset",
  access: "access",
};

/**
 * The former names, in French: emails already sent and descriptions
 * still cite them ("?carte=12"). They still open.
 */
export const LEGACY_QUERY_PARAMS: Record<LinkTargetKind, string> = {
  project: "projet",
  card: "carte",
  support: "demande",
  asset: "poste",
  access: "acces",
};

export const itemLink = (kind: LinkTargetKind, id: Id): string => `?${QUERY_PARAMS[kind]}=${id}`;
