// The locations of a board (shared, locations.ts): entered by hand in its
// "Emplacements" widgets, each in its own (LIST_KEY), with their labels,
// their warehouse and their places — no name of their own: the table's
// "name" column stays empty. They follow the permission on their
// widget type, "Logistique", like the warehouses.
//
// A place's code is typed by hand: required, the server checks it is given
// once among the places of the same level.

import { Router } from "express";
import type { Request } from "express";
import {
  DEFAULT_LOCATION_PLACE_TYPE,
  LOCATION_CODE_MAX,
  LOCATION_LIST_TYPE,
  LOCATION_PLACES_MAX,
  LOCATION_PLACE_NAME_MAX,
  accessIncludes,
  isLocationPlaceType,
  locationPlaceTypeLabel,
  locationTypesUnder,
} from "@milo/shared";
import type {
  Id,
  Label,
  LabelTestPrint,
  Location,
  LocationPlace,
  LocationPlaceType,
  WidgetAccess,
} from "@milo/shared";
import { mutation, selection, transaction } from "../db/query.js";
import { HttpError, badRequest, fail, orNotFound, toIds } from "../lib/http.js";
import { printZpl } from "../lib/zebra.js";
import { now } from "../lib/time.js";
import { touch } from "../middleware/events.js";
import { openBoard } from "../repositories/boards.js";
import { keyInBoard } from "../repositories/lists.js";
import { widgetRights } from "../repositories/users.js";
import { filled, groupsOf, joined, printerFor, templatesOf } from "./label-templates.js";

const NOT_FOUND = "Fiche d'emplacements introuvable";

/** A place's id, drawn by the client: a UUID, or as long. */
const PLACE_ID_MAX = 64;

type LocationRow = Omit<Location, "labels" | "places"> & { name: string; places: string };

const parsedPlaces = (saved: string): LocationPlace[] => {
  try {
    const list = JSON.parse(saved) as unknown;
    return Array.isArray(list) ? (list as LocationPlace[]) : [];
  } catch {
    return [];
  }
};

// --- Reading -----------------------------------------------------------------

const SELECT = `SELECT l.*, COALESCE(w.name, '') AS warehouse_name FROM locations l
  LEFT JOIN warehouses w ON w.id = l.warehouse_id`;

const ofBoard = selection<LocationRow>(
  `${SELECT} WHERE l.board_id = ? ORDER BY warehouse_name COLLATE NOCASE, l.id`,
);
const byId = selection<LocationRow>(`${SELECT} WHERE l.id = ?`);
const labelsOfBoard = selection<Label & { location_id: Id }>(
  `SELECT k.location_id, l.*, g.name AS group_name FROM location_label_links k
   JOIN location_labels l ON l.id = k.label_id
   LEFT JOIN location_label_groups g ON g.id = l.group_id
   JOIN locations x ON x.id = k.location_id
   WHERE x.board_id = ? ORDER BY l.position, l.id`,
);
const warehouseExists = selection<{ id: Id }>("SELECT id FROM warehouses WHERE id = ?");

/** A board's locations, each with its labels and its places. */
const locationsOf = (boardId: Id): Location[] => {
  const labels = new Map<Id, Label[]>();
  for (const { location_id, ...label } of labelsOfBoard.all(boardId)) {
    labels.set(location_id, [...(labels.get(location_id) ?? []), label]);
  }
  return ofBoard.all(boardId).map(({ name: _unused, ...row }) => ({
    ...row,
    places: parsedPlaces(row.places),
    labels: labels.get(row.id) ?? [],
  }));
};

const oneLocation = (row: LocationRow): Location =>
  locationsOf(row.board_id).find((l) => l.id === row.id)!;

// --- The places --------------------------------------------------------------

/**
 * The places, as received: a parent before its children, each named and
 * typed, each with its code, given once among the places of the same level —
 * under the same parent.
 */
