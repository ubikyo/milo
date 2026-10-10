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

/** The lists of a board's Produits widgets, shared by all of them. */
export interface ProductSettings {
  categories: ProductCategory[];
}

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

/** A value of a variant: its name, its color — a label's. */
export interface ProductVariantValue {
  name: string;
  color: string;
}

/** A variant: an attribute, and its values in their order. */
export interface ProductVariant {
  attribute: string;
  values: ProductVariantValue[];
}

export interface Product {
  id: Id;
  board_id: Id;
  list_key: string;
  name: string;
  favorite: boolean;
  notes: string;
  tracking: ProductTracking;
  /** A category of its board's tree, by its id; empty, none. */
  category: string;
  variants: ProductVariant[];
  labels: Label[];
  created_at: string;
  updated_at: string;
}

export interface ProductInput {
  name: string;
  favorite: boolean;
  notes: string;
  tracking: ProductTracking;
  category: string;
  variants: ProductVariant[];
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
export const PRODUCT_NOTES_MAX = 4000;
export const PRODUCT_FIELD_MAX = 200;
/** How many variants a product has at most, and how many values each. */
export const PRODUCT_VARIANTS_MAX = 50;
export const PRODUCT_VALUES_MAX = 100;
