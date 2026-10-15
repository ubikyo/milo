// The value lists: entered in a board's "Liste" widgets (group "Objets"),
// each its own (LIST_KEY) — a name each, in their order, under an id that
// never changes. The widget names its list (VALUE_LIST_NAME), what it holds
// (VALUE_TYPE_NAME) and its gender (VALUE_TYPE_GENDER): "Aucun {type}",
// "Aucune {type}", "Ajouter {type}".
//
// A widget that offers a list's items names the Liste widgets it reads
// (VALUE_SOURCES): a choice keeps the item's id, and shows its name.

/** The widget that owns its items (LIST_KEY). */
export const VALUE_LIST_TYPE = "value.list";

/** The route: "/api/value-lists", "?board=&list=". */
export const VALUE_LIST_ROUTES = {
  items: "/value-lists",
} as const;

/** The configuration key of a widget that offers items: the Liste widgets it reads. */
export const VALUE_SOURCES = "value_sources";

/** The configuration keys: the list's name, and the name of what it holds. */
export const VALUE_LIST_NAME = "list_name";
export const VALUE_TYPE_NAME = "type_name";
export const VALUE_TYPE_GENDER = "type_gender";

/** The gender of what the list holds: masculine until the drawer says otherwise. */
export const VALUE_TYPE_GENDERS = [
  { value: "masculine", label: "Masculin" },
  { value: "feminine", label: "Féminin" },
] as const;

export type ValueTypeGender = (typeof VALUE_TYPE_GENDERS)[number]["value"];

export const VALUE_TYPE_GENDER_DEFAULT: ValueTypeGender = "masculine";

/** What a list holds, until its drawer names it. */
export const VALUE_TYPE_DEFAULT = "élément";

/**
 * A list's item: its id, drawn by the server when it is added and never
 * changed — what a choice keeps —, and its name, required — what it shows.
 */
export interface ValueItem {
  id: string;
  name: string;
}

/** An item received: a new one has no id yet. */
export type ValueItemInput = Pick<ValueItem, "name"> & { id?: string };

/** How many items a list has at most, and the longest name. */
export const VALUE_ITEMS_MAX = 500;
export const VALUE_NAME_MAX = 120;

const textOf = (config: unknown, key: string): string => {
  const value = (config as Record<string, unknown> | null)?.[key];
  return typeof value === "string" ? value.trim() : "";
};

/** The list's name; empty when not given. */
export const valueListName = (config: unknown): string => textOf(config, VALUE_LIST_NAME);

/** The name of what the list holds: "contrat"; its default when not given. */
export const valueTypeName = (config: unknown): string =>
  textOf(config, VALUE_TYPE_NAME) || VALUE_TYPE_DEFAULT;

/** The name of what the list holds, as a title: "Contrat", "Élément". */
export const valueTypeTitle = (config: unknown): string => {
  const type = valueTypeName(config);
  return type.charAt(0).toUpperCase() + type.slice(1);
};

/** The gender of what the list holds; masculine when not given. */
export const valueTypeGender = (config: unknown): ValueTypeGender =>
  textOf(config, VALUE_TYPE_GENDER) === "feminine" ? "feminine" : VALUE_TYPE_GENDER_DEFAULT;

/** The empty list, agreed with its type: "Aucun contrat", "Aucune marque". */
export const valueListEmpty = (config: unknown): string =>
  `${valueTypeGender(config) === "feminine" ? "Aucune" : "Aucun"} ${valueTypeName(config)}`;
