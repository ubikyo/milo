// Project categories, and their milestones. A category belongs to a board; its
// visibility is the board's (repositories/boards.ts). They form a tree: each
// has a parent, none at the root.

import { mutation, selection } from "../db/query.js";
import { isLabelColor } from "@milo/shared";
import type { Category, Id, Milestone } from "@milo/shared";
import type { CategoryRow } from "../db/rows.js";

const createCategory = mutation(
  `INSERT INTO categories (board_id, name, milestones, parent_id, position)
   VALUES (?, ?, ?, ?, (SELECT COALESCE(MAX(position), -1) + 1 FROM categories WHERE board_id = ?))`,
);

export const categories = {
  byId: selection<CategoryRow>("SELECT * FROM categories WHERE id = ?"),
  // Two categories of a parent do not share a name; those of two parents may.
  byName: selection<CategoryRow>(
    `SELECT * FROM categories
     WHERE board_id = ? AND parent_id IS ? AND name = ? COLLATE NOCASE AND id != ?`,
  ),
  children: selection<CategoryRow>("SELECT * FROM categories WHERE parent_id = ?"),
  // A new category is placed at the end of its board's.
  create: {
    run: (boardId: unknown, name: string, milestones: string, parentId: Id | null = null) =>
      createCategory.run(boardId, name, milestones, parentId, boardId),
  },
  rename: mutation("UPDATE categories SET name = ? WHERE id = ?"),
  setParent: mutation("UPDATE categories SET parent_id = ? WHERE id = ?"),
  setMilestones: mutation("UPDATE categories SET milestones = ? WHERE id = ?"),
};

/** A category and all those under it, by their ids. */
export const subtreeOf = (id: Id): Set<Id> => {
  const inside = new Set<Id>([id]);
  const pending: Id[] = [id];
  while (pending.length) {
    for (const child of categories.children.all(pending.pop())) {
      if (inside.has(child.id)) continue;
      inside.add(child.id);
      pending.push(child.id);
    }
  }
  return inside;
};

/**
 * The received milestones, put back in order: each milestone carries a label
 * and an integer value from 0 to 100, once per value, sorted by value.
 * Returns "null" if the input is not a list.
 */
export const validMilestones = (received: unknown): Milestone[] | null => {
  if (!Array.isArray(received)) return null;
  const byValue = new Map<number, Milestone>();
  for (const milestone of received) {
    if (!milestone || typeof milestone !== "object") return null;
    const { value, label, color } = milestone as Record<string, unknown>;
    const numericValue = Number(value);
    // The label is optional: without it, the milestone colors its segment but
    // is not written under the slider. An unreadable color is left aside.
    const trimmedLabel = typeof label === "string" ? label.trim() : "";
    if (!Number.isInteger(numericValue) || numericValue < 0 || numericValue > 100) return null;
    byValue.set(numericValue, {
      value: numericValue,
      label: trimmedLabel,
      ...(isLabelColor(color) ? { color: String(color) } : {}),
    });
  }
  return [...byValue.values()].sort((a, b) => a.value - b.value);
};

/**
 * The row as the API returns it: its milestones become a list again.
 * Unreadable JSON does not break the read: the category comes out without milestones.
 */
export const renderedCategory = <Row extends CategoryRow>(
  row: Row,
): Omit<Row, "milestones"> & Pick<Category, "milestones"> => {
  let milestones: Milestone[] = [];
  try {
    milestones = validMilestones(JSON.parse(row.milestones)) ?? [];
  } catch {
    /* unreadable milestones: the category does without them */
  }
  return { ...row, milestones };
};
