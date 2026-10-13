// The products of a board (shared, products.ts): entered by hand in its
// "Produits" widgets, each in its own (LIST_KEY), with their labels, their
// variants — their own attributes, each with its colored values —, their
// photos, their documents and their comments. They follow the
// permission on their widget type, "Logistique", like the contacts.
//
// As on a declared asset, the photos and documents go out on upload, without
// waiting for "Sauvegarder"; the rest of the record goes with it. The
// comments, as on a card, are written one by one.

import express, { Router } from "express";
import type { Request } from "express";
import {
  PRODUCT_FIELD_MAX,
  PRODUCT_LIST_TYPE,
  PRODUCT_NAME_MAX,
  PRODUCT_SKU_MAX,
  PRODUCT_NOTES_MAX,
  PRODUCT_PRICE_MAX,
  PRODUCT_QUANTITY_MAX,
  PRODUCT_SUPPLIERS_MAX,
  PRODUCT_TAXES_MAX,
  PRODUCT_TAX_DEFAULTS,
  PRODUCT_TAX_MAX,
  PRODUCT_VALUES_MAX,
  PRODUCT_VARIANTS_MAX,
  accessIncludes,
  isLabelColor,
  isProductTracking,
  productTrackingLabel,
} from "@milo/shared";
import type {
  Id,
  Label,
  Product,
  ProductAttachment,
  ProductCategory,
  ProductComment,
  ProductFiles,
  ProductPhoto,
  ProductSettings,
  ProductSupplier,
  ProductTax,
  ProductTracking,
  ProductVariant,
  SqliteBool,
  WidgetAccess,
} from "@milo/shared";
import { mutation, scalar, selection, transaction } from "../db/query.js";
import type { NextRow, WithAuthorColumns } from "../db/rows.js";
import { changes, eventLine, list, logAction, quote } from "../lib/history.js";
import type { Field } from "../lib/history.js";
import { HttpError, badRequest, forbidden, orNotFound, requireText, toIds } from "../lib/http.js";
import { SIZE_MAX, deleteMedia, inlineType, isImage, mediaUrl, writeMedia } from "../lib/media.js";
import { now } from "../lib/time.js";
import { touch } from "../middleware/events.js";
import { attachments as cardAttachments } from "../repositories/attachments.js";
import { openBoard, requireBoardControl } from "../repositories/boards.js";
import { SYSTEM_COMMENT, creationNote, withAuthor } from "../repositories/comments.js";
import { keyInBoard, listInBoard } from "../repositories/lists.js";
import type { ListScope } from "../repositories/lists.js";
import { widgetRights } from "../repositories/users.js";

const NOT_FOUND = "Produit introuvable";

/** A product as stored: its mark as a number, its variants as JSON. */
interface ProductRow {
  id: Id;
  board_id: Id;
  list_key: string;
  sku: string;
  name: string;
  archived: SqliteBool;
  favorite: SqliteBool;
  notes: string;
  tracking: string;
  category: string;
  variants: string;
  suppliers: string;
  created_at: string;
  updated_at: string;
}

interface FileRow {
  id: Id;
  product_id: Id;
  file: string;
  name: string;
  mime?: string;
  size: number;
  position: number;
  created_at: string;
}

interface CommentRow {
  id: Id;
  product_id: Id;
  user_id: Id | null;
  text: string;
  system: SqliteBool;
  created_at: string;
  updated_at: string;
}

/** A stored JSON list; unreadable, none. */
const parsed = <T>(saved: string | undefined): T[] => {
  if (!saved) return [];
  try {
    const list = JSON.parse(saved) as unknown;
    return Array.isArray(list) ? (list as T[]) : [];
  } catch {
    return [];
  }
};

/** A short text, trimmed and checked for length. */
const text = (value: unknown, max: number, what: string): string => {
  const read = String(value ?? "").trim();
  if (read.length > max) badRequest(`${what} tient en ${max} caractères`);
  return read;
};

/**
 * The variants received: each an attribute and its values — a name, a
 * label's color and a SKU —, every name once in its list. A value left without a name
 * is dropped; an attribute needs its name.
 */
