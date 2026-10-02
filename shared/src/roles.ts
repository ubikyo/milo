// Les permissions d'un utilisateur ou d'un groupe Entra : le Paramétrage
// (Voir ou Modifier), et une permission par type de widget — Aucun, Lire,
// Modifier (widget-kinds.ts). Elles valent pour toutes les sociétés.
//
// Les droits de chaque mode — Voir, Ajouter, Modifier, Supprimer — que les
// routes et l'interface vérifient s'en déduisent : un mode suit le type de
// ses widgets. Le client s'en sert pour taire ce qui serait refusé, le
// serveur pour refuser.

import type { Id } from "./domain.js";
import { MODES } from "./modes.js";
import type { Mode } from "./modes.js";
import {
  GENRES_DU_MODE,
  accesLePlusLarge,
  validWidgetRights,
  widgetRightsPartout,
} from "./widget-kinds.js";
import type { WidgetRights } from "./widget-kinds.js";

export const RIGHTS = [
  { value: "view", label: "Voir" },
  { value: "create", label: "Ajouter" },
  { value: "update", label: "Modifier" },
  { value: "delete", label: "Supprimer" },
] as const;

export type Right = (typeof RIGHTS)[number]["value"];

/** Ce sur quoi portent les droits : les modes. */
export const AREAS = MODES;

export type Area = Mode;

/** Des droits, domaine par domaine. Un domaine absent n'accorde rien. */
export type Permissions = Partial<Record<Area, Right[]>>;

/**
 * Les droits qu'un domaine propose. Les assets ne se lisent que : ils viennent
 * des agents d'inventaire, personne ne les ajoute ni ne les modifie à la main.
 */
export const rightsFor = (area: Area): readonly Right[] =>
  area === "assets" ? ["view"] : RIGHTS.map((r) => r.value);

/** Tous les droits de tous les domaines : ceux du compte « admin ». */
export const allPermissions = (): Permissions =>
  Object.fromEntries(AREAS.map((a) => [a.value, [...rightsFor(a.value)]]));

/**
 * Des droits reçus de l'extérieur, ramenés à ce qui existe : les domaines
 * inconnus et les droits qu'un domaine ne propose pas sont écartés, et
 * l'ordre est celui de RIGHTS.
 */
export const validPermissions = (value: unknown): Permissions => {
  const source = (value && typeof value === "object" ? value : {}) as Record<string, unknown>;
  const resultat: Permissions = {};
  for (const { value: area } of AREAS) {
    const demandes = Array.isArray(source[area]) ? (source[area] as unknown[]) : [];
    const accordes = rightsFor(area).filter((r) => demandes.includes(r));
    if (accordes.length > 0) resultat[area] = accordes;
  }
  return resultat;
};

/** L'accès au Paramétrage : aucun, Voir, ou Modifier (qui comprend Voir). */
export const SETTINGS_ACCESS = [
  { value: "", label: "Aucun" },
  { value: "view", label: "Voir" },
  { value: "update", label: "Modifier" },
] as const;

export type SettingsAccess = (typeof SETTINGS_ACCESS)[number]["value"];

/**
 * Les permissions d'un utilisateur ou d'un groupe pour l'application : le
 * Paramétrage, et une permission par type de widget.
 */
export interface AppPermissions {
  settings: SettingsAccess;
  widgets: WidgetRights;
}

/** Celles d'un utilisateur ou d'un groupe qui n'en a pas encore : rien. */
export const defaultAppPermissions = (): AppPermissions => ({
  settings: "",
  widgets: widgetRightsPartout(""),
});

/** Des permissions reçues de l'extérieur, ramenées à ce qui existe. */
export const validAppPermissions = (value: unknown): AppPermissions => {
  const source = (value && typeof value === "object" ? value : {}) as Record<string, unknown>;
  return {
    settings: SETTINGS_ACCESS.some((a) => a.value === source["settings"])
      ? (source["settings"] as SettingsAccess)
      : "",
    widgets: validWidgetRights(source["widgets"]),
  };
};

/**
 * Les droits de chaque mode, déduits des permissions par type : un mode suit
 * le plus large des types de ses widgets. « Lire » ouvre le mode en lecture ;
 * « Modifier » y donne tout ce que le domaine propose.
 */
export const permissionsDesWidgets = (widgets: WidgetRights): Permissions => {
  const resultat: Permissions = {};
  for (const { value: area } of AREAS) {
    const acces = GENRES_DU_MODE[area].reduce(
      (acc, kind) => accesLePlusLarge(acc, widgets[kind]),
      "" as WidgetRights[keyof WidgetRights],
    );
    if (acces === "view") resultat[area] = ["view"];
    if (acces === "update") resultat[area] = [...rightsFor(area)];
  }
  return resultat;
};

/**
 * Les droits d'un compte, société par société : la clé est l'identifiant de
 * la société. Une société absente n'accorde rien. La clé « * » vaut pour
 * toutes les sociétés, y compris celles créées depuis : c'est ainsi que les
 * permissions par type de widget, communes à toutes, se lisent.
 */
export type CompanyRights = Record<string, Permissions>;

/** La clé des droits qui valent pour toutes les sociétés. */
export const TOUTES_SOCIETES = "*";

/**
 * Le compte a-t-il ce droit dans cette société ? Ce qui n'appartient à aucune
 * société (un projet sans société, un poste dont le tag ne désigne personne,
 * le mode Accès) suit les droits de toutes ses sociétés réunies : il suffit
 * que l'une d'elles l'accorde.
 */
export const can = (
  rights: CompanyRights,
  area: Area,
  right: Right,
  companyId?: Id | string | null,
): boolean =>
  (rights[TOUTES_SOCIETES]?.[area]?.includes(right) ?? false) ||
  (companyId === null || companyId === undefined || companyId === ""
    ? Object.values(rights).some((p) => p[area]?.includes(right) ?? false)
    : (rights[String(companyId)]?.[area]?.includes(right) ?? false));

/** Les sociétés où le compte a ce droit. */
export const companiesWith = (rights: CompanyRights, area: Area, right: Right = "view"): Id[] =>
  Object.entries(rights)
    .filter(([id, p]) => id !== TOUTES_SOCIETES && p[area]?.includes(right))
    .map(([id]) => Number(id));
