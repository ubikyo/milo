// Les types de widgets, et les permissions qui s'y attachent.
//
// Un widget appartient à un type : ceux du mode Accès sont communs à tous les
// modes (« common »), sauf ceux qui lisent Microsoft 365 — le courrier et
// l'agenda de qui regarde (« m365 ») ; ceux d'un mode ne servent qu'à lui. La permission d'un utilisateur ou d'un
// groupe se règle type par type — Aucun, Lire, Modifier — et vaut pour le
// widget comme pour ses données : « Support » en Modifier, c'est poser ses
// widgets et traiter des demandes.

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

/** Le libellé d'un type, tel que l'interface le montre. */
export const kindLabel = (kind: WidgetKind): string =>
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
export const widgetRightsEverywhere = (access: WidgetAccess): WidgetRights =>
  Object.fromEntries(WIDGET_KINDS.map((k) => [k.value, access])) as WidgetRights;

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

const RANK: Record<WidgetAccess, number> = { "": 0, view: 1, update: 2 };

/** La plus large de deux permissions. */
export const widestAccess = (a: WidgetAccess, b: WidgetAccess): WidgetAccess =>
  RANK[a] >= RANK[b] ? a : b;

/** Plusieurs jeux de permissions réunis — les siennes et celles de ses groupes : le plus large l'emporte. */
export const mergeWidgetRights = (rightSets: WidgetRights[]): WidgetRights =>
  Object.fromEntries(
    WIDGET_KINDS.map((k) => [
      k.value,
      rightSets.reduce<WidgetAccess>((acc, rightSet) => widestAccess(acc, rightSet[k.value]), ""),
    ]),
  ) as WidgetRights;

/** « Lire » ou mieux. */
export const canRead = (access: WidgetAccess): boolean => access !== "";

/** Les types de chaque mode : ses données suivent le plus large d'entre eux. */
export const MODE_KINDS: Record<Mode, readonly WidgetKind[]> = {
  access: ["common", "m365"],
  projects: ["project"],
  tasks: ["task"],
  support: ["helpdesk"],
  assets: ["asset"],
};

/**
 * Les widgets communs à toutes les vues, sans préfixe : les titres, le lien,
 * les attributs, l'horloge, le flux RSS, les images, la météo, la liste de
 * choses à faire — et ceux de Microsoft 365 (WIDGETS_365), le calendrier et
 * le courrier.
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
 * Les widgets propres à un type de données, sous leur préfixe : ceux du
 * Support (« support. »), des Assets (« asset. »), des projets
 * (« project. ») et des tâches (« task. »).
 */
const OWN = {
  support: ["list", "tickets", "status", "actors", "trend", "age", "due", "labels", "senders"],
  asset: ["list", "assets", "compliance", "systems", "disks"],
  project: ["list", "projects", "progress", "categories", "actors", "labels"],
  task: ["list", "cards", "lists", "due", "members", "labels"],
} as const;

/** Le préfixe des widgets de chaque type de données, et le type de widget qui va avec. */
const PREFIXES: Record<keyof typeof OWN, WidgetKind> = {
  support: "helpdesk",
  asset: "asset",
  project: "project",
  task: "task",
};

/**
 * Tout ce qu'une section peut porter : la chaîne rangée en base, qui ne
 * change jamais. C'est le widget du client qui sait l'afficher et le
 * configurer ; le serveur ne vérifie que son existence.
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
 * Les widgets qui possèdent leurs éléments : deux « Projets » d'un même
 * tableau ne montrent pas les mêmes projets. Chacun porte, dans sa
 * configuration, la clé de sa liste (LIST_KEY) ; ses éléments la
 * portent aussi, et partent avec le dernier widget qui la tient.
 */
export const LIST_WIDGET_TYPES: readonly string[] = [
  "project.list",
  "task.list",
  "support.list",
  "asset.list",
];

export const isListWidgetType = (type: string): boolean => LIST_WIDGET_TYPES.includes(type);

/** La clé de la configuration d'un widget de liste qui désigne ses éléments. */
export const LIST_KEY = "list_key";

/** La clé de liste d'une configuration ; vide si elle n'en porte pas. */
export const listKey = (config: unknown): string => {
  const value = (config as Record<string, unknown> | null)?.[LIST_KEY];
  return typeof value === "string" ? value : "";
};

/**
 * Les widgets qui lisent Microsoft 365, par Entra : le calendrier (l'agenda
 * Outlook) et le courrier (la boîte de réception). Leur type est « m365 ».
 */
export const WIDGETS_365: readonly string[] = ["calendar", "mail"];

/** Le type de widget d'un widget, d'après ce que la base range de lui. */
export const widgetKind = (type: string): WidgetKind => {
  if (WIDGETS_365.includes(type)) return "m365";
  const prefix = type.split(".")[0] as keyof typeof PREFIXES;
  return type.includes(".") && PREFIXES[prefix] ? PREFIXES[prefix] : "common";
};

/**
 * Le type rangé d'un widget des anciens panneaux — Support, Assets, Projet,
 * Tâche —, sous son préfixe. Les widgets communs gardent le leur.
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
