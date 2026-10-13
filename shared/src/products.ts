// The products: entered by hand in a board's "Produits" widgets (group
// "Logistique"), each in its own (LIST_KEY), with their labels, a favorite
// mark, notes, how their stock is tracked, their variants, their photos, their
// documents and their comment thread.
//
// A product's variants are its own: its attributes ("Couleur"), each with its
// values ("Noir", "Rouge", "Bleu"), colored and ordered as labels in their
// groups — and edited the same way. Its category is a place of its board's
// categories tree, as a declared device's location (declared-assets.ts).

import type { Actor, Id, Label, SqliteBool } from "./domain.js";

/** The widget that owns its products (LIST_KEY). */
export const PRODUCT_LIST_TYPE = "product.list";

/** The routes: "/api/products", "/api/product-labels", "/api/product-settings". */
export const PRODUCT_ROUTES = {
  products: "/products",
  labels: "/product-labels",
  settings: "/product-settings",
} as const;

/**
 * A category of the board's tree — "Vêtements > Hauts > T-shirts" —: its
 * parent's id, none at the root. Stored flat, a parent before its children.
 */
export interface ProductCategory {
  /** Drawn by the client; what a product stores to designate its category. */
  id: string;
  parent: string | null;
  name: string;
}

/** A tax a supplier's price is given: its rate, in percent. */
export interface ProductTax {
  rate: number;
}

/** The lists of a board's Produits widgets, shared by all of them. */
export interface ProductSettings {
  categories: ProductCategory[];
  /** In their order: the first is a new price's. */
  taxes: ProductTax[];
}

/** A widget's taxes until it records its own. */
export const PRODUCT_TAX_DEFAULTS: ProductTax[] = [{ rate: 20 }, { rate: 0 }];

/** How many taxes a widget has at most, and the largest rate. */
export const PRODUCT_TAXES_MAX = 50;
export const PRODUCT_TAX_MAX = 100;

/** A rate as it reads: "20 %", "5,5 %". */
export const taxLabel = (rate: number): string => `${rate.toLocaleString("fr-FR")} %`;

/** How a product's stock is tracked: by default, it is not. */
export const PRODUCT_TRACKINGS = [
  { value: "none", label: "Aucun" },
  { value: "serial", label: "Par numéro de série" },
  { value: "quantity", label: "Par quantité" },
] as const;

export type ProductTracking = (typeof PRODUCT_TRACKINGS)[number]["value"];

export const isProductTracking = (value: unknown): value is ProductTracking =>
  PRODUCT_TRACKINGS.some((t) => t.value === value);

export const productTrackingLabel = (tracking: ProductTracking): string =>
  PRODUCT_TRACKINGS.find((t) => t.value === tracking)?.label ?? tracking;

/** A value of a variant: its name, its color — a label's —, its SKU. */
export interface ProductVariantValue {
  name: string;
  color: string;
  /** Its own reference — "BLK" —; empty, none. */
  sku: string;
}

/**
 * A price of a product at a supplier: a company of a Contact widget — of any
 * board —, in its currency. Without a minimum quantity, it holds for any
 * quantity, and may be left out (null); from a minimum, it is required. A
 * supplier may have several, one per minimum — one without. An order's line
 * takes the one its quantity reaches (supplierPrice, orders.ts).
 */
export interface ProductSupplier {
  contact_id: Id;
  min_quantity: number | null;
  price: number | null;
  /** Its tax's rate, in percent — one of the widget's taxes —; null, none chosen. */
  tax: number | null;
}

/**
 * The price of a product at a supplier for a quantity: that of the largest
 * minimum it reaches — none counting as the smallest —, the smallest one's
 * below them all. Null without one.
 */
export const supplierPrice = (
  suppliers: ProductSupplier[],
  contactId: Id,
  quantity: number,
): number | null => supplierTier(suppliers, contactId, quantity)?.price ?? null;

