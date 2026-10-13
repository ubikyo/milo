// The locations: entered by hand in a board's "Emplacements" widgets (group
// "Logistique"), each in its own (LIST_KEY). A record has its labels, its
// warehouse — one of those of the Entrepôts widgets its drawer names
// (LOCATION_WAREHOUSE_SOURCES), on any board one sees — and its places: a
// tree, each place a name and a type. A record has no name of its own.
//
// A place's code is typed by hand when it is added, and given once in its
// widget. The widget's label templates print a place's label
// (label-templates.ts, "location").

import type { Id, Label } from "./domain.js";

/** The widget that owns its locations (LIST_KEY). */
export const LOCATION_LIST_TYPE = "location.list";

/** The routes: "/api/locations", "/api/location-labels". */
export const LOCATION_ROUTES = {
  locations: "/locations",
  labels: "/location-labels",
} as const;

/** The widget's configuration key: the Entrepôts widgets it reads. */
export const LOCATION_WAREHOUSE_SOURCES = "warehouse_sources";

/** What a place is. */
export const LOCATION_PLACE_TYPES = [
  { value: "supplier", label: "Fournisseur" },
  { value: "internal", label: "Interne" },
  { value: "customer", label: "Client" },
  { value: "loss", label: "Perte" },
  { value: "production", label: "Production" },
  { value: "transit", label: "Transit" },
] as const;

export type LocationPlaceType = (typeof LOCATION_PLACE_TYPES)[number]["value"];

export const isLocationPlaceType = (value: unknown): value is LocationPlaceType =>
  LOCATION_PLACE_TYPES.some((t) => t.value === value);

export const locationPlaceTypeLabel = (type: LocationPlaceType): string =>
  LOCATION_PLACE_TYPES.find((t) => t.value === type)?.label ?? type;

/** A new place's type, at the root. */
export const DEFAULT_LOCATION_PLACE_TYPE: LocationPlaceType = "internal";

/**
 * The types a place may hold under it: an internal one, internal places,
 * losses, production and transit; every other, only its own type.
 */
export const LOCATION_CHILD_TYPES: Record<LocationPlaceType, readonly LocationPlaceType[]> = {
  supplier: ["supplier"],
  internal: ["internal", "loss", "production", "transit"],
  customer: ["customer"],
  loss: ["loss"],
  production: ["production"],
  transit: ["transit"],
};

/** The types a place may take under this parent's type: any at the root. */
export const locationTypesUnder = (parent: LocationPlaceType | null): readonly LocationPlaceType[] =>
  parent === null ? LOCATION_PLACE_TYPES.map((t) => t.value) : LOCATION_CHILD_TYPES[parent];

/** The places whose type their parent's refuses, by id. */
export const misplacedLocationPlaces = (
  places: Pick<LocationPlace, "id" | "parent" | "type">[],
): Set<string> => {
  const typeOf = new Map(places.map((p) => [p.id, p.type]));
  return new Set(
    places
      .filter((p) => !locationTypesUnder(p.parent === null ? null : (typeOf.get(p.parent) ?? null)).includes(p.type))
      .map((p) => p.id),
  );
};

/**
 * A place of the tree: its parent's id, none at the root. The tree is stored
 * flat, a parent always before its children, in the order it is shown — as a
 * declared device's locations (declared-assets.ts).
 */
export interface LocationPlace {
  /** Drawn by the client. */
  id: string;
  parent: string | null;
  name: string;
  type: LocationPlaceType;
  /** Its code, typed by hand: required, given once in the widget. */
  code: string;
}

export interface Location {
  id: Id;
  board_id: Id;
  list_key: string;
  /** Its warehouse; null for none, or once deleted. */
  warehouse_id: Id | null;
  /** Its warehouse's name, read with it; empty without one. */
  warehouse_name: string;
  places: LocationPlace[];
  labels: Label[];
  created_at: string;
  updated_at: string;
}

export interface LocationInput {
  warehouse_id: Id | null;
  places: LocationPlace[];
  label_ids: Id[];
}

// --- Limits ------------------------------------------------------------------

export const LOCATION_PLACE_NAME_MAX = 120;
export const LOCATION_PLACES_MAX = 2000;
/** A code, typed by hand, holds this many characters at most. */
export const LOCATION_CODE_MAX = 15;
