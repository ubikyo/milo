// The "Indicateurs" widgets ("indicator."): each shows a figure — a number, a
// breakdown, a ring… — of the data chosen in its drawer (INDICATOR_DATA), any
// list widget kind that gives one (client widgets/indicators). They replace
// the figures each kind used to carry under its own prefix — "support.tickets",
// "project.categories"… —: legacyIndicator says what each of those becomes,
// for the databases and the layouts saved before.

import { migrateWidgetConfig } from "./widget-config.js";

/**
 * An indicator's data: the prefix of the list widgets it reads —
 * "unmanaged_device_asset" —, or "mail" for the Mail widgets.
 */
export const INDICATOR_DATA = "data";

/** The "Indicateurs" types, in the order the widgets drawer shows them. */
export const INDICATOR_TYPES = [
  "count",
  "breakdown",
  "columns",
  "donut",
  "radar",
  "actors",
  "trend",
  "compliance",
] as const;

export type IndicatorType = (typeof INDICATOR_TYPES)[number];

/** What an indicator's configuration names, beside its data (INDICATOR_DATA). */
export const INDICATOR_MEASURE = "measure";
export const INDICATOR_DIMENSION = "dimension";
export const INDICATOR_LIMIT = "limit";
/** True: the slices that weigh nothing show too. */
export const INDICATOR_ZEROS = "zeros";
/** The order the slices show in: INDICATOR_ORDERS, "default" while none is chosen. */
export const INDICATOR_ORDER = "order";
export const INDICATOR_ORDERS = ["default", "desc", "asc", "name"] as const;
export type IndicatorOrder = (typeof INDICATOR_ORDERS)[number];
export const INDICATOR_DATE = "date";
export const INDICATOR_PERIOD = "days";

/** Beyond any breakdown: what "no limit" was before. */
const ALL_BARS = 50;

type Config = Record<string, unknown>;

const own = (config: unknown): Config =>
  config && typeof config === "object" && !Array.isArray(config) ? { ...(config as Config) } : {};

const flag = (config: Config, key: string) => config[key] === true;

/**
 * What each former figure becomes: its "Indicateurs" type, and its
 * configuration — the data, measure and dimension that gave the same
 * figure; its name, sources, colors and other keys kept.
 */
