// Les widgets de liste possèdent leurs éléments : deux « Projets » d'un même
// tableau ne montrent pas les mêmes projets. Chacun porte dans sa
// configuration une clé de liste (shared, CLE_DE_LISTE), que ses projets, ses
// listes de tâches, ses demandes et ses postes portent aussi.
//
// La clé naît avec le widget et ne change plus ; la copie personnelle d'un
// tableau (« Hérité » décoché) la garde, pour montrer les mêmes éléments. Les
// éléments partent avec le dernier widget qui tient leur clé.

import { randomUUID } from "node:crypto";
import { LIST_KEY, listKey, isListWidgetType } from "@milo/shared";
import type { Id } from "@milo/shared";
import { mutation, selection } from "../db/query.js";

const read = (config: string): Record<string, unknown> => {
  try {
    const readValue = JSON.parse(config) as unknown;
    return readValue && typeof readValue === "object" ? (readValue as Record<string, unknown>) : {};
  } catch {
    return {};
  }
};

/** La configuration d'un widget neuf : un widget de liste y reçoit sa clé. */
export const withNewKey = (type: string, config: string): string =>
  isListWidgetType(type)
    ? JSON.stringify({ ...read(config), [LIST_KEY]: randomUUID() })
    : config;

/** Une configuration modifiée garde la clé de l'ancienne : elle ne se change pas. */
export const keepKey = (type: string, before: string, after: string): string => {
  if (!isListWidgetType(type)) return after;
  const key = listKey(read(before));
  return JSON.stringify({ ...read(after), [LIST_KEY]: key || randomUUID() });
};

const boardKeys = selection<{ key: string | null }>(
  `SELECT json_extract(w.config, '$.${LIST_KEY}') AS cle FROM board_widgets w
   JOIN board_sections s ON s.id = w.section_id
   WHERE s.board_id = ? AND w.type = ? AND json_valid(w.config)
   ORDER BY s.owner_id IS NOT NULL, s.position, s.id, w.position, w.id`,
);

/**
 * La clé de liste d'un élément créé dans ce tableau : celle qu'on dit, si un
 * widget de ce type la tient ; sinon celle du premier — public d'abord. Vide
 * quand le tableau n'en porte aucun.
 */
export const keyInBoard = (boardId: Id, type: string, received: unknown): string => {
  const keys = boardKeys
    .all(boardId, type)
    .map((l) => l.key)
    .filter((c): c is string => Boolean(c));
  if (typeof received === "string" && keys.includes(received)) return received;
  return keys[0] ?? "";
};

/** Un widget de ce type, dans ce tableau, tient-il cette clé ? */
const holdsKey = (type: string, board: string, key: string) =>
  `EXISTS (SELECT 1 FROM board_widgets w JOIN board_sections s ON s.id = w.section_id
           WHERE s.board_id = ${board} AND w.type = '${type}' AND json_valid(w.config)
             AND json_extract(w.config, '$.${LIST_KEY}') = ${key})`;

const orphans = {
  projects: mutation(
    `DELETE FROM projects
     WHERE list_key != '' AND NOT ${holdsKey("project.list", "projects.board_id", "projects.list_key")}`,
  ),
  "task-lists": mutation(
    `DELETE FROM task_lists
     WHERE list_key != '' AND NOT ${holdsKey("task.list", "task_lists.board_id", "task_lists.list_key")}`,
  ),
  "support-requests": mutation(
    `DELETE FROM support_requests
     WHERE list_key != '' AND NOT ${holdsKey(
       "support.list",
       "support_requests.board_id",
       "support_requests.list_key",
     )}`,
  ),
  assets: mutation(
    `DELETE FROM assets
     WHERE list_key != '' AND NOT ${holdsKey(
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
export const cleanLists = (): (keyof typeof orphans)[] =>
  (Object.keys(orphans) as (keyof typeof orphans)[]).filter(
    (resource) => orphans[resource].run().changes > 0,
  );
