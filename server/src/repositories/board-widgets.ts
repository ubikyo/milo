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
import { avecCleNeuve } from "./listes.js";
import { now } from "../lib/time.js";

type Owner = Id | null;

/** Le widget tel que l'API le rend : sa configuration relue en objet. */
export const widgetRendu = (row: BoardWidgetRow): BoardWidget => {
  let config: Record<string, unknown> = {};
  try {
    const lu: unknown = JSON.parse(row.config);
    if (lu && typeof lu === "object" && !Array.isArray(lu)) {
      config = lu as Record<string, unknown>;
    }
  } catch {
    /* configuration illisible : le widget reprendra la sienne */
  }
  return { ...row, config };
};

const sectionsDe = selection<BoardSectionRow>(
  "SELECT * FROM board_sections WHERE board_id = ? AND owner_id IS ? ORDER BY position, id",
);
const sectionParId = selection<BoardSectionRow>("SELECT * FROM board_sections WHERE id = ?");
const prochaineSection = scalar<NextRow>(
  `SELECT COALESCE(MAX(position), -1) + 1 AS next FROM board_sections
   WHERE board_id = ? AND owner_id IS ?`,
);
const creerSection = mutation(
  `INSERT INTO board_sections (board_id, width_unit, width_value, gap, position, owner_id, created_at)
   VALUES (?, ?, ?, ?, ?, ?, ?)`,
);
const placerSection = mutation("UPDATE board_sections SET position = ? WHERE id = ?");
const retirerSection = mutation("DELETE FROM board_sections WHERE id = ?");
const retirerSectionsDe = mutation(
  "DELETE FROM board_sections WHERE board_id = ? AND owner_id = ?",
);

const widgetParId = selection<BoardWidgetRow>("SELECT * FROM board_widgets WHERE id = ?");
const widgetsDeLaSection = selection<BoardWidgetRow>(
  "SELECT * FROM board_widgets WHERE section_id = ? ORDER BY position, id",
);
const widgetsDe = selection<BoardWidgetRow>(
  `SELECT w.* FROM board_widgets w
   JOIN board_sections s ON s.id = w.section_id
   WHERE s.board_id = ? AND s.owner_id IS ?
   ORDER BY s.position, s.id, w.position, w.id`,
);
const prochainWidget = scalar<NextRow>(
  "SELECT COALESCE(MAX(position), -1) + 1 AS next FROM board_widgets WHERE section_id = ?",
);
const creerWidget = mutation(
  `INSERT INTO board_widgets (section_id, type, config, position, created_at) VALUES (?, ?, ?, ?, ?)`,
);
const placerWidget = mutation("UPDATE board_widgets SET section_id = ?, position = ? WHERE id = ?");

/** Les sections, dans l'ordre donné. */
const rangerSections = transaction((ids: Id[]) => {
  ids.forEach((id, place) => placerSection.run(place, id));
});

/**
 * Une section et ce qu'elle porte, recopiées pour « owner » dans le tableau
 * « boardId ». La copie personnelle garde les clés des widgets de liste, pour
 * en montrer les éléments ; une section dupliquée porte des listes neuves,
 * vides (repositories/listes.ts).
 */
const copierSection = (
  original: BoardSectionRow,
  boardId: Id,
  owner: Owner,
  position: number,
  memesListes = false,
): Id => {
  const timestamp = now();
  const id = Number(
    creerSection.run(
      boardId,
      original.width_unit,
      original.width_value,
      original.gap,
      position,
      owner,
      timestamp,
    ).lastInsertRowid,
  );
  widgetsDeLaSection.all(original.id).forEach((w, place) => {
    creerWidget.run(
      id,
      w.type,
      memesListes ? w.config : avecCleNeuve(w.type, w.config),
      place,
      timestamp,
    );
  });
  return id;
};

