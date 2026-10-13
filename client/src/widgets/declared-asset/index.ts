// The registry of the declared asset widgets (shared, declared-assets.ts):
// the equipment and the applications entered by hand, which no agent
// inventories. Each kind has its own widget type ("unmanaged_device_asset",
// "application_asset"), with its own permissions, filed in the drawer with
// the managed device assets.

import type { ComponentType } from "react";
import type { DeclaredAssetKind, Id } from "@milo/shared";
import type { IndicatorWidgetBase } from "../../components/ui/IndicatorsPanel";
import { declaredAssetListWidget } from "./list";

/** What the section passes to a widget's display. */
export interface DeclaredAssetDisplayProps {
  config: unknown;
  /** The widget's identifier: the search asks it to open an asset. */
  id: Id;
  onChange?: (config: Record<string, unknown>) => void | Promise<void>;
  locked?: boolean;
}

export interface DeclaredAssetWidget extends IndicatorWidgetBase<string> {
  Display: ComponentType<DeclaredAssetDisplayProps>;
}

/**
 * Each kind's widgets, in the order the widgets drawer presents them; its
 * figures are the "Indicateurs" widgets' (widgets/indicators).
 */
export const declaredAssetWidgets = (kind: DeclaredAssetKind): DeclaredAssetWidget[] => [
  declaredAssetListWidget(kind),
];
