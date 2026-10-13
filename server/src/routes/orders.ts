// The orders of a board (shared, orders.ts): entered in its "Commandes"
// widgets, each in its own (LIST_KEY), with their actors, labels, supplier,
// due date and lines, and their comments. They follow the permission on their
// widget type, "Logistique", like the contacts and the products.
//
// Their status moves one way: a quote becomes an order or is cancelled, an
// order may be cancelled; a cancelled one no longer changes. Only a quote — or
// a cancelled one that never was an order — is deleted. The supplier's
// currency is frozen at each save, as its name and the products' names: the
// order still reads once they are gone.
//
// A quote takes its number on its creation, an order when it becomes one:
// drawn in the browser by the widget's format (shared, orders.ts), with the
// index of its count it was given — checked here to be the one due, in the
// transaction that saves it: two orders saved at once cannot take the same,
// and none is skipped. A number is given once in its widget.

import { Router } from "express";
import type { Request } from "express";
import {
  CONTACT_EMAIL_PATTERN,
  CONTACT_SETTINGS_DEFAULTS,
  ORDER_LINES_MAX,
  ORDER_LIST_TYPE,
  ORDER_NOTE_MAX,
  ORDER_NUMBER_CODE_MAX,
  ORDER_NUMBER_FORMATS,
  ORDER_NUMBER_MAX,
  ORDER_PRICE_MAX,
  ORDER_QUANTITY_MAX,
  ORDER_SECTION_MAX,
  accessIncludes,
  canDeleteOrder,
  canMoveOrder,
  PRODUCT_FIELD_MAX,
  PRODUCT_VARIANTS_MAX,
  defaultOrderNumberCode,
  formatAmount,
  isOrderLineKind,
  isOrderMailKind,
  isOrderNumberFormat,
  orderNumberFormat,
  isOrderStatus,
  orderLineName,
  orderNumber,
  orderStatusLabel,
  orderTotal,
} from "@milo/shared";
import type {
  Actor,
  ContactCurrency,
  Id,
  Label,
  Order,
  OrderAttachment,
  OrderComment,
  OrderContactActor,
  OrderCurrency,
  OrderLine,
  OrderNumberFormat,
  OrderNumberTemplate,
  OrderMessage,
  OrderStatus,
  ProductVariant,
  OrderMailKind,
  SqliteBool,
  WidgetAccess,
} from "@milo/shared";
import { mutation, selection, transaction } from "../db/query.js";
import type { WithAuthorColumns } from "../db/rows.js";
import { changes, editMessage, eventLine, list, logAction, quote } from "../lib/history.js";
import { deleteMedia, isImage, mediaUrl, writeMedia } from "../lib/media.js";
import { attachments as cardAttachments } from "../repositories/attachments.js";
import { concerned, notify, notifyDeletion, root } from "../lib/notify.js";
import type { Field } from "../lib/history.js";
import { HttpError, badRequest, forbidden, orNotFound, requireText, toIds } from "../lib/http.js";
import { now } from "../lib/time.js";
import { touch } from "../middleware/events.js";
import { openBoard, requireBoardControl } from "../repositories/boards.js";
import { SYSTEM_COMMENT, creationNote, withAuthor } from "../repositories/comments.js";
import { keyInBoard, listInBoard } from "../repositories/lists.js";
import type { ListScope } from "../repositories/lists.js";
import { nextReference, peekReference } from "../repositories/references.js";
import { actorOf, widgetRights } from "../repositories/users.js";
import { fileBody, priceOf, rateOf, receivedFile } from "./products.js";
import { env } from "../env.js";
import { entraConfigured } from "../lib/entra.js";
import { sendMail } from "../lib/mail.js";
import { orderMailTemplate, previewOrderMail } from "../lib/mail-template.js";
import {
  fillOrderContent,
  orderMailData,
  orderMailReference,
  orderMailValues,
} from "../lib/order-mail.js";
import { withReference } from "../lib/mail-reference.js";
import type { OrderForMail } from "../lib/order-mail.js";
import { accountPerson } from "../lib/support-variables.js";

const NOT_FOUND = "Commande introuvable";

/** An order as stored: its currency and lines as JSON. */
interface OrderRow {
  id: Id;
  board_id: Id;
  list_key: string;
  status: string;
  quote_number: string;
  quote_index: number;
  order_number: string;
  order_index: number;
  supplier_id: Id | null;
  supplier_name: string;
  currency: string;
  due_date: string;
  warehouse_id: Id | null;
  lines: string;
  ordered_at: string;
  created_at: string;
  updated_at: string;
}

interface CommentRow {
  id: Id;
  order_id: Id;
  user_id: Id | null;
  text: string;
  system: SqliteBool;
  created_at: string;
  updated_at: string;
}

/** A stored JSON value; unreadable, the fallback. */
const parsed = <T>(saved: string | undefined, fallback: T): T => {
  if (!saved) return fallback;
  try {
    return (JSON.parse(saved) as T) ?? fallback;
  } catch {
    return fallback;
  }
};

// --- The supplier and the products -----------------------------------------

const supplierById = selection<{
  id: Id;
  board_id: Id;
  list_key: string;
  name: string;
  type: string;
  currency: string;
}>("SELECT id, board_id, list_key, name, type, currency FROM contacts WHERE id = ?");

const currenciesOf = selection<{ currencies: string }>(
  "SELECT currencies FROM board_contact_settings WHERE board_id = ? AND list_key = ?",
);

const productById = selection<{ id: Id; name: string; variants: string; archived: SqliteBool }>(
  "SELECT id, name, variants, archived FROM products WHERE id = ?",
);

/**
 * The variant of a line: a value per attribute of its product. A product
 * with variants asks for one; the values are read as received — the product's
 * may have changed since the order took them.
 */