export const boardSections = {
  all: (boardId: Id, owner: Owner) => sectionsDe.all(boardId, owner),
  byId: (id: unknown) => sectionParId.get(id),
  /** Ajoutée au bout, ou au rang demandé. */
  create: transaction(
    (
      boardId: Id,
      owner: Owner,
      unite: string,
      valeur: number | null,
      ecart: number,
      rang: number | null,
    ): Id => {
      const { next } = prochaineSection(boardId, owner);
      const id = Number(
        creerSection.run(boardId, unite, valeur, ecart, next, owner, now()).lastInsertRowid,
      );
      if (rang !== null) {
        const autres = sectionsDe
          .all(boardId, owner)
          .map((s) => s.id)
          .filter((autre) => autre !== id);
        rangerSections([...autres.slice(0, rang), id, ...autres.slice(rang)]);
      }
      return id;
    },
  ),
  update: mutation(
    "UPDATE board_sections SET width_unit = ?, width_value = ?, gap = ? WHERE id = ?",
  ),
  ranger: rangerSections,
  /** La copie, avec ses widgets, se pose juste à droite de l'original. */
  duplicate: transaction((original: BoardSectionRow): Id => {
    const { next } = prochaineSection(original.board_id, original.owner_id);
    const id = copierSection(original, original.board_id, original.owner_id, next);
    const ordre = sectionsDe
      .all(original.board_id, original.owner_id)
      .map((s) => s.id)
      .filter((autre) => autre !== id);
    ordre.splice(ordre.indexOf(original.id) + 1, 0, id);
    rangerSections(ordre);
    return id;
  }),
  /** Ce qu'elle portait part avec elle, par clé étrangère. */
  remove: mutation("DELETE FROM board_sections WHERE id = ?"),

  /**
   * « Hérité » décoché : ce compte part d'une copie de la structure publique
   * du tableau — sections et widgets —, qu'il modifie sans toucher celle des
   * autres. Une copie déjà là est d'abord retirée.
   */
  personnaliser: transaction((boardId: Id, userId: Id): void => {
    retirerSectionsDe.run(boardId, userId);
    sectionsDe.all(boardId, null).forEach((section, place) => {
      copierSection(section, boardId, userId, place, true);
    });
  }),
  /** « Hérité » recoché : sa structure s'en va, il revient à la publique. */
  heriter: (boardId: Id, userId: Id): void => {
    retirerSectionsDe.run(boardId, userId);
  },
  /**
   * Une disposition importée remplace la structure « owner » du tableau :
   * ses sections neuves, et leurs widgets, dont la configuration arrive prête
   * à ranger — clé de liste comprise. Les widgets « gardes » de l'ancienne,
   * que le compte ne peut pas enlever, passent au bout de la première ; le
   * reste de l'ancienne part, par clé étrangère. Tout passe, ou rien.
   */
  importer: transaction(
    (
      boardId: Id,
      owner: Owner,
      sections: {
        unite: string;
        valeur: number | null;
        ecart: number;
        widgets: { type: string; config: string }[];
      }[],
      gardes: Id[],
    ): void => {
      const anciennes = sectionsDe.all(boardId, owner).map((s) => s.id);
      const timestamp = now();
      const posees = sections.map((section, place) => {
        const id = Number(
          creerSection.run(
            boardId,
            section.unite,
            section.valeur,
            section.ecart,
            place,
            owner,
            timestamp,
          ).lastInsertRowid,
        );
        section.widgets.forEach((w, rang) => creerWidget.run(id, w.type, w.config, rang, timestamp));
        return { id, nombre: section.widgets.length };
      });
      if (gardes.length > 0) {
        const premiere =
          posees[0] ??
          ({
            id: Number(
              creerSection.run(boardId, "auto", null, 50, 0, owner, timestamp).lastInsertRowid,
            ),
            nombre: 0,
          } as const);
        gardes.forEach((id, rang) => placerWidget.run(premiere.id, premiere.nombre + rang, id));
      }
      anciennes.forEach((id) => retirerSection.run(id));
    },
  ),
  /** Un tableau neuf : une section, vide ou portant un premier widget. */
  poserLaPremiere: transaction((boardId: Id, type: string | null): void => {
    const timestamp = now();
    const id = Number(
      creerSection.run(boardId, "auto", null, 50, 0, null, timestamp).lastInsertRowid,
    );
    if (type) creerWidget.run(id, type, avecCleNeuve(type, "{}"), 0, timestamp);
  }),
};

export const boardWidgets = {
  byId: (id: unknown) => widgetParId.get(id),
  /** Ceux de toutes les sections d'une structure, dans l'ordre des colonnes puis de chacune. */
  all: (boardId: Id, owner: Owner) => widgetsDe.all(boardId, owner),
  bySection: (sectionId: Id) => widgetsDeLaSection.all(sectionId),
  create: (sectionId: Id, type: string, config: string): Id => {
    const { next } = prochainWidget(sectionId);
    return Number(
      creerWidget.run(sectionId, type, avecCleNeuve(type, config), next, now()).lastInsertRowid,
    );
  },
  update: mutation("UPDATE board_widgets SET config = ? WHERE id = ?"),
  convertir: mutation("UPDATE board_widgets SET type = ? WHERE id = ?"),
  remove: mutation("DELETE FROM board_widgets WHERE id = ?"),
  /**
   * Ce qu'une section porte désormais, dans l'ordre. Un widget venu d'une
   * autre section y est admis : c'est ainsi qu'on le déplace.
   */
  ranger: transaction((sectionId: Id, ids: Id[]) => {
    ids.forEach((id, place) => placerWidget.run(sectionId, place, id));
  }),
  /** La copie, de même type et de même configuration, se pose juste sous l'original. */
  duplicate: transaction((original: BoardWidgetRow): Id => {
    const { next } = prochainWidget(original.section_id);
    const id = Number(
      creerWidget.run(original.section_id, original.type, original.config, next, now())
        .lastInsertRowid,
    );
    const ordre = widgetsDeLaSection
      .all(original.section_id)
      .map((w) => w.id)
      .filter((autre) => autre !== id);
    ordre.splice(ordre.indexOf(original.id) + 1, 0, id);
    ordre.forEach((wid, place) => placerWidget.run(original.section_id, place, wid));
    return id;
  }),
};
