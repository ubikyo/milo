// Permissions of an Entra user or group: in each
// workspace, one permission per widget type — Aucun, Lire, Modifier
// (widget-kinds.ts); for the whole application, the Settings (Voir or
// Modifier) and workspace management.
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

/** Access to the Settings: none, Voir, or Modifier (which includes Voir). */
export const SETTINGS_ACCESS = [
  { value: "", label: "Aucun" },
  { value: "view", label: "Voir" },
  { value: "update", label: "Modifier" },
] as const;

export type SettingsAccess = (typeof SETTINGS_ACCESS)[number]["value"];

/**
 * Workspace management: creating, renaming, deleting them, and
 * setting the access of each. The "admin" account always has it.
 */
export const WORKSPACES_ACCESS = [
  { value: "", label: "Aucun" },
  { value: "update", label: "Gérer" },
] as const;

export type WorkspacesAccess = (typeof WORKSPACES_ACCESS)[number]["value"];

/**
 * The administration of a user or a group, for the whole
 * application: the Settings, and workspace management. It does not
 * depend on any workspace — their access, for its part, only covers widget
 * types.
 */
export interface AdminPermissions {
  settings: SettingsAccess;
  workspaces: WorkspacesAccess;
}

/** That of a user or a group that has none yet: none. */
export const defaultAdminPermissions = (): AdminPermissions => ({ settings: "", workspaces: "" });

/** An administration received from outside, reduced to what exists. */
export const validAdminPermissions = (value: unknown): AdminPermissions => {
  const source = (value && typeof value === "object" ? value : {}) as Record<string, unknown>;
  return {
    settings: SETTINGS_ACCESS.some((a) => a.value === source["settings"])
      ? (source["settings"] as SettingsAccess)
      : "",
    workspaces: WORKSPACES_ACCESS.some((a) => a.value === source["workspaces"])
      ? (source["workspaces"] as WorkspacesAccess)
      : "",
  };
};

/**
 * The rights of each mode, derived from the per-type permissions: a mode follows
 * the widest of its widgets' types. "Lire" opens the mode read-only;
 * "Modifier" gives it everything the area offers.
 */
export const widgetPermissions = (widgets: WidgetRights): Permissions => {
  const result: Permissions = {};
  for (const { value: area } of AREAS) {
    const access = MODE_KINDS[area].reduce(
      (acc, kind) => widestAccess(acc, widgets[kind]),
      "" as WidgetRights[keyof WidgetRights],
    );
    if (access === "view") result[area] = ["view"];
    if (access === "update") result[area] = [...rightsFor(area)];
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