const variantOf = (value: unknown, product: { name: string; variants: string }): string[] => {
  const variant = Array.isArray(value)
    ? value.map((v) => String(v ?? "").trim().slice(0, PRODUCT_FIELD_MAX)).filter(Boolean)
    : [];
  if (variant.length > PRODUCT_VARIANTS_MAX) badRequest(`« ${product.name} » : variante illisible`);
  if (!variant.length && parsed<ProductVariant[]>(product.variants, []).length) {
    badRequest(`« ${product.name} » : choisissez ses variantes`);
  }
  return variant;
};

/**
 * The supplier chosen, a company of a Contact widget, with its currency — as
 * its widget's lists name it; without a row, the defaults.
 */
const supplierOf = (value: unknown) => {
  if (value === null || value === undefined || value === "") {
    return { supplier_id: null, supplier_name: "", currency: "" };
  }
  const supplier = orNotFound(supplierById.get(Number(value)), "Fournisseur introuvable");
  if (supplier.type !== "company") badRequest("Un fournisseur est une société");
  const row = currenciesOf.get(supplier.board_id, supplier.list_key);
  const currencies = row
    ? parsed<ContactCurrency[]>(row.currencies, [])
    : CONTACT_SETTINGS_DEFAULTS.currencies;
  const found = currencies.find((c) => c.name === supplier.currency);
  const currency: OrderCurrency | null = found
    ? { name: found.name, code: found.code, symbol: found.symbol }
    : null;
  return {
    supplier_id: supplier.id,
    supplier_name: supplier.name,
    currency: currency ? JSON.stringify(currency) : "",
  };
};

/** The lines received: each a product that exists, a quantity, a price — or a section's, a note's text. */
/**
 * The lines received. An archived product is refused — unless the order
 * already cited it ("kept"): it stays in the orders it was in.
 */
const linesOf = (value: unknown, kept: ReadonlySet<Id> | null = null): OrderLine[] => {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) badRequest("Les produits sont une liste");
  const lines: OrderLine[] = [];
  for (const entry of value as unknown[]) {
    const row = (entry ?? {}) as Record<string, unknown>;
    const kind = row.kind ?? "product";
    if (!isOrderLineKind(kind)) return badRequest("Type de ligne inconnu");
    if (kind !== "product") {
      const text = String(row.text ?? "").trim();
      const max = kind === "section" ? ORDER_SECTION_MAX : ORDER_NOTE_MAX;
      const what = kind === "section" ? "Une section" : "Une note";
      if (!text) badRequest(kind === "section" ? "Une section demande un libellé" : "Une note demande un texte");
      if (text.length > max) badRequest(`${what} tient en ${max} caractères`);
      lines.push({ kind, text, product_id: 0, product_name: "", variant: [], quantity: 0, unit_price: null, tax: null });
      continue;
    }
    const product = orNotFound(productById.get(Number(row.product_id)), "Produit introuvable");
    if (product.archived && kept && !kept.has(product.id)) {
      badRequest(`« ${product.name} » est archivé : il ne peut plus être commandé`);
    }
    const quantity = Number(row.quantity);
    if (!Number.isFinite(quantity) || quantity <= 0) {
      badRequest(`« ${product.name} » : la quantité est un nombre positif`);
    }
    if (quantity > ORDER_QUANTITY_MAX) {
      badRequest(`Une quantité tient sous ${ORDER_QUANTITY_MAX.toLocaleString("fr-FR")}`);
    }
    lines.push({
      kind: "product",
      text: "",
      product_id: product.id,
      product_name: product.name,
      variant: variantOf(row.variant, product),
      quantity: Math.round(quantity * 1000) / 1000,
      unit_price: priceOf(row.unit_price, ORDER_PRICE_MAX),
      tax: rateOf(row.tax),
    });
  }
  if (lines.length > ORDER_LINES_MAX) badRequest(`Une commande tient en ${ORDER_LINES_MAX} lignes`);
  return lines;
};

/** A due date: "YYYY-MM-DD", or none. */
const dueOf = (value: unknown): string => {
  const read = String(value ?? "").trim().slice(0, 10);
  if (!read) return "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(read) || Number.isNaN(Date.parse(read))) {
    badRequest("Échéance illisible");
  }
  return read;
};

const warehouseExists = selection<{ id: Id }>("SELECT id FROM warehouses WHERE id = ?");

/** The delivery warehouse: one that exists, or none. */
const warehouseOf = (value: unknown): Id | null => {
  if (value === null || value === undefined || value === "") return null;
  return orNotFound(warehouseExists.get(Number(value)), "Entrepôt introuvable").id;
};

/** The fields an order is written with, read from the request; "before", its lines until then. */
const fieldsOf = (body: Record<string, unknown>, status: OrderStatus, before: OrderLine[] = []) => {
  return {
    status,
    ...supplierOf(body.supplier_id),
    due_date: dueOf(body.due_date),
    warehouse_id: warehouseOf(body.warehouse_id),
    lines: JSON.stringify(linesOf(body.lines, new Set(before.map((l) => l.product_id)))),
  };
};

// --- Reading -----------------------------------------------------------------

const ofBoard = selection<OrderRow & { warehouse_name: string }>(
  `SELECT o.*, COALESCE(w.name, '') AS warehouse_name FROM orders o
   LEFT JOIN warehouses w ON w.id = o.warehouse_id
   WHERE o.board_id = ? ORDER BY o.created_at DESC, o.id DESC`,
);
const byId = selection<OrderRow>("SELECT * FROM orders WHERE id = ?");
const actorsOfBoard = selection<{ order_id: Id; id: Id; name: string; email: string }>(
  `SELECT a.order_id, u.id, u.name, u.email FROM order_actors a
   JOIN users u ON u.id = a.user_id
   JOIN orders o ON o.id = a.order_id
   WHERE o.board_id = ? ORDER BY u.name`,
);
const contactActorsOfBoard = selection<{
  order_id: Id;
  id: Id;
  first_name: string;
  name: string;
  type: string;
  emails: string;
}>(
  `SELECT a.order_id, c.id, c.first_name, c.name, c.type, c.emails FROM order_contact_actors a
   JOIN contacts c ON c.id = a.contact_id
   JOIN orders o ON o.id = a.order_id
   WHERE o.board_id = ? ORDER BY c.type, c.name, c.first_name`,
);
const labelsOfBoard = selection<Label & { order_id: Id }>(
  `SELECT k.order_id, l.* FROM order_label_links k
   JOIN order_labels l ON l.id = k.label_id
   JOIN orders o ON o.id = k.order_id
   WHERE o.board_id = ? ORDER BY l.position, l.id`,
);

