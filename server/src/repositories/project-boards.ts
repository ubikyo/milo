// Les catégories des projets, et leurs jalons. Une catégorie appartient à un
// tableau ; sa visibilité est celle du tableau (repositories/boards.ts).

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
  // Une catégorie neuve se range au bout de celles de son tableau.
  create: {
    run: (boardId: unknown, name: string, milestones: string) =>
      createCategory.run(boardId, name, milestones, boardId),
  },
  rename: mutation("UPDATE categories SET name = ? WHERE id = ?"),
  setMilestones: mutation("UPDATE categories SET milestones = ? WHERE id = ?"),
};

/**
 * Les jalons reçus, remis en ordre : chaque jalon porte un libellé et une
 * valeur entière de 0 à 100, une seule fois par valeur, rangés par valeur.
 * Rend « null » si la liste n'en est pas une.
 */
export const validMilestones = (received: unknown): Milestone[] | null => {
  if (!Array.isArray(received)) return null;
  const byValue = new Map<number, Milestone>();
  for (const milestone of received) {
    if (!milestone || typeof milestone !== "object") return null;
    const { value, label, color } = milestone as Record<string, unknown>;
    const numericValue = Number(value);
    // Le libellé est facultatif : sans lui, le jalon colore sa tranche mais ne
    // s'écrit pas sous le curseur. Une couleur illisible est laissée de côté.
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
 * La ligne telle que l'API la rend : ses jalons redeviennent une liste. Un
 * JSON illisible ne fait pas tomber la lecture : la catégorie sort sans jalon.
 */
export const renderedCategory = <Row extends CategoryRow>(
  row: Row,
): Omit<Row, "milestones"> & Pick<Category, "milestones"> => {
  let milestones: Milestone[] = [];
  try {
    milestones = validMilestones(JSON.parse(row.milestones)) ?? [];
  } catch {
    /* jalons illisibles : la catégorie s'en passe */
  }
  return { ...row, milestones };
};
