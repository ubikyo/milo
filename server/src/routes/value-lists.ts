// The items of a board's "Liste" widgets (shared, value-lists.ts), each its
// own (LIST_KEY) — a name each, in their order, under an id the server draws
// when it is added. They follow the permission on their widget type,
// "Objets": anyone who sees the board reads them — a widget that offers them
// too —, "Modifier" writes them, "Supprimer" deletes one.

import { randomUUID } from "node:crypto";
import { Router } from "express";
import type { Request } from "express";
import { VALUE_ITEMS_MAX, VALUE_LIST_TYPE, VALUE_NAME_MAX, accessIncludes } from "@milo/shared";
import type { Id, ValueItem, WidgetAccess } from "@milo/shared";
import { mutation, selection } from "../db/query.js";
import { HttpError, badRequest } from "../lib/http.js";
import { touch } from "../middleware/events.js";
import { openBoard } from "../repositories/boards.js";
import { listInBoard } from "../repositories/lists.js";
import type { ListScope } from "../repositories/lists.js";
import { widgetRights } from "../repositories/users.js";

/** The board, if this person may act on its lists this way. */
const verifyBoard = (req: Request, boardId: unknown, access: WidgetAccess): Id => {
  if (!accessIncludes(widgetRights(req.user).objects, access)) {
    throw access === "view"
      ? new HttpError(404, "Introuvable")
      : new HttpError(403, "Vous n'avez pas le droit de modifier ici");
  }
  return openBoard(boardId, req.user).id;
};

/**
 * The items received, in their order: each a name; an item already there
 * keeps its id, a new one — or one whose id is unknown — receives one.
 */
const itemsOf = (received: unknown, before: ValueItem[]): ValueItem[] => {
  if (!Array.isArray(received)) badRequest("La liste est une liste");
  const known = new Set(before.map((i) => i.id));
  const seen = new Set<string>();
  const items = (received as unknown[]).map((entry) => {
    const fields = (entry ?? {}) as Record<string, unknown>;
    const name = String(fields.name ?? "").trim();
    if (!name) badRequest("Chaque ligne demande son nom");
    if (name.length > VALUE_NAME_MAX) badRequest(`Un nom tient en ${VALUE_NAME_MAX} caractères`);
    const id = typeof fields.id === "string" && known.has(fields.id) && !seen.has(fields.id) ? fields.id : randomUUID();
    seen.add(id);
    return { id, name };
  });
  if (items.length > VALUE_ITEMS_MAX) badRequest(`Une liste tient en ${VALUE_ITEMS_MAX} lignes`);
  return items;
};

const read = selection<{ items: string }>(
  "SELECT items FROM board_value_lists WHERE board_id = ? AND list_key = ?",
);
const write = mutation(
  `INSERT INTO board_value_lists (board_id, list_key, items) VALUES (?, ?, ?)
   ON CONFLICT (board_id, list_key) DO UPDATE SET items = excluded.items`,
);

/**
 * A Liste widget's items; none without a row. Those recorded before the ids
 * receive theirs, kept at once: an id never changes.
 */
const itemsOfList = (scope: ListScope): ValueItem[] => {
  const row = read.get(scope.board, scope.list);
  if (!row) return [];
  let stored: unknown;
  try {
    stored = JSON.parse(row.items);
  } catch {
    return [];
  }
  if (!Array.isArray(stored)) return [];
  const items = stored as Partial<ValueItem>[];
  if (items.every((i) => typeof i.id === "string")) return items as ValueItem[];
  const named = items.map((i) => ({ id: typeof i.id === "string" ? i.id : randomUUID(), name: String(i.name ?? "") }));
  write.run(scope.board, scope.list, JSON.stringify(named));
  return named;
};

/** A Liste widget's items: its own data (ListScope), named by "?board=&list=". */
export const valueListRoutes = Router();

valueListRoutes.use(touch("value-lists"));

valueListRoutes.get("/", (req, res) => {
  const board = verifyBoard(req, req.query.board, "view");
  res.json(itemsOfList(listInBoard(board, VALUE_LIST_TYPE, req.query.list)));
});

/** The list received replaces the widget's entirely. */
valueListRoutes.put("/", (req, res) => {
  const scope = listInBoard(verifyBoard(req, req.query.board, "update"), VALUE_LIST_TYPE, req.query.list);
  write.run(scope.board, scope.list, JSON.stringify(itemsOf(req.body, itemsOfList(scope))));
  res.json(itemsOfList(scope));
});