/** A board's orders, each with its actors and labels. */
const ordersOf = (boardId: Id): Order[] => {
  const actors = new Map<Id, Actor[]>();
  for (const { order_id, ...row } of actorsOfBoard.all(boardId)) {
    actors.set(order_id, [...(actors.get(order_id) ?? []), actorOf(row)]);
  }
  const contactActors = new Map<Id, OrderContactActor[]>();
  for (const { order_id, id, first_name, name, type, emails } of contactActorsOfBoard.all(boardId)) {
    const actor: OrderContactActor = {
      id,
      name: [first_name, name].filter(Boolean).join(" "),
      email: parsed<string[]>(emails, [])[0] ?? "",
      type: type === "company" ? "company" : "person",
    };
    contactActors.set(order_id, [...(contactActors.get(order_id) ?? []), actor]);
  }
  const labels = new Map<Id, Label[]>();
  for (const { order_id, ...label } of labelsOfBoard.all(boardId)) {
    labels.set(order_id, [...(labels.get(order_id) ?? []), label]);
  }
  return ofBoard.all(boardId).map((row) => ({
    ...row,
    status: isOrderStatus(row.status) ? row.status : "quote",
    currency: parsed<OrderCurrency | null>(row.currency, null),
    // A line saved before the variants has none, before the sections and notes is a product's.
    lines: parsed<OrderLine[]>(row.lines, []).map((l) => ({
      ...l,
      kind: l.kind ?? "product",
      text: l.text ?? "",
      variant: l.variant ?? [],
      tax: l.tax ?? null,
    })),
    actors: actors.get(row.id) ?? [],
    contact_actors: contactActors.get(row.id) ?? [],
    labels: labels.get(row.id) ?? [],
  }));
};

const oneOrder = (row: OrderRow): Order => ordersOf(row.board_id).find((o) => o.id === row.id)!;

/** An order as notifications name it: its number, or its type before it has one. */
const orderTitle = (order: Order): string => orderNumber(order) || orderStatusLabel(order.status);

/** The board's "Commandes" widgets, the shared ones first, with their key. */
const widgetsOf = selection<{ id: Id; list_key: string | null }>(
  `SELECT w.id, json_extract(w.config, '$.list_key') AS list_key
   FROM board_widgets w JOIN board_sections s ON s.id = w.section_id
   WHERE s.board_id = ? AND w.type = 'order.list'
   ORDER BY s.owner_id IS NOT NULL, s.position, w.position`,
);

/** What the thread notes about an order when its record changes (lib/history.ts). */
const fieldsRead = (order: Order): Field[] => [
  { label: "Numéro du devis", value: order.quote_number || "—" },
  { label: "Numéro de la commande", value: order.order_number || "—" },
  { label: "Statut", value: orderStatusLabel(order.status) },
  { label: "Fournisseur", value: order.supplier_name || "—" },
  { label: "Échéance de livraison", value: order.due_date || "—" },
  {
    label: "Produits",
    value: list(
      order.lines.map((l) => {
        if (l.kind === "section") return `[${l.text}]`;
        if (l.kind === "note") return `Note : ${l.text}`;
        const price = l.unit_price === null ? "" : ` à ${formatAmount(l.unit_price, order.currency)}`;
        return `${l.quantity} × ${orderLineName(l)}${price}`;
      }),
    ),
  },
  { label: "Total", value: formatAmount(orderTotal(order.lines), order.currency) || "—" },
  { label: "Acteurs", value: list([...order.actors, ...order.contact_actors].map((a) => a.name)) },
  { label: "Étiquettes", value: list(order.labels.map((l) => l.name)) },
];

// --- Writing -----------------------------------------------------------------

const insert = mutation(
  `INSERT INTO orders (board_id, list_key, name, status, supplier_id, supplier_name, currency, due_date,
     warehouse_id, lines, ordered_at, created_at, updated_at)
   VALUES (@board_id, @list_key, '', @status, @supplier_id, @supplier_name, @currency, @due_date,
     @warehouse_id, @lines, @ordered_at, @at, @at)`,
);
const update = mutation(
  `UPDATE orders SET status = @status, supplier_id = @supplier_id,
     supplier_name = @supplier_name, currency = @currency, due_date = @due_date,
     warehouse_id = @warehouse_id, lines = @lines,
     ordered_at = @ordered_at, updated_at = @at
   WHERE id = @id`,
);
const remove = mutation("DELETE FROM orders WHERE id = ?");

// --- Numbers -----------------------------------------------------------------

const setNumber: Record<OrderNumberFormat, ReturnType<typeof mutation>> = {
  quote: mutation("UPDATE orders SET quote_number = ?, quote_index = ? WHERE id = ?"),
  order: mutation("UPDATE orders SET order_number = ?, order_index = ? WHERE id = ?"),
};
const numberTaken = selection<{ id: Id }>(
  `SELECT id FROM orders WHERE board_id = ? AND list_key = ? AND id != ?
     AND (quote_number = ? OR order_number = ?) LIMIT 1`,
);

