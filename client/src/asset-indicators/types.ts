// The contract of a widget of the Assets mode statistics panel.
//
// The same as the Support one (indicators/types.ts), on workstations instead
// of requests. Adding a kind of indicator means adding a file in
// this folder, registering it in "index.ts" and in "ASSET_INDICATOR_TYPES"
// (shared/domain.ts).

import type { ComponentType } from "react";
import type { IndicatorWidgetBase } from "../components/ui/IndicatorsPanel";
import type { Asset, AssetIndicatorType } from "@milo/shared";

/** What the panel passes to a widget's display. */
export interface AssetIndicatorDisplayProps {
  config: unknown;
  /** The workstations of the company being viewed — all of them, "toutes les sociétés" included. */
  assets: Asset[];
  /**
   * Saves a configuration modified from the display itself — a
   * title renamed on double-click. No effect once locked.
   */
  onChange?: (config: Record<string, unknown>) => void | Promise<void>;
  /** The locked sections: the widget no longer offers anything that modifies. */
  locked?: boolean;
}

export interface AssetIndicatorWidget extends IndicatorWidgetBase<AssetIndicatorType> {
  /** What the panel shows. */
  Display: ComponentType<AssetIndicatorDisplayProps>;
}
