// Les types de widgets, et les permissions qui s'y attachent.
//
// Un widget appartient à un type : ceux du mode Accès sont communs à tous les
// modes (« common »), sauf Uptime qui surveille des machines (« telemetry ») ;
// ceux d'un mode ne servent qu'à lui. La permission d'un utilisateur ou d'un
// groupe se règle type par type — Aucun, Lire, Modifier — et vaut pour le
// widget comme pour ses données : « Support » en Modifier, c'est poser ses
// widgets et traiter des demandes.

import type { Mode } from "./modes.js";

export const WIDGET_KINDS = [
  { value: "common", label: "Commun" },
  { value: "telemetry", label: "Télémétrie" },
  { value: "project", label: "Projet" },
  { value: "task", label: "Tâche" },
  { value: "helpdesk", label: "Support" },
  { value: "asset", label: "Asset" },
] as const;

export type WidgetKind = (typeof WIDGET_KINDS)[number]["value"];

/** Le libellé d'un type, tel que l'interface le montre. */
export const libelleDuGenre = (kind: WidgetKind): string =>
  WIDGET_KINDS.find((k) => k.value === kind)?.label ?? kind;

/** La permission sur un type : aucune, la lecture, ou la modification (qui comprend la lecture). */
export const WIDGET_ACCESS = [
  { value: "", label: "Aucun" },
  { value: "view", label: "Lire" },
  { value: "update", label: "Modifier" },
] as const;

export type WidgetAccess = (typeof WIDGET_ACCESS)[number]["value"];

/** La permission de chaque type. */
export type WidgetRights = Record<WidgetKind, WidgetAccess>;

/** Les mêmes permissions pour tous les types. */
export const widgetRightsPartout = (acces: WidgetAccess): WidgetRights =>
  Object.fromEntries(WIDGET_KINDS.map((k) => [k.value, acces])) as WidgetRights;

/** Des permissions reçues de l'extérieur, ramenées à ce qui existe : un type absent n'a rien. */
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

const RANG: Record<WidgetAccess, number> = { "": 0, view: 1, update: 2 };

/** La plus large de deux permissions. */
export const accesLePlusLarge = (a: WidgetAccess, b: WidgetAccess): WidgetAccess =>
  RANG[a] >= RANG[b] ? a : b;

/** Plusieurs jeux de permissions réunis — les siennes et celles de ses groupes : le plus large l'emporte. */
export const reunirWidgetRights = (jeux: WidgetRights[]): WidgetRights =>
  Object.fromEntries(
    WIDGET_KINDS.map((k) => [
      k.value,
      jeux.reduce<WidgetAccess>((acc, jeu) => accesLePlusLarge(acc, jeu[k.value]), ""),
    ]),
  ) as WidgetRights;

/** « Lire » ou mieux. */
export const peutLire = (acces: WidgetAccess): boolean => acces !== "";

/** Les types de chaque mode : ses données suivent le plus large d'entre eux. */
export const GENRES_DU_MODE: Record<Mode, readonly WidgetKind[]> = {
  access: ["common", "telemetry"],
  projects: ["project"],
  tasks: ["task"],
  support: ["helpdesk"],
  assets: ["asset"],
};

/** Les widgets du mode Accès que les sections des autres modes reprennent : des widgets communs. */
const COMMUNS_EN_SECTION = new Set(["category", "subcategory", "link", "number", "clock"]);

/**
 * Le type d'un widget, d'après le mode dont il occupe les sections et ce que
 * la base range de lui. Le client le déclare widget par widget ; le serveur,
 * qui ne connaît que les types rangés, le retrouve ici.
 */
export const genreDuWidget = (mode: Mode, type: string): WidgetKind => {
  if (mode === "access") return type === "uptime" ? "telemetry" : "common";
  if (COMMUNS_EN_SECTION.has(type)) return "common";
  return GENRES_DU_MODE[mode][0]!;
};