/** The number drawn, as received: its format, its index, its value. */
const drawOf = (value: unknown) => {
  if (value === undefined || value === null) return null;
  const row = value as Record<string, unknown>;
  if (!isOrderNumberFormat(row.format)) badRequest("Format de numéro inconnu");
  const index = Number(row.index);
  if (!Number.isInteger(index) || index < 1) badRequest("Index de numéro illisible");
  const number = String(row.value ?? "").trim();
  if (!number) badRequest("Le format n'a renvoyé aucun numéro");
  if (number.length > ORDER_NUMBER_MAX) badRequest(`Un numéro tient en ${ORDER_NUMBER_MAX} caractères`);
  return { format: row.format, index, number };
};

/**
 * The number its status asks for, given to the order — in the transaction
 * that saves it: its format's, if it has none yet. Its index must be the next
 * of the widget's count, taken then; another, someone took it meanwhile (409):
 * the browser draws again. Without one received, the order goes without.
 */
const giveNumber = (row: OrderRow, status: OrderStatus, received: unknown): void => {
  const format = orderNumberFormat(status);
  if (!format || row[`${format}_number`]) return;
  const draw = drawOf(received);
  if (!draw) return;
  if (draw.format !== format) badRequest("Ce numéro n'est pas celui de son statut");
  if (draw.index !== peekReference(format, row.board_id, row.list_key)) {
    throw new HttpError(409, "Ce numéro vient d'être donné : un autre est tiré");
  }
  if (numberTaken.get(row.board_id, row.list_key, row.id, draw.number, draw.number)) {
    badRequest(`Le numéro « ${draw.number} » est déjà donné : revoyez le format`);
  }
  nextReference(format, row.board_id, row.list_key);
  setNumber[format].run(draw.number, draw.index, row.id);
};

const clearActors = mutation("DELETE FROM order_actors WHERE order_id = ?");
const addActor = mutation(
  "INSERT OR IGNORE INTO order_actors (order_id, user_id) SELECT ?, id FROM users WHERE id = ?",
);
const clearContactActors = mutation("DELETE FROM order_contact_actors WHERE order_id = ?");
// Only its supplier, or one of its people, with an e-mail address.
const addContactActor = mutation(
  `INSERT OR IGNORE INTO order_contact_actors (order_id, contact_id)
   SELECT o.id, c.id FROM orders o JOIN contacts c ON c.id = ?
   WHERE o.id = ? AND c.emails != '[]'
     AND (c.id = o.supplier_id
          OR EXISTS (SELECT 1 FROM contact_members m WHERE m.company_id = o.supplier_id AND m.member_id = c.id))`,
);
const clearLabels = mutation("DELETE FROM order_label_links WHERE order_id = ?");
// Only a label of the order's widget.
const addLabel = mutation(
  `INSERT OR IGNORE INTO order_label_links (order_id, label_id)
   SELECT o.id, l.id FROM orders o
   JOIN order_labels l ON l.board_id = o.board_id AND l.list_key = o.list_key
   WHERE o.id = ? AND l.id = ? AND o.board_id = ?`,
);

type Fields = ReturnType<typeof fieldsOf> & { ordered_at: string };

/** Its actors: the workspace's people, its supplier's contacts. */
interface Actors {
  users: Id[];
  contacts: Id[];
}

const actorsOf = (body: Record<string, unknown>): Actors => ({
  users: toIds(body.actor_ids),
  contacts: toIds(body.contact_actor_ids),
});

/** The record, its actors and labels, written together. */
const write = transaction(
  (orderId: Id, boardId: Id, fields: Fields, actors: Actors, labelIds: Id[]) => {
    update.run({ id: orderId, ...fields, at: now() });
    clearActors.run(orderId);
    for (const id of actors.users) addActor.run(orderId, id);
    // After the supplier is written: its contacts are checked against it.
    clearContactActors.run(orderId);
    for (const id of actors.contacts) addContactActor.run(id, orderId);
    clearLabels.run(orderId);
    for (const id of labelIds) addLabel.run(orderId, id, boardId);
  },
);

const create = transaction(
  (boardId: Id, listKey: string, fields: Fields, actors: Actors, labelIds: Id[], number: unknown): Id => {
    const { lastInsertRowid } = insert.run({ board_id: boardId, list_key: listKey, ...fields, at: now() });
    const id = Number(lastInsertRowid);
    write(id, boardId, fields, actors, labelIds);
    giveNumber(byId.get(id)!, fields.status, number);
    return id;
  },
);

/** An order's record rewritten, with the number its status asks for. */
const rewrite = transaction(
  (row: OrderRow, fields: Fields, actors: Actors, labelIds: Id[], number: unknown): void => {
    write(row.id, row.board_id, fields, actors, labelIds);
    giveNumber(row, fields.status, number);
  },
);

/** The date it became an order: kept once set, today when it becomes one. */
const orderedAt = (before: string, status: OrderStatus): string =>
  before || (status === "order" ? now() : "");

// --- Documents ---------------------------------------------------------------

/** An order's document as stored. */
interface FileRow {
  id: Id;
  order_id: Id;
  kind: string;
  file: string;
  name: string;
  mime: string;
  size: number;
  position: number;
  created_at: string;
}

const files = {
  byId: selection<FileRow>("SELECT * FROM order_attachments WHERE id = ?"),
  ofOrder: selection<FileRow>("SELECT * FROM order_attachments WHERE order_id = ? ORDER BY position, id DESC"),
  // A dropped document is placed first, as on a product. The order is
  // named twice: better-sqlite3 refuses a numbered parameter used twice.
  create: mutation(
    `INSERT INTO order_attachments (order_id, kind, file, name, mime, size, user_id, created_at, position)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?,
       (SELECT COALESCE(MIN(position), 1) - 1 FROM order_attachments WHERE order_id = ?))`,
  ),
  remove: mutation("DELETE FROM order_attachments WHERE id = ?"),
  place: mutation("UPDATE order_attachments SET position = ? WHERE id = ? AND order_id = ?"),
};

const attachmentOf = (row: FileRow): OrderAttachment => ({
  ...row,
  kind: row.kind === "invoice" ? "invoice" : "document",
  url: mediaUrl(row.file),
  is_image: isImage(row.file),
});

