// Les rôles : ce qu'une personne peut faire dans chaque mode, pour une société
// donnée, et dans le Paramétrage. Un rôle porte ses droits domaine par
// domaine ; un utilisateur ou un groupe Entra reçoit un rôle par société.
//
// Le client s'en sert pour dessiner la grille des droits, le serveur pour
// valider ce qu'on lui envoie : la liste des droits vit donc ici.

import type { Id } from "./domain.js";
import { MODES } from "./modes.js";

export const RIGHTS = [
  { value: "view", label: "Voir" },
  { value: "create", label: "Ajouter" },
  { value: "update", label: "Modifier" },
  { value: "delete", label: "Supprimer" },
] as const;

export type Right = (typeof RIGHTS)[number]["value"];

/**
 * Ce sur quoi un rôle porte des droits : le Paramétrage, puis les modes. Dans
 * l'ordre de la grille des permissions.
 */
export const AREAS = [
  { value: "settings", label: "Paramétrage" },
  ...MODES,
] as const;

export type Area = (typeof AREAS)[number]["value"];

/** Les droits d'un rôle, domaine par domaine. Un domaine absent n'accorde rien. */
export type Permissions = Partial<Record<Area, Right[]>>;

/**
 * Les droits qu'un domaine propose. Les assets ne se lisent que : ils viennent
 * des agents d'inventaire, personne ne les ajoute ni ne les modifie à la main.
 * Le Paramétrage se voit et se modifie : on n'y ajoute ni n'y supprime de
 * paramètres.
 */
export const rightsFor = (area: Area): readonly Right[] =>
  area === "assets"
    ? ["view"]
    : area === "settings"
      ? ["view", "update"]
      : RIGHTS.map((r) => r.value);

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