const variantsOf = (value: unknown): ProductVariant[] => {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) badRequest("Les variantes sont une liste");
  const attributes = new Set<string>();
  const variants: ProductVariant[] = [];
  for (const entry of value as unknown[]) {
    const row = (entry ?? {}) as Record<string, unknown>;
    const attribute = text(row.attribute, PRODUCT_FIELD_MAX, "Un attribut");
    if (!attribute) badRequest("Variantes : chaque attribut demande un nom");
    if (attributes.has(attribute.toLowerCase())) badRequest(`L'attribut « ${attribute} » figure deux fois`);
    attributes.add(attribute.toLowerCase());
    const received = Array.isArray(row.values) ? (row.values as unknown[]) : [];
    const names = new Set<string>();
    const values: ProductVariant["values"] = [];
    for (const v of received) {
      const read = (v ?? {}) as Record<string, unknown>;
      const name = text(read.name, PRODUCT_FIELD_MAX, "Une valeur");
      if (!name) continue;
      if (names.has(name.toLowerCase())) badRequest(`« ${name} » figure deux fois dans « ${attribute} »`);
      if (!isLabelColor(read.color)) badRequest("Couleur inconnue");
      names.add(name.toLowerCase());
      values.push({ name, color: String(read.color), sku: text(read.sku, PRODUCT_SKU_MAX, "Un SKU") });
    }
    if (values.length > PRODUCT_VALUES_MAX) {
      badRequest(`L'attribut « ${attribute} » tient en ${PRODUCT_VALUES_MAX} valeurs`);
    }
    variants.push({ attribute, values });
  }
  if (variants.length > PRODUCT_VARIANTS_MAX) {
    badRequest(`Les variantes tiennent en ${PRODUCT_VARIANTS_MAX} attributs`);
  }
  return variants;
};

/** The companies of the Contact widgets, by id: what a supplier must be. */
const companyById = selection<{ id: Id; name: string }>(
  "SELECT id, name FROM contacts WHERE id = ? AND type = 'company'",
);

/** A price: a positive amount, to the cent; null when not given. */
export const priceOf = (value: unknown, max: number): number | null => {
  if (value === null || value === undefined || value === "") return null;
  const read = Number(value);
  if (!Number.isFinite(read) || read < 0) badRequest("Un prix est un montant positif");
  if (read > max) badRequest(`Un prix tient sous ${max.toLocaleString("fr-FR")}`);
  return Math.round(read * 100) / 100;
};

/** A tax's rate: a percentage, to the hundredth; null when not given. */
export const rateOf = (value: unknown): number | null => {
  if (value === null || value === undefined || value === "") return null;
  const read = Number(value);
  if (!Number.isFinite(read) || read < 0 || read > PRODUCT_TAX_MAX) {
    badRequest(`Une taxe est un pourcentage entre 0 et ${PRODUCT_TAX_MAX}`);
  }
  return Math.round(read * 100) / 100;
};

/** The taxes received: each a rate, once; in their order. */
const taxesOf = (received: unknown): ProductTax[] => {
  if (!Array.isArray(received)) badRequest("Les taxes sont une liste");
  const rates: number[] = [];
  for (const entry of received as unknown[]) {
    const rate = rateOf(((entry ?? {}) as Record<string, unknown>).rate);
    if (rate === null) return badRequest("Une taxe demande son taux");
    if (rates.includes(rate)) badRequest(`La taxe ${rate.toLocaleString("fr-FR")} % figure deux fois`);
    rates.push(rate);
  }
  if (rates.length > PRODUCT_TAXES_MAX) badRequest(`Un widget tient en ${PRODUCT_TAXES_MAX} taxes`);
  return rates.map((rate) => ({ rate }));
};

/** A minimum quantity: a positive number; null, none. */
const minQuantityOf = (value: unknown): number | null => {
  if (value === null || value === undefined || value === "") return null;
  const read = Number(value);
  if (!Number.isFinite(read) || read <= 0) badRequest("Une quantité minimum est un nombre positif");
  if (read > PRODUCT_QUANTITY_MAX) {
    badRequest(`Une quantité tient sous ${PRODUCT_QUANTITY_MAX.toLocaleString("fr-FR")}`);
  }
  return Math.round(read * 1000) / 1000;
};

/**
 * The prices received: each a company of a Contact widget, a minimum
 * quantity or none — once per company — and its price, required from a
 * minimum; sorted by company, then quantity, none first. A company that no
 * longer exists is dropped.
 */
