// The warehouses of a board (shared, warehouses.ts): entered by hand in its
// "Entrepôts" widgets, each in its own (LIST_KEY), with their labels and
// their widget's countries. They
// follow the permission on their widget type, "Logistique", like the
// contacts.

import { Router } from "express";
import type { Request } from "express";
import {
  WAREHOUSE_FIELD_MAX,
  WAREHOUSE_LIST_TYPE,
  WAREHOUSE_NAME_MAX,
  WAREHOUSE_SETTINGS_DEFAULTS,
  accessIncludes,
} from "@milo/shared";
import type { ContactCountry, Id, Label, Warehouse, WarehouseSettings, WidgetAccess } from "@milo/shared";
import { mutation, selection, transaction } from "../db/query.js";
import { HttpError, badRequest, orNotFound, requireText, toIds } from "../lib/http.js";
import { now } from "../lib/time.js";
import { touch } from "../middleware/events.js";
import { openBoard, requireBoardControl } from "../repositories/boards.js";
import { keyInBoard, listInBoard } from "../repositories/lists.js";
import type { ListScope } from "../repositories/lists.js";
import { countriesOf } from "./contacts.js";
import { widgetRights } from "../repositories/users.js";

const NOT_FOUND = "Entrepôt introuvable";

type WarehouseRow = Omit<Warehouse, "labels">;

/** A short text, trimmed and checked for length. */
const text = (value: unknown, max: number, what: string): string => {
  const read = String(value ?? "").trim();
  if (read.length > max) badRequest(`${what} tient en ${max} caractères`);
  return read;
};

/** The fields a warehouse is written with, read from the request. */
const fieldsOf = (body: Record<string, unknown>) => ({
  name: text(requireText(body.name, "Le champ « Nom » est requis"), WAREHOUSE_NAME_MAX, "Un nom"),
  line1: text(body.line1, WAREHOUSE_FIELD_MAX, "Une adresse"),
  line2: text(body.line2, WAREHOUSE_FIELD_MAX, "Une adresse"),
  postal_code: text(body.postal_code, WAREHOUSE_FIELD_MAX, "Un code postal"),
  city: text(body.city, WAREHOUSE_FIELD_MAX, "Une ville"),
  country: text(body.country, WAREHOUSE_FIELD_MAX, "Un pays"),
});

// --- Reading -----------------------------------------------------------------

const ofBoard = selection<WarehouseRow>(
  "SELECT * FROM warehouses WHERE board_id = ? ORDER BY name COLLATE NOCASE, id",
);
const byId = selection<WarehouseRow>("SELECT * FROM warehouses WHERE id = ?");
const labelsOfBoard = selection<Label & { warehouse_id: Id }>(
  `SELECT k.warehouse_id, l.* FROM warehouse_label_links k
   JOIN warehouse_labels l ON l.id = k.label_id
   JOIN warehouses w ON w.id = k.warehouse_id
   WHERE w.board_id = ? ORDER BY l.position, l.id`,
);

/** A board's warehouses, each with its labels. */
const warehousesOf = (boardId: Id): Warehouse[] => {
  const labels = new Map<Id, Label[]>();
  for (const { warehouse_id, ...label } of labelsOfBoard.all(boardId)) {
    labels.set(warehouse_id, [...(labels.get(warehouse_id) ?? []), label]);
  }
  return ofBoard.all(boardId).map((row) => ({ ...row, labels: labels.get(row.id) ?? [] }));
};

const oneWarehouse = (row: WarehouseRow): Warehouse =>
  warehousesOf(row.board_id).find((w) => w.id === row.id)!;

// --- Writing -----------------------------------------------------------------

const insert = mutation(
  `INSERT INTO warehouses (board_id, list_key, name, line1, line2, postal_code, city, country,
     created_at, updated_at)
   VALUES (@board_id, @list_key, @name, @line1, @line2, @postal_code, @city, @country, @at, @at)`,
);
const update = mutation(
  `UPDATE warehouses SET name = @name, line1 = @line1, line2 = @line2,
     postal_code = @postal_code, city = @city, country = @country, updated_at = @at
   WHERE id = @id`,
);
const remove = mutation("DELETE FROM warehouses WHERE id = ?");

const clearLabels = mutation("DELETE FROM warehouse_label_links WHERE warehouse_id = ?");
// Only a label of the warehouse's widget.
const addLabel = mutation(
  `INSERT OR IGNORE INTO warehouse_label_links (warehouse_id, label_id)
   SELECT x.id, l.id FROM warehouses x
   JOIN warehouse_labels l ON l.board_id = x.board_id AND l.list_key = x.list_key
   WHERE x.id = ? AND l.id = ? AND x.board_id = ?`,
);

type Fields = ReturnType<typeof fieldsOf>;

