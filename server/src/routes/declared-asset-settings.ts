// The lists of a declared asset widget (shared, declared-assets.ts):
// categories, suppliers, makers, and products with their category and maker —
// device types, brands and models; software types, publishers and
// applications. They are not its configuration but its own data (ListScope),
// as its labels. Like those, they follow the permission on the widget type.

import { Router } from "express";
import type { Request } from "express";
import {
  DECLARED_ASSET_EXTRA_LISTS,
  DECLARED_ASSET_EXTRA_LIST_DEFAULTS,
  DECLARED_ASSET_LISTS,
  DECLARED_ASSET_LIST_SOURCES,
  DECLARED_ASSET_NAME_MAX,
  DECLARED_ASSET_RESOURCES,
  DECLARED_ASSET_SUPPLIER,
  DECLARED_ASSET_WORDS,
  accessIncludes,
  capitalized,
  declaredAssetListType,
  sourcesOf,
} from "@milo/shared";
import type {
  DeclaredAssetEntry,
  DeclaredAssetExtraList,
  DeclaredAssetKind,
  DeclaredAssetLocation,
  DeclaredAssetProduct,
  DeclaredAssetSettings,
  DeclaredAssetSourcedList,
} from "@milo/shared";
import { declaredAssetTables } from "../db/declared-asset-tables.js";
import { mutation, selection, transaction } from "../db/query.js";
import type { Mutation } from "../db/query.js";
import { HttpError, badRequest } from "../lib/http.js";
import { touch, touchNow } from "../middleware/events.js";
import { openBoard, requireBoardControl } from "../repositories/boards.js";
import { listInBoard } from "../repositories/lists.js";
import type { ListScope } from "../repositories/lists.js";
import { widgetRights } from "../repositories/users.js";
import { addValueListNames, valueListNames } from "../repositories/value-list-names.js";

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
const nameOf = (entry: unknown, field: "name" | "maker" = "name"): string => {
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

/** A node's id, as the client draws it. */
const NODE_ID_MAX = 64;

/** How many nodes a board's tree — its locations, its categories — holds at most. */
const NODES_MAX = 1000;

/** How a tree's messages name it, and its nodes; whether its roots may be tied to a label. */
const LOCATIONS_TREE = {
  titles: "Les emplacements",
  one: "Un emplacement",
  many: "emplacements",
  withLabels: true,
};

/**
 * A tree — the locations, the categories —, stored flat: each node has an id
 * of its own and a name, and its parent — when it has one — comes before it.
 * Two nodes of the same parent may share a name: their ids tell them apart.
 * Empty rows are left out, with the nodes under them. A tree that allows it
 * keeps the label a root is tied to, by its id.
 */
const readTree = (
  received: unknown,
  words: { titles: string; one: string; many: string; withLabels?: boolean },
): DeclaredAssetLocation[] => {
  if (!Array.isArray(received)) badRequest(`${words.titles} sont une liste`);
  const kept = new Set<string>();
  const list: DeclaredAssetLocation[] = [];
  for (const entry of received as unknown[]) {
    const row = (entry ?? {}) as Record<string, unknown>;
    const id = String(row.id ?? "").trim();
    if (!id || id.length > NODE_ID_MAX) badRequest(`${words.one} est illisible`);
    if (kept.has(id)) badRequest(`${words.one} figure deux fois`);
    const parent = row.parent == null || row.parent === "" ? null : String(row.parent);
    // Under a node left out, or not yet seen: it goes too.
    if (parent !== null && !kept.has(parent)) continue;
    const name = nameOf(row);
    if (!name) continue;
    kept.add(id);
    const label = Number(row.label);
    list.push(
      words.withLabels && parent === null && Number.isInteger(label) && label > 0
        ? { id, parent, name, label }
        : { id, parent, name },
    );
  }
  if (list.length > NODES_MAX) badRequest(`Un tableau tient en ${NODES_MAX} ${words.many}`);
  return list;
};

/** Reads a received extra list. */
const readExtraList = (list: DeclaredAssetExtraList, received: unknown) =>
  list === "locations"
    ? readTree(received, LOCATIONS_TREE)
    : readEntries(received, EXTRA_ENTRY_LISTS[list]!);

/** The names of a list, by their lowercase: a product's are found case aside. */
const byName = (entries: DeclaredAssetEntry[]) =>
  new Map(entries.map((e) => [e.name.toLowerCase(), e.name]));

/** One kind's routes: "/api/<asset>-settings". */
export const declaredAssetSettingsRoutes = (kind: DeclaredAssetKind): Router => {
  const { settings } = declaredAssetTables(kind);
  const { category, maker, product } = DECLARED_ASSET_WORDS[kind];
  const categoriesTree = {
    titles: capitalized(`les ${category.titles.toLowerCase()}`),
    one: capitalized(category.a),
    many: category.titles.toLowerCase(),
  };

  // The kind's extra lists, after the others: their column names come from
  // DECLARED_ASSET_EXTRA_LISTS, never from a request.
  const extraLists = DECLARED_ASSET_EXTRA_LISTS[kind];
  const read = selection<Partial<Lists>>(
    `SELECT categories, suppliers, makers, products${extraLists.map((l) => `, ${l}`).join("")}
     FROM ${settings} WHERE board_id = ? AND list_key = ?`,
  );
  const ensure = mutation(`INSERT OR IGNORE INTO ${settings} (board_id, list_key) VALUES (?, ?)`);
  // The column names come from DECLARED_ASSET_LISTS, never from a request.
  const writers = Object.fromEntries(
    [...DECLARED_ASSET_LISTS, ...extraLists].map((list) => [
      list,
      mutation(`UPDATE ${settings} SET ${list} = ? WHERE board_id = ? AND list_key = ?`),
    ]),
  ) as Record<keyof Lists, Mutation>;

  const configOf = selection<{ config: string }>(
    `SELECT w.config FROM board_widgets w JOIN board_sections s ON s.id = w.section_id
     WHERE s.board_id = ? AND w.type = '${declaredAssetListType(kind)}' AND json_valid(w.config)
       AND json_extract(w.config, '$.list_key') = ?
     ORDER BY w.id LIMIT 1`,
  );

  /** The Liste widgets each list the widget takes from them comes from (DECLARED_ASSET_LIST_SOURCES), by key. */
  const sourceKeys = (scope: ListScope): Partial<Record<DeclaredAssetSourcedList, string[]>> => {
    const row = configOf.get(scope.board, scope.list);
    let config: unknown = {};
    try {
      config = row ? (JSON.parse(row.config) as unknown) : {};
    } catch {
      config = {};
    }
    return Object.fromEntries(
      Object.entries(DECLARED_ASSET_LIST_SOURCES[kind]).flatMap(([list, field]) => {
        const keys = sourcesOf(config, field);
        return keys.length ? [[list, keys]] : [];
      }),
    );
  };

  /** Those lists: their Liste widgets' names, in place of the widget's own — none named, none. */
  const sourcedLists = (scope: ListScope): Partial<Record<DeclaredAssetSourcedList, DeclaredAssetEntry[]>> =>
    Object.fromEntries(
      Object.entries(sourceKeys(scope)).map(([list, keys]) => [
        list,
        valueListNames(keys).map((name) => ({ name })),
      ]),
    );

  const settingsOf = (scope: ListScope): DeclaredAssetSettings => ({
    ...ownSettingsOf(scope),
    ...sourcedLists(scope),
  });

  /** The widget's own lists, as it records them. */
  const ownSettingsOf = (scope: ListScope): DeclaredAssetSettings => {
    const row = read.get(scope.board, scope.list);
    return {
      categories: parsed<DeclaredAssetLocation>(row?.categories),
      suppliers: parsed<DeclaredAssetEntry>(row?.suppliers),
      makers: parsed<DeclaredAssetEntry>(row?.makers),
      products: parsed<DeclaredAssetProduct>(row?.products).map((p) => ({
        ...p,
        category: p.category ?? "",
      })),
      // A widget without a row has its extra lists' defaults.
      ...Object.fromEntries(
        extraLists.map((list) => [
          list,
          row ? parsed(row[list]) : DECLARED_ASSET_EXTRA_LIST_DEFAULTS[list],
        ]),
      ),
    };
  };

  /**
   * The widget named by "?board=&list=", if this person sees its board — and,
   * to change its lists, may modify them.
   */
  const verifyList = (req: Request, write: boolean): ListScope => {
    if (write && !accessIncludes(widgetRights(req.user)[kind], "update")) {
      throw new HttpError(403, "Vous n'avez pas le droit de modifier ici");
    }
    const board = openBoard(req.query.board, req.user);
    if (write) requireBoardControl(board, req.user);
    return listInBoard(board.id, declaredAssetListType(kind), req.query.list);
  };

  /**
   * The products: each names a node of the categories tree, by its id, and
   * one of the makers, and appears once per maker. Empty rows are left out.
   */
  const readProducts = (
    received: unknown,
    categories: DeclaredAssetLocation[],
    makers: DeclaredAssetEntry[],
  ): DeclaredAssetProduct[] => {
    if (!Array.isArray(received)) {
      badRequest(`La liste des ${product.titles.toLowerCase()} est une liste`);
    }
    const knownCategories = new Set(categories.map((c) => c.id));
    const knownMakers = byName(makers);
    const seen = new Set<string>();
    const list: DeclaredAssetProduct[] = [];
    for (const entry of received as unknown[]) {
      const name = nameOf(entry);
      const categoryId = String((entry as Record<string, unknown> | null)?.category ?? "").trim();
      const makerName = nameOf(entry, "maker");
      if (!name && !categoryId && !makerName) continue;
      if (!categoryId) badRequest(`${capitalized(product.the)} « ${name} » n'a pas ${category.of}`);
      if (!makerName) badRequest(`${capitalized(product.the)} « ${name} » n'a pas ${maker.of}`);
      if (!name) badRequest(`${capitalized(product.a)} ${maker.ofThe} « ${makerName} » n'a pas de nom`);
      if (!knownCategories.has(categoryId)) {
        badRequest(`${capitalized(category.the)} ${product.ofThe} « ${name} » n'existe plus`);
      }
      const knownMaker = knownMakers.get(makerName.toLowerCase());
      if (!knownMaker) badRequest(`${capitalized(maker.the)} « ${makerName} » n'existe pas`);
      const key = `${makerName.toLowerCase()}\n${name.toLowerCase()}`;
      if (seen.has(key)) {
        badRequest(`${capitalized(product.the)} « ${knownMaker} ${name} » figure deux fois`);
      }
      seen.add(key);
      list.push({ category: categoryId, maker: knownMaker!, name });
    }
    return list;
  };

  const save = transaction((scope: ListScope, lists: Partial<DeclaredAssetSettings>) => {
    ensure.run(scope.board, scope.list);
    for (const list of [...DECLARED_ASSET_LISTS, ...extraLists]) {
      const value = lists[list];
      if (value) writers[list].run(JSON.stringify(value), scope.board, scope.list);
    }
  });

  const routes = Router();

  // The lists name what the assets show — a renamed maker, a location's
  // path —: their lists re-read with them.
  routes.use(touch(DECLARED_ASSET_RESOURCES[kind]));

  routes.get("/", (req, res) => {
    res.json(settingsOf(verifyList(req, false)));
  });

  /**
   * Each received list is replaced entirely, in one go; a list that is not
   * sent stays as it is. The products are checked against the categories
   * and makers as they will be once saved.
   */
  routes.put("/", (req, res) => {
    const scope = verifyList(req, true);
    const body = (req.body ?? {}) as Record<string, unknown>;
    if ([...DECLARED_ASSET_LISTS, ...extraLists].every((list) => body[list] === undefined)) {
      badRequest("Rien à enregistrer");
    }
    // A list taken from Liste widgets is theirs: a name sent that none holds —
    // a brand added from an asset's drawer — joins the first one's items, as
    // it joined the widget's list before; the rest of what is sent is left.
    for (const [list, keys] of Object.entries(sourceKeys(scope))) {
      const sent = body[list];
      delete body[list];
      if (sent === undefined) continue;
      const names = readEntries(sent, list === "makers" ? maker : { titles: list }).map((e) => e.name);
      if (addValueListNames(keys[0]!, names)) touchNow(res, "value-lists");
    }
    const current = settingsOf(scope);
    // Everything is checked before writing: a rejected list does not leave
    // the others half saved.
    const categories =
      body.categories === undefined ? undefined : readTree(body.categories, categoriesTree);
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
    save(scope, { categories, suppliers, makers, products, ...extras });
    res.json(settingsOf(scope));
  });

  return routes;
};