const suppliersOf = (value: unknown): ProductSupplier[] => {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) badRequest("Les fournisseurs sont une liste");
  const seen = new Set<string>();
  const suppliers: (ProductSupplier & { name: string })[] = [];
  for (const entry of value as unknown[]) {
    const row = (entry ?? {}) as Record<string, unknown>;
    const contactId = Number(row.contact_id);
    const company = Number.isInteger(contactId) ? companyById.get(contactId) : undefined;
    if (!company) continue;
    const minQuantity = minQuantityOf(row.min_quantity);
    const key = `${contactId}\n${minQuantity ?? ""}`;
    if (seen.has(key)) {
      badRequest(
        minQuantity === null
          ? `« ${company.name} » : un seul prix sans quantité minimum`
          : `« ${company.name} » : la quantité ${minQuantity.toLocaleString("fr-FR")} figure deux fois`,
      );
    }
    seen.add(key);
    const price = priceOf(row.price, PRODUCT_PRICE_MAX);
    if (minQuantity !== null && price === null) {
      badRequest(`« ${company.name} » : un prix à partir d'une quantité demande son prix`);
    }
    const tax = rateOf(row.tax);
    suppliers.push({ contact_id: contactId, min_quantity: minQuantity, price, tax, name: company.name });
  }
  if (suppliers.length > PRODUCT_SUPPLIERS_MAX) {
    badRequest(`Un produit tient en ${PRODUCT_SUPPLIERS_MAX} prix fournisseurs`);
  }
  return suppliers
    .sort(
      (a, b) =>
        a.name.localeCompare(b.name, "fr", { numeric: true }) ||
        a.contact_id - b.contact_id ||
        (a.min_quantity ?? 0) - (b.min_quantity ?? 0),
    )
    .map(({ name: _name, ...supplier }) => supplier);
};

/** A category's id, as the client draws it. */
const CATEGORY_ID_MAX = 64;

/** How many categories a board's tree holds at most. */
const CATEGORIES_MAX = 1000;

/**
 * The categories tree, stored flat, as a board's locations
 * (declared-asset-settings.ts): each category has an id of its own and a
 * name, and its parent — when it has one — comes before it. Empty rows are
 * left out, with the categories under them.
 */
const categoriesOf = (received: unknown): ProductCategory[] => {
  if (!Array.isArray(received)) badRequest("Les catégories sont une liste");
  const kept = new Set<string>();
  const list: ProductCategory[] = [];
  for (const entry of received as unknown[]) {
    const row = (entry ?? {}) as Record<string, unknown>;
    const id = String(row.id ?? "").trim();
    if (!id || id.length > CATEGORY_ID_MAX) badRequest("Catégorie illisible");
    if (kept.has(id)) badRequest("Une catégorie figure deux fois");
    const parent = row.parent == null || row.parent === "" ? null : String(row.parent);
    // Under a category left out, or not yet seen: it goes too.
    if (parent !== null && !kept.has(parent)) continue;
    const name = text(row.name, PRODUCT_FIELD_MAX, "Un nom");
    if (!name) continue;
    kept.add(id);
    list.push({ id, parent, name });
  }
  if (list.length > CATEGORIES_MAX) badRequest(`Un tableau tient en ${CATEGORIES_MAX} catégories`);
  return list;
};

/** The categories, each with its path: "Vêtements > Hauts > T-shirts". */
const categoryPaths = (categories: ProductCategory[]): Map<string, string> => {
  const paths = new Map<string, string>();
  for (const c of categories) {
    // A parent comes before its children: its path is already known.
    const above = c.parent ? paths.get(c.parent) : undefined;
    paths.set(c.id, above ? `${above} > ${c.name}` : c.name);
  }
  return paths;
};

/** The fields a product is written with, read from the request. */
const fieldsOf = (body: Record<string, unknown>) => {
  const tracking: ProductTracking =
    body.tracking === undefined ? "none" : (body.tracking as ProductTracking);
  if (!isProductTracking(tracking)) badRequest("Suivi d'inventaire inconnu");
  return {
    sku: text(body.sku, PRODUCT_SKU_MAX, "Un SKU"),
    name: text(requireText(body.name, "Le champ « Nom » est requis"), PRODUCT_NAME_MAX, "Un nom"),
    favorite: body.favorite === true ? 1 : 0,
    notes: text(body.notes, PRODUCT_NOTES_MAX, "Des notes"),
    tracking,
    // A category of the board's tree, by its id: one no longer in it shows none.
    category: text(body.category, CATEGORY_ID_MAX, "Une catégorie"),
    variants: JSON.stringify(variantsOf(body.variants)),
    suppliers: JSON.stringify(suppliersOf(body.suppliers)),
  };
};

// --- Reading -----------------------------------------------------------------