const placesOf = (received: unknown): LocationPlace[] => {
  if (received === undefined) return [];
  if (!Array.isArray(received)) badRequest("Les emplacements sont une liste");
  const entries = received as unknown[];
  if (entries.length > LOCATION_PLACES_MAX) badRequest(`Une fiche tient en ${LOCATION_PLACES_MAX} emplacements`);
  const seen = new Map<string, LocationPlaceType>();
  const codes = new Set<string>();
  return entries.map((entry) => {
    const row = (entry ?? {}) as Record<string, unknown>;
    const id = String(row.id ?? "").trim();
    if (!id || id.length > PLACE_ID_MAX || seen.has(id)) badRequest("Identifiant d'emplacement illisible");
    const parent = row.parent == null ? null : String(row.parent);
    if (parent !== null && !seen.has(parent)) badRequest("Un emplacement est placé sous un autre qui n'existe pas");
    const name = String(row.name ?? "").trim();
    if (!name) badRequest("Chaque emplacement doit avoir un nom");
    if (name.length > LOCATION_PLACE_NAME_MAX) badRequest(`Un nom tient en ${LOCATION_PLACE_NAME_MAX} caractères`);
    const type = isLocationPlaceType(row.type) ? row.type : DEFAULT_LOCATION_PLACE_TYPE;
    // Its parent's type decides the types it may take.
    const parentType = parent === null ? null : seen.get(parent)!;
    if (!locationTypesUnder(parentType).includes(type)) {
      badRequest(
        `L'emplacement « ${name} » (${locationPlaceTypeLabel(type)}) ne peut pas être sous un emplacement ${locationPlaceTypeLabel(parentType!)}`,
      );
    }
    seen.set(id, type);
    const code = String(row.code ?? "").trim();
    if (!code) badRequest(`L'emplacement « ${name} » doit avoir un code`);
    if (code.length > LOCATION_CODE_MAX) badRequest(`Un code tient en ${LOCATION_CODE_MAX} caractères`);
    const level = `${parent ?? ""}\n${code}`;
    if (codes.has(level)) badRequest(`Le code « ${code} » est déjà donné à un emplacement du même niveau`);
    codes.add(level);
    return { id, parent, name, type, code };
  });
};

// --- Writing -----------------------------------------------------------------

/** The fields a record is written with, read from the request. */
const fieldsOf = (body: Record<string, unknown>) => {
  const warehouse = body.warehouse_id == null || body.warehouse_id === "" ? null : Number(body.warehouse_id);
  if (warehouse !== null && !warehouseExists.get(warehouse)) badRequest("Entrepôt introuvable");
  return { warehouse_id: warehouse };
};

type Fields = ReturnType<typeof fieldsOf>;

const insert = mutation(
  `INSERT INTO locations (board_id, list_key, name, warehouse_id, places, created_at, updated_at)
   VALUES (@board_id, @list_key, '', @warehouse_id, '[]', @at, @at)`,
);
const update = mutation(
  `UPDATE locations SET warehouse_id = @warehouse_id, places = @places, updated_at = @at
   WHERE id = @id`,
);
const remove = mutation("DELETE FROM locations WHERE id = ?");

const clearLabels = mutation("DELETE FROM location_label_links WHERE location_id = ?");
// Only a label of the record's widget.
const addLabel = mutation(
  `INSERT OR IGNORE INTO location_label_links (location_id, label_id)
   SELECT x.id, l.id FROM locations x
   JOIN location_labels l ON l.board_id = x.board_id AND l.list_key = x.list_key
   WHERE x.id = ? AND l.id = ? AND x.board_id = ?`,
);

/** The record, its places and its labels, written together. */
const write = transaction((row: LocationRow, fields: Fields, places: unknown, labelIds: Id[]) => {
  const checked = placesOf(places);
  update.run({ id: row.id, ...fields, places: JSON.stringify(checked), at: now() });
  clearLabels.run(row.id);
  for (const id of labelIds) addLabel.run(row.id, id, row.board_id);
});

