// Permissions of an Entra user or group: in each
// workspace, one permission per widget type — Aucun, Lire, Modifier
// (widget-kinds.ts); for the whole application, the administration
// (ADMIN_SECTIONS).
//
// The rights of each mode — Voir, Ajouter, Modifier, Supprimer — that the
// routes and the interface check are derived from them: a mode follows the type of
// its widgets. The client uses them to hide what would be refused, the
// server to refuse.

import type { Id } from "./domain.js";
import { MODES } from "./modes.js";
import type { Mode } from "./modes.js";
import { MODE_KINDS, widestAccess } from "./widget-kinds.js";
import type { WidgetRights } from "./widget-kinds.js";

export const RIGHTS = [
  { value: "view", label: "Voir" },
  { value: "create", label: "Ajouter" },
  { value: "update", label: "Modifier" },
  { value: "delete", label: "Supprimer" },
] as const;

export type Right = (typeof RIGHTS)[number]["value"];

/** What the rights apply to: the modes. */
export const AREAS = MODES;

export type Area = Mode;

/** Rights, area by area. A missing area grants nothing. */
export type Permissions = Partial<Record<Area, Right[]>>;

/**
 * The rights an area offers. Assets are read-only: they come
 * from the inventory agents, nobody adds or edits them by hand.
 */
export const rightsFor = (area: Area): readonly Right[] =>
  area === "assets" ? ["view"] : RIGHTS.map((r) => r.value);

/** All the rights of all the areas: those of the "admin" account. */
export const allPermissions = (): Permissions =>
  Object.fromEntries(AREAS.map((a) => [a.value, [...rightsFor(a.value)]]));

/**
 * Rights received from outside, reduced to what exists: unknown
 * areas and rights an area does not offer are dropped, and
 * the order is that of RIGHTS.
 */
export const validPermissions = (value: unknown): Permissions => {
  const source = (value && typeof value === "object" ? value : {}) as Record<string, unknown>;
  const result: Permissions = {};
  for (const { value: area } of AREAS) {
    const requests = Array.isArray(source[area]) ? (source[area] as unknown[]) : [];
    const granted = rightsFor(area).filter((r) => requests.includes(r));
    if (granted.length > 0) result[area] = granted;
  }
  return result;
};

/**
 * The application's administration, section by section, and the rights each
 * one offers. Without a right, a section gives nothing. The "admin" account
 * has them all.
 *
 *   - Gestion du paramétrage: "Autorisée" opens it — the profile menu —, and
 *     changes what no other section covers (Affichage).
 *   - Gestion des workspaces: "Voir" opens their tab and each one's access,
 *     read-only; "Créer" adds one, renames them and sets their access;
 *     "Supprimer" deletes one.
 *   - Gestion des droits d'administration: the same, for the administration
 *     — its tab, adding someone and setting their rights, removing them.
 *   - Gestion des modèles d'email, Gestion des thèmes: "Autorisée" opens
 *     their tab.
 *
 * In the two lists, a right brings those before it: "Supprimer" requires
 * "Créer", which requires "Voir".
 */
export const ADMIN_SECTIONS = [
  {
    value: "settings",
    label: "Gestion du paramétrage",
    rights: [{ value: "access", label: "Autorisée" }],
  },
  {
    value: "workspaces",
    label: "Gestion des workspaces",
    rights: [
      { value: "view", label: "Voir" },
      { value: "create", label: "Créer" },
      { value: "delete", label: "Supprimer" },
    ],
  },
  {
    value: "administration",
    label: "Gestion des droits d'administration",
    rights: [
      { value: "view", label: "Voir" },
      { value: "create", label: "Créer" },
      { value: "delete", label: "Supprimer" },
    ],
  },
  {
    value: "templates",
    label: "Gestion des modèles d'email",
    rights: [{ value: "access", label: "Autorisée" }],
  },
  {
    value: "themes",
    label: "Gestion des thèmes",
    rights: [{ value: "access", label: "Autorisée" }],
  },
] as const;

export type AdminSection = (typeof ADMIN_SECTIONS)[number]["value"];

/** A section's rights. */
export type AdminRight<S extends AdminSection = AdminSection> = Extract<
  (typeof ADMIN_SECTIONS)[number],
  { value: S }
>["rights"][number]["value"];

/**
 * The administration of a user or a group, for the whole application: the
 * rights it holds in each section. It does not depend on any workspace —
 * their access, for its part, only covers widget types.
 */
export type AdminPermissions = { [S in AdminSection]: AdminRight<S>[] };

/** That of a user or a group that has none yet: no right. */
export const defaultAdminPermissions = (): AdminPermissions => ({
  settings: [],
  workspaces: [],
  administration: [],
  templates: [],
  themes: [],
});

/** What someone may do with workspaces, right by right. */
export type WorkspaceRights = { [R in AdminRight<"workspaces">]: boolean };

/** What someone may do with the administration, right by right. */
export type AdministrationRights = { [R in AdminRight<"administration">]: boolean };

