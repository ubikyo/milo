// The widget types, and the permissions attached to them.
//
// A widget belongs to a type: those of the Access mode are shared by all
// modes ("common"), except those that read Microsoft 365 — the mail and
// calendar of whoever is looking ("m365"); those of a mode serve only that mode. The permission of a user or
// group is set type by type — Aucun, Utiliser, Modifier, Supprimer. Any widget
// on a board one sees can be read, with its data, whatever the permission.
// "Utiliser" places it on a board; "Modifier" changes its configuration and
// its data — "Support" at Modifier handles requests —; "Supprimer" removes it
// from a board, and deletes its data too.

import type { Mode } from "./modes.js";

export const WIDGET_KINDS = [
  { value: "common", label: "Commun" },
  { value: "m365", label: "365" },
  { value: "project", label: "Projet" },
  { value: "task", label: "Tâche" },
  { value: "helpdesk", label: "Support" },
  // Managed device assets: the workstations a GLPI agent inventories.
  { value: "managed_device_asset", label: "Équipements supervisés" },
  // The declared assets (declared-assets.ts): the equipment and the
  // applications entered by hand.
  { value: "unmanaged_device_asset", label: "Équipements déclarés" },
  { value: "application_asset", label: "Applications" },
  // The logistics: the contacts (contacts.ts).
  { value: "logistics", label: "Logistique" },
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
  { value: "view", label: "Utiliser" },
  { value: "update", label: "Modifier" },
  { value: "delete", label: "Supprimer" },
] as const;

export type WidgetAccess = (typeof WIDGET_ACCESS)[number]["value"];

/** The permission of each type. */
export type WidgetRights = Record<WidgetKind, WidgetAccess>;

/** The same permissions for all types. */
export const widgetRightsEverywhere = (access: WidgetAccess): WidgetRights =>
  Object.fromEntries(WIDGET_KINDS.map((k) => [k.value, access])) as WidgetRights;

/**
 * Permissions received from outside, reduced to what exists: a missing type
 * has nothing; one stored under its former name counts under its current one.
 */