const ofBoard = selection<ProductRow>(
  "SELECT * FROM products WHERE board_id = ? ORDER BY name COLLATE NOCASE, id",
);
const byId = selection<ProductRow>("SELECT * FROM products WHERE id = ?");
const labelsOfBoard = selection<Label & { product_id: Id }>(
  `SELECT k.product_id, l.* FROM product_label_links k
   JOIN product_labels l ON l.id = k.label_id
   JOIN products p ON p.id = k.product_id
   WHERE p.board_id = ? ORDER BY l.position, l.id`,
);
/** Each product's labels, from their links on a board. */
const byProduct = (rows: (Label & { product_id: Id })[]): Map<Id, Label[]> => {
  const found = new Map<Id, Label[]>();
  for (const { product_id, ...label } of rows) {
    found.set(product_id, [...(found.get(product_id) ?? []), label]);
  }
  return found;
};

/** A board's products, each with its labels. */
const productsOf = (boardId: Id): Product[] => {
  const labels = byProduct(labelsOfBoard.all(boardId));
  const used = new Set(usedProducts.all().map((r) => r.id));
  return ofBoard.all(boardId).map((row) => ({
    ...row,
    archived: Boolean(row.archived),
    used: used.has(row.id),
    favorite: Boolean(row.favorite),
    tracking: isProductTracking(row.tracking) ? row.tracking : "none",
    // A value saved before its SKU has none.
    variants: parsed<ProductVariant>(row.variants).map((v) => ({
      ...v,
      values: v.values.map((x) => ({ ...x, sku: x.sku ?? "" })),
    })),
    // Stored before the minimum quantity, or the tax: none.
    suppliers: parsed<ProductSupplier>(row.suppliers).map((s) => ({
      ...s,
      min_quantity: s.min_quantity ?? null,
      tax: s.tax ?? null,
    })),
    labels: labels.get(row.id) ?? [],
  }));
};

/** The products some order's lines cite — on any board. */
const usedProducts = selection<{ id: Id }>(
  `SELECT DISTINCT CAST(json_extract(j.value, '$.product_id') AS INTEGER) AS id
   FROM orders, json_each(orders.lines) j
   WHERE json_extract(j.value, '$.product_id') > 0`,
);

/** Does an order's line cite this product? */
const isUsed = selection<{ one: number }>(
  `SELECT 1 AS one FROM orders, json_each(orders.lines) j
   WHERE json_extract(j.value, '$.product_id') = ? LIMIT 1`,
);

const setArchived = mutation("UPDATE products SET archived = ?, updated_at = ? WHERE id = ?");

const oneProduct = (row: ProductRow): Product =>
  productsOf(row.board_id).find((p) => p.id === row.id)!;

// --- A widget's lists -------------------------------------------------------

const readSettings = selection<{ categories: string; taxes: string }>(
  "SELECT categories, taxes FROM board_product_settings WHERE board_id = ? AND list_key = ?",
);
const writeTaxes = mutation(
  `INSERT INTO board_product_settings (board_id, list_key, taxes) VALUES (?, ?, ?)
   ON CONFLICT (board_id, list_key) DO UPDATE SET taxes = excluded.taxes`,
);
const writeCategories = mutation(
  `INSERT INTO board_product_settings (board_id, list_key, categories) VALUES (?, ?, ?)
   ON CONFLICT (board_id, list_key) DO UPDATE SET categories = excluded.categories`,
);

/** A "Produits" widget's lists; without a row, no category and the default taxes. */
const settingsOf = (scope: ListScope): ProductSettings => {
  const row = readSettings.get(scope.board, scope.list);
  return {
    categories: parsed<ProductCategory>(row?.categories),
    taxes: row ? parsed<ProductTax>(row.taxes) : PRODUCT_TAX_DEFAULTS,
  };
};

/** What the thread notes about a product when its record changes (lib/history.ts). */
const fieldsRead = (product: Product): Field[] => [
  { label: "SKU", value: product.sku || "—" },
  { label: "Nom", value: quote(product.name) },
  { label: "Favoris", value: product.favorite ? "Oui" : "Non" },
  {
    label: "Catégorie",
    value:
      categoryPaths(settingsOf({ board: product.board_id, list: product.list_key }).categories).get(
        product.category,
      ) ?? "—",
  },
  { label: "Suivi inventaire", value: productTrackingLabel(product.tracking) },
  {
    label: "Variantes",
    value: list(product.variants.map((v) => `${v.attribute} (${v.values.map((x) => x.name).join(", ")})`)),
  },
  {
    label: "Fournisseurs",
    value: list(
      product.suppliers.map((x) => {
        const name = companyById.get(x.contact_id)?.name ?? `#${x.contact_id}`;
        const price = x.price === null ? "" : x.price.toLocaleString("fr-FR");
        if (x.min_quantity === null) return price ? `${name} (${price})` : name;
        return `${name} (dès ${x.min_quantity.toLocaleString("fr-FR")} : ${price})`;
      }),
    ),
  },
  { label: "Étiquettes", value: list(product.labels.map((l) => l.name)) },
  { label: "Notes", value: product.notes, opaque: true },
];

