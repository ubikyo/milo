// A widget's kind: what sorts the widget drawer (WidgetDrawer) into groups,
// and what permissions apply to. The list lives in the shared code (shared,
// widget-kinds.ts): the server uses it to check rights.

export { WIDGET_KINDS, kindLabel } from "@milo/shared";
export type { WidgetKind } from "@milo/shared";
