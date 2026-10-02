// Le type d'un widget : ce qui range le tiroir des widgets (WidgetDrawer) en
// groupes. Les widgets du mode Accès sont communs à tous les modes, sauf
// Uptime, qui surveille des machines ; ceux d'un mode ne servent qu'à lui.

export const WIDGET_KINDS = [
  { value: "common", label: "Commun" },
  { value: "telemetry", label: "Télémétrie" },
  { value: "project", label: "Projet" },
  { value: "task", label: "Tâche" },
  { value: "helpdesk", label: "Support" },
  { value: "asset", label: "Asset" },
] as const;

export type WidgetKind = (typeof WIDGET_KINDS)[number]["value"];

/** Le libellé d'un type, tel que le tiroir le montre. */
export const libelleDuGenre = (kind: WidgetKind): string =>
  WIDGET_KINDS.find((k) => k.value === kind)?.label ?? kind;
