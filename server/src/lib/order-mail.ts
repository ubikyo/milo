// An order's e-mail to its supplier (shared, orders.ts): the message written
// in the sending window, its variables filled for each recipient — the
// order, its supplier, the contact it goes to, whoever sends it —, laid out
// by the widget's template (lib/mail-template.ts). One message per
// recipient: each reads its own name. Sent from the address of whoever
// sends it, through Graph; with MILO_SUPPORT_REPLY=simulate, as a
// support reply, everything is prepared and logged, nothing leaves Milo.

import { SUPPORT_REPLY_VARIABLES, orderMailView } from "@milo/shared";
import type { Id, OrderForMail, OrderMailView, ProductVariant, SupportPerson } from "@milo/shared";
import { selection } from "../db/query.js";
import { orderViewOf } from "./mail-template.js";

export type { OrderForMail } from "@milo/shared";

const productById = selection<{ sku: string; variants: string }>(
  "SELECT sku, variants FROM products WHERE id = ?",
);
const contactById = selection<{ id: Id; type: string; first_name: string; name: string; emails: string }>(
  "SELECT id, type, first_name, name, emails FROM contacts WHERE id = ?",
);

const parsed = <T>(saved: string | undefined, fallback: T): T => {
  try {
    return saved ? ((JSON.parse(saved) as T) ?? fallback) : fallback;
  } catch {
    return fallback;
  }
};

const firstEmail = (emails: string | undefined): string => parsed<string[]>(emails, [])[0] ?? "";

/** The order written out, its products' SKU and variants read from the base. */
export const orderMailData = (order: OrderForMail): OrderMailView =>
  orderMailView(order, (id) => {
    const product = productById.get(id);
    return product && { sku: product.sku, variants: parsed<ProductVariant[]>(product.variants, []) };
  });

/** A recipient: a contact the order's actors hold, with its address. */
export interface OrderRecipient {
  id: Id;
  name: string;
  email: string;
}

/** A variable's value; "html", put in as it is — a table. */
type Value = { value: string; html?: boolean };

/** Every variable a content may cite, for this recipient and whoever sends. */
export const orderMailValues = (
  order: OrderForMail,
  recipientId: Id | null,
  user: SupportPerson,
): Map<string, Value> => {
  const view = orderMailData(order);
  const tables = orderViewOf(view);
  const supplier = order.supplier_id === null ? undefined : contactById.get(order.supplier_id);
  const recipient = recipientId === null ? undefined : contactById.get(recipientId);
  const person = recipient?.type === "person";
  const values = new Map<string, Value>([
    ["order.number", { value: view.number }],
    ["order.supplier", { value: view.supplier }],
    ["order.due_date", { value: view.due_date }],
    ["order.total", { value: view.total }],
    ["order.lines", { value: tables.order.lines, html: true }],
    ["orders.products", { value: tables.orders.products, html: true }],
    ["supplier.name", { value: supplier?.name ?? order.supplier_name }],
    ["supplier.email", { value: firstEmail(supplier?.emails) }],
    // The company itself, as recipient, has its name as its contact's.
    ["supplier_contact.first_name", { value: person ? (recipient?.first_name ?? "") : "" }],
    ["supplier_contact.last_name", { value: recipient?.name ?? "" }],
    ["supplier_contact.email", { value: firstEmail(recipient?.emails) }],
  ]);
  for (const v of SUPPORT_REPLY_VARIABLES) {
    if (!v.key.startsWith("user.")) continue;
    const field = v.key.slice("user.".length) as keyof SupportPerson;
    values.set(v.key, { value: user[field] ?? "" });
  }
  return values;
};

/**
 * The reference that traces a reply back to the order's exchanges: in the
 * message's headers ("X-Milo-Reference"), and in its hidden line
 * (lib/mail-reference.ts).
 */
export const orderMailReference = (orderId: number, messageId: number): string =>
  `milo-order-${orderId}-${messageId}`;


const escapeHtml = (text: string): string =>
  text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/**
 * The content, its variables replaced: a text escaped, a table as it is — in
 * place of the paragraph it stands alone in, which it would otherwise close
 * before itself, leaving an empty one under. An unknown variable stays.
 */
export const fillOrderContent = (html: string, values: Map<string, Value>): string =>
  html.replace(
    /(<p(?:\s[^>]*)?>\s*)?\{\{\s*([\w.]+)\s*\}\}(\s*<\/p>)?/g,
    (match, open: string | undefined, key: string, close: string | undefined) => {
      const v = values.get(key);
      if (!v) return match;
      if (v.html && open && close) return v.value;
      return `${open ?? ""}${v.html ? v.value : escapeHtml(v.value)}${close ?? ""}`;
    },
  );