/** The file goes when the last row citing it does. */
const dropFile = (file: string): void => {
  if (cardAttachments.countOfFile({ file }).count === 0) deleteMedia(file);
};

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

/** The order, if this person may act on it this way. */
const openOrder = (req: Request, id: unknown, access: WidgetAccess): OrderRow => {
  const order = orNotFound(byId.get(id), NOT_FOUND);
  verifyBoard(req, order.board_id, access);
  return order;
};

/** The status asked for, if the order may go there from its own. */
const statusAsked = (value: unknown, from: OrderStatus | null): OrderStatus => {
  const asked = value === undefined ? (from ?? "quote") : value;
  if (!isOrderStatus(asked)) return badRequest("Statut inconnu");
  const status: OrderStatus = asked;
  if (from === null) {
    if (status === "cancelled") badRequest("Une commande naît en devis ou en commande");
    return status;
  }
  if (!canMoveOrder(from, status)) {
    badRequest(
      from === "cancelled"
        ? "Une commande annulée ne change plus"
        : `${orderStatusLabel(from)} ne peut pas repasser en ${orderStatusLabel(status).toLowerCase()}`,
    );
  }
  return status;
};

const statusOf = (row: OrderRow): OrderStatus => (isOrderStatus(row.status) ? row.status : "quote");

// --- Comments ----------------------------------------------------------------

const COMMENT_NOT_FOUND = "Commentaire introuvable";

const COMMENT_SELECT = `
  SELECT order_comments.*, users.name AS author_name, users.email AS author_email
  FROM order_comments
  LEFT JOIN users ON users.id = order_comments.user_id
`;

const comments = {
  raw: selection<CommentRow>("SELECT * FROM order_comments WHERE id = ?"),
  byId: selection<WithAuthorColumns<CommentRow>>(`${COMMENT_SELECT} WHERE order_comments.id = ?`),
  ofOrder: selection<WithAuthorColumns<CommentRow>>(
    `${COMMENT_SELECT} WHERE order_comments.order_id = ? ORDER BY order_comments.created_at ASC`,
  ),
  create: mutation(
    `INSERT INTO order_comments (order_id, user_id, text, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?)`,
  ),
  createSystem: mutation(
    `INSERT INTO order_comments (order_id, user_id, text, system, created_at, updated_at)
     VALUES (?, NULL, ?, 1, ?, ?)`,
  ),
  update: mutation("UPDATE order_comments SET text = ?, updated_at = ? WHERE id = ?"),
  remove: mutation("DELETE FROM order_comments WHERE id = ?"),
};

const commentOf = (row: WithAuthorColumns<CommentRow>): OrderComment => withAuthor(row);

// --- Routes ------------------------------------------------------------------

export const orderRoutes = Router();

orderRoutes.use(touch("orders"));

/**
 * The index the widget's count of a format gives next, without taking it: a
 * number is drawn with it, then saved with the order (giveNumber).
 */
orderRoutes.get("/next-index", (req, res) => {
  const boardId = verifyBoard(req, req.query.board, "update");
  const format = req.query.format;
  if (!isOrderNumberFormat(format)) badRequest("Format de numéro inconnu");
  const listKey = keyInBoard(boardId, ORDER_LIST_TYPE, req.query.list);
  res.json({ index: peekReference(format as OrderNumberFormat, boardId, listKey) });
});

/**
 * Where an order opens: its board, and its widget there — a notification's
 * link leads to it.
 */
orderRoutes.get("/:id/location", (req, res) => {
  const order = openOrder(req, req.params.id, "view");
  // The widget holding its key; failing that, the board's first.
  const widgets = widgetsOf.all(order.board_id);
  const widget = widgets.find((w) => w.list_key === order.list_key) ?? widgets[0];
  res.json({ board_id: order.board_id, widget_id: widget?.id ?? null });
});

/** Whoever writes, as the editors fill their "{{user.…}}": their account, completed from Entra. */
orderRoutes.get("/variables", async (req, res, next) => {
  try {
    requireAccess(req, "view");
    res.json({ user: await accountPerson(req.user) });
  } catch (e) {
    next(e);
  }
});

orderRoutes.get("/", (req, res) => {
  const { board } = req.query;
  if (!board) badRequest("Le paramètre board est requis");
  res.json(ordersOf(verifyBoard(req, board, "view")));
});

orderRoutes.post("/", (req, res) => {
  const body = (req.body ?? {}) as Record<string, unknown>;
  if (!body.board_id) badRequest("Le tableau est requis");
  const boardId = verifyBoard(req, body.board_id, "update");
  const status = statusAsked(body.status, null);
  const id = create(
    boardId,
    // The widget named, if it is one of this board's; otherwise its first.
    keyInBoard(boardId, ORDER_LIST_TYPE, body.list_key),
    { ...fieldsOf(body, status), ordered_at: orderedAt("", status) },
    actorsOf(body),
    toIds(body.label_ids),
    body.number,
  );
  // An order's thread opens on its creation, signed Milo.
  const at = now();
  comments.createSystem.run(id, creationNote("Commande créée", at, req.user.id), at, at);
  const created = oneOrder(byId.get(id)!);
  // Its actors, and whoever follows it from now on, are notified.
  notify({
    kind: "order",
    targetId: created.id,
    title: orderTitle(created),
    message: created.status === "quote" ? "a créé le devis" : "a créé la commande",
    author: req.user,
    base: root(req),
  });
  res.status(201).json(created);
});

