// Les catégories des projets, et leurs jalons. Une catégorie appartient à un
// tableau ; sa visibilité est celle du tableau (repositories/boards.ts).

import { mutation, selection } from "../db/query.js";
import { isLabelColor } from "@milo/shared";
import type { Category, Milestone } from "@milo/shared";
import type { CategoryRow } from "../db/rows.js";

const creerCategorie = mutation(
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
      creerCategorie.run(boardId, name, milestones, boardId),
  },
  rename: mutation("UPDATE categories SET name = ? WHERE id = ?"),
  setMilestones: mutation("UPDATE categories SET milestones = ? WHERE id = ?"),
};

/**
 * Les jalons reçus, remis en ordre : chaque jalon porte un libellé et une
 * valeur entière de 0 à 100, une seule fois par valeur, rangés par valeur.
 * Rend « null » si la liste n'en est pas une.
 */
export const jalonsValides = (recu: unknown): Milestone[] | null => {
  if (!Array.isArray(recu)) return null;
  const parValeur = new Map<number, Milestone>();
  for (const jalon of recu) {
    if (!jalon || typeof jalon !== "object") return null;
    const { value, label, color } = jalon as Record<string, unknown>;
    const valeur = Number(value);
    // Le libellé est facultatif : sans lui, le jalon colore sa tranche mais ne
    // s'écrit pas sous le curseur. Une couleur illisible est laissée de côté.
    const libelle = typeof label === "string" ? label.trim() : "";
    if (!Number.isInteger(valeur) || valeur < 0 || valeur > 100) return null;
    parValeur.set(valeur, {
      value: valeur,
      label: libelle,
      ...(isLabelColor(color) ? { color: String(color) } : {}),
    });
  }
  return [...parValeur.values()].sort((a, b) => a.value - b.value);
};

/**
 * La ligne telle que l'API la rend : ses jalons redeviennent une liste. Un
 * JSON illisible ne fait pas tomber la lecture : la catégorie sort sans jalon.
 */
export const categorieRendue = <Row extends CategoryRow>(
  row: Row,
): Omit<Row, "milestones"> & Pick<Category, "milestones"> => {
  let milestones: Milestone[] = [];
  try {
    milestones = jalonsValides(JSON.parse(row.milestones)) ?? [];
  } catch {
    /* jalons illisibles : la catégorie s'en passe */
  }
  return { ...row, milestones };
};