// --- Writing -----------------------------------------------------------------

const insert = mutation(
  `INSERT INTO products (board_id, list_key, sku, name, favorite, notes, tracking, category, variants, suppliers,
     created_at, updated_at)
   VALUES (@board_id, @list_key, @sku, @name, @favorite, @notes, @tracking, @category, @variants, @suppliers,
     @at, @at)`,
);
const update = mutation(
  `UPDATE products SET sku = @sku, name = @name, favorite = @favorite, notes = @notes, tracking = @tracking,
     category = @category, variants = @variants, suppliers = @suppliers, updated_at = @at
   WHERE id = @id`,
);
const remove = mutation("DELETE FROM products WHERE id = ?");

const clearLabels = mutation("DELETE FROM product_label_links WHERE product_id = ?");
// Only a label of the product's widget.
const addLabel = mutation(
  `INSERT OR IGNORE INTO product_label_links (product_id, label_id)
   SELECT x.id, l.id FROM products x
   JOIN product_labels l ON l.board_id = x.board_id AND l.list_key = x.list_key
   WHERE x.id = ? AND l.id = ? AND x.board_id = ?`,
);

type Fields = ReturnType<typeof fieldsOf>;

/** The record and its labels, written together. */
const write = transaction((productId: Id, boardId: Id, fields: Fields, labelIds: Id[]) => {
  update.run({ id: productId, ...fields, at: now() });
  clearLabels.run(productId);
  for (const id of labelIds) addLabel.run(productId, id, boardId);
});

const create = transaction((boardId: Id, listKey: string, fields: Fields, labelIds: Id[]): Id => {
  const { lastInsertRowid } = insert.run({ board_id: boardId, list_key: listKey, ...fields, at: now() });
  const id = Number(lastInsertRowid);
  write(id, boardId, fields, labelIds);
  return id;
});

// --- Permissions -------------------------------------------------------------

/** The permission on the "Logistique" type a request needs. */
const requireAccess = (req: Request, access: WidgetAccess): void => {
  if (!accessIncludes(widgetRights(req.user).logistics, access)) {
    throw access === "view"
      ? new HttpError(404, "Introuvable")
      : new HttpError(403, "Vous n'avez pas le droit de modifier ici");
  }
};

/** The board, if this person sees it and holds this permission on the widget type. */
const verifyBoard = (req: Request, boardId: unknown, access: WidgetAccess): Id => {
  requireAccess(req, access);
  return openBoard(boardId, req.user).id;
};

/** The product, if this person may act on it this way. */
const openProduct = (req: Request, id: unknown, access: WidgetAccess): ProductRow => {
  const product = orNotFound(byId.get(id), NOT_FOUND);
  verifyBoard(req, product.board_id, access);
  return product;
};

// --- Files -------------------------------------------------------------------