orderRoutes.put("/:id", (req, res) => {
  const existing = openOrder(req, req.params.id, "update");
  const from = statusOf(existing);
  if (from === "cancelled") forbidden("Une commande annulée ne se modifie plus");
  const body = (req.body ?? {}) as Record<string, unknown>;
  const status = statusAsked(body.status, from);
  const before = fieldsRead(oneOrder(existing));
  rewrite(
    existing,
    { ...fieldsOf(body, status, oneOrder(existing).lines), ordered_at: orderedAt(existing.ordered_at, status) },
    actorsOf(body),
    toIds(body.label_ids),
    body.number,
  );
  const saved = oneOrder(byId.get(existing.id)!);
  // What moved is noted in its thread, and notifies its actors and whoever follows it;
  // a quote become an order keeps the trace of its quote's number.
  const rows = changes(before, fieldsRead(saved));
  if (from === "quote" && status === "order") {
    rows.unshift(
      eventLine(
        "Transformation",
        `Le devis ${saved.quote_number ? quote(saved.quote_number) : ""} devient la commande ${
          saved.order_number ? quote(saved.order_number) : ""
        }`.replace(/\s+/g, " "),
      ),
    );
  }
  logAction("order", existing.id, req.user, rows);
  if (rows.length) {
    notify({
      kind: "order",
      targetId: saved.id,
      title: orderTitle(saved),
      message: editMessage(rows),
      author: req.user,
      base: root(req),
    });
  }
  res.json(saved);
});

orderRoutes.delete("/:id", (req, res) => {
  const existing = openOrder(req, req.params.id, "delete");
  const status = statusOf(existing);
  if (!canDeleteOrder({ status, ordered_at: existing.ordered_at })) {
    forbidden(
      status === "cancelled"
        ? "Une commande annulée ne se supprime pas"
        : "Une commande ne se supprime pas : annulez-la",
    );
  }
  const recipients = concerned.order(existing.id);
  const title = orderTitle(oneOrder(existing));
  const cited = files.ofOrder.all(existing.id);
  remove.run(existing.id);
  for (const { file } of cited) dropFile(file);
  notifyDeletion({
    kind: "order",
    targetId: existing.id,
    title,
    message: "a supprimé le devis",
    author: req.user,
    recipients,
    vanished: true,
    base: root(req),
  });
  res.status(204).end();
});

// An order's documents, read when its drawer opens.
orderRoutes.get("/:id/attachments", (req, res) => {
  const order = openOrder(req, req.params.id, "view");
  res.json(files.ofOrder.all(order.id).map(attachmentOf));
});

/** A document — or, for an order, its invoice —, placed first among its own. */
const addFile = (req: Request, order: OrderRow, kind: OrderAttachment["kind"]): OrderAttachment => {
  const { content, name, mime } = receivedFile(req);
  const { lastInsertRowid } = files.create.run(
    order.id,
    kind,
    writeMedia(content, name),
    name,
    mime,
    content.length,
    req.user.id,
    now(),
    order.id,
  );
  const what = kind === "invoice" ? "Factures" : "Pièces jointes";
  logAction("order", order.id, req.user, [eventLine(what, `${quote(name)} ajoutée`)]);
  return attachmentOf(files.byId.get(lastInsertRowid)!);
};

// An order's invoice: only once it is an order — not a quote, nor cancelled.
orderRoutes.post("/:id/invoices", fileBody, (req, res) => {
  const order = openOrder(req, req.params.id, "update");
  if (statusOf(order) !== "order") badRequest("Seule une commande reçoit sa facture");
  res.status(201).json(addFile(req, order, "invoice"));
});

orderRoutes.post("/:id/attachments", fileBody, (req, res) => {
  const order = openOrder(req, req.params.id, "update");
  res.status(201).json(addFile(req, order, "document"));
});

orderRoutes.put("/:id/attachments/order", (req, res) => {
  const order = openOrder(req, req.params.id, "update");
  transaction(() => toIds(req.body.ids).forEach((id, rank) => files.place.run(rank, id, order.id)))();
  res.json(files.ofOrder.all(order.id).map(attachmentOf));
});

orderRoutes.delete("/attachments/:attachment", (req, res) => {
  const attachment = orNotFound(files.byId.get(req.params.attachment), "Pièce jointe introuvable");
  openOrder(req, attachment.order_id, "update");
  files.remove.run(attachment.id);
  dropFile(attachment.file);
  logAction("order", attachment.order_id, req.user, [
    eventLine(attachment.kind === "invoice" ? "Factures" : "Pièces jointes", `${quote(attachment.name)} supprimée`),
  ]);
  res.status(204).end();
});

// An order's thread, read when its "Commentaires" tab is.
orderRoutes.get("/:id/comments", (req, res) => {
  const order = openOrder(req, req.params.id, "view");
  res.json(comments.ofOrder.all(order.id).map(commentOf));
});

// Writing in an order's thread means editing it.
orderRoutes.post("/:id/comments", (req, res) => {
  const order = openOrder(req, req.params.id, "update");
  const body = requireText(req.body?.text, "text est requis");
  const at = now();
  const { lastInsertRowid } = comments.create.run(order.id, req.user.id, body, at, at);
  res.status(201).json(commentOf(comments.byId.get(lastInsertRowid)!));
});

orderRoutes.put("/comments/:comment", (req, res) => {
  const comment = orNotFound(comments.raw.get(req.params.comment), COMMENT_NOT_FOUND);
  if (comment.system) forbidden(SYSTEM_COMMENT);
  openOrder(req, comment.order_id, "update");
  const body = requireText(req.body?.text, "text est requis");
  // An identical text is not a modification: the comment's date stays.
  if (body !== comment.text) comments.update.run(body, now(), comment.id);
  res.json(commentOf(comments.byId.get(comment.id)!));
});

orderRoutes.delete("/comments/:comment", (req, res) => {
  const comment = orNotFound(comments.raw.get(req.params.comment), COMMENT_NOT_FOUND);
  if (comment.system) forbidden(SYSTEM_COMMENT);
  openOrder(req, comment.order_id, "update");
  comments.remove.run(comment.id);
  res.status(204).end();
});

// --- Numbering formats -------------------------------------------------------

