// The lists of a board's declared asset widgets, kind by kind (shared,
// declared-assets.ts): categories, suppliers, makers, and products with their
// category and maker — device types, brands and models; software types,
// publishers and applications. They are not a widget's configuration but the
// board's: every widget of the kind on the board shares them, as its labels.
// Like those, they follow the permission on the widget type.

import { Router } from "express";
import type { Request } from "express";
import {
  DECLARED_ASSET_EXTRA_LISTS,
  DECLARED_ASSET_EXTRA_LIST_DEFAULTS,
  DECLARED_ASSET_LISTS,
  DECLARED_ASSET_NAME_MAX,
  DECLARED_ASSET_RESOURCES,
  DECLARED_ASSET_SUPPLIER,
  DECLARED_ASSET_WORDS,
  accessIncludes,
  capitalized,
} from "@milo/shared";
import type {
  DeclaredAssetEntry,
  DeclaredAssetExtraList,
  DeclaredAssetKind,
  DeclaredAssetLocation,
  DeclaredAssetProduct,
  DeclaredAssetSettings,
  Id,
} from "@milo/shared";
import { declaredAssetTables } from "../db/declared-asset-tables.js";
import { mutation, selection, transaction } from "../db/query.js";
import type { Mutation } from "../db/query.js";
import { HttpError, badRequest } from "../lib/http.js";
import { touch } from "../middleware/events.js";
import { openBoard, requireBoardControl } from "../repositories/boards.js";
import { widgetRights } from "../repositories/users.js";

type Lists = Record<(typeof DECLARED_ASSET_LISTS)[number] | DeclaredAssetExtraList, string>;

const parsed = <T>(saved: string | undefined): T[] => {
  if (!saved) return [];
  try {
    const list = JSON.parse(saved) as unknown;
    return Array.isArray(list) ? (list as T[]) : [];
  } catch {
    return [];
  }
};

/** A name, trimmed and checked for length. */
const nameOf = (entry: unknown, field: "name" | "category" | "maker" = "name"): string => {
  const name = String((entry as Record<string, unknown> | null)?.[field] ?? "").trim();
  if (name.length > DECLARED_ASSET_NAME_MAX) {
    badRequest(`Un nom tient en ${DECLARED_ASSET_NAME_MAX} caractères`);
  }
  return name;
};

/**
 * A list of names: empty rows are left out, a name appears only once, case
 * aside. Its noun names it in the messages.
 */
const readEntries = (received: unknown, what: { titles: string }): DeclaredAssetEntry[] => {
  if (!Array.isArray(received)) badRequest(`La liste des ${what.titles.toLowerCase()} est une liste`);
  const seen = new Set<string>();
  const list: DeclaredAssetEntry[] = [];
  for (const entry of received as unknown[]) {
    const name = nameOf(entry);
    if (!name) continue;
    const key = name.toLowerCase();
    if (seen.has(key)) badRequest(`« ${name} » figure deux fois`);
    seen.add(key);
    list.push({ name });
  }
  return list;
};

/** The extra lists of names, as their messages name them. */
const EXTRA_ENTRY_LISTS: Partial<Record<DeclaredAssetExtraList, { titles: string }>> = {
  identification_types: { titles: "Types d'identification" },
  license_info_types: { titles: "Types d'informations de licence" },
};

/** A place's id, as the client draws it. */
const LOCATION_ID_MAX = 64;

/** How many places a board's locations tree holds at most. */
const LOCATIONS_MAX = 1000;

/**
 * The locations tree, stored flat: each place has an id of its own and a
 * name, and its parent — when it has one — comes before it. Two places of the
 * same parent may share a name: their ids tell them apart. Empty rows are left
 * out, with the places under them.
 */
const readLocations = (received: unknown): DeclaredAssetLocation[] => {
  if (!Array.isArray(received)) badRequest("Les emplacements sont une liste");
  const kept = new Set<string>();
  const list: DeclaredAssetLocation[] = [];
  for (const entry of received as unknown[]) {
    const row = (entry ?? {}) as Record<string, unknown>;
    const id = String(row.id ?? "").trim();
    if (!id || id.length > LOCATION_ID_MAX) badRequest("Emplacement illisible");
    if (kept.has(id)) badRequest("Un emplacement figure deux fois");
    const parent = row.parent == null || row.parent === "" ? null : String(row.parent);
    // Under a place left out, or not yet seen: it goes too.
    if (parent !== null && !kept.has(parent)) continue;
    const name = nameOf(row);
    if (!name) continue;
    kept.add(id);
    list.push({ id, parent, name });
  }
  if (list.length > LOCATIONS_MAX) badRequest(`Un tableau tient en ${LOCATIONS_MAX} emplacements`);
  return list;
};

/** Reads a received extra list. */
const readExtraList = (list: DeclaredAssetExtraList, received: unknown) =>
  list === "locations" ? readLocations(received) : readEntries(received, EXTRA_ENTRY_LISTS[list]!);

/** The names of a list, by their lowercase: a product's are found case aside. */
const byName = (entries: DeclaredAssetEntry[]) =>
  new Map(entries.map((e) => [e.name.toLowerCase(), e.name]));