/** The record and its labels, written together. */
const write = transaction((warehouseId: Id, boardId: Id, fields: Fields, labelIds: Id[]) => {
  update.run({ id: warehouseId, ...fields, at: now() });
  clearLabels.run(warehouseId);
  for (const id of labelIds) addLabel.run(warehouseId, id, boardId);
});

const create = transaction((boardId: Id, listKey: string, fields: Fields, labelIds: Id[]): Id => {
  const { lastInsertRowid } = insert.run({ board_id: boardId, list_key: listKey, ...fields, at: now() });
  const id = Number(lastInsertRowid);
  write(id, boardId, fields, labelIds);
  return id;
});

/** The board, if this person sees it and holds this permission on "Logistique". */
const verifyBoard = (req: Request, boardId: unknown, access: WidgetAccess): Id => {
  if (!accessIncludes(widgetRights(req.user).logistics, access)) {
    throw access === "view"
      ? new HttpError(404, "Introuvable")
      : new HttpError(403, "Vous n'avez pas le droit de modifier ici");
  }
  return openBoard(boardId, req.user).id;
};

/** The warehouse, if this person may act on it this way. */
const openWarehouse = (req: Request, id: unknown, access: WidgetAccess): WarehouseRow => {
  const warehouse = orNotFound(byId.get(id), NOT_FOUND);
  verifyBoard(req, warehouse.board_id, access);
  return warehouse;
};

export const warehouseRoutes = Router();

warehouseRoutes.use(touch("warehouses"));

warehouseRoutes.get("/", (req, res) => {
  const { board } = req.query;
  if (!board) badRequest("Le paramètre board est requis");
  res.json(warehousesOf(verifyBoard(req, board, "view")));
});

warehouseRoutes.post("/", (req, res) => {
  const body = (req.body ?? {}) as Record<string, unknown>;
  if (!body.board_id) badRequest("Le tableau est requis");
  const boardId = verifyBoard(req, body.board_id, "update");
  const id = create(
    boardId,
    // The widget named, if it is one of this board's; otherwise its first.
    keyInBoard(boardId, WAREHOUSE_LIST_TYPE, body.list_key),
    fieldsOf(body),
    toIds(body.label_ids),
  );
  res.status(201).json(oneWarehouse(byId.get(id)!));
});

warehouseRoutes.put("/:id", (req, res) => {
  const existing = openWarehouse(req, req.params.id, "update");
  const body = (req.body ?? {}) as Record<string, unknown>;
  write(existing.id, existing.board_id, fieldsOf(body), toIds(body.label_ids));
  res.json(oneWarehouse(byId.get(existing.id)!));
});

warehouseRoutes.delete("/:id", (req, res) => {
  const existing = openWarehouse(req, req.params.id, "delete");
  remove.run(existing.id);
  res.status(204).end();
});

// --- A widget's lists -------------------------------------------------------

const readSettings = selection<{ countries: string }>(
  "SELECT countries FROM board_warehouse_settings WHERE board_id = ? AND list_key = ?",
);
const ensureSettings = mutation(
  "INSERT OR IGNORE INTO board_warehouse_settings (board_id, list_key) VALUES (?, ?)",
);
const writeCountries = mutation(
  "UPDATE board_warehouse_settings SET countries = ? WHERE board_id = ? AND list_key = ?",
);

/** An Entrepôts widget's lists; without a row, their defaults. */
const settingsOf = (scope: ListScope): WarehouseSettings => {
  const row = readSettings.get(scope.board, scope.list);
  if (!row) return WAREHOUSE_SETTINGS_DEFAULTS;
  try {
    const countries = JSON.parse(row.countries) as unknown;
    return { countries: Array.isArray(countries) ? (countries as ContactCountry[]) : [] };
  } catch {
    return { countries: [] };
  }
};

const saveSettings = transaction((scope: ListScope, countries: ContactCountry[]) => {
  ensureSettings.run(scope.board, scope.list);
  writeCountries.run(JSON.stringify(countries), scope.board, scope.list);
});

/**
 * The lists of an Entrepôts widget: not its configuration but its own data
 * (ListScope), named by "?board=&list=".
 */
export const warehouseSettingsRoutes = Router();

warehouseSettingsRoutes.use(touch("warehouses"));

warehouseSettingsRoutes.get("/", (req, res) => {
  const board = verifyBoard(req, req.query.board, "view");
  res.json(settingsOf(listInBoard(board, WAREHOUSE_LIST_TYPE, req.query.list)));
});

warehouseSettingsRoutes.put("/", (req, res) => {
  const board = openBoard(verifyBoard(req, req.query.board, "update"), req.user);
  requireBoardControl(board, req.user);
  const scope = listInBoard(board.id, WAREHOUSE_LIST_TYPE, req.query.list);
  const body = (req.body ?? {}) as Record<string, unknown>;
  if (body.countries === undefined) badRequest("Rien à enregistrer");
  saveSettings(scope, countriesOf(body.countries));
  res.json(settingsOf(scope));
});