export const validWidgetRights = (value: unknown): WidgetRights => {
  const source = renamedWidgetKinds(
    (value && typeof value === "object" ? value : {}) as Record<string, unknown>,
  );
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

/** Does this permission include that one? "Supprimer" includes "Modifier", which includes "Utiliser". */
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

/** "Utiliser" or better: the widget can be placed on a board. */
export const canUse = (access: WidgetAccess): boolean => access !== "";

/** "Modifier" or better. */
export const canUpdate = (access: WidgetAccess): boolean => accessIncludes(access, "update");

/** The types of each mode: its data follows the widest of them. */
export const MODE_KINDS: Record<Mode, readonly WidgetKind[]> = {
  access: ["common", "m365"],
  projects: ["project"],
  tasks: ["task"],
  support: ["helpdesk"],
  assets: ["managed_device_asset"],
};

/**
 * The widgets common to all views, without a prefix: the titles, the link,
 * the attributes, the clock, the date, the quote, the RSS feed, the images, the weather, the
 * to-do list — and those of Microsoft 365 (WIDGETS_365), the calendar and
 * the mail.
 */
export const COMMON_WIDGET_TYPES = [
  "category",
  "link",
  "number",
  "clock",
  "date",
  "quote",
  "rss",
  "image",
  "weather",
  "calendar",
  "mail",
  "todo",
] as const;

/**
 * The mail widgets that count rather than list: the "Indicateur" (unread,
 * total…) and "Messages par dossier". They name no mailbox: each counts what a
 * Mail widget of its board reads (MAIL_SOURCE), under that one's consent.
 */
export const MAIL_COUNT_TYPES = ["mail_count", "mail_folders"] as const;

/** The Mail widget a counting one follows: its id; absent, all the board's. */
export const MAIL_SOURCE = "source";

/**
 * The folders "Messages par dossier" counts, by person of its Mail widget
 * ({ "email": …, "folders": [ids] }); a person with none chosen, those the Mail
 * widget reads.
 */
export const COUNTED_FOLDERS = "counted_folders";

export const countedFoldersOf = (config: unknown): Map<string, string[]> =>
  choicesByPerson(config, COUNTED_FOLDERS, "folders");

/** The Mail widget a configuration follows; null: all the board's. */
export const mailSourceOf = (config: unknown): number | null => {
  const value = Number((config as Record<string, unknown> | null)?.[MAIL_SOURCE]);
  return Number.isInteger(value) && value > 0 ? value : null;
};

/**
 * The calendar widgets that follow a Calendar widget of their board
 * (CALENDAR_SOURCE) and read what it reads, under its consent: "Rendez-vous",
 * the appointments listed, and its "Indicateur", their number.
 */
export const APPOINTMENT_TYPES = ["appointments", "appointment_count"] as const;

/** The Calendar widget an appointment widget follows: its id; absent, all the board's. */
export const CALENDAR_SOURCE = "source";

/** The Calendar widget a configuration follows; null: all the board's. */
export const calendarSourceOf = (config: unknown): number | null => {
  const value = Number((config as Record<string, unknown> | null)?.[CALENDAR_SOURCE]);
  return Number.isInteger(value) && value > 0 ? value : null;
};

/**
 * The widgets specific to a data type, under their prefix: those of
 * Support ("support."), Assets ("managed_device_asset."), projects
 * ("project.") and tasks ("task.").
 */
const OWN = {
  support: ["list", "tickets", "status", "actors", "trend", "age", "due", "labels", "senders"],
  managed_device_asset: ["list", "assets", "compliance", "systems", "disks"],
  unmanaged_device_asset: ["list"],
  application_asset: ["list"],
  contact: ["list", "contacts"],
  project: ["list", "projects", "progress", "categories", "actors", "labels"],
  task: ["list", "cards", "lists", "due", "members", "labels"],
} as const;

/** The prefix of the widgets of each data type, and the widget type that goes with it. */
const PREFIXES: Record<keyof typeof OWN, WidgetKind> = {
  support: "helpdesk",
  managed_device_asset: "managed_device_asset",
  unmanaged_device_asset: "unmanaged_device_asset",
  application_asset: "application_asset",
  contact: "logistics",
  project: "project",
  task: "task",
};

/** The widget types, and permissions, named before the assets were named by kind. */
const RENAMED_KINDS: Record<string, WidgetKind> = {
  asset: "managed_device_asset",
  unmanaged_asset: "unmanaged_device_asset",
};

/**
 * A widget type as it was stored before the assets were named by kind —
 * "asset.list", "unmanaged_asset.list" —, as it is now; any other, as is.
 * A layout exported before still imports.
 */
export const renamedWidgetType = (type: string): string => {
  const dot = type.indexOf(".");
  const kind = dot < 0 ? undefined : RENAMED_KINDS[type.slice(0, dot)];
  return kind ? `${kind}${type.slice(dot)}` : type;
};

/** Permissions by type, stored under the former names: under the current ones. */
export const renamedWidgetKinds = (rights: Record<string, unknown>): Record<string, unknown> =>
  Object.fromEntries(Object.entries(rights).map(([kind, access]) => [RENAMED_KINDS[kind] ?? kind, access]));

/**
 * Everything a section can carry: the string stored in the database, which
 * never changes. It is the client widget that knows how to display and
 * configure it; the server only checks that it exists.
 */
export const BOARD_WIDGET_TYPES: readonly string[] = [
  ...COMMON_WIDGET_TYPES,
  ...MAIL_COUNT_TYPES,
  ...APPOINTMENT_TYPES,
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
  "managed_device_asset.list",
  "unmanaged_device_asset.list",
  "application_asset.list",
  "contact.list",
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
 * The configuration key of a Calendar widget that designates it: the consents
 * of the people whose calendar it shows are its own (server,
 * lib/calendar-optin.ts). Born with the widget, it never changes, and its
 * personal copy keeps it.
 */
export const CALENDAR_KEY = "calendar_key";

/** The calendar key of a configuration; empty if it carries none. */
export const calendarKey = (config: unknown): string => {
  const value = (config as Record<string, unknown> | null)?.[CALENDAR_KEY];
  return typeof value === "string" ? value : "";
};

/**
 * The Calendar widget's other people: their addresses, as rows
 * ({ "email": … }), and those whose appointments it shows — with, for each,
 * the Outlook calendars read ({ "email": …, "calendars": [ids] }).
 */
export const CALENDAR_PEOPLE = "calendars";
export const SHOWN_CALENDARS = "shown_calendars";

/**
 * The calendars read, by person's address in lowercase. An empty list stands
 * for the person's main calendar: that is how the first widgets kept it, a
 * bare address.
 */
export const shownCalendarsOf = (config: unknown): Map<string, string[]> =>
  choicesByPerson(config, SHOWN_CALENDARS, "calendars");

/**
 * What a widget reads of each person who consented — their calendars, their
 * mail folders —, by address in lowercase: the entries { email, [field]: ids }
 * of the configuration key "key". A bare address counts as an empty choice.
 */
export const choicesByPerson = (
  config: unknown,
  key: string,
  field: string,
): Map<string, string[]> => {
  const value = (config as Record<string, unknown> | null)?.[key];
  const shown = new Map<string, string[]>();
  if (!Array.isArray(value)) return shown;
  for (const entry of value as unknown[]) {
    if (typeof entry === "string") {
      if (entry.trim()) shown.set(entry.trim().toLowerCase(), []);
      continue;
    }
    const record = (entry ?? {}) as Record<string, unknown>;
    const email = record.email;
    if (typeof email !== "string" || !email.trim()) continue;
    const chosen = record[field];
    const ids = Array.isArray(chosen)
      ? chosen.filter((c): c is string => typeof c === "string" && c !== "")
      : [];
    shown.set(email.trim().toLowerCase(), ids);
  }
  return shown;
};

/**
 * The configuration key of a Mail widget that designates it: like a
 * calendar's (CALENDAR_KEY), the consents of the people whose mailbox it
 * reads are its own (server, lib/mail-optin.ts).
 */
export const MAIL_KEY = "mail_key";

/** The mail key of a configuration; empty if it carries none. */
export const mailKey = (config: unknown): string => {
  const value = (config as Record<string, unknown> | null)?.[MAIL_KEY];
  return typeof value === "string" ? value : "";
};

/**
 * The Mail widget's other people: their addresses, as rows ({ "email": … }),
 * and, for those who consented, the folders read ({ "email": …, "folders":
 * [ids] }) — none chosen, their inbox.
 */
export const MAIL_PEOPLE = "mail_people";
export const SHOWN_FOLDERS = "shown_folders";

export const shownFoldersOf = (config: unknown): Map<string, string[]> =>
  choicesByPerson(config, SHOWN_FOLDERS, "folders");

/**
 * The key a widget owns, under the field its type stores it in: a list's
 * (LIST_KEY), a calendar's (CALENDAR_KEY), a Mail widget's (MAIL_KEY); empty
 * for the others, or for a widget not yet saved.
 */
export const ownKeyOf = (type: string, config: unknown): string => {
  if (isListWidgetType(type)) return listKey(config);
  if (type === "calendar") return calendarKey(config);
  if (type === "mail") return mailKey(config);
  return "";
};

/** The number of identifiers of 4 digits and letters. */
const REFERENCES = 36 ** 4;

/**
 * A widget's identifier, as its drawer shows it: "#" and 4 digits and letters,
 * drawn from its key — random, born with the widget, never changed. Empty for
 * a widget that owns no key.
 */
export const widgetReference = (type: string, config: unknown): string => {
  const hex = ownKeyOf(type, config).replace(/[^0-9a-f]/gi, "").slice(0, 8);
  if (!hex) return "";
  const value = parseInt(hex, 16) % REFERENCES;
  return `#${value.toString(36).toUpperCase().padStart(4, "0")}`;
};

/**
 * The widgets that read Microsoft 365, through Entra: the calendar (the
 * Outlook agenda) and its appointments, the mail (the inbox) and its counts.
 * Their type is "m365".
 */
export const WIDGETS_365: readonly string[] = [
  "calendar",
  "mail",
  ...MAIL_COUNT_TYPES,
  ...APPOINTMENT_TYPES,
];

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
