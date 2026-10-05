// A board's sections and the widgets they carry. A widget is designated by its
// type (shared, BOARD_WIDGET_TYPES); the server stores its configuration as
// JSON without re-reading it — the client's widget is what knows what it
// means. A board has one structure, seen by all who see it.

import type { BoardWidget, Id } from "@milo/shared";
import { mutation, scalar, selection, transaction } from "../db/query.js";
import type { BoardSectionRow, BoardWidgetRow, NextRow } from "../db/rows.js";
import { withNewKey } from "./lists.js";
import { now } from "../lib/time.js";

/** The widget as the API returns it: its configuration re-read as an object. */
export const renderedWidget = (row: BoardWidgetRow): BoardWidget => {
  let config: Record<string, unknown> = {};
  try {
    const readValue: unknown = JSON.parse(row.config);
    if (readValue && typeof readValue === "object" && !Array.isArray(readValue)) {
      config = readValue as Record<string, unknown>;
    }
  } catch {
    /* unreadable configuration: the widget will fall back to its own */
  }
  return { ...row, config };
};

const sectionsOf = selection<BoardSectionRow>(
  "SELECT * FROM board_sections WHERE board_id = ? ORDER BY position, id",
);
const sectionById = selection<BoardSectionRow>("SELECT * FROM board_sections WHERE id = ?");
const nextSection = scalar<NextRow>(
  "SELECT COALESCE(MAX(position), -1) + 1 AS next FROM board_sections WHERE board_id = ?",
);
const createSection = mutation(
  `INSERT INTO board_sections (board_id, width_unit, width_value, gap, position, created_at)
   VALUES (?, ?, ?, ?, ?, ?)`,
);
const placeSection = mutation("UPDATE board_sections SET position = ? WHERE id = ?");
const removeSection = mutation("DELETE FROM board_sections WHERE id = ?");

const widgetById = selection<BoardWidgetRow>("SELECT * FROM board_widgets WHERE id = ?");
const sectionWidgets = selection<BoardWidgetRow>(
  "SELECT * FROM board_widgets WHERE section_id = ? ORDER BY position, id",
);
const widgetsOf = selection<BoardWidgetRow>(
  `SELECT w.* FROM board_widgets w
   JOIN board_sections s ON s.id = w.section_id
   WHERE s.board_id = ?
   ORDER BY s.position, s.id, w.position, w.id`,
);
const nextWidget = scalar<NextRow>(
  "SELECT COALESCE(MAX(position), -1) + 1 AS next FROM board_widgets WHERE section_id = ?",
);
const createWidget = mutation(
  `INSERT INTO board_widgets (section_id, type, config, position, created_at) VALUES (?, ?, ?, ?, ?)`,
);
const placeWidget = mutation("UPDATE board_widgets SET section_id = ?, position = ? WHERE id = ?");

/** The sections, in the given order. */
const arrangeSections = transaction((ids: Id[]) => {
  ids.forEach((id, place) => placeSection.run(place, id));
});

/**
 * A section and what it carries, copied into board "boardId". The copy
 * carries new, empty lists (repositories/lists.ts).
 */
const copySection = (original: BoardSectionRow, boardId: Id, position: number): Id => {
  const timestamp = now();
  const id = Number(
    createSection.run(
      boardId,
      original.width_unit,
      original.width_value,
      original.gap,
      position,
      timestamp,
    ).lastInsertRowid,
  );
  sectionWidgets.all(original.id).forEach((w, place) => {
    createWidget.run(id, w.type, withNewKey(w.type, w.config), place, timestamp);
  });
  return id;
};

