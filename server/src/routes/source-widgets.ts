// The widgets a counting one can read (shared, SOURCES): the lists, Mail and
// Calendar widgets of a type, on every board one sees, of every view of
// one's workspace. An indicator or a chart names them by their key: it may
// count the items of a widget of another board, of another view.

import { Router } from "express";
import type { Request } from "express";
import {
  LIST_WIDGET_TYPES,
  accessIncludes,
  ownKeyOf,
  widgetReference,
} from "@milo/shared";
import type { Id, SourceWidget } from "@milo/shared";
import { selection } from "../db/query.js";
import { badRequest } from "../lib/http.js";
import { widgetAccess } from "../lib/rights.js";
import { VISIBLE_BOARDS_CLAUSE } from "../repositories/boards.js";

/** The types a counting widget can read. */
const SOURCE_TYPES: readonly string[] = [...LIST_WIDGET_TYPES, "mail", "calendar"];

export interface SourceRow {
  id: Id;
  type: string;
  config: string;
  board_id: Id;
  board: string;
  view_id: Id;
  view: string;
}

const visibleOfType = selection<SourceRow>(
  `SELECT w.id, w.type, w.config, b.id AS board_id, b.name AS board,
          v.id AS view_id, v.name AS view
     FROM board_widgets w
     JOIN board_sections s ON s.id = w.section_id
     JOIN boards b ON b.id = s.board_id
     JOIN views v ON v.id = b.view_id
    WHERE ${VISIBLE_BOARDS_CLAUSE("b.id")} AND w.type = @type
    ORDER BY v.position, v.id, b.position, b.id, s.position, s.id, w.position, w.id`,
);

const parsed = (config: string): unknown => {
  try {
    return JSON.parse(config) as unknown;
  } catch {
    return {};
  }
};

/**
 * The widgets of a type this person sees and may use, each key once — the
 * first that holds it.
 */
export const visibleSources = (req: Request, type: string): SourceWidget[] => {
  if (!accessIncludes(widgetAccess(req, type), "view")) return [];
  const seen = new Set<string>();
  return visibleOfType.all({ me: req.user.id, type }).flatMap((row) => {
    const config = parsed(row.config);
    const key = ownKeyOf(row.type, config);
    if (!key || seen.has(key)) return [];
    seen.add(key);
    return [
      {
        id: row.id,
        type: row.type,
        key,
        reference: widgetReference(row.type, config),
        board_id: row.board_id,
        board: row.board,
        view_id: row.view_id,
        view: row.view,
        config,
      },
    ];
  });
};

/**
 * The widgets of a type a counting widget names (SOURCES), among those this
 * person sees: a key held by none of them reads nothing.
 */
export const readSources = (req: Request, type: string, keys: string[]): SourceRow[] => {
  if (!accessIncludes(widgetAccess(req, type), "view")) return [];
  const wanted = new Set(keys);
  const seen = new Set<string>();
  return visibleOfType.all({ me: req.user.id, type }).filter((row) => {
    const key = ownKeyOf(row.type, parsed(row.config));
    if (!wanted.has(key) || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

export const sourceWidgetRoutes = Router();

sourceWidgetRoutes.get("/", (req, res) => {
  const type = String(req.query.type ?? "");
  if (!SOURCE_TYPES.includes(type)) badRequest("Type de widget inconnu");
  res.json(visibleSources(req, type));
});
