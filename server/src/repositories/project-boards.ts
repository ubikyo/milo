// Project categories, and their milestones. A category belongs to a board; its
// visibility is the board's (repositories/boards.ts).

import { mutation, selection } from "../db/query.js";
import { isLabelColor } from "@milo/shared";
import type { Category, Milestone } from "@milo/shared";
import type { CategoryRow } from "../db/rows.js";

const createCategory = mutation(
  `INSERT INTO categories (board_id, name, milestones, position)
   VALUES (?, ?, ?, (SELECT COALESCE(MAX(position), -1) + 1 FROM categories WHERE board_id = ?))`,
);

export const categories = {
  byId: selection<CategoryRow>("SELECT * FROM categories WHERE id = ?"),
  byName: selection<CategoryRow>(
    "SELECT * FROM categories WHERE board_id = ? AND name = ? COLLATE NOCASE AND id != ?",
  ),
  // A new category is placed at the end of its board's.
  create: {
    run: (boardId: unknown, name: string, milestones: string) =>
      createCategory.run(boardId, name, milestones, boardId),
  },
  rename: mutation("UPDATE categories SET name = ? WHERE id = ?"),
  setMilestones: mutation("UPDATE categories SET milestones = ? WHERE id = ?"),
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
