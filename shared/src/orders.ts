// The orders: entered in a board's "Commandes" widgets (group "Logistique"),
// each in its own (LIST_KEY), with their actors, labels, supplier, due date
// and lines. The supplier is a company of a Contact widget, the products those
// of the Produits widgets the widget names in its drawer (ORDER_SUPPLIER_SOURCES,
// ORDER_PRODUCT_SOURCES) — of any board one sees. A line offers the products
// the supplier sells (Product.suppliers) and takes their price; the order is
// in its supplier's currency, frozen at each save.
//
// An order is first a quote. A quote becomes an order, or is cancelled; it
// may be deleted. An order may be cancelled, never deleted, and never goes
// back to a quote. A cancelled order stays as it is.
//
// A quote takes a number on its creation, an order when it becomes one: each
// drawn by its widget's format ("Devis", "Commande" — the two it has, no
// more), TypeScript the browser runs as an asset number's
// (asset-number-templates.ts). "{{index}}" is the next of the widget's count
// for that format: from 1, one by one, never given twice — the server checks
// it is the one due when the number is saved.
//
// Its actors are the workspace's people, and the supplier's: the company, if
// it has an e-mail address, and its people who have one (contact_actors).

import type { AssetNumberVariable } from "./asset-number-templates.js";
import type { Actor, Id, Label, SqliteBool } from "./domain.js";

/** The widget that owns its orders (LIST_KEY). */
export const ORDER_LIST_TYPE = "order.list";

/** The routes: "/api/orders", "/api/order-labels". */
export const ORDER_ROUTES = {
  orders: "/orders",
  labels: "/order-labels",
  numbers: "/order-numbers",
} as const;

/** The widget's configuration keys: the Contact, Produits and Entrepôts widgets it reads. */
export const ORDER_SUPPLIER_SOURCES = "supplier_sources";
export const ORDER_PRODUCT_SOURCES = "product_sources";
export const ORDER_WAREHOUSE_SOURCES = "warehouse_sources";

export const ORDER_STATUSES = [
  { value: "quote", label: "Devis", color: "orange" },
  { value: "order", label: "Commande", color: "teal" },
  { value: "cancelled", label: "Annulé", color: "red" },
] as const;

export type OrderStatus = (typeof ORDER_STATUSES)[number]["value"];

export const isOrderStatus = (value: unknown): value is OrderStatus =>
  ORDER_STATUSES.some((s) => s.value === value);

export const orderStatusLabel = (status: OrderStatus): string =>
  ORDER_STATUSES.find((s) => s.value === status)?.label ?? status;

export const orderStatusColor = (status: OrderStatus): string =>
  ORDER_STATUSES.find((s) => s.value === status)?.color ?? "gray";

/** The statuses an order may go to from its own: itself, then the next ones. */
const NEXT: Record<OrderStatus, OrderStatus[]> = {
  quote: ["quote", "order", "cancelled"],
  order: ["order", "cancelled"],
  cancelled: ["cancelled"],
};

export const nextOrderStatuses = (status: OrderStatus): OrderStatus[] => NEXT[status];

/** Can an order go from this status to that one? */
export const canMoveOrder = (from: OrderStatus, to: OrderStatus): boolean => NEXT[from].includes(to);

/**
 * Can it be deleted? Only a quote — or a cancelled one that never was an
 * order: an order, even cancelled, stays.
 */
export const canDeleteOrder = (order: Pick<Order, "status" | "ordered_at">): boolean =>
  order.status === "quote" || (order.status === "cancelled" && !order.ordered_at);

/** A cancelled order is read-only. */
export const isOrderLocked = (order: Pick<Order, "status">): boolean => order.status === "cancelled";

/**
 * What a line is: a product; a section, a title across the lines that
 * groups those after it; a note, a text among them.
 */
export const ORDER_LINE_KINDS = ["product", "section", "note"] as const;

export type OrderLineKind = (typeof ORDER_LINE_KINDS)[number];

export const isOrderLineKind = (value: unknown): value is OrderLineKind =>
  ORDER_LINE_KINDS.includes(value as OrderLineKind);

/**
 * A line: a product — one of its variants, for a product that has some —, its
 * quantity, its unit price in the order's currency. A section's or a note's
 * holds its text alone: no product (0), no quantity, no price.
 */