/** The tier of a product's prices at a supplier a quantity reaches, as supplierPrice; none without a price. */
export const supplierTier = (
  suppliers: ProductSupplier[],
  contactId: Id,
  quantity: number,
): ProductSupplier | null => {
  const tiers = suppliers
    .filter((s) => s.contact_id === contactId && s.price !== null)
    .sort((a, b) => (a.min_quantity ?? 0) - (b.min_quantity ?? 0));
  if (!tiers.length) return null;
  const reached = tiers.filter((t) => (t.min_quantity ?? 0) <= quantity);
  return reached.at(-1) ?? tiers[0]!;
};

/** A variant: an attribute, and its values in their order. */
export interface ProductVariant {
  attribute: string;
  values: ProductVariantValue[];
}

/**
 * A product's reference for a variant: its SKU, then each value's, in the
 * order of its attributes, joined by "-" — "TSH-BLK-M". A SKU left empty
 * adds nothing, not even its "-".
 */
export const productReference = (
  product: Pick<Product, "sku" | "variants">,
  /** A value per attribute, by name, in their order; empty without variants. */
  variant: string[],
): string =>
  [
    product.sku,
    ...product.variants.map((v, i) => v.values.find((x) => x.name === variant[i])?.sku ?? ""),
  ]
    .map((sku) => sku.trim())
    .filter(Boolean)
    .join("-");

export interface Product {
  id: Id;
  board_id: Id;
  list_key: string;
  /** Its reference — Stock Keeping Unit —; empty, none. */
  sku: string;
  name: string;
  /**
   * Archived: kept, no longer offered to an order. A product an order cites
   * is archived, never deleted ("used").
   */
  archived: boolean;
  /** Cited by a quote or an order: it can no longer be deleted. */
  used: boolean;
  favorite: boolean;
  notes: string;
  tracking: ProductTracking;
  /** A category of its board's tree, by its id; empty, none. */
  category: string;
  variants: ProductVariant[];
  suppliers: ProductSupplier[];
  labels: Label[];
  created_at: string;
  updated_at: string;
}

export interface ProductInput {
  sku: string;
  name: string;
  favorite: boolean;
  notes: string;
  tracking: ProductTracking;
  category: string;
  variants: ProductVariant[];
  suppliers: ProductSupplier[];
  label_ids: Id[];
}

/** A photo of a product: an image of the media folder, in its order. */
export interface ProductPhoto {
  id: Id;
  product_id: Id;
  file: string;
  name: string;
  size: number;
  position: number;
  created_at: string;
  /** Where to read it: "/api/media/<file>". */
  url: string;
}

/** A document of a product, as a card's attachment. */
export interface ProductAttachment extends ProductPhoto {
  mime: string;
  /** True for the images the server returns as is. */
  is_image: boolean;
}

/** A product's files, read when its drawer opens. */
export interface ProductFiles {
  photos: ProductPhoto[];
  attachments: ProductAttachment[];
}

/** A comment of a product's thread, as a card's. */
export interface ProductComment {
  id: Id;
  product_id: Id;
  user_id: Id | null;
  text: string;
  system: SqliteBool;
  created_at: string;
  updated_at: string;
  author: Actor | null;
}

// --- Limits ------------------------------------------------------------------

export const PRODUCT_NAME_MAX = 200;
export const PRODUCT_SKU_MAX = 100;
export const PRODUCT_NOTES_MAX = 4000;
export const PRODUCT_FIELD_MAX = 200;
/** How many variants a product has at most, and how many values each. */
export const PRODUCT_VARIANTS_MAX = 50;
export const PRODUCT_VALUES_MAX = 100;
/** How many suppliers a product has at most, and the largest price. */
export const PRODUCT_SUPPLIERS_MAX = 200;
export const PRODUCT_QUANTITY_MAX = 1_000_000;
export const PRODUCT_PRICE_MAX = 100_000_000;