/** One kind's routes: "/api/<asset>-settings". */
export const declaredAssetSettingsRoutes = (kind: DeclaredAssetKind): Router => {
  const { settings } = declaredAssetTables(kind);
  const { category, maker, product } = DECLARED_ASSET_WORDS[kind];

  // The kind's extra lists, after the others: their column names come from
  // DECLARED_ASSET_EXTRA_LISTS, never from a request.
  const extraLists = DECLARED_ASSET_EXTRA_LISTS[kind];
  const read = selection<Partial<Lists>>(
    `SELECT categories, suppliers, makers, products${extraLists.map((l) => `, ${l}`).join("")}
     FROM ${settings} WHERE board_id = ?`,
  );
  const ensure = mutation(`INSERT OR IGNORE INTO ${settings} (board_id) VALUES (?)`);
  // The column names come from DECLARED_ASSET_LISTS, never from a request.
  const writers = Object.fromEntries(
    [...DECLARED_ASSET_LISTS, ...extraLists].map((list) => [
      list,
      mutation(`UPDATE ${settings} SET ${list} = ? WHERE board_id = ?`),
    ]),
  ) as Record<keyof Lists, Mutation>;

  const settingsOf = (boardId: Id): DeclaredAssetSettings => {
    const row = read.get(boardId);
    return {
      categories: parsed<DeclaredAssetEntry>(row?.categories),
      suppliers: parsed<DeclaredAssetEntry>(row?.suppliers),
      makers: parsed<DeclaredAssetEntry>(row?.makers),
      products: parsed<DeclaredAssetProduct>(row?.products).map((p) => ({
        ...p,
        category: p.category ?? "",
      })),
      // A board without a row has its extra lists' defaults.
      ...Object.fromEntries(
        extraLists.map((list) => [
          list,
          row ? parsed(row[list]) : DECLARED_ASSET_EXTRA_LIST_DEFAULTS[list],
        ]),
      ),
    };
  };

  /**
   * The board named by "?board=", if this person sees it — and, to change
   * its lists, may modify them.
   */
  const verifyBoard = (req: Request, write: boolean): Id => {
    if (write && !accessIncludes(widgetRights(req.user)[kind], "update")) {
      throw new HttpError(403, "Vous n'avez pas le droit de modifier ici");
    }
    const board = openBoard(req.query.board, req.user);
    if (write) requireBoardControl(board, req.user);
    return board.id;
  };

  /**
   * The products: each names one of the categories and one of the makers,
   * and appears once per maker. Empty rows are left out.
   */
  const readProducts = (
    received: unknown,
    categories: DeclaredAssetEntry[],
    makers: DeclaredAssetEntry[],
  ): DeclaredAssetProduct[] => {
    if (!Array.isArray(received)) {
      badRequest(`La liste des ${product.titles.toLowerCase()} est une liste`);
    }
    const knownCategories = byName(categories);
    const knownMakers = byName(makers);
    const seen = new Set<string>();
    const list: DeclaredAssetProduct[] = [];
    for (const entry of received as unknown[]) {
      const name = nameOf(entry);
      const categoryName = nameOf(entry, "category");
      const makerName = nameOf(entry, "maker");
      if (!name && !categoryName && !makerName) continue;
      if (!categoryName) badRequest(`${capitalized(product.the)} « ${name} » n'a pas ${category.of}`);
      if (!makerName) badRequest(`${capitalized(product.the)} « ${name} » n'a pas ${maker.of}`);
      if (!name) badRequest(`${capitalized(product.a)} ${maker.ofThe} « ${makerName} » n'a pas de nom`);
      const knownCategory = knownCategories.get(categoryName.toLowerCase());
      if (!knownCategory) badRequest(`${capitalized(category.the)} « ${categoryName} » n'existe pas`);
      const knownMaker = knownMakers.get(makerName.toLowerCase());
      if (!knownMaker) badRequest(`${capitalized(maker.the)} « ${makerName} » n'existe pas`);
      const key = `${makerName.toLowerCase()}\n${name.toLowerCase()}`;
      if (seen.has(key)) {
        badRequest(`${capitalized(product.the)} « ${knownMaker} ${name} » figure deux fois`);
      }
      seen.add(key);
      list.push({ category: knownCategory!, maker: knownMaker!, name });
    }
    return list;
  };

  const save = transaction((boardId: Id, lists: Partial<DeclaredAssetSettings>) => {
    ensure.run(boardId);
    for (const list of [...DECLARED_ASSET_LISTS, ...extraLists]) {
      const value = lists[list];
      if (value) writers[list].run(JSON.stringify(value), boardId);
    }
  });

  const routes = Router();

  // The lists name what the assets show — a renamed maker, a location's
  // path —: their lists re-read with them.
  routes.use(touch(DECLARED_ASSET_RESOURCES[kind]));

  routes.get("/", (req, res) => {
    res.json(settingsOf(verifyBoard(req, false)));
  });

  /**
   * Each received list is replaced entirely, in one go; a list that is not
   * sent stays as it is. The products are checked against the categories
   * and makers as they will be once saved.
   */
  routes.put("/", (req, res) => {
    const boardId = verifyBoard(req, true);
    const body = (req.body ?? {}) as Record<string, unknown>;
    if ([...DECLARED_ASSET_LISTS, ...extraLists].every((list) => body[list] === undefined)) {
      badRequest("Rien à enregistrer");
    }
    const current = settingsOf(boardId);
    // Everything is checked before writing: a rejected list does not leave
    // the others half saved.
    const categories =
      body.categories === undefined ? undefined : readEntries(body.categories, category);
    const suppliers =
      body.suppliers === undefined ? undefined : readEntries(body.suppliers, DECLARED_ASSET_SUPPLIER);
    const makers = body.makers === undefined ? undefined : readEntries(body.makers, maker);
    // New categories or makers may leave products without theirs: those are
    // checked too.
    const products =
      body.products === undefined && makers === undefined && categories === undefined
        ? undefined
        : readProducts(
            body.products ?? current.products,
            categories ?? current.categories,
            makers ?? current.makers,
          );
    const extras = Object.fromEntries(
      extraLists
        .filter((list) => body[list] !== undefined)
        .map((list) => [list, readExtraList(list, body[list])]),
    );
    save(boardId, { categories, suppliers, makers, products, ...extras });
    res.json(settingsOf(boardId));
  });

  return routes;
};
