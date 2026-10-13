// An order as its e-mails cite it (server, lib/order-mail.ts): its lines and
// their references written out, and the two tables "{{order.lines}}" and
// "{{orders.products}}" become. Shared: the editor of its exchanges shows the
// same tables in their place (client, VariableBlock).

import type { Id } from "./domain.js";
import type { OrderCurrency, OrderLine } from "./orders.js";
import { formatAmount, orderLineName, orderTotal } from "./orders.js";
import type { Product } from "./products.js";
import { productReference } from "./products.js";

/** An order as an e-mail reads it: saved, or as its drawer holds it. */
export interface OrderForMail {
  number: string;
  supplier_id: Id | null;
  supplier_name: string;
  currency: OrderCurrency | null;
  due_date: string;
  lines: Pick<OrderLine, "kind" | "text" | "product_id" | "product_name" | "variant" | "quantity" | "unit_price">[];
}

export interface OrderMailView {
  number: string;
  supplier: string;
  due_date: string;
  /** Its lines in their order: a product's name, quantity, price and amount; a section's, a note's text. */
  lines: { kind: "product" | "section" | "note"; name: string; quantity: string; price: string; amount: string }[];
  /** Each product line's reference — the product's SKU and its values' — and quantity. */
  references: { reference: string; quantity: string }[];
  total: string;
}

/** "2026-11-15" read as "15/11/2026"; empty, none. */
const frenchDate = (date: string): string => {
  const [y, m, d] = date.split("-");
  return y && m && d ? `${d}/${m}/${y}` : "";
};

/** The order written out; "productOf", a product's SKU and variants — its references. */
export const orderMailView = (
  order: OrderForMail,
  productOf: (id: Id) => Pick<Product, "sku" | "variants"> | undefined,
): OrderMailView => {
  const products = order.lines.filter((l) => l.kind === "product");
  const quantity = (n: number) => n.toLocaleString("fr-FR");
  return {
    number: order.number,
    supplier: order.supplier_name,
    due_date: frenchDate(order.due_date),
    // Every line, in its order: the sections and notes with the products.
    lines: order.lines.map((l) => ({
      kind: l.kind,
      name: l.kind === "product" ? orderLineName(l) : l.text,
      quantity: l.kind === "product" ? quantity(l.quantity) : "",
      price: l.kind === "product" ? formatAmount(l.unit_price, order.currency) : "",
      amount:
        l.kind !== "product" || l.unit_price === null
          ? ""
          : formatAmount(Math.round(l.quantity * l.unit_price * 100) / 100, order.currency),
    })),
    references: products.map((l) => {
      const product = productOf(l.product_id);
      const reference = product ? productReference(product, l.variant) : "";
      return { reference: reference || orderLineName(l), quantity: quantity(l.quantity) };
    }),
    total: formatAmount(orderTotal(products), order.currency),
  };
};

/** Milo's rule gray, frozen: e-mails share no CSS variables. */
const RULE = "#dee2e6";

const escapeHtml = (text: string): string =>
  text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const TABLE = `<table style="width:100%;border-collapse:collapse;margin:0;padding:0" cellpadding="0" cellspacing="0">`;

// Each cell a little inside its row: the header's and the sections' bands
// do not touch their text.
const ruled = (align: string, extra = "") =>
  `padding:4px 8px;margin:0;border-bottom:1px solid ${RULE};text-align:${align}${extra}`;

/** A section's band — white text on it, in both themes —, and a note's rules. */
const SECTION_BG = "#495057";

/** A note's background. */
const NOTE_BG = "#e9ecef";

/**
 * What is already dark — the header, the sections: white on a dark
 * background, the same in both themes. A mail client in dark mode leaves
 * such a cell as it is, and darkens the rest; the dark previews, which
 * invert the rest, turn these back (MailPreview, VariableBlock).
 */
export const MAIL_DARK_CLASS = "milo-dark";

/**
 * A note, light: a mail client in dark mode turns its background to this
 * gray — Outlook's —, its text to white; the dark previews do the same,
 * where inverting it would make it nearly black.
 */
export const MAIL_NOTE_CLASS = "milo-note";
export const MAIL_NOTE_DARK_BG = "#545759";
const headCell = (text: string, align: string) =>
  `<th class="${MAIL_DARK_CLASS}" style="${ruled(align, ";background-color:#000000;color:#ffffff")}">${text}</th>`;

/** The references to order, as a table: one row per product line. */
export const orderReferencesTable = (references: OrderMailView["references"]): string => {
  const cell = (text: string, align = "left") => `<td style="${ruled(align)}">${escapeHtml(text)}</td>`;
  const head = headCell("Référence", "left") + headCell("Quantité", "right");
  const rows = references.map((r) => `<tr>${cell(r.reference)}${cell(r.quantity, "right")}</tr>`).join("");
  return `${TABLE}<tr>${head}</tr>${rows}</table>`;
};

/**
 * An order's lines, as a table: its header white on black; a
 * product's name, quantity — its price and amount when one of them has a
 * price —; a section across the row, in bold, white on gray, 30 px below
 * what precedes it unless that is the header; a note across it, in italics,
 * on light gray between two gray rules — 10 px inside —, its line breaks
 * kept, right against the rows around it; under a section, no rule above.
 */
export const orderLinesTable = (lines: OrderMailView["lines"]): string => {
  const priced = lines.some((l) => l.kind === "product" && l.price);
  const columns = priced ? ["Produit", "Qté", "PU", "Montant"] : ["Produit", "Qté"];
  const cell = (text: string, align = "left") => `<td style="${ruled(align)}">${escapeHtml(text)}</td>`;
  const text = (l: { name: string }) => escapeHtml(l.name).replace(/\n/g, "<br>");
  const head = columns.map((h, i) => headCell(h, i ? "right" : "left")).join("");
  const rows = lines
    .map((l, i) => {
      if (l.kind === "section") {
        // Under the header, it follows it; lower down, it stands 30 px apart —
        // tables know no margins: an empty row stands for it.
        const style = ruled("left", `;font-weight:bold;background-color:${SECTION_BG};color:#ffffff`);
        const gap = i > 0 ? `<tr><td colspan="${columns.length}" style="padding:30px 0 0 0;margin:0"></td></tr>` : "";
        return `${gap}<tr><td colspan="${columns.length}" class="${MAIL_DARK_CLASS}" style="${style}">${text(l)}</td></tr>`;
      }
      if (l.kind === "note") {
        // Under a section, it goes on with its band: no rule between them.
        const rule = `2px solid ${SECTION_BG}`;
        const top = lines[i - 1]?.kind === "section" ? "" : `border-top:${rule};`;
        const style = `${top}border-bottom:${rule};background-color:${NOTE_BG};color:#000000`;
        return `<tr><td colspan="${columns.length}" style="padding:0;margin:0">`
          + `<div class="${MAIL_NOTE_CLASS}" style="${style};padding:10px;font-style:italic">${text(l)}</div></td></tr>`;
      }
      return `<tr>${cell(l.name)}${cell(l.quantity, "right")}${
        priced ? `${cell(l.price, "right")}${cell(l.amount, "right")}` : ""
      }</tr>`;
    })
    .join("");
  return `${TABLE}<tr>${head}</tr>${rows}</table>`;
};

/** The variables that are tables, and what each becomes. */
export const orderTables = (view: OrderMailView): Record<"order.lines" | "orders.products", string> => ({
  "order.lines": orderLinesTable(view.lines),
  "orders.products": orderReferencesTable(view.references),
});
