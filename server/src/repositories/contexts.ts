// A board's contexts are labels (shared, contexts.ts): the board chooses one
// label group by its name. In each kind of labels its lists use — projects',
// cards', tickets', assets' — the group of that name gives the list its
// contexts. The board's contexts are the names of those groups' labels; each
// person chooses, board by board, the one they look at — by its name —, and
// with no choice looks at all of them.

import {
  ALL_CONTEXT_GROUPS,
  CONTACT_LIST_TYPE,
  CONTACT_TYPE_CONTEXTS,
  CONTACT_TYPE_GROUP,
  contextKey,
  isContextList,
  listKey,
} from "@milo/shared";
import type { ContextList, Id } from "@milo/shared";
import { mutation, selection } from "../db/query.js";
import type { Selection } from "../db/query.js";

/** Where each kind of list keeps its labels. Table names never come from a request. */
const TABLES: Record<ContextList, { labels: string; groups: string }> = {
  "project.list": { labels: "project_labels", groups: "project_label_groups" },
  "task.list": { labels: "labels", groups: "label_groups" },
  "managed_device_asset.list": { labels: "managed_device_asset_labels", groups: "managed_device_asset_label_groups" },
  "support.list": { labels: "support_labels", groups: "support_label_groups" },
};

const byKind = <Row>(sql: (t: (typeof TABLES)[ContextList]) => string) =>
  Object.fromEntries(
    Object.entries(TABLES).map(([type, t]) => [type, selection<Row>(sql(t))]),
  ) as Record<ContextList, Selection<Row>>;

/** The groups of a kind for a board, in order, each with the list that owns it. */
const groupsOf = byKind<{ id: Id; name: string; list_key: string }>(
  (t) =>
    `SELECT id, name, list_key FROM ${t.groups} WHERE board_id = @board
     ORDER BY position, id`,
);

const labelsOfGroup = byKind<{ id: Id; name: string }>(
  (t) => `SELECT id, name FROM ${t.labels} WHERE group_id = ? ORDER BY position, id`,
);

const listsOf = selection<{ type: string; config: string }>(
  `SELECT w.type, w.config FROM board_widgets w
   JOIN board_sections s ON s.id = w.section_id
   WHERE s.board_id = ?
   ORDER BY s.position, s.id, w.position, w.id`,
);

const groupNameOf = selection<{ context_group: string }>(
  "SELECT context_group FROM boards WHERE id = ?",
);

/** The board's lists whose labels can give it contexts, in the board's order. */
const contextListsOf = (boardId: Id): { type: ContextList; list: string }[] =>
  listsOf.all(boardId).flatMap((w) => {
    if (!isContextList(w.type)) return [];
    let config: unknown;
    try {
      config = JSON.parse(w.config);
    } catch {
      config = {};
    }
    return [{ type: w.type, list: listKey(config) }];
  });

/** Does the board carry a Contact widget? It then offers the contact types as contexts. */
const withContacts = (boardId: Id): boolean =>
  listsOf.all(boardId).some((w) => w.type === CONTACT_LIST_TYPE);

/** The kinds of labels the board's lists use, each once. */
const kindsOf = (boardId: Id): Set<ContextList> =>
  new Set(contextListsOf(boardId).map((l) => l.type));

/**
 * The groups of this name among a list's groups — all of them for
 * ALL_CONTEXT_GROUPS; empty if there is none. Each list has its own labels.
 */
const groupsNamed = (type: ContextList, boardId: Id, list: string, name: string): Id[] =>
  groupsOf[type]
    .all({ board: boardId })
    .filter(
      (g) =>
        g.list_key === list &&
        (name === ALL_CONTEXT_GROUPS || contextKey(g.name) === contextKey(name)),
    )
    .map((g) => g.id);

/** The board's context group, by its name; null for none. */
export const boardGroup = (boardId: Id): string | null => {
  const name = groupNameOf.get(boardId)?.context_group.trim() ?? "";
  return name ? name : null;
};

/** The groups the board can choose: those of the kinds its lists use, each name once. */
export const contextGroupOptions = (boardId: Id): string[] => {
  const names = new Map<string, string>();
  for (const type of kindsOf(boardId)) {
    for (const { name } of groupsOf[type].all({ board: boardId })) {
      const key = contextKey(name);
      if (key && !names.has(key)) names.set(key, name.trim());
    }
  }
  const contactKey = contextKey(CONTACT_TYPE_GROUP);
  if (withContacts(boardId) && !names.has(contactKey)) names.set(contactKey, CONTACT_TYPE_GROUP);
  return [...names.values()];
};