/** All of them: the "admin" account's. */
export const fullAdminPermissions = (): AdminPermissions => ({
  settings: ["access"],
  workspaces: ["view", "create", "delete"],
  administration: ["view", "create", "delete"],
  templates: ["access"],
  themes: ["access"],
});

/** The sections whose rights follow one another: "Supprimer" ⇒ "Créer" ⇒ "Voir". */
const CHAINED: readonly AdminSection[] = ["workspaces", "administration"];

/**
 * A chained section's rights, straightened out: each right held brings those
 * before it in the list.
 */
const chained = (section: AdminSection, rights: string[]): string[] => {
  const order = ADMIN_SECTIONS.find((s) => s.value === section)!.rights.map((r) => r.value as string);
  const last = Math.max(-1, ...rights.map((r) => order.indexOf(r)));
  return order.slice(0, last + 1);
};

/**
 * An administration received from outside, reduced to what exists, in order;
 * in the chained sections, a right brings those before it.
 */
export const validAdminPermissions = (value: unknown): AdminPermissions => {
  const source = (value && typeof value === "object" ? value : {}) as Record<string, unknown>;
  const result = defaultAdminPermissions();
  for (const section of ADMIN_SECTIONS) {
    const received = source[section.value];
    const list = Array.isArray(received) ? received : [];
    const kept = section.rights.map((r) => r.value as string).filter((r) => list.includes(r));
    (result[section.value] as string[]) = CHAINED.includes(section.value)
      ? chained(section.value, kept)
      : kept;
  }
  return result;
};

/**
 * A chained section's rights after a change in the interface: removing a
 * right removes those after it, adding one adds those before it.
 */
export const normalizeAdminRights = (
  section: string,
  before: string[],
  after: string[],
): string[] => {
  if (!CHAINED.includes(section as AdminSection)) return after;
  const order = ADMIN_SECTIONS.find((s) => s.value === section)!.rights.map((r) => r.value as string);
  const removed = before.find((r) => !after.includes(r));
  if (removed) return order.slice(0, order.indexOf(removed)).filter((r) => after.includes(r));
  return chained(section as AdminSection, after);
};

/** Rights as stored, in JSON: unreadable, they grant nothing. */
export const parseAdminRights = (json: string): AdminPermissions => {
  try {
    return validAdminPermissions(JSON.parse(json));
  } catch {
    return defaultAdminPermissions();
  }
};

/** Their administration, merged — their own and their groups': each right held by one. */
export const mergeAdminPermissions = (all: AdminPermissions[]): AdminPermissions =>
  validAdminPermissions(
    Object.fromEntries(
      ADMIN_SECTIONS.map((s) => [s.value, all.flatMap((p) => p[s.value] as string[])]),
    ),
  );

/**
 * The rights of each mode, derived from the per-type permissions: a mode follows
 * the widest of its widgets' types. Its data is read by all — what a widget
 * shows can always be read; "Modifier" gives it everything the area offers
 * but deleting, "Supprimer" everything.
 */
export const widgetPermissions = (widgets: WidgetRights): Permissions => {
  const result: Permissions = {};
  for (const { value: area } of AREAS) {
    const access = MODE_KINDS[area].reduce(
      (acc, kind) => widestAccess(acc, widgets[kind]),
      "" as WidgetRights[keyof WidgetRights],
    );
    // "Modifier" gives everything the area offers but deleting; "Supprimer",
    // that too.
    if (access === "" || access === "view") result[area] = ["view"];
    if (access === "update") result[area] = rightsFor(area).filter((r) => r !== "delete");
    if (access === "delete") result[area] = [...rightsFor(area)];
  }
  return result;
};

/**
 * An account's rights, company by company: the key is the company
 * id. A missing company grants nothing. The "*" key applies to
 * all companies, including those created since: that is how the
 * per-widget-type permissions, common to all, are read.
 */
export type CompanyRights = Record<string, Permissions>;

/** The key of the rights that apply to all companies. */
export const ALL_COMPANIES = "*";

/**
 * Does the account have this right in this company? What belongs to no
 * company (a project without a company, a machine whose tag designates no one,
 * the Access mode) follows the rights of all its companies combined: it is enough
 * that one of them grants it.
 */
export const can = (
  rights: CompanyRights,
  area: Area,
  right: Right,
  companyId?: Id | string | null,
): boolean =>
  (rights[ALL_COMPANIES]?.[area]?.includes(right) ?? false) ||
  (companyId === null || companyId === undefined || companyId === ""
    ? Object.values(rights).some((p) => p[area]?.includes(right) ?? false)
    : (rights[String(companyId)]?.[area]?.includes(right) ?? false));

/** The companies where the account has this right. */
export const companiesWith = (rights: CompanyRights, area: Area, right: Right = "view"): Id[] =>
  Object.entries(rights)
    .filter(([id, p]) => id !== ALL_COMPANIES && p[area]?.includes(right))
    .map(([id]) => Number(id));
