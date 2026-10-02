// Les panneaux des statistiques : ceux des modes Support, Assets, Projet et
// Tâche. Leurs indicateurs ont la même forme — un widget du client, sa
// configuration en JSON, un rang — et se rangent chacun dans leur table. Le
// serveur range le JSON du widget sans le relire.

import type { Id } from "@milo/shared";
import { mutation, scalar, selection, transaction } from "../db/query.js";
import type { IndicatorRow, IndicatorSectionRow, NextRow } from "../db/rows.js";
import { now } from "../lib/time.js";

/** Un indicateur tel que l'API le rend : sa configuration relue en objet. */
export interface IndicateurRendu<Type extends string> {
  id: Id;
  type: Type;
  config: Record<string, unknown>;
  position: number;
  created_at: string;
}

/** L'indicateur tel que l'API le rend : sa configuration relue en objet. */
export const indicateurRendu = <Type extends string>(
  row: IndicatorRow<Type>,
): IndicateurRendu<Type> => {
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

/**
 * Les requêtes d'un panneau, sur sa table et ses sections. « Verrouillé »
 * n'est pas ici : il ne vit que dans la fenêtre qui le pose (client).
 *
 * Les sections sont les colonnes du panneau, comme celles d'une catégorie
 * d'accès : un indicateur appartient à l'une d'elles et passe de l'une à
 * l'autre en se rangeant.
 *
 * « owner » choisit la structure : nul, la publique, partagée par tous ceux
 * qui l'héritent ; sinon celle de ce compte (repositories/layouts.ts).
 */
export const panneauIndicateurs = <Type extends string>(
  table: "support_indicators" | "asset_indicators" | "project_indicators" | "task_indicators",
  panel: IndicatorSectionRow["panel"],
) => {
  type Owner = Id | null;
  const placer = mutation(`UPDATE ${table} SET section_id = ?, position = ? WHERE id = ?`);
  const placerSection = mutation("UPDATE indicator_sections SET position = ? WHERE id = ?");
  // « IS » plutôt que « = » : nul y vaut nul, la structure publique se lit
  // par la même requête que celle d'un compte.
  const sectionsDuPanneau = selection<IndicatorSectionRow>(
    "SELECT * FROM indicator_sections WHERE panel = ? AND owner_id IS ? ORDER BY position, id",
  );
  const sectionParId = selection<IndicatorSectionRow>(
    "SELECT * FROM indicator_sections WHERE id = ? AND panel = ? AND owner_id IS ?",
  );
  const prochaineSection = scalar<NextRow>(
    `SELECT COALESCE(MAX(position), -1) + 1 AS next FROM indicator_sections
     WHERE panel = ? AND owner_id IS ?`,
  );
  const creerSection = mutation(
    `INSERT INTO indicator_sections (panel, width_unit, width_value, gap, position, owner_id, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  );
  const retirerSectionsDe = mutation(
    "DELETE FROM indicator_sections WHERE panel = ? AND owner_id = ?",
  );

  const byId = selection<IndicatorRow<Type>>(`SELECT * FROM ${table} WHERE id = ?`);
  const bySection = selection<IndicatorRow<Type>>(
    `SELECT * FROM ${table} WHERE section_id = ? ORDER BY position, id`,
  );
  const tousDe = selection<IndicatorRow<Type>>(
    `SELECT ${table}.* FROM ${table}
     JOIN indicator_sections ON indicator_sections.id = ${table}.section_id
     WHERE indicator_sections.panel = ? AND indicator_sections.owner_id IS ?
     ORDER BY indicator_sections.position, indicator_sections.id, ${table}.position, ${table}.id`,
  );
  const nextPosition = scalar<NextRow>(
    `SELECT COALESCE(MAX(position), -1) + 1 AS next FROM ${table} WHERE section_id = ?`,
  );
  const create = mutation(
    `INSERT INTO ${table} (section_id, type, config, position, created_at) VALUES (?, ?, ?, ?, ?)`,
  );

  /** Les sections, dans l'ordre donné. */
  const rangerSections = transaction((ids: Id[]) => {
    ids.forEach((id, place) => placerSection.run(place, id));
  });

  /** Une section et ce qu'elle porte, recopiées pour « owner ». */
  const copier = (original: IndicatorSectionRow, owner: Owner, position: number): Id => {
    const timestamp = now();
    const id = Number(
      creerSection.run(
        panel,
        original.width_unit,
        original.width_value,
        original.gap,
        position,
        owner,
        timestamp,
      ).lastInsertRowid,
    );
    bySection.all(original.id).forEach((indicateur, place) => {
      create.run(id, indicateur.type, indicateur.config, place, timestamp);
    });
    return id;
  };

  return {
    byId,
    /** Ceux de toutes les sections de cette structure, dans l'ordre des colonnes puis de chacune. */
    all: (owner: Owner) => tousDe.all(panel, owner),
    nextPosition,
    create,
    update: mutation(`UPDATE ${table} SET config = ? WHERE id = ?`),
    remove: mutation(`DELETE FROM ${table} WHERE id = ?`),
    /**
     * Ce qu'une section porte désormais, dans l'ordre. Un indicateur venu
     * d'une autre section y est admis : c'est ainsi qu'on le déplace.
     */
    ranger: transaction((sectionId: Id, ids: Id[]) => {
      ids.forEach((id, place) => placer.run(sectionId, place, id));
    }),

    sections: {
      all: (owner: Owner) => sectionsDuPanneau.all(panel, owner),
      byId: (id: unknown, owner: Owner) => sectionParId.get(id, panel, owner),
      /** Ajoutée au bout, ou au rang demandé. */
      create: transaction(
        (
          owner: Owner,
          unite: string,
          valeur: number | null,
          ecart: number,
          rang: number | null,
        ): Id => {
          const { next } = prochaineSection(panel, owner);
          const id = Number(
            creerSection.run(panel, unite, valeur, ecart, next, owner, now()).lastInsertRowid,
          );
          if (rang !== null) {
            const autres = sectionsDuPanneau
              .all(panel, owner)
              .map((s) => s.id)
              .filter((autre) => autre !== id);
            rangerSections([...autres.slice(0, rang), id, ...autres.slice(rang)]);
          }
          return id;
        },
      ),
      update: mutation(
        "UPDATE indicator_sections SET width_unit = ?, width_value = ?, gap = ? WHERE id = ?",
      ),
      ranger: rangerSections,
      /** La copie, avec ses indicateurs, se pose juste à droite de l'original. */
      duplicate: transaction((original: IndicatorSectionRow): Id => {
        const { next } = prochaineSection(panel, original.owner_id);
        const id = copier(original, original.owner_id, next);
        const ordre = sectionsDuPanneau
          .all(panel, original.owner_id)
          .map((s) => s.id)
          .filter((autre) => autre !== id);
        ordre.splice(ordre.indexOf(original.id) + 1, 0, id);
        rangerSections(ordre);
        return id;
      }),
      /** Ce qu'elle portait part avec elle, par clé étrangère. */
      remove: mutation("DELETE FROM indicator_sections WHERE id = ?"),
    },

    /**
     * « Hérité » décoché : ce compte part d'une copie de la structure
     * publique — sections et indicateurs —, qu'il modifie sans toucher celle
     * des autres. Une copie déjà là est d'abord retirée.
     */
    personnaliser: transaction((userId: Id): void => {
      retirerSectionsDe.run(panel, userId);
      sectionsDuPanneau.all(panel, null).forEach((section, place) => {
        copier(section, userId, place);
      });
    }),
    /** « Hérité » recoché : sa structure s'en va, il revient à la publique. */
    heriter: (userId: Id): void => {
      retirerSectionsDe.run(panel, userId);
    },

  };
};

export type PanneauIndicateurs<Type extends string> = ReturnType<typeof panneauIndicateurs<Type>>;
