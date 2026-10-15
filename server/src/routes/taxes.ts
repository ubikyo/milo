// The taxes of a board (shared, taxes.ts): entered in its "Taxes" widgets,
// each its own (LIST_KEY) — a name and a rate each, in their order. They
// follow the permission on their widget type, "Logistique", like the
// warehouses: anyone who sees the board reads them — a Produits widget offers
// them —, "Modifier" writes them. A rate a product or a declared asset of a
// widget that names it holds stays.

import { Router } from "express";
import type { Request } from "express";
import {
  DECLARED_ASSET_KINDS,
  PRODUCT_LIST_TYPE,
  TAXES_MAX,
  TAX_DEFAULTS,
  TAX_LIST_TYPE,
  TAX_NAME_MAX,
  TAX_SOURCES,
  accessIncludes,
  declaredAssetListType,
} from "@milo/shared";
import type { Id, Tax, WidgetAccess } from "@milo/shared";
import { mutation, selection } from "../db/query.js";
import { declaredAssetTables } from "../db/declared-asset-tables.js";
import { HttpError, badRequest, forbidden } from "../lib/http.js";
import { touch } from "../middleware/events.js";
import { openBoard } from "../repositories/boards.js";
import { listInBoard } from "../repositories/lists.js";
import type { ListScope } from "../repositories/lists.js";
import { widgetRights } from "../repositories/users.js";
import { rateOf } from "./products.js";

/** The board, if this person may act on its taxes this way. */
const verifyBoard = (req: Request, boardId: unknown, access: WidgetAccess): Id => {
  if (!accessIncludes(widgetRights(req.user).logistics, access)) {
    throw access === "view"
      ? new HttpError(404, "Introuvable")
      : new HttpError(403, "Vous n'avez pas le droit de modifier ici");
  }
  return openBoard(boardId, req.user).id;
};

/** The taxes received: each a name, perhaps empty, and a rate, once; in their order. */
const taxesOf = (received: unknown): Tax[] => {
  if (!Array.isArray(received)) badRequest("Les taxes sont une liste");
  const taxes: Tax[] = [];
  for (const entry of received as unknown[]) {
    const fields = (entry ?? {}) as Record<string, unknown>;
    const name = String(fields.name ?? "").trim();
    if (name.length > TAX_NAME_MAX) badRequest(`Un nom de taxe tient en ${TAX_NAME_MAX} caractères`);
    const rate = rateOf(fields.rate);
    if (rate === null) return badRequest(`« ${name || "Une taxe"} » demande son taux`);
    if (taxes.some((t) => t.rate === rate)) {
      badRequest(`Le taux ${rate.toLocaleString("fr-FR")} % figure deux fois`);
    }
    taxes.push({ name, rate });
  }
  if (taxes.length > TAXES_MAX) badRequest(`Un widget tient en ${TAXES_MAX} taxes`);
  return taxes;
};

const read = selection<{ taxes: string }>(
  "SELECT taxes FROM board_tax_settings WHERE board_id = ? AND list_key = ?",
);
const write = mutation(
  `INSERT INTO board_tax_settings (board_id, list_key, taxes) VALUES (?, ?, ?)
   ON CONFLICT (board_id, list_key) DO UPDATE SET taxes = excluded.taxes`,
);

/** A Taxes widget's taxes; without a row, their defaults. */
const taxesOfList = (scope: ListScope): Tax[] => {
  const row = read.get(scope.board, scope.list);
  if (!row) return TAX_DEFAULTS;
  try {
    const taxes = JSON.parse(row.taxes) as unknown;
    return Array.isArray(taxes) ? (taxes as Tax[]) : [];
  } catch {
    return [];
  }
};

/**
 * The widgets of a type that name a Taxes widget (TAX_SOURCES), joined to
 * their items' table by their board and their key.
 */
const namingWidgets = (type: string, items: string) =>
  `EXISTS (SELECT 1 FROM board_widgets w JOIN board_sections s ON s.id = w.section_id, json_each(w.config, '$.${TAX_SOURCES}') src
    WHERE w.type = '${type}' AND json_valid(w.config) AND s.board_id = ${items}.board_id
      AND json_extract(w.config, '$.list_key') = ${items}.list_key AND src.value = @list)`;

/** A product whose widget names the Taxes widget holds the rate at one of its suppliers. */
const productUses = selection<{ one: number }>(
  `SELECT 1 AS one FROM products p, json_each(p.suppliers) sup
   WHERE json_extract(sup.value, '$.tax') = @rate AND ${namingWidgets(PRODUCT_LIST_TYPE, "p")} LIMIT 1`,
);

/** A declared asset whose widget names the Taxes widget holds the rate, by kind. */
const assetUses = DECLARED_ASSET_KINDS.map((kind) =>
  selection<{ one: number }>(
    `SELECT 1 AS one FROM ${declaredAssetTables(kind).assets} a
     WHERE a.tax = @rate AND ${namingWidgets(declaredAssetListType(kind), "a")} LIMIT 1`,
  ),
);

/** The rates removed still in use stop the writing. */
const verifyRemoved = (scope: ListScope, taxes: Tax[]) => {
  const kept = new Set(taxes.map((t) => t.rate));
  for (const { rate } of taxesOfList(scope)) {
    if (kept.has(rate)) continue;
    const params = { rate, list: scope.list };
    if (productUses.get(params) || assetUses.some((uses) => uses.get(params))) {
      forbidden(`Le taux ${rate.toLocaleString("fr-FR")} % est utilisé : il ne peut pas être supprimé`);
    }
  }
};

/** A Taxes widget's taxes: its own data (ListScope), named by "?board=&list=". */
export const taxRoutes = Router();

taxRoutes.use(touch("taxes"));

taxRoutes.get("/", (req, res) => {
  const board = verifyBoard(req, req.query.board, "view");
  res.json(taxesOfList(listInBoard(board, TAX_LIST_TYPE, req.query.list)));
});

/** The list received replaces the widget's entirely. */
taxRoutes.put("/", (req, res) => {
  const scope = listInBoard(verifyBoard(req, req.query.board, "update"), TAX_LIST_TYPE, req.query.list);
  const taxes = taxesOf(req.body);
  verifyRemoved(scope, taxes);
  write.run(scope.board, scope.list, JSON.stringify(taxes));
  res.json(taxesOfList(scope));
});
