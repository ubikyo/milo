// Les permissions d'un utilisateur ou d'un groupe Entra, en deux étages :
//
// - pour l'application : le Paramétrage (Voir ou Modifier), commun à toutes
//   les sociétés, et les modes qui lui sont ouverts ;
// - par société : un rôle, qui porte ses droits mode par mode.
//
// Le client s'en sert pour dessiner la grille des droits, le serveur pour
// valider ce qu'on lui envoie : la liste des droits vit donc ici.

import type { Id } from "./domain.js";
import { MODES } from "./modes.js";
import type { Mode } from "./modes.js";

export const RIGHTS = [
  { value: "view", label: "Voir" },
  { value: "create", label: "Ajouter" },
  { value: "update", label: "Modifier" },
  { value: "delete", label: "Supprimer" },
] as const;

export type Right = (typeof RIGHTS)[number]["value"];

/**
 * Ce sur quoi un rôle porte des droits : les modes, dans l'ordre de la grille
 * des permissions. Le Paramétrage n'en est pas : il ne dépend d'aucune
 * société, il se règle pour l'application (AppPermissions).
 */
export const AREAS = MODES;

export type Area = Mode;

/** Les droits d'un rôle, domaine par domaine. Un domaine absent n'accorde rien. */
export type Permissions = Partial<Record<Area, Right[]>>;

/**
 * Les droits qu'un domaine propose. Les assets ne se lisent que : ils viennent
 * des agents d'inventaire, personne ne les ajoute ni ne les modifie à la main.
 */
export const rightsFor = (area: Area): readonly Right[] =>
  area === "assets" ? ["view"] : RIGHTS.map((r) => r.value);

/** Tous les droits de tous les domaines : ceux de l'administrateur. */
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
 * Les permissions d'un utilisateur ou d'un groupe pour l'application, quelle
 * que soit la société : le Paramétrage, et les modes qui lui sont ouverts. Un
 * mode fermé ici ne s'ouvre par aucun rôle ; un mode ouvert ne donne, lui,
 * que ce que les rôles accordent société par société.
 */
export interface AppPermissions {
  settings: SettingsAccess;
  modes: Mode[];
}

/** Celles d'un utilisateur ou d'un groupe qui n'en a pas encore : tous les modes, pas de Paramétrage. */
export const defaultAppPermissions = (): AppPermissions => ({
  settings: "",
  modes: MODES.map((m) => m.value),
});

/** Des permissions reçues de l'extérieur, ramenées à ce qui existe. */
export const validAppPermissions = (value: unknown): AppPermissions => {
  const source = (value && typeof value === "object" ? value : {}) as Record<string, unknown>;
  const modes = Array.isArray(source["modes"]) ? (source["modes"] as unknown[]) : [];
  return {
    settings: SETTINGS_ACCESS.some((a) => a.value === source["settings"])
      ? (source["settings"] as SettingsAccess)
      : "",
    modes: MODES.map((m) => m.value).filter((m) => modes.includes(m)),
  };
};

export interface Role {
  id: Id;
  name: string;
  /**
   * Le rôle Administrateur : tous les droits, toujours. Il existe toujours,
   * ne se supprime pas, et ses droits ne se modifient pas.
   */
  is_admin: boolean;
  permissions: Permissions;
  /** Le nombre d'attributions : la suppression les emporte. */
  assignment_count: number;
}

/** Le rôle d'un compte pour une société. */
export interface UserCompanyRole {
  company_id: Id;
  role_id: Id;
}

/**
 * Les droits d'un compte, société par société : la clé est l'identifiant de
 * la société. Une société absente n'accorde rien. Quand le compte tient
 * plusieurs rôles dans une même société — le sien et ceux de ses groupes —,
 * leurs droits s'additionnent.
 */
export type CompanyRights = Record<string, Permissions>;

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
  companyId === null || companyId === undefined || companyId === ""
    ? Object.values(rights).some((p) => p[area]?.includes(right) ?? false)
    : (rights[String(companyId)]?.[area]?.includes(right) ?? false);

/** Les sociétés où le compte a ce droit. */
export const companiesWith = (rights: CompanyRights, area: Area, right: Right = "view"): Id[] =>
  Object.entries(rights)
    .filter(([, p]) => p[area]?.includes(right))
    .map(([id]) => Number(id));