export interface OrderLine {
  kind: OrderLineKind;
  /** A section's title, a note's text; empty for a product. */
  text: string;
  product_id: Id;
  /** Its name when last saved: it stays if the product goes away. */
  product_name: string;
  /**
   * The variant ordered: a value per attribute of the product, in their order
   * ("Noir", "M"); empty for a product without variants.
   */
  variant: string[];
  quantity: number;
  /** Null: not given. */
  unit_price: number | null;
  /** Its tax's rate, in percent — its price's at the supplier, or chosen —; null, none. */
  tax: number | null;
}

/** The order's currency, as its supplier's widget names it (ContactCurrency). */
export interface OrderCurrency {
  name: string;
  code: string;
  symbol: string;
}

/** A contact among an order's actors: its supplier, or one of its people. */
export interface OrderContactActor {
  id: Id;
  /** A person's first name and name; a company's name. */
  name: string;
  /** Its first address. */
  email: string;
  type: "person" | "company";
}

export interface Order {
  id: Id;
  board_id: Id;
  list_key: string;
  status: OrderStatus;
  /** Its quote's number; empty, none given. */
  quote_number: string;
  /** Its order's number, once it became one; empty before. */
  order_number: string;
  /** A company of a Contact widget; null once it is deleted, or not chosen. */
  supplier_id: Id | null;
  /** Its name when last saved. */
  supplier_name: string;
  currency: OrderCurrency | null;
  /** "YYYY-MM-DD"; empty, none. */
  due_date: string;
  /** Where it is delivered: a warehouse of an Entrepôts widget; null, none or deleted. */
  warehouse_id: Id | null;
  /** Its name; empty without one. */
  warehouse_name: string;
  lines: OrderLine[];
  /** When it became an order; empty while it never was one. */
  ordered_at: string;
  actors: Actor[];
  /** The supplier's contacts among its actors. */
  contact_actors: OrderContactActor[];
  labels: Label[];
  created_at: string;
  updated_at: string;
}

/**
 * A number drawn for an order (OrderInput.number): its format, the index it
 * was drawn with — the widget's next for the format —, and the number.
 */
export interface OrderNumberDraw {
  format: OrderNumberFormat;
  index: number;
  value: string;
}

export interface OrderInput {
  status: OrderStatus;
  /** The number its status asks for, when it has none yet. */
  number?: OrderNumberDraw;
  supplier_id: Id | null;
  due_date: string;
  warehouse_id: Id | null;
  lines: Pick<OrderLine, "kind" | "text" | "product_id" | "variant" | "quantity" | "unit_price" | "tax">[];
  actor_ids: Id[];
  /** The supplier, or its people: those with an e-mail address. */
  contact_actor_ids: Id[];
  label_ids: Id[];
}

/** A document of an order — a supplier's quote —, as a product's. */
export interface OrderAttachment {
  id: Id;
  order_id: Id;
  /** A document — a supplier's quote —, or the order's invoice, once it is one. */
  kind: "document" | "invoice";
  file: string;
  name: string;
  mime: string;
  size: number;
  position: number;
  created_at: string;
  /** Where to read it: "/api/media/<file>". */
  url: string;
  /** True for the images the server returns as is. */
  is_image: boolean;
}

/** A comment of an order's thread, as a product's. */
export interface OrderComment {
  id: Id;
  order_id: Id;
  user_id: Id | null;
  text: string;
  system: SqliteBool;
  created_at: string;
  updated_at: string;
  author: Actor | null;
}

/** The number an order shows: its order's once it was one, its quote's otherwise. */
export const orderNumber = (order: Pick<Order, "quote_number" | "order_number">): string =>
  order.order_number || order.quote_number;

/** A line as it reads: its product, then its variant — "T-shirt — Noir / M". */
export const orderLineName = (line: Pick<OrderLine, "product_name" | "variant">): string =>
  line.variant.length ? `${line.product_name} — ${line.variant.join(" / ")}` : line.product_name;

/** An order's total: its lines' quantities by their prices; null when none has a price. */
export const orderTotal = (lines: Pick<OrderLine, "quantity" | "unit_price">[]): number | null => {
  const priced = lines.filter((l) => l.unit_price !== null);
  if (!priced.length) return null;
  return Math.round(priced.reduce((sum, l) => sum + l.quantity * l.unit_price!, 0) * 100) / 100;
};

/**
 * The tax of each rate the priced lines have — on their amount before tax —,
 * the highest rate first. A line without a tax has none.
 */