export const boardSections = {
  all: (boardId: Id) => sectionsOf.all(boardId),
  byId: (id: unknown) => sectionById.get(id),
  /** Added at the end, or at the requested position. */
  create: transaction(
    (
      boardId: Id,
      unit: string,
      value: number | null,
      gap: number,
      rank: number | null,
    ): Id => {
      const { next } = nextSection(boardId);
      const id = Number(createSection.run(boardId, unit, value, gap, next, now()).lastInsertRowid);
      if (rank !== null) {
        const others = sectionsOf
          .all(boardId)
          .map((s) => s.id)
          .filter((other) => other !== id);
        arrangeSections([...others.slice(0, rank), id, ...others.slice(rank)]);
      }
      return id;
    },
  ),
  update: mutation(
    "UPDATE board_sections SET width_unit = ?, width_value = ?, gap = ? WHERE id = ?",
  ),
  store: arrangeSections,
  /** The copy, with its widgets, is placed just right of the original. */
  duplicate: transaction((original: BoardSectionRow): Id => {
    const { next } = nextSection(original.board_id);
    const id = copySection(original, original.board_id, next);
    const order = sectionsOf
      .all(original.board_id)
      .map((s) => s.id)
      .filter((other) => other !== id);
    order.splice(order.indexOf(original.id) + 1, 0, id);
    arrangeSections(order);
    return id;
  }),
  /** What it carried goes with it, through the foreign key. */
  remove: mutation("DELETE FROM board_sections WHERE id = ?"),

  /**
   * An imported layout replaces the board's structure: its new
   * sections, and their widgets, whose configuration arrives ready to store —
   * list key included. The old structure's "guard" widgets, which the account
   * cannot remove, move to the end of the first section; the rest of the old
   * structure goes away, through the foreign key. Everything passes, or nothing.
   */
  importSections: transaction(
    (
      boardId: Id,
      sections: {
        unit: string;
        value: number | null;
        gap: number;
        widgets: { type: string; config: string }[];
      }[],
      keptCount: Id[],
    ): void => {
      const old = sectionsOf.all(boardId).map((s) => s.id);
      const timestamp = now();
      const placed = sections.map((section, place) => {
        const id = Number(
          createSection.run(
            boardId,
            section.unit,
            section.value,
            section.gap,
            place,
            timestamp,
          ).lastInsertRowid,
        );
        section.widgets.forEach((w, rank) => createWidget.run(id, w.type, w.config, rank, timestamp));
        return { id, count: section.widgets.length };
      });
      if (keptCount.length > 0) {
        const first =
          placed[0] ??
          ({
            id: Number(
              createSection.run(boardId, "auto", null, 50, 0, timestamp).lastInsertRowid,
            ),
            count: 0,
          } as const);
        keptCount.forEach((id, rank) => placeWidget.run(first.id, first.count + rank, id));
      }
      old.forEach((id) => removeSection.run(id));
    },
  ),
  /** A new board: one section, empty or carrying a first widget. */
  setFirst: transaction((boardId: Id, type: string | null): void => {
    const timestamp = now();
    const id = Number(
      createSection.run(boardId, "auto", null, 50, 0, timestamp).lastInsertRowid,
    );
    if (type) createWidget.run(id, type, withNewKey(type, "{}"), 0, timestamp);
  }),
};

export const boardWidgets = {
  byId: (id: unknown) => widgetById.get(id),
  /** Those of all of a structure's sections, in column order then each one's order. */
  all: (boardId: Id) => widgetsOf.all(boardId),
  bySection: (sectionId: Id) => sectionWidgets.all(sectionId),
  create: (sectionId: Id, type: string, config: string): Id => {
    const { next } = nextWidget(sectionId);
    return Number(
      createWidget.run(sectionId, type, withNewKey(type, config), next, now()).lastInsertRowid,
    );
  },
  update: mutation("UPDATE board_widgets SET config = ? WHERE id = ?"),
  remove: mutation("DELETE FROM board_widgets WHERE id = ?"),
  /**
   * What a section now carries, in order. A widget coming from another
   * section is admitted: that is how it is moved.
   */
  store: transaction((sectionId: Id, ids: Id[]) => {
    ids.forEach((id, place) => placeWidget.run(sectionId, place, id));
  }),
  /** The copy, of the same type and configuration, is placed just under the original. */
  duplicate: transaction((original: BoardWidgetRow): Id => {
    const { next } = nextWidget(original.section_id);
    const id = Number(
      createWidget.run(original.section_id, original.type, original.config, next, now())
        .lastInsertRowid,
    );
    const order = sectionWidgets
      .all(original.section_id)
      .map((w) => w.id)
      .filter((other) => other !== id);
    order.splice(order.indexOf(original.id) + 1, 0, id);
    order.forEach((wid, place) => placeWidget.run(original.section_id, place, wid));
    return id;
  }),
};