const LEGACY: Record<string, (config: Config) => { type: IndicatorType; config: Config }> = {
  "support.tickets": (c) => ({ type: "count", config: { ...c, [INDICATOR_DATA]: "support", [INDICATOR_MEASURE]: c.type ?? "open" } }),
  "support.status": (c) => ({ type: "radar", config: { ...c, [INDICATOR_DATA]: "support", [INDICATOR_DIMENSION]: "status", [INDICATOR_MEASURE]: "total" } }),
  "support.actors": (c) => ({ type: "actors", config: { ...c, [INDICATOR_DATA]: "support", [INDICATOR_DIMENSION]: "actors", [INDICATOR_MEASURE]: "total" } }),
  "support.trend": (c) => ({ type: "trend", config: { ...c, [INDICATOR_DATA]: "support", [INDICATOR_DATE]: "created", [INDICATOR_MEASURE]: "total" } }),
  "support.age": (c) => ({ type: "columns", config: { ...c, [INDICATOR_DATA]: "support", [INDICATOR_DIMENSION]: "age", [INDICATOR_MEASURE]: "ongoing" } }),
  "support.due": (c) => ({ type: "donut", config: { ...c, [INDICATOR_DATA]: "support", [INDICATOR_DIMENSION]: "due", [INDICATOR_MEASURE]: "ongoing" } }),
  "support.labels": (c) => ({
    type: "breakdown",
    config: { ...c, [INDICATOR_DATA]: "support", [INDICATOR_DIMENSION]: "labels", [INDICATOR_MEASURE]: flag(c, "include_all") ? "total" : "ongoing", [INDICATOR_LIMIT]: ALL_BARS },
  }),
  "support.senders": (c) => ({
    type: "breakdown",
    config: { ...c, [INDICATOR_DATA]: "support", [INDICATOR_DIMENSION]: "senders", [INDICATOR_MEASURE]: "total", [INDICATOR_LIMIT]: typeof c.count === "number" ? c.count : 5 },
  }),
  "project.projects": (c) => ({ type: "count", config: { ...c, [INDICATOR_DATA]: "project", [INDICATOR_MEASURE]: c.type ?? "in_progress" } }),
  "project.progress": (c) => ({ type: "donut", config: { ...c, [INDICATOR_DATA]: "project", [INDICATOR_DIMENSION]: "progress", [INDICATOR_MEASURE]: "total" } }),
  "project.categories": (c) => ({
    type: "breakdown",
    config: { ...c, [INDICATOR_DATA]: "project", [INDICATOR_DIMENSION]: "categories", [INDICATOR_MEASURE]: flag(c, "include_all") ? "total" : "in_progress", [INDICATOR_LIMIT]: ALL_BARS },
  }),
  "project.actors": (c) => ({
    type: "actors",
    config: { ...c, [INDICATOR_DATA]: "project", [INDICATOR_DIMENSION]: "actors", [INDICATOR_MEASURE]: flag(c, "include_all") ? "total" : "in_progress" },
  }),
  "project.labels": (c) => ({
    type: "breakdown",
    config: { ...c, [INDICATOR_DATA]: "project", [INDICATOR_DIMENSION]: "labels", [INDICATOR_MEASURE]: flag(c, "include_all") ? "total" : "in_progress", [INDICATOR_LIMIT]: ALL_BARS },
  }),
  "task.cards": (c) => ({ type: "count", config: { ...c, [INDICATOR_DATA]: "task", [INDICATOR_MEASURE]: c.type ?? "total" } }),
  "task.lists": (c) => ({
    type: "breakdown",
    config: { ...c, [INDICATOR_DATA]: "task", [INDICATOR_DIMENSION]: "lists", [INDICATOR_MEASURE]: "total", [INDICATOR_LIMIT]: ALL_BARS, [INDICATOR_ZEROS]: true },
  }),
  "task.due": (c) => ({ type: "donut", config: { ...c, [INDICATOR_DATA]: "task", [INDICATOR_DIMENSION]: "due", [INDICATOR_MEASURE]: "total" } }),
  "task.members": (c) => ({ type: "actors", config: { ...c, [INDICATOR_DATA]: "task", [INDICATOR_DIMENSION]: "members", [INDICATOR_MEASURE]: "total" } }),
  "task.labels": (c) => ({
    type: "breakdown",
    config: { ...c, [INDICATOR_DATA]: "task", [INDICATOR_DIMENSION]: "labels", [INDICATOR_MEASURE]: "total", [INDICATOR_LIMIT]: ALL_BARS },
  }),
  "managed_device_asset.assets": (c) => ({ type: "count", config: { ...c, [INDICATOR_DATA]: "managed_device_asset", [INDICATOR_MEASURE]: c.type ?? "total" } }),
  "managed_device_asset.compliance": (c) => ({ type: "compliance", config: { ...c, [INDICATOR_DATA]: "managed_device_asset" } }),
  "managed_device_asset.systems": (c) => ({
    type: "donut",
    config: { ...c, [INDICATOR_DATA]: "managed_device_asset", [INDICATOR_DIMENSION]: "systems", [INDICATOR_MEASURE]: "total", [INDICATOR_LIMIT]: 5 },
  }),
  "managed_device_asset.disks": (c) => ({
    type: "breakdown",
    config: { ...c, [INDICATOR_DATA]: "managed_device_asset", [INDICATOR_DIMENSION]: "disks", [INDICATOR_MEASURE]: "total", [INDICATOR_LIMIT]: ALL_BARS },
  }),
  "contact.contacts": (c) =>
    c.type === "products"
      ? { type: "count", config: { ...c, [INDICATOR_DATA]: "product", [INDICATOR_MEASURE]: "total" } }
      : { type: "count", config: { ...c, [INDICATOR_DATA]: "contact", [INDICATOR_MEASURE]: c.type ?? "total" } },
  mail_count: (c) => ({ type: "count", config: { ...c, [INDICATOR_DATA]: "mail", [INDICATOR_MEASURE]: c.metric ?? "unread" } }),
  mail_folders: (c) => ({
    type: "breakdown",
    config: {
      ...c,
      [INDICATOR_DATA]: "mail",
      [INDICATOR_DIMENSION]: "folders",
      [INDICATOR_MEASURE]: c.counted === "unread" ? "unread" : "total",
      [INDICATOR_ZEROS]: flag(c, "withEmpty"),
      [INDICATOR_LIMIT]: ALL_BARS,
    },
  }),
};

/** The former figures' types: those legacyIndicator converts. */
export const LEGACY_INDICATOR_TYPES = Object.keys(LEGACY);

/**
 * A former figure, as an "Indicateurs" widget: "indicator.<type>" and its
 * configuration. Null for any other widget.
 */
export const legacyIndicator = (type: unknown, config: unknown): { type: string; config: Config } | null => {
  const convert = typeof type === "string" ? LEGACY[type] : undefined;
  if (!convert) return null;
  // Its keys first take their English names, as the former type stored them.
  const converted = convert(own(migrateWidgetConfig(type as string, config)));
  return { type: `indicator.${converted.type}`, config: converted.config };
};