export const orderTaxes = (
  lines: Pick<OrderLine, "quantity" | "unit_price" | "tax">[],
): { rate: number; amount: number }[] => {
  const byRate = new Map<number, number>();
  for (const l of lines) {
    if (l.unit_price === null || l.tax === null) continue;
    byRate.set(l.tax, (byRate.get(l.tax) ?? 0) + (l.quantity * l.unit_price * l.tax) / 100);
  }
  return [...byRate]
    .sort(([a], [b]) => b - a)
    .map(([rate, amount]) => ({ rate, amount: Math.round(amount * 100) / 100 }));
};

/** An amount, in French, with its currency's symbol — or its code. */
export const formatAmount = (amount: number | null, currency: OrderCurrency | null): string => {
  if (amount === null) return "";
  const text = amount.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const unit = currency?.symbol || currency?.code || "";
  return unit ? `${text} ${unit}` : text;
};

// --- Limits ------------------------------------------------------------------

/** A number, drawn by a format, holds this many characters at most. */
export const ORDER_NUMBER_MAX = 100;
export const ORDER_LINES_MAX = 500;
export const ORDER_QUANTITY_MAX = 1_000_000;
export const ORDER_PRICE_MAX = 100_000_000;
/** A section's title, a note's text, hold this many characters at most. */
export const ORDER_SECTION_MAX = 200;
export const ORDER_NOTE_MAX = 4000;

// --- Numbering formats -------------------------------------------------------

/** The two formats of a widget: its quotes', its orders'. */
export const ORDER_NUMBER_FORMATS = [
  { value: "quote", label: "Devis", prefix: "D" },
  { value: "order", label: "Commande", prefix: "C" },
] as const;

export type OrderNumberFormat = (typeof ORDER_NUMBER_FORMATS)[number]["value"];

export const isOrderNumberFormat = (value: unknown): value is OrderNumberFormat =>
  ORDER_NUMBER_FORMATS.some((f) => f.value === value);

/** The format a status numbers with: a quote's, an order's; cancelled, none — it keeps its own. */
export const orderNumberFormat = (status: OrderStatus): OrderNumberFormat | null =>
  status === "cancelled" ? null : status;

/** The function a format declares, which gives the number. */
export const ORDER_NUMBER_FUNCTION = "orderNumber";

/** The variable of the count: replaced, before the run, by the index — a number. */
export const ORDER_INDEX_VARIABLE = "{{index}}";

/** A format of a widget, its code. */
export interface OrderNumberTemplate {
  format: OrderNumberFormat;
  code: string;
}

/** A widget's formats, and the variables their code may hold — "{{index}}". */
export interface OrderNumberTemplates {
  templates: OrderNumberTemplate[];
  variables: AssetNumberVariable[];
}

/**
 * What a format starts from: its letter, the year and the month, then the
 * index on 3 digits — "D202610/042".
 */
export const defaultOrderNumberCode = (format: OrderNumberFormat): string => {
  const { label, prefix } = ORDER_NUMBER_FORMATS.find((f) => f.value === format)!;
  return `// Le numéro ${format === "quote" ? "du devis" : "de la commande"} : « ${prefix} », l'année et le mois, « / », puis le
// compteur sur 3 chiffres.
//
// ${ORDER_INDEX_VARIABLE} est remplacé, avant l'exécution, par le prochain numéro du compteur
// « ${label} » du widget : un nombre, à partir de 1, qui augmente de 1 à chaque numéro donné.

function ${ORDER_NUMBER_FUNCTION}(): string {
  const index: number = ${ORDER_INDEX_VARIABLE};
  const now = new Date();

  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");

  return \`${prefix}\${year}\${month}/\${String(index).padStart(3, "0")}\`;
}
`;
};

/** True when a format's code is no longer the one it starts from. */
export const isCustomOrderNumberCode = (format: OrderNumberFormat, code: string): boolean =>
  code.trim() !== defaultOrderNumberCode(format).trim();

/** Beyond this, a format's code is no longer one. */
export const ORDER_NUMBER_CODE_MAX = 20_000;

// --- Default contents --------------------------------------------------------

/**
 * Which e-mails to the supplier a default content is offered in: "Tous les
 * messages" in all — a signature —; by the order's status, "Demande de devis"
 * (a quote), "Confirmation de commande" (an order), "Annulation de commande"
 * (cancelled) — the default text until a message went out in that status —;
 * "Nouveau message", the default text after. A content saved with an event
 * since removed is placed nowhere.
 */
