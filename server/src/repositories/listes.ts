// Les widgets de liste possèdent leurs éléments : deux « Projets » d'un même
// tableau ne montrent pas les mêmes projets. Chacun porte dans sa
// configuration une clé de liste (shared, CLE_DE_LISTE), que ses projets, ses
// listes de tâches, ses demandes et ses postes portent aussi.
//
// La clé naît avec le widget et ne change plus ; la copie personnelle d'un
// tableau (« Hérité » décoché) la garde, pour montrer les mêmes éléments. Les
// éléments partent avec le dernier widget qui tient leur clé.

import { randomUUID } from "node:crypto";
import { CLE_DE_LISTE, cleDeListe, isListWidgetType } from "@milo/shared";
import type { Id } from "@milo/shared";
import { mutation, selection } from "../db/query.js";

const lire = (config: string): Record<string, unknown> => {
  try {
    const lu = JSON.parse(config) as unknown;
    return lu && typeof lu === "object" ? (lu as Record<string, unknown>) : {};
  } catch {
    return {};
  }
};

/** La configuration d'un widget neuf : un widget de liste y reçoit sa clé. */
export const avecCleNeuve = (type: string, config: string): string =>
  isListWidgetType(type)
    ? JSON.stringify({ ...lire(config), [CLE_DE_LISTE]: randomUUID() })
    : config;

/** Une configuration modifiée garde la clé de l'ancienne : elle ne se change pas. */
export const garderLaCle = (type: string, avant: string, apres: string): string => {
  if (!isListWidgetType(type)) return apres;
  const cle = cleDeListe(lire(avant));
  return JSON.stringify({ ...lire(apres), [CLE_DE_LISTE]: cle || randomUUID() });
};

const clesDuTableau = selection<{ cle: string | null }>(
  `SELECT json_extract(w.config, '$.${CLE_DE_LISTE}') AS cle FROM board_widgets w
   JOIN board_sections s ON s.id = w.section_id
   WHERE s.board_id = ? AND w.type = ? AND json_valid(w.config)
   ORDER BY s.owner_id IS NOT NULL, s.position, s.id, w.position, w.id`,
);

/**
 * La clé de liste d'un élément créé dans ce tableau : celle qu'on dit, si un
 * widget de ce type la tient ; sinon celle du premier — public d'abord. Vide
 * quand le tableau n'en porte aucun.
 */
export const cleDansLeTableau = (boardId: Id, type: string, recue: unknown): string => {
  const cles = clesDuTableau
    .all(boardId, type)
    .map((l) => l.cle)
    .filter((c): c is string => Boolean(c));
  if (typeof recue === "string" && cles.includes(recue)) return recue;
  return cles[0] ?? "";
};

/** Un widget de ce type, dans ce tableau, tient-il cette clé ? */
const tenue = (type: string, tableau: string, cle: string) =>
  `EXISTS (SELECT 1 FROM board_widgets w JOIN board_sections s ON s.id = w.section_id
           WHERE s.board_id = ${tableau} AND w.type = '${type}' AND json_valid(w.config)
             AND json_extract(w.config, '$.${CLE_DE_LISTE}') = ${cle})`;

const orphelins = {
  projects: mutation(
    `DELETE FROM projects
     WHERE list_key != '' AND NOT ${tenue("project.list", "projects.board_id", "projects.list_key")}`,
  ),
  "task-lists": mutation(
    `DELETE FROM task_lists
     WHERE list_key != '' AND NOT ${tenue("task.list", "task_lists.board_id", "task_lists.list_key")}`,
  ),
  "support-requests": mutation(
    `DELETE FROM support_requests
     WHERE list_key != '' AND NOT ${tenue(
       "support.list",
       "support_requests.board_id",
       "support_requests.list_key",
     )}`,
  ),
  assets: mutation(
    `DELETE FROM assets
     WHERE list_key != '' AND NOT ${tenue(
       "asset.list",
       "assets.board_id",
       "assets.list_key",
     )}`,
  ),
} as const;

/**
 * Ce qu'aucun widget ne tient plus s'en va : les éléments d'un widget
 * supprimé — seul, avec sa section, ou avec la copie personnelle qui le
 * portait. Rend les ressources touchées.
 */
export const nettoyerLesListes = (): (keyof typeof orphelins)[] =>
  (Object.keys(orphelins) as (keyof typeof orphelins)[]).filter(
    (ressource) => orphelins[ressource].run().changes > 0,
  );