/** The context groups of each list of the board, by list key. */
export const contextGroups = (boardId: Id): Record<string, Id[]> => {
  const name = boardGroup(boardId);
  if (name === null) return {};
  return Object.fromEntries(
    contextListsOf(boardId).flatMap(({ type, list }) => {
      const groups = groupsNamed(type, boardId, list, name);
      return groups.length === 0 ? [] : [[list, groups]];
    }),
  );
};

/**
 * The board's contexts under the name of their group: the labels of its
 * context groups, each name once — in the first group that has it —, groups
 * of the same name together, in order.
 */
export const boardContextSections = (boardId: Id): { group: string; contexts: string[] }[] => {
  const name = boardGroup(boardId);
  if (name === null) return [];
  const seen = new Set<string>();
  const sections = new Map<string, { group: string; contexts: string[] }>();
  for (const type of kindsOf(boardId)) {
    for (const group of groupsOf[type].all({ board: boardId })) {
      if (name !== ALL_CONTEXT_GROUPS && contextKey(group.name) !== contextKey(name)) continue;
      const groupKey = contextKey(group.name);
      const section = sections.get(groupKey) ?? { group: group.name.trim(), contexts: [] };
      sections.set(groupKey, section);
      for (const label of labelsOfGroup[type].all(group.id)) {
        const key = contextKey(label.name);
        if (!key || seen.has(key)) continue;
        seen.add(key);
        section.contexts.push(label.name.trim());
      }
    }
  }
  // The contact types, after the labels: a group of their own, not labels.
  if (
    withContacts(boardId) &&
    (name === ALL_CONTEXT_GROUPS || contextKey(name) === contextKey(CONTACT_TYPE_GROUP))
  ) {
    const groupKey = contextKey(CONTACT_TYPE_GROUP);
    const section = sections.get(groupKey) ?? { group: CONTACT_TYPE_GROUP, contexts: [] };
    sections.set(groupKey, section);
    for (const context of CONTACT_TYPE_CONTEXTS) {
      if (seen.has(contextKey(context))) continue;
      seen.add(contextKey(context));
      section.contexts.push(context);
    }
  }
  return [...sections.values()].filter((s) => s.contexts.length > 0);
};

/** The board's contexts: the names of its context groups' labels, each once, in order. */
export const boardContexts = (boardId: Id): string[] =>
  boardContextSections(boardId).flatMap((s) => s.contexts);

/**
 * The label to set, on creation, on an item of this list so that it belongs
 * to the context being viewed: that of this name in the list's group named
 * by the board. Null with no context, no group, or no label of that name.
 */
export const contextLabel = (
  type: ContextList,
  boardId: Id,
  list: string,
  context: unknown,
): Id | null => {
  if (typeof context !== "string" || !contextKey(context)) return null;
  const name = boardGroup(boardId);
  const groups = name === null ? [] : groupsNamed(type, boardId, list, name);
  const label = groups
    .flatMap((group) => labelsOfGroup[type].all(group))
    .find((l) => contextKey(l.name) === contextKey(context));
  return label?.id ?? null;
};

const renameInBoard = mutation(
  "UPDATE boards SET context_group = ? WHERE id = ? AND lower(trim(context_group)) = ?",
);
const renameEverywhere = mutation(
  "UPDATE boards SET context_group = ? WHERE lower(trim(context_group)) = ?",
);

/**
 * A label group renamed: the boards that chose it by its former name follow
 * it — the board's own (scope), or all of them for Support's groups.
 */
export const renameContextGroup = (scope: Id | undefined, before: string, after: string): void => {
  if (scope === undefined) renameEverywhere.run(after.trim(), contextKey(before));
  else renameInBoard.run(after.trim(), scope, contextKey(before));
};

const selected = selection<{ context_name: string }>(
  "SELECT context_name FROM user_board_contexts WHERE user_id = ? AND board_id = ?",
);

export const selectContext = mutation(
  `INSERT INTO user_board_contexts (user_id, board_id, context_name) VALUES (?, ?, ?)
   ON CONFLICT(user_id, board_id) DO UPDATE SET context_name = excluded.context_name`,
);

/**
 * The context this account looks at in this board; null for all — or when
 * the board no longer offers it.
 */
export const selectedContext = (userId: Id, boardId: Id, contexts: string[]): string | null => {
  const name = selected.get(userId, boardId)?.context_name ?? "";
  return contexts.find((c) => contextKey(c) === contextKey(name)) ?? null;
};
