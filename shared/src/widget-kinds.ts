// The widget types, and the permissions attached to them.
//
// A widget belongs to a type: those of the Access mode are shared by all
// modes ("common"), except those that read Microsoft 365 — the mail and
// calendar of whoever is looking ("m365"); those of a mode serve only that mode. The permission of a user or
// group is set type by type — Aucun, Lire, Modifier, Supprimer — and applies
// to the widget as to its data: "Support" at Modifier means placing its
// widgets and handling requests; at Supprimer, deleting them too.

import type { Mode } from "./modes.js";

export const WIDGET_KINDS = [
  { value: "common", label: "Commun" },
  { value: "m365", label: "365" },
  { value: "project", label: "Projet" },
  { value: "task", label: "Tâche" },
  { value: "helpdesk", label: "Support" },
  { value: "asset", label: "Asset" },
] as const;

export type WidgetKind = (typeof WIDGET_KINDS)[number]["value"];

/** The label of a type, as the interface shows it. */
export const kindLabel = (kind: WidgetKind): string =>
  WIDGET_KINDS.find((k) => k.value === kind)?.label ?? kind;

/**
 * The permission on a type: none, read, edit, or delete — each one includes
 * the previous ones.
 */
export const WIDGET_ACCESS = [
  { value: "", label: "Aucun" },
  { value: "view", label: "Lire" },
  { value: "update", label: "Modifier" },
  { value: "delete", label: "Supprimer" },
] as const;

export type WidgetAccess = (typeof WIDGET_ACCESS)[number]["value"];

/** The permission of each type. */
export type WidgetRights = Record<WidgetKind, WidgetAccess>;

/** The same permissions for all types. */
export const widgetRightsEverywhere = (access: WidgetAccess): WidgetRights =>
  Object.fromEntries(WIDGET_KINDS.map((k) => [k.value, access])) as WidgetRights;

/** Permissions received from outside, reduced to what exists: a missing type has nothing. */
export const validWidgetRights = (value: unknown): WidgetRights => {
  const source = (value && typeof value === "object" ? value : {}) as Record<string, unknown>;
  return Object.fromEntries(
    WIDGET_KINDS.map((k) => [
      k.value,
      WIDGET_ACCESS.some((a) => a.value === source[k.value])
        ? (source[k.value] as WidgetAccess)
        : "",
    ]),
  ) as WidgetRights;
};

const RANK: Record<WidgetAccess, number> = { "": 0, view: 1, update: 2, delete: 3 };

/** Does this permission include that one? "Supprimer" includes "Modifier". */
export const accessIncludes = (access: WidgetAccess, wanted: WidgetAccess): boolean =>
  RANK[access] >= RANK[wanted];

/** The widest of two permissions. */
export const widestAccess = (a: WidgetAccess, b: WidgetAccess): WidgetAccess =>
  RANK[a] >= RANK[b] ? a : b;

/** Several sets of permissions combined — one's own and those of one's groups: the widest wins. */
export const mergeWidgetRights = (rightSets: WidgetRights[]): WidgetRights =>
  Object.fromEntries(
    WIDGET_KINDS.map((k) => [
      k.value,
      rightSets.reduce<WidgetAccess>((acc, rightSet) => widestAccess(acc, rightSet[k.value]), ""),
    ]),
  ) as WidgetRights;

/** "Lire" or better. */
export const canRead = (access: WidgetAccess): boolean => access !== "";

/** "Modifier" or better. */
export const canUpdate = (access: WidgetAccess): boolean => accessIncludes(access, "update");

/** The types of each mode: its data follows the widest of them. */
export const MODE_KINDS: Record<Mode, readonly WidgetKind[]> = {
  access: ["common", "m365"],
  projects: ["project"],
  tasks: ["task"],
  support: ["helpdesk"],
  assets: ["asset"],
};

/**
 * The widgets common to all views, without a prefix: the titles, the link,
 * the attributes, the clock, the RSS feed, the images, the weather, the
 * to-do list — and those of Microsoft 365 (WIDGETS_365), the calendar and
 * the mail.
 */
export const COMMON_WIDGET_TYPES = [
  "category",
  "subcategory",
  "link",
  "number",
  "clock",
  "rss",
  "image",
  "weather",
  "calendar",
  "mail",
  "todo",
] as const;

/**
 * The widgets specific to a data type, under their prefix: those of
 * Support ("support."), Assets ("asset."), projects
 * ("project.") and tasks ("task.").
 */
const OWN = {
  support: ["list", "tickets", "status", "actors", "trend", "age", "due", "labels", "senders"],
  asset: ["list", "assets", "compliance", "systems", "disks"],
  project: ["list", "projects", "progress", "categories", "actors", "labels"],
  task: ["list", "cards", "lists", "due", "members", "labels"],
} as const;

/** The prefix of the widgets of each data type, and the widget type that goes with it. */
const PREFIXES: Record<keyof typeof OWN, WidgetKind> = {
  support: "helpdesk",
  asset: "asset",
  project: "project",
  task: "task",
};

/**
 * Everything a section can carry: the string stored in the database, which
 * never changes. It is the client widget that knows how to display and
 * configure it; the server only checks that it exists.
 */
export const BOARD_WIDGET_TYPES: readonly string[] = [
  ...COMMON_WIDGET_TYPES,
  ...Object.entries(OWN).flatMap(([prefix, types]) =>
    types.map((type) => `${prefix}.${type}`),
  ),
];

export const isBoardWidgetType = (value: unknown): value is string =>
  typeof value === "string" && BOARD_WIDGET_TYPES.includes(value);

/**
 * The widgets that own their items: two "Projets" of the same
 * board do not show the same projects. Each carries, in its
 * configuration, the key of its list (LIST_KEY); its items also
 * carry it, and leave with the last widget that holds it.
 */
export const LIST_WIDGET_TYPES: readonly string[] = [
  "project.list",
  "task.list",
  "support.list",
  "asset.list",
];

export const isListWidgetType = (type: string): boolean => LIST_WIDGET_TYPES.includes(type);

/** The configuration key of a list widget that designates its items. */
export const LIST_KEY = "list_key";

/** The list key of a configuration; empty if it carries none. */
export const listKey = (config: unknown): string => {
  const value = (config as Record<string, unknown> | null)?.[LIST_KEY];
  return typeof value === "string" ? value : "";
};

/**
 * The widgets that read Microsoft 365, through Entra: the calendar (the
 * Outlook agenda) and the mail (the inbox). Their type is "m365".
 */
export const WIDGETS_365: readonly string[] = ["calendar", "mail"];

/** The widget type of a widget, from what the database stores about it. */
export const widgetKind = (type: string): WidgetKind => {
  if (WIDGETS_365.includes(type)) return "m365";
  const prefix = type.split(".")[0] as keyof typeof PREFIXES;
  return type.includes(".") && PREFIXES[prefix] ? PREFIXES[prefix] : "common";
};

/**
 * The stored type of a widget of the old panels — Support, Assets, Project,
 * Task —, under its prefix. Common widgets keep theirs.
 */
export const panelType = (
  panel: "support" | "assets" | "projects" | "tasks",
  type: string,
): string => {
  if ((COMMON_WIDGET_TYPES as readonly string[]).includes(type)) return type;
  const prefix = { support: "support", assets: "asset", projects: "project", tasks: "task" }[
    panel
  ];
  return `${prefix}.${type}`;
};