const readFormats = selection<{ number_templates: string }>(
  "SELECT number_templates FROM board_order_settings WHERE board_id = ? AND list_key = ?",
);
const writeFormats = mutation(
  `INSERT INTO board_order_settings (board_id, list_key, number_templates) VALUES (?, ?, ?)
   ON CONFLICT (board_id, list_key) DO UPDATE SET number_templates = excluded.number_templates`,
);

/** The widget's two formats: each its code, the one it starts from without one. */
const formatsOf = (scope: ListScope): OrderNumberTemplate[] => {
  const saved = parsed<Record<string, unknown>>(readFormats.get(scope.board, scope.list)?.number_templates, {});
  return ORDER_NUMBER_FORMATS.map(({ value }) => {
    const code = saved[value];
    return { format: value, code: typeof code === "string" && code.trim() ? code : defaultOrderNumberCode(value) };
  });
};

/** The index a format's test draws from. */
const INDEX_SAMPLES = ["1", "7", "42", "128", "2026"];

const numbersOf = (scope: ListScope) => ({
  templates: formatsOf(scope),
  variables: [{ group: "Commande", label: "index", name: "{{index}}", samples: INDEX_SAMPLES }],
});

/**
 * A "Commandes" widget's numbering formats — "Devis", "Commande" —: not its
 * configuration but its own data (ListScope), named by "?board=&list=".
 */
export const orderNumberRoutes = Router();

orderNumberRoutes.use(touch("orders"));

orderNumberRoutes.get("/", (req, res) => {
  const board = verifyBoard(req, req.query.board, "view");
  res.json(numbersOf(listInBoard(board, ORDER_LIST_TYPE, req.query.list)));
});

/** The formats received replace the widget's; one left out keeps its code. */
orderNumberRoutes.put("/", (req, res) => {
  requireAccess(req, "update");
  const board = openBoard(req.query.board, req.user);
  requireBoardControl(board, req.user);
  const scope = listInBoard(board.id, ORDER_LIST_TYPE, req.query.list);
  const received = (req.body ?? {}).templates;
  if (!Array.isArray(received)) badRequest("Les formats de numérotation sont une liste");
  const codes: Record<string, string> = Object.fromEntries(formatsOf(scope).map((t) => [t.format, t.code]));
  for (const entry of received as unknown[]) {
    const row = (entry ?? {}) as Record<string, unknown>;
    const format = row.format;
    if (!isOrderNumberFormat(format)) return badRequest("Format de numéro inconnu");
    const code = typeof row.code === "string" ? row.code : "";
    if (code.length > ORDER_NUMBER_CODE_MAX) badRequest("Le format est trop volumineux");
    codes[format] = code;
  }
  writeFormats.run(scope.board, scope.list, JSON.stringify(codes));
  res.json(numbersOf(scope));
});

// --- E-mails to the supplier -------------------------------------------------

/** The e-mail asked for: a quote request, or a message. */
const mailKindOf = (value: unknown): OrderMailKind => {
  if (!isOrderMailKind(value)) return badRequest("Type d'e-mail inconnu");
  return value;
};

