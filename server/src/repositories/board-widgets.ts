// A board's sections and the widgets they carry. A widget is designated by its
// type (shared, BOARD_WIDGET_TYPES); the server stores its configuration as
// JSON without re-reading it — the client's widget is what knows what it
// means.
//
// A board has its public structure (null owner_id), shared by all who inherit
// it, and that of each account that no longer inherits it
// (repositories/layouts.ts). "IS" rather than "=" in queries: null there
// equals null, so the public structure is read by the same query as an
// account's.

import type { BoardWidget, Id } from "@milo/shared";
import { mutation, scalar, selection, transaction } from "../db/query.js";
import type { BoardSectionRow, BoardWidgetRow, NextRow } from "../db/rows.js";
import { withNewKey } from "./lists.js";
import { now } from "../lib/time.js";

type Owner = Id | null;

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
  "SELECT * FROM board_sections WHERE board_id = ? AND owner_id IS ? ORDER BY position, id",
);
const sectionById = selection<BoardSectionRow>("SELECT * FROM board_sections WHERE id = ?");
const nextSection = scalar<NextRow>(
  `SELECT COALESCE(MAX(position), -1) + 1 AS next FROM board_sections
   WHERE board_id = ? AND owner_id IS ?`,
);
const createSection = mutation(
  `INSERT INTO board_sections (board_id, width_unit, width_value, gap, position, owner_id, created_at)
   VALUES (?, ?, ?, ?, ?, ?, ?)`,
);
const placeSection = mutation("UPDATE board_sections SET position = ? WHERE id = ?");
const removeSection = mutation("DELETE FROM board_sections WHERE id = ?");
const removeSectionsOf = mutation(
  "DELETE FROM board_sections WHERE board_id = ? AND owner_id = ?",
);

const widgetById = selection<BoardWidgetRow>("SELECT * FROM board_widgets WHERE id = ?");
const sectionWidgets = selection<BoardWidgetRow>(
  "SELECT * FROM board_widgets WHERE section_id = ? ORDER BY position, id",
);
const widgetsOf = selection<BoardWidgetRow>(
  `SELECT w.* FROM board_widgets w
   JOIN board_sections s ON s.id = w.section_id
   WHERE s.board_id = ? AND s.owner_id IS ?
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
 * A section and what it carries, copied for "owner" into board "boardId". The
 * personal copy keeps the list widgets' keys, to show their items; a
 * duplicated section carries new, empty lists (repositories/lists.ts).
 */
const copySection = (
  original: BoardSectionRow,
  boardId: Id,
  owner: Owner,
  position: number,
  sameLists = false,
): Id => {
  const timestamp = now();
  const id = Number(
    createSection.run(
      boardId,
      original.width_unit,
      original.width_value,
      original.gap,
      position,
      owner,
      timestamp,
    ).lastInsertRowid,
  );
  sectionWidgets.all(original.id).forEach((w, place) => {
    createWidget.run(
      id,
      w.type,
      sameLists ? w.config : withNewKey(w.type, w.config),
      place,
      timestamp,
    );
  });
  return id;
};

export const boardSections = {
  all: (boardId: Id, owner: Owner) => sectionsOf.all(boardId, owner),
  byId: (id: unknown) => sectionById.get(id),
  /** Added at the end, or at the requested position. */
  create: transaction(
    (
      boardId: Id,
      owner: Owner,
      unit: string,
      value: number | null,
      gap: number,
      rank: number | null,
    ): Id => {
      const { next } = nextSection(boardId, owner);
      const id = Number(
        createSection.run(boardId, unit, value, gap, next, owner, now()).lastInsertRowid,
      );
      if (rank !== null) {
        const others = sectionsOf
          .all(boardId, owner)
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
    const { next } = nextSection(original.board_id, original.owner_id);
    const id = copySection(original, original.board_id, original.owner_id, next);
    const order = sectionsOf
      .all(original.board_id, original.owner_id)
      .map((s) => s.id)
      .filter((other) => other !== id);
    order.splice(order.indexOf(original.id) + 1, 0, id);
    arrangeSections(order);
    return id;
  }),
  /** What it carried goes with it, through the foreign key. */
  remove: mutation("DELETE FROM board_sections WHERE id = ?"),

  /**
   * "Hérité" unchecked: this account starts from a copy of the board's public
   * structure — sections and widgets —, which it modifies without touching
   * others'. A copy already there is removed first.
   */
  customize: transaction((boardId: Id, userId: Id): void => {
    removeSectionsOf.run(boardId, userId);
    sectionsOf.all(boardId, null).forEach((section, place) => {
      copySection(section, boardId, userId, place, true);
    });
  }),
  /** "Hérité" checked again: its structure goes away, it returns to the public one. */
  inherit: (boardId: Id, userId: Id): void => {
    removeSectionsOf.run(boardId, userId);
  },
  /**
   * An imported layout replaces the board's "owner" structure: its new
   * sections, and their widgets, whose configuration arrives ready to store —
   * list key included. The old structure's "guard" widgets, which the account
   * cannot remove, move to the end of the first section; the rest of the old
   * structure goes away, through the foreign key. Everything passes, or nothing.
   */
  importSections: transaction(
    (
      boardId: Id,
      owner: Owner,
      sections: {
        unit: string;
        value: number | null;
        gap: number;
        widgets: { type: string; config: string }[];
      }[],
      keptCount: Id[],
    ): void => {
      const old = sectionsOf.all(boardId, owner).map((s) => s.id);
      const timestamp = now();
      const placed = sections.map((section, place) => {
        const id = Number(
          createSection.run(
            boardId,
            section.unit,
            section.value,
            section.gap,
            place,
            owner,
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
              createSection.run(boardId, "auto", null, 50, 0, owner, timestamp).lastInsertRowid,
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
      createSection.run(boardId, "auto", null, 50, 0, null, timestamp).lastInsertRowid,
    );
    if (type) createWidget.run(id, type, withNewKey(type, "{}"), 0, timestamp);
  }),
};

export const boardWidgets = {
  byId: (id: unknown) => widgetById.get(id),
  /** Those of all of a structure's sections, in column order then each one's order. */
  all: (boardId: Id, owner: Owner) => widgetsOf.all(boardId, owner),
  bySection: (sectionId: Id) => sectionWidgets.all(sectionId),
  create: (sectionId: Id, type: string, config: string): Id => {
    const { next } = nextWidget(sectionId);
    return Number(
      createWidget.run(sectionId, type, withNewKey(type, config), next, now()).lastInsertRowid,
    );
  },
  update: mutation("UPDATE board_widgets SET config = ? WHERE id = ?"),
  convert: mutation("UPDATE board_widgets SET type = ? WHERE id = ?"),
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