const create = transaction(
  (boardId: Id, listKey: string, fields: Fields, places: unknown, labelIds: Id[]): Id => {
    const { lastInsertRowid } = insert.run({ board_id: boardId, list_key: listKey, ...fields, at: now() });
    const id = Number(lastInsertRowid);
    write(byId.get(id)!, fields, places, labelIds);
    return id;
  },
);

/** The board, if this person sees it and holds this permission on "Logistique". */
const verifyBoard = (req: Request, boardId: unknown, access: WidgetAccess): Id => {
  if (!accessIncludes(widgetRights(req.user).logistics, access)) {
    throw access === "view"
      ? new HttpError(404, "Introuvable")
      : new HttpError(403, "Vous n'avez pas le droit de modifier ici");
  }
  return openBoard(boardId, req.user).id;
};

/** The record, if this person may act on it this way. */
const openLocation = (req: Request, id: unknown, access: WidgetAccess): Location => {
  const row = orNotFound(byId.get(id), NOT_FOUND);
  verifyBoard(req, row.board_id, access);
  return oneLocation(row);
};

export const locationRoutes = Router();

locationRoutes.use(touch("locations"));

locationRoutes.get("/", (req, res) => {
  const { board } = req.query;
  if (!board) badRequest("Le paramètre board est requis");
  res.json(locationsOf(verifyBoard(req, board, "view")));
});

locationRoutes.post("/", (req, res) => {
  const body = (req.body ?? {}) as Record<string, unknown>;
  if (!body.board_id) badRequest("Le tableau est requis");
  const boardId = verifyBoard(req, body.board_id, "update");
  const id = create(
    boardId,
    // The widget named, if it is one of this board's; otherwise its first.
    keyInBoard(boardId, LOCATION_LIST_TYPE, body.list_key),
    fieldsOf(body),
    body.places,
    toIds(body.label_ids),
  );
  res.status(201).json(oneLocation(byId.get(id)!));
});

locationRoutes.put("/:id", (req, res) => {
  const existing = orNotFound(byId.get(req.params.id), NOT_FOUND);
  verifyBoard(req, existing.board_id, "update");
  const body = (req.body ?? {}) as Record<string, unknown>;
  write(existing, fieldsOf(body), body.places, toIds(body.label_ids));
  res.json(oneLocation(byId.get(existing.id)!));
});

/**
 * A place's label: the template of this name, among those of the record's
 * widget, filled with the place — its code, its name, its type, its path —
 * and, for each group, the record's labels in it.
 */
locationRoutes.post("/:id/places/:place/print", (req, res, next) => {
  const location = openLocation(req, req.params.id, "view");
  const place = location.places.find((p) => p.id === req.params.place) ?? fail(404, "Emplacement introuvable");
  const scope = { board: location.board_id, list: location.list_key };
  const name = String(req.body?.name ?? "");
  const template =
    templatesOf("location", scope).templates.find((t) => t.name === name) ??
    fail(404, `Le modèle « ${name} » n'existe plus`);
  if (!template.zpl.trim()) badRequest(`Le modèle « ${name} » est vide`);
  const printer = printerFor(template.paper_format_id);
  const byId = new Map(location.places.map((p) => [p.id, p]));
  const path: string[] = [];
  for (let at: LocationPlace | undefined = place; at; at = at.parent ? byId.get(at.parent) : undefined) {
    path.unshift(at.name);
  }
  const groups = groupsOf("location", scope).map((g) => ({
    name: g.name,
    labels: location.labels.filter((l) => l.group_name === g.name).map((l) => l.name),
  }));
  const own = {
    "location.code": place.code,
    "location.name": place.name,
    "location.type": locationPlaceTypeLabel(place.type),
    "location.path": path.join(" > "),
  };
  printZpl(printer, filled(template.zpl, own, groups, joined))
    .then(() => {
      const sent: LabelTestPrint = { printer: printer.name };
      res.json(sent);
    })
    .catch(next);
});

locationRoutes.delete("/:id", (req, res) => {
  const existing = orNotFound(byId.get(req.params.id), NOT_FOUND);
  verifyBoard(req, existing.board_id, "delete");
  remove.run(existing.id);
  res.status(204).end();
});