/** The text version of a message: its HTML without tags. */
const plainText = (html: string): string =>
  html
    .replace(/<\/(p|tr|h\d|li)>/g, "\n")
    .replace(/<br\s*\/?>/g, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .trim();

/** Graph's ceiling on a message's attachments (lib/ticket-files.ts). */
const FILES_MAX = 3 * 1024 * 1024;

/** The files received with a message: a name, a type, the content in base 64. */
const filesOf = (value: unknown): { name: string; mime: string; content: Buffer }[] => {
  if (!Array.isArray(value)) return [];
  const files = (value as unknown[]).map((entry) => {
    const row = (entry ?? {}) as Record<string, unknown>;
    const name = String(row.name ?? "").trim().slice(0, 200) || "fichier";
    const mime = String(row.mime ?? "") || "application/octet-stream";
    return { name, mime, content: Buffer.from(String(row.content ?? ""), "base64") };
  });
  const total = files.reduce((sum, f) => sum + f.content.length, 0);
  if (total > FILES_MAX) badRequest("Les pièces jointes dépassent 3 Mo");
  return files;
};

/**
 * The reply editor's preview: the message being written, its variables
 * filled for the first recipient, in its template — the order as its drawer
 * holds it, saved or not.
 */
orderRoutes.post("/mail-preview", async (req, res, next) => {
  try {
    const body = (req.body ?? {}) as Record<string, unknown>;
    verifyBoard(req, body.board_id, "update");
    const supplier = supplierOf(body.supplier_id);
    const order: OrderForMail = {
      number: String(body.number ?? ""),
      supplier_id: supplier.supplier_id,
      supplier_name: supplier.supplier_name,
      currency: parsed<OrderCurrency | null>(supplier.currency, null),
      due_date: dueOf(body.due_date),
      lines: linesOf(body.lines),
    };
    const recipient = body.recipient_id ? Number(body.recipient_id) : null;
    const values = orderMailValues(order, recipient, await accountPerson(req.user));
    const html = await previewOrderMail(fillOrderContent(String(body.html ?? ""), values), orderMailData(order));
    res.json({ html });
  } catch (e) {
    next(e);
  }
});

/** Addresses received for a copy: each one checked. */
const copiesOf = (value: unknown): string[] => {
  const list = Array.isArray(value) ? value.map((v) => String(v ?? "").trim()).filter(Boolean) : [];
  const wrong = list.find((a) => !CONTACT_EMAIL_PATTERN.test(a));
  if (wrong) badRequest(`« ${wrong} » n'est pas une adresse e-mail`);
  return [...new Set(list)];
};

const messages = {
  ofOrder: selection<{
    id: Id;
    order_id: Id;
    order_status: string;
    text: string;
    mail_status: string;
    mail_to: string;
    mail_cc: string;
    mail_bcc: string;
    created_at: string;
    user_id: Id | null;
    name: string | null;
    email: string | null;
  }>(
    `SELECT m.*, u.name, u.email FROM order_messages m LEFT JOIN users u ON u.id = m.user_id
     WHERE m.order_id = ? ORDER BY m.created_at, m.id`,
  ),
  create: mutation(
    `INSERT INTO order_messages (order_id, user_id, kind, order_status, text, mail_status, mail_to, mail_cc,
       mail_bcc, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ),
  /** Once sent: its text, as the first recipient read it, and what became of it. */
  sent: mutation("UPDATE order_messages SET text = ?, mail_status = ? WHERE id = ?"),
};

const MAIL_STATUSES = ["sent", "simulated", "failed"] as const;

/** An order's exchanges, as its "Échanges" tab shows them: never deleted. */
orderRoutes.get("/:id/messages", (req, res) => {
  const order = openOrder(req, req.params.id, "view");
  const list: OrderMessage[] = messages.ofOrder.all(order.id).map((m) => ({
    id: m.id,
    order_id: m.order_id,
    order_status: isOrderStatus(m.order_status) ? m.order_status : null,
    text: m.text,
    author: m.user_id === null ? null : actorOf({ id: m.user_id, name: m.name ?? "", email: m.email ?? "" }),
    mail_status: MAIL_STATUSES.find((s) => s === m.mail_status) ?? "sent",
    mail_to: m.mail_to,
    mail_cc: m.mail_cc,
    mail_bcc: m.mail_bcc,
    created_at: m.created_at,
    updated_at: m.created_at,
  }));
  res.json(list);
});

/**
 * The e-mail sent to the order's supplier contacts — those among its actors
 * with an address —: one each, its variables filled for them, from the
 * address of whoever sends it; its copies — and a hidden one to its author,
 * if asked — with the first only. It joins the order's exchanges, as the
 * first recipient read it, and the thread notes to whom it went.
 */
orderRoutes.post("/:id/mail", async (req, res, next) => {
  try {
    const existing = openOrder(req, req.params.id, "update");
    const body = (req.body ?? {}) as Record<string, unknown>;
    const kind = mailKindOf(body.kind);
    const order = oneOrder(existing);
    // A message written in the exchanges goes under its type's name: "Devis D202610/001".
    const label = kind === "order_message" ? orderStatusLabel(order.status) : "Demande de devis";
    const recipients = order.contact_actors.filter((c) => c.email);
    if (!recipients.length) badRequest("Aucun contact du fournisseur avec une adresse e-mail parmi les acteurs");
    // From whoever sends it: the supplier answers them, the message stays in their sent items.
    const sender = req.user.email;
    if (!sender) badRequest("Votre compte n'a pas d'adresse e-mail : le message ne peut pas partir");
    if (!entraConfigured()) badRequest("Milo n'est pas connecté à Microsoft : le message ne peut pas partir");
    const user = await accountPerson(req.user);
    const forMail: OrderForMail = { ...order, number: orderNumber(order) };
    const view = orderMailData(forMail);
    const subject = `${label} ${view.number}`.trim();
    const cc = copiesOf(body.cc);
    // Its attachments go with every message.
    const files = filesOf(body.files);
    const bcc = [...new Set([...copiesOf(body.bcc), ...(body.copy === true ? [sender] : [])])];

    // Recorded first: its id makes the reference a reply is traced by.
    const at = now();
    const { lastInsertRowid } = messages.create.run(
      existing.id,
      req.user.id,
      kind,
      order.status,
      "",
      "",
      recipients.map((r) => r.email).join(", "),
      cc.join(", "),
      bcc.join(", "),
      at,
    );
    const messageId = Number(lastInsertRowid);
    const reference = orderMailReference(existing.id, messageId);

    const failures: string[] = [];
    let firstContent = "";
    for (const [rank, r] of recipients.entries()) {
      const content = fillOrderContent(String(body.html ?? ""), orderMailValues(forMail, r.id, user));
      if (rank === 0) firstContent = content;
      const laidOut = await orderMailTemplate(withReference(content, reference), view);
      // The copies go with the first message only.
      const copies = rank === 0 ? { cc, bcc } : { cc: [], bcc: [] };
      if (!env.supportReplySend) {
        const copied = [...copies.cc, ...copies.bcc].join(", ");
        console.log(`[Simulation] ${subject} — from ${sender} to ${r.email}${copied ? `, copies ${copied}` : ""} (not sent)`);
        continue;
      }
      try {
        await sendMail({
          from: sender,
          to: r.email,
          subject,
          text: plainText(content),
          html: laidOut.html,
          attachments: laidOut.attachments,
          ...(copies.cc.length && { cc: copies.cc }),
          ...(copies.bcc.length && { bcc: copies.bcc }),
          keep: true,
          headers: { "X-Milo-Reference": reference },
          ...(files.length && { files }),
        });
      } catch (e) {
        failures.push(`${r.email} : ${e instanceof Error ? e.message : "l'envoi a échoué"}`);
      }
    }

    const status = !env.supportReplySend ? "simulated" : failures.length ? "failed" : "sent";
    messages.sent.run(firstContent, status, messageId);
    const sent = recipients.filter((r) => !failures.some((f) => f.startsWith(`${r.email} :`)));
    if (sent.length && kind !== "order_message") {
      const to = sent.map((r) => `${r.name} (${r.email})`).join(", ");
      const note = `${label} envoyée${env.supportReplySend ? "" : " (simulation)"} à ${to}`;
      comments.createSystem.run(existing.id, creationNote(note, at, req.user.id), at, at);
    }
    if (sent.length) {
      notify({
        kind: "order",
        targetId: existing.id,
        title: orderTitle(order),
        message: kind === "order_message" ? "a envoyé un message au fournisseur" : `a envoyé : ${label.toLowerCase()}`,
        author: req.user,
        base: root(req),
      });
    }
    if (failures.length) badRequest(`Envoi impossible — ${failures.join(" ; ")}`);
    res.json({ sent: sent.length, simulated: !env.supportReplySend });
  } catch (e) {
    next(e);
  }
});
