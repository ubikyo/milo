// The registry of the Assets mode statistics panel widgets. Only one place
// knows them: the widgets drawer, the panel and the settings one
// pick what they need from it.

import { complianceIndicator } from "./compliance";
import { disksIndicator } from "./disks";
import { assetListIndicator } from "./list";
import { workstationsIndicator } from "./workstations";
import { systemsIndicator } from "./systems";
import { accessWidgets } from "../widgets/in-section";
import type { AssetIndicatorDisplayProps, AssetIndicatorWidget } from "./types";
import type { AssetIndicatorType } from "@milo/shared";

/** In the order the widgets drawer presents them. */
export const ASSET_INDICATORS: AssetIndicatorWidget[] = [
  assetListIndicator,
  ...accessWidgets<AssetIndicatorType, AssetIndicatorDisplayProps>(),
  workstationsIndicator,
  complianceIndicator,
  systemsIndicator,
  disksIndicator,
];

const BY_TYPE = new Map<AssetIndicatorType, AssetIndicatorWidget>(
  ASSET_INDICATORS.map((p) => [p.type, p]),
);

/**
 * The widget that can read this indicator, or "undefined": a type stored
 * by a version that knew one more must not crash the page.
 */
export const assetIndicatorOf = (type: AssetIndicatorType): AssetIndicatorWidget | undefined =>
  BY_TYPE.get(type);

export type { AssetIndicatorWidget } from "./types";
