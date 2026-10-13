// The warehouses: places entered by hand in a board's "Entrepôts" widgets
// (group "Logistique"), each in its own (LIST_KEY), with their labels, their
// name and their address — as a contact's (contacts.ts): two lines, a postal
// code, a town and a country, chosen among its widget's countries.

import { CONTACT_SETTINGS_DEFAULTS } from "./contacts.js";
import type { ContactCountry } from "./contacts.js";
import type { Id, Label } from "./domain.js";

/** The widget that owns its warehouses (LIST_KEY). */
export const WAREHOUSE_LIST_TYPE = "warehouse.list";

/** The routes: "/api/warehouses", "/api/warehouse-labels", "/api/warehouse-settings". */
export const WAREHOUSE_ROUTES = {
  warehouses: "/warehouses",
  labels: "/warehouse-labels",
  settings: "/warehouse-settings",
} as const;

export interface Warehouse {
  id: Id;
  board_id: Id;
  list_key: string;
  name: string;
  line1: string;
  line2: string;
  postal_code: string;
  city: string;
  country: string;
  labels: Label[];
  created_at: string;
  updated_at: string;
}

export interface WarehouseInput {
  name: string;
  line1: string;
  line2: string;
  postal_code: string;
  city: string;
  country: string;
  label_ids: Id[];
}

// --- A widget's lists ---------------------------------------------------------

export interface WarehouseSettings {
  /** The countries an address picks from: the first is a new warehouse's. */
  countries: ContactCountry[];
}

/** A widget's lists until it records its own: the contacts' countries. */
export const WAREHOUSE_SETTINGS_DEFAULTS: WarehouseSettings = {
  countries: CONTACT_SETTINGS_DEFAULTS.countries,
};

/** Its address on one line: "1 rue …, 75001 Paris, France". */
export const warehouseAddress = (
  w: Pick<Warehouse, "line1" | "line2" | "postal_code" | "city" | "country">,
): string =>
  [w.line1, w.line2, [w.postal_code, w.city].filter(Boolean).join(" "), w.country]
    .filter(Boolean)
    .join(", ");

// --- Limits ------------------------------------------------------------------

export const WAREHOUSE_NAME_MAX = 200;
export const WAREHOUSE_FIELD_MAX = 200;