const photos = {
  byId: selection<FileRow>("SELECT * FROM product_photos WHERE id = ?"),
  ofProduct: selection<FileRow>(
    "SELECT * FROM product_photos WHERE product_id = ? ORDER BY position, id",
  ),
  nextPosition: scalar<NextRow>(
    "SELECT COALESCE(MAX(position), -1) + 1 AS next FROM product_photos WHERE product_id = ?",
  ),
  create: mutation(
    `INSERT INTO product_photos (product_id, file, name, size, position, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
  ),
  remove: mutation("DELETE FROM product_photos WHERE id = ?"),
  place: mutation("UPDATE product_photos SET position = ? WHERE id = ? AND product_id = ?"),
};

const files = {
  byId: selection<FileRow>("SELECT * FROM product_attachments WHERE id = ?"),
  ofProduct: selection<FileRow>(
    "SELECT * FROM product_attachments WHERE product_id = ? ORDER BY position, id DESC",
  ),
  // A dropped attachment is placed first, as on a card. The product is
  // named twice: better-sqlite3 refuses a numbered parameter used twice.
  create: mutation(
    `INSERT INTO product_attachments (product_id, file, name, mime, size, user_id, created_at, position)
     VALUES (?, ?, ?, ?, ?, ?, ?,
       (SELECT COALESCE(MIN(position), 1) - 1 FROM product_attachments WHERE product_id = ?))`,
  ),
  remove: mutation("DELETE FROM product_attachments WHERE id = ?"),
  place: mutation("UPDATE product_attachments SET position = ? WHERE id = ? AND product_id = ?"),
};

const photoOf = ({ mime: _mime, ...row }: FileRow): ProductPhoto => ({
  ...row,
  url: mediaUrl(row.file),
});
const attachmentOf = (row: FileRow): ProductAttachment => ({
  ...row,
  mime: row.mime ?? "",
  url: mediaUrl(row.file),
  is_image: isImage(row.file),
});

const filesOf = (productId: Id): ProductFiles => ({
  photos: photos.ofProduct.all(productId).map(photoOf),
  attachments: files.ofProduct.all(productId).map(attachmentOf),
});

/** The file goes when the last row citing it does. */
const dropFile = (file: string): void => {
  if (cardAttachments.countOfFile({ file }).count === 0) deleteMedia(file);
};

/** The body is a file: we take it as is, whatever its declared type. */
export const fileBody = express.raw({ type: () => true, limit: SIZE_MAX });

/** The uploaded file: its content, its name — never a path —, its declared type. */
export const receivedFile = (req: Request) => {
  const content: unknown = req.body;
  if (!Buffer.isBuffer(content) || content.length === 0) badRequest("Fichier vide");
  const name =
    String(req.query["name"] ?? "")
      .split(/[/\\]/)
      .pop()!
      .trim()
      .slice(0, 255) || "fichier";
  const declared = String(req.query["type"] ?? "").trim().slice(0, 100);
  const mime = /^[\w.+-]+\/[\w.+-]+$/.test(declared) ? declared : "application/octet-stream";
  return { content: content as Buffer, name, mime };
};

// --- Comments ----------------------------------------------------------------

const COMMENT_NOT_FOUND = "Commentaire introuvable";

const COMMENT_SELECT = `
  SELECT product_comments.*, users.name AS author_name, users.email AS author_email
  FROM product_comments
  LEFT JOIN users ON users.id = product_comments.user_id
`;

const comments = {
  raw: selection<CommentRow>("SELECT * FROM product_comments WHERE id = ?"),
  byId: selection<WithAuthorColumns<CommentRow>>(`${COMMENT_SELECT} WHERE product_comments.id = ?`),
  ofProduct: selection<WithAuthorColumns<CommentRow>>(
    `${COMMENT_SELECT} WHERE product_comments.product_id = ? ORDER BY product_comments.created_at ASC`,
  ),
  create: mutation(
    `INSERT INTO product_comments (product_id, user_id, text, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?)`,
  ),
  createSystem: mutation(
    `INSERT INTO product_comments (product_id, user_id, text, system, created_at, updated_at)
     VALUES (?, NULL, ?, 1, ?, ?)`,
  ),
  update: mutation("UPDATE product_comments SET text = ?, updated_at = ? WHERE id = ?"),
  remove: mutation("DELETE FROM product_comments WHERE id = ?"),
};

const commentOf = (row: WithAuthorColumns<CommentRow>): ProductComment => withAuthor(row);

// --- Routes ------------------------------------------------------------------

export const productRoutes = Router();

productRoutes.use(touch("products"));

productRoutes.get("/", (req, res) => {
  const { board } = req.query;
  if (!board) badRequest("Le paramètre board est requis");
  res.json(productsOf(verifyBoard(req, board, "view")));
});

productRoutes.post("/", (req, res) => {
  const body = (req.body ?? {}) as Record<string, unknown>;
  if (!body.board_id) badRequest("Le tableau est requis");
  const boardId = verifyBoard(req, body.board_id, "update");
  const id = create(
    boardId,
    // The widget named, if it is one of this board's; otherwise its first.
    keyInBoard(boardId, PRODUCT_LIST_TYPE, body.list_key),
    fieldsOf(body),
    toIds(body.label_ids),
  );
  // A product's thread opens on its creation, signed Milo.
  const at = now();
  comments.createSystem.run(id, creationNote("Produit créé", at, req.user.id), at, at);
  res.status(201).json(oneProduct(byId.get(id)!));
});

productRoutes.put("/:id", (req, res) => {
  const existing = openProduct(req, req.params.id, "update");
  const body = (req.body ?? {}) as Record<string, unknown>;
  const before = fieldsRead(oneProduct(existing));
  write(existing.id, existing.board_id, fieldsOf(body), toIds(body.label_ids));
  const saved = oneProduct(byId.get(existing.id)!);
  logAction("product", existing.id, req.user, changes(before, fieldsRead(saved)));
  res.json(saved);
});

// The copy sits beside the original, "(copie)" after its name: its record,
// its labels, its photos and documents — the same files, cited twice, as a
// duplicated card's. Its thread starts anew, on its creation.
const COPY_SUFFIX = " (copie)";

const copyLabels = mutation(
  `INSERT INTO product_label_links (product_id, label_id)
   SELECT ?, label_id FROM product_label_links WHERE product_id = ?`,
);
const copyPhotos = mutation(
  `INSERT INTO product_photos (product_id, file, name, size, position, created_at)
   SELECT ?, file, name, size, position, ? FROM product_photos WHERE product_id = ?`,
);
const copyAttachments = mutation(
  `INSERT INTO product_attachments (product_id, file, name, mime, size, user_id, created_at, position)
   SELECT ?, file, name, mime, size, user_id, ?, position FROM product_attachments WHERE product_id = ?`,
);

const duplicate = transaction((source: ProductRow): Id => {
  const at = now();
  const name = source.name.slice(0, PRODUCT_NAME_MAX - COPY_SUFFIX.length) + COPY_SUFFIX;
  const { board_id, list_key, favorite, notes, tracking, category, variants, suppliers } = source;
  // A reference designates one product: the copy starts without.
  const { lastInsertRowid } = insert.run({
    board_id, list_key, sku: "", name, favorite, notes, tracking, category, variants, suppliers, at,
  });
  const id = Number(lastInsertRowid);
  copyLabels.run(id, source.id);
  copyPhotos.run(id, at, source.id);
  copyAttachments.run(id, at, source.id);
  return id;
});

productRoutes.post("/:id/duplicate", (req, res) => {
  const source = openProduct(req, req.params.id, "update");
  const id = duplicate(source);
  const at = now();
  comments.createSystem.run(id, creationNote("Produit créé", at, req.user.id), at, at);
  res.status(201).json(oneProduct(byId.get(id)!));
});

/** Archived, or back: an archived product is no longer offered to an order. */
productRoutes.put("/:id/archive", (req, res) => {
  const existing = openProduct(req, req.params.id, "update");
  const archived = req.body?.archived === true;
  if (Boolean(existing.archived) !== archived) {
    setArchived.run(archived ? 1 : 0, now(), existing.id);
    logAction("product", existing.id, req.user, [eventLine("Archivage", archived ? "Archivé" : "Désarchivé")]);
  }
  res.json(oneProduct(byId.get(existing.id)!));
});

productRoutes.delete("/:id", (req, res) => {
  const existing = openProduct(req, req.params.id, "delete");
  // A quote or an order cites it: it stays — archived, if need be.
  if (isUsed.get(existing.id)) forbidden("Ce produit figure dans un devis ou une commande : archivez-le plutôt");
  const cited = [...photos.ofProduct.all(existing.id), ...files.ofProduct.all(existing.id)];
  remove.run(existing.id);
  for (const { file } of cited) dropFile(file);
  res.status(204).end();
});

// A product's photos and documents, read when its drawer opens.
productRoutes.get("/:id/files", (req, res) => {
  const product = openProduct(req, req.params.id, "view");
  res.json(filesOf(product.id));
});

// A photo: only images the server returns as is, since it is shown.
productRoutes.post("/:id/photos", fileBody, (req, res) => {
  const product = openProduct(req, req.params.id, "update");
  const { content, name } = receivedFile(req);
  if (!(inlineType(name) ?? "").startsWith("image/")) {
    badRequest("Ce format d'image ne peut pas servir de photo");
  }
  const { lastInsertRowid } = photos.create.run(
    product.id,
    writeMedia(content, name),
    name,
    content.length,
    photos.nextPosition(product.id).next,
    now(),
  );
  logAction("product", product.id, req.user, [eventLine("Photos", `${quote(name)} ajoutée`)]);
  res.status(201).json(photoOf(photos.byId.get(lastInsertRowid)!));
});

productRoutes.put("/:id/photos/order", (req, res) => {
  const product = openProduct(req, req.params.id, "update");
  transaction(() => toIds(req.body.ids).forEach((id, rank) => photos.place.run(rank, id, product.id)))();
  res.json(filesOf(product.id).photos);
});

productRoutes.delete("/photos/:photo", (req, res) => {
  const photo = orNotFound(photos.byId.get(req.params.photo), "Photo introuvable");
  openProduct(req, photo.product_id, "update");
  photos.remove.run(photo.id);
  dropFile(photo.file);
  logAction("product", photo.product_id, req.user, [eventLine("Photos", `${quote(photo.name)} supprimée`)]);
  res.status(204).end();
});

productRoutes.post("/:id/attachments", fileBody, (req, res) => {
  const product = openProduct(req, req.params.id, "update");
  const { content, name, mime } = receivedFile(req);
  const { lastInsertRowid } = files.create.run(
    product.id,
    writeMedia(content, name),
    name,
    mime,
    content.length,
    req.user.id,
    now(),
    product.id,
  );
  logAction("product", product.id, req.user, [eventLine("Pièces jointes", `${quote(name)} ajoutée`)]);
  res.status(201).json(attachmentOf(files.byId.get(lastInsertRowid)!));
});

productRoutes.put("/:id/attachments/order", (req, res) => {
  const product = openProduct(req, req.params.id, "update");
  transaction(() => toIds(req.body.ids).forEach((id, rank) => files.place.run(rank, id, product.id)))();
  res.json(filesOf(product.id).attachments);
});

productRoutes.delete("/attachments/:attachment", (req, res) => {
  const attachment = orNotFound(files.byId.get(req.params.attachment), "Pièce jointe introuvable");
  openProduct(req, attachment.product_id, "update");
  files.remove.run(attachment.id);
  dropFile(attachment.file);
  logAction("product", attachment.product_id, req.user, [
    eventLine("Pièces jointes", `${quote(attachment.name)} supprimée`),
  ]);
  res.status(204).end();
});

// A product's thread, read when its "Commentaires" tab is.
productRoutes.get("/:id/comments", (req, res) => {
  const product = openProduct(req, req.params.id, "view");
  res.json(comments.ofProduct.all(product.id).map(commentOf));
});

// Writing in a product's thread means editing it.
productRoutes.post("/:id/comments", (req, res) => {
  const product = openProduct(req, req.params.id, "update");
  const body = requireText(req.body?.text, "text est requis");
  const at = now();
  const { lastInsertRowid } = comments.create.run(product.id, req.user.id, body, at, at);
  res.status(201).json(commentOf(comments.byId.get(lastInsertRowid)!));
});

productRoutes.put("/comments/:comment", (req, res) => {
  const comment = orNotFound(comments.raw.get(req.params.comment), COMMENT_NOT_FOUND);
  if (comment.system) forbidden(SYSTEM_COMMENT);
  openProduct(req, comment.product_id, "update");
  const body = requireText(req.body?.text, "text est requis");
  // An identical text is not a modification: the comment's date stays.
  if (body !== comment.text) comments.update.run(body, now(), comment.id);
  res.json(commentOf(comments.byId.get(comment.id)!));
});

productRoutes.delete("/comments/:comment", (req, res) => {
  const comment = orNotFound(comments.raw.get(req.params.comment), COMMENT_NOT_FOUND);
  if (comment.system) forbidden(SYSTEM_COMMENT);
  openProduct(req, comment.product_id, "update");
  comments.remove.run(comment.id);
  res.status(204).end();
});

/**
 * The lists of a Produits widget — its categories tree, its taxes —: not its
 * configuration but its own data (ListScope), named by "?board=&list=".
 */
export const productSettingsRoutes = Router();

productSettingsRoutes.use(touch("products"));

productSettingsRoutes.get("/", (req, res) => {
  const board = verifyBoard(req, req.query.board, "view");
  res.json(settingsOf(listInBoard(board, "product.list", req.query.list)));
});

/** The tree received replaces the widget's entirely. */
productSettingsRoutes.put("/", (req, res) => {
  requireAccess(req, "update");
  const board = openBoard(req.query.board, req.user);
  requireBoardControl(board, req.user);
  const scope = listInBoard(board.id, "product.list", req.query.list);
  const body = (req.body ?? {}) as Record<string, unknown>;
  if (body.categories === undefined && body.taxes === undefined) badRequest("Rien à enregistrer");
  // Each list read first: a refused one writes nothing.
  const categories = body.categories === undefined ? undefined : categoriesOf(body.categories);
  const taxes = body.taxes === undefined ? undefined : taxesOf(body.taxes);
  transaction(() => {
    if (categories) writeCategories.run(scope.board, scope.list, JSON.stringify(categories));
    if (taxes) writeTaxes.run(scope.board, scope.list, JSON.stringify(taxes));
  })();
  res.json(settingsOf(scope));
});
