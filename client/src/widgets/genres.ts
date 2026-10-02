// Le type d'un widget : ce qui range le tiroir des widgets (WidgetDrawer) en
// groupes, et ce sur quoi portent les permissions. La liste vit dans le code
// partagé (shared, widget-kinds.ts) : le serveur s'en sert pour vérifier les
// droits.

export { WIDGET_KINDS, libelleDuGenre } from "@milo/shared";
export type { WidgetKind } from "@milo/shared";
