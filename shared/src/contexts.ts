// A board's contexts are labels. In interface editing, the board chooses, on
// its tab, one label group by its name — "Société", "Priorité" — or none.
// Outside editing, its tab offers the labels of that group: choosing one
// shows, in each list, what carries the label of that name in the list's
// group of that name. A list whose labels have no group of that name is not
// filtered.
//
// Names are compared case aside: lists of different kinds — projects, tasks,
// tickets, assets, each with its own labels — share a context by naming their
// groups and labels alike.

import type { Id } from "./domain.js";

/** The list widgets whose labels can give the board its contexts. */
export const CONTEXT_LISTS = ["project.list", "task.list", "support.list", "asset.list"] as const;

export type ContextList = (typeof CONTEXT_LISTS)[number];

export const isContextList = (type: string): type is ContextList =>
  (CONTEXT_LISTS as readonly string[]).includes(type);

/**
 * The board's context group when it takes them all: its contexts are then all
 * its labels, whatever their group.
 */
export const ALL_CONTEXT_GROUPS = "*";

/** The comparable form of a context or group name. */
export const contextKey = (name: string): string => name.trim().toLowerCase();

/**
 * Does an item belong to the context? Always, with no context chosen or when
 * its list has no context group; otherwise, when it carries a label of one of
 * those groups bearing that name.
 */
export const inContext = (
  labels: readonly { group_id: Id; name: string }[],
  groups: readonly Id[] | undefined,
  context: string | null,
): boolean =>
  context === null ||
  !groups?.length ||
  labels.some((l) => groups.includes(l.group_id) && contextKey(l.name) === contextKey(context));
