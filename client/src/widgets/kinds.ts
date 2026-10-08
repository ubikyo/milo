// A widget's kind: what sorts the widget drawer (WidgetDrawer) into groups,
// and what permissions apply to. The list lives in the shared code (shared,
// widget-kinds.ts): the server uses it to check rights.

import { kindLabel, type WidgetKind } from "@milo/shared";

export { WIDGET_KINDS, kindLabel } from "@milo/shared";
export type { WidgetKind } from "@milo/shared";

/**
 * The drawer files some kinds together, under one title, while their
 * permissions stay apart: the managed device assets, the unmanaged device
 * assets and the applications, under "Asset" — the first one's group.
 */
const ASSETS = { group: "managed_device_asset", label: "Asset" } as const;
const DRAWER_GROUPS: Partial<Record<WidgetKind, { group: WidgetKind; label: string }>> = {
  managed_device_asset: ASSETS,
  unmanaged_device_asset: ASSETS,
  application_asset: ASSETS,
};

/** The drawer group of a kind: its own, unless it shares one. */
export const drawerGroup = (kind: WidgetKind): WidgetKind => DRAWER_GROUPS[kind]?.group ?? kind;

/** The title of a drawer group. */
export const drawerGroupLabel = (kind: WidgetKind): string =>
  DRAWER_GROUPS[kind]?.label ?? kindLabel(kind);