export const ORDER_CONTENT_EVENTS = [
  { value: "all", label: "Tous les messages" },
  { value: "new", label: "Nouveau message" },
  { value: "quote_request", label: "Demande de devis" },
  { value: "confirmation", label: "Confirmation de commande" },
  { value: "cancellation", label: "Annulation de commande" },
] as const;

export type OrderContentEvent = (typeof ORDER_CONTENT_EVENTS)[number]["value"];

export const isOrderContentEvent = (value: unknown): value is OrderContentEvent =>
  ORDER_CONTENT_EVENTS.some((e) => e.value === value);

/** An order's default content: a title, its HTML template, the event that places it. */
export interface OrderContent {
  id: Id;
  name: string;
  html: string;
  /** "null": it is placed nowhere. */
  event: OrderContentEvent | null;
}

/** A table of the previews, as an order's e-mail lays it out: a header row, then a row each. */
const sampleTable = (head: string[], rows: string[][]): string => {
  const cell = (tag: string, text: string, i: number) =>
    `<${tag} style="padding:0;margin:0;border-bottom:1px solid #dee2e6;text-align:${i ? "right" : "left"}">${text}</${tag}>`;
  const row = (tag: string, cells: string[]) => `<tr>${cells.map((c, i) => cell(tag, c, i)).join("")}</tr>`;
  return `<table style="width:100%;border-collapse:collapse;margin:0;padding:0" cellpadding="0" cellspacing="0">${row("th", head)}${rows.map((r) => row("td", r)).join("")}</table>`;
};

const SAMPLE_LINES_HTML = sampleTable(
  ["Produit", "Qté", "PU", "Montant"],
  [
    ["T-shirt — Noir / M", "10", "8,50 €", "85,00 €"],
    ["Casquette", "5", "6,00 €", "30,00 €"],
  ],
);

const SAMPLE_REFERENCES_HTML = sampleTable(
  ["Référence", "Quantité"],
  [
    ["TSH-BLK-M", "10"],
    ["CAS", "5"],
  ],
);

/**
 * What an order's default content may cite besides the user's: the order —
 * its tables as HTML ("html") —, its supplier, and the supplier's contact the
 * e-mail goes to — with the value the preview shows.
 */
export const ORDER_CONTENT_VARIABLES = [
  { group: "Commandes", key: "order.number", label: "Numéro", sample: "D202610/042" },
  { group: "Commandes", key: "order.supplier", label: "Fournisseur", sample: "Fournitures Durand" },
  { group: "Commandes", key: "order.due_date", label: "Échéance de livraison", sample: "15/11/2026" },
  { group: "Commandes", key: "order.lines", label: "Produits", sample: SAMPLE_LINES_HTML, html: true },
  {
    group: "Commandes",
    key: "orders.products",
    label: "Références et quantités",
    sample: SAMPLE_REFERENCES_HTML,
    html: true,
  },
  { group: "Commandes", key: "order.total", label: "Total", sample: "115,00 €" },
  { group: "Fournisseur", key: "supplier.name", label: "Nom", sample: "Fournitures Durand" },
  { group: "Fournisseur", key: "supplier.email", label: "E-mail", sample: "contact@durand.fr" },
  { group: "Contact fournisseur", key: "supplier_contact.first_name", label: "Prénom", sample: "Claire" },
  { group: "Contact fournisseur", key: "supplier_contact.last_name", label: "Nom", sample: "Martin" },
  { group: "Contact fournisseur", key: "supplier_contact.email", label: "E-mail", sample: "claire.martin@durand.fr" },
] as const;

// --- Exchanges ---------------------------------------------------------------

/**
 * A message of an order's "Échanges": an e-mail sent from Milo to its
 * supplier contacts — a quote request, a message written there —, as the
 * Support's thread shows a reply. Its text, as the first recipient read it.
 */
export interface OrderMessage {
  id: Id;
  order_id: Id;
  /** The order's status when it was sent; null, not known — sent before it was noted. */
  order_status: OrderStatus | null;
  text: string;
  author: Actor | null;
  /** "sent", "simulated" or "failed" (SupportMailStatus). */
  mail_status: "sent" | "simulated" | "failed";
  /** Its recipients, and its copies, as addresses joined by ", ". */
  mail_to: string;
  mail_cc: string;
  mail_bcc: string;
  created_at: string;
  updated_at: string;
}
