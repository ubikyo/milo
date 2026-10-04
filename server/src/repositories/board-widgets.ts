// Les sections d'un tableau et les widgets qu'elles portent. Un widget est
// désigné par son type (shared, BOARD_WIDGET_TYPES) ; le serveur range sa
// configuration en JSON sans la relire — c'est le widget du client qui sait
// ce qu'elle veut dire.
//
// Un tableau a sa structure publique (owner_id nul), partagée par tous ceux
// qui l'héritent, et celle de chaque compte qui ne l'hérite plus
// (repositories/layouts.ts). « IS » plutôt que « = » dans les requêtes : nul
// y vaut nul, la structure publique se lit par la même requête que celle d'un
// compte.

import type { BoardWidget, Id } from "@milo/shared";
import { mutation, scalar, selection, transaction } from "../db/query.js";
import type { BoardSectionRow, BoardWidgetRow, NextRow } from "../db/rows.js";
import { withNewKey } from "./lists.js";
import { now } from "../lib/time.js";

type Owner = Id | null;

/** Le widget tel que l'API le rend : sa configuration relue en objet. */
export const renderedWidget = (row: BoardWidgetRow): BoardWidget => {
  let config: Record<string, unknown> = {};
  try {
    const readValue: unknown = JSON.parse(row.config);
    if (readValue && typeof readValue === "object" && !Array.isArray(readValue)) {
      config = readValue as Record<string, unknown>;
    }
  } catch {
    /* configuration illisible : le widget reprendra la sienne */
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

/** Les sections, dans l'ordre donné. */
const arrangeSections = transaction((ids: Id[]) => {
  ids.forEach((id, place) => placeSection.run(place, id));
});

/**
 * Une section et ce qu'elle porte, recopiées pour « owner » dans le tableau
 * « boardId ». La copie personnelle garde les clés des widgets de liste, pour
 * en montrer les éléments ; une section dupliquée porte des listes neuves,
 * vides (repositories/listes.ts).
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
  /** Ajoutée au bout, ou au rang demandé. */
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
  /** La copie, avec ses widgets, se pose juste à droite de l'original. */
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
  /** Ce qu'elle portait part avec elle, par clé étrangère. */
  remove: mutation("DELETE FROM board_sections WHERE id = ?"),

  /**
   * « Hérité » décoché : ce compte part d'une copie de la structure publique
   * du tableau — sections et widgets —, qu'il modifie sans toucher celle des
   * autres. Une copie déjà là est d'abord retirée.
   */
  customize: transaction((boardId: Id, userId: Id): void => {
    removeSectionsOf.run(boardId, userId);
    sectionsOf.all(boardId, null).forEach((section, place) => {
      copySection(section, boardId, userId, place, true);
    });
  }),
  /** « Hérité » recoché : sa structure s'en va, il revient à la publique. */
  inherit: (boardId: Id, userId: Id): void => {
    removeSectionsOf.run(boardId, userId);
  },
  /**
   * Une disposition importée remplace la structure « owner » du tableau :
   * ses sections neuves, et leurs widgets, dont la configuration arrive prête
   * à ranger — clé de liste comprise. Les widgets « gardes » de l'ancienne,
   * que le compte ne peut pas enlever, passent au bout de la première ; le
   * reste de l'ancienne part, par clé étrangère. Tout passe, ou rien.
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
  /** Un tableau neuf : une section, vide ou portant un premier widget. */
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
  /** Ceux de toutes les sections d'une structure, dans l'ordre des colonnes puis de chacune. */
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
   * Ce qu'une section porte désormais, dans l'ordre. Un widget venu d'une
   * autre section y est admis : c'est ainsi qu'on le déplace.
   */
  store: transaction((sectionId: Id, ids: Id[]) => {
    ids.forEach((id, place) => placeWidget.run(sectionId, place, id));
  }),
  /** La copie, de même type et de même configuration, se pose juste sous l'original. */
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
