// The registry of the Assets mode statistics panel widgets. Only one place
// knows them: the widgets drawer, the panel and the settings one
// pick what they need from it.

import { managedDeviceAssetListIndicator } from "./list";
import { accessWidgets } from "../in-section";
import type {
  ManagedDeviceAssetIndicatorDisplayProps,
  ManagedDeviceAssetIndicatorWidget,
} from "./types";
import type { ManagedDeviceAssetIndicatorType } from "@milo/shared";

/** In the order the widgets drawer presents them; their figures are the "Indicateurs" widgets' (widgets/indicators). */
export const MANAGED_DEVICE_ASSET_INDICATORS: ManagedDeviceAssetIndicatorWidget[] = [
  managedDeviceAssetListIndicator,
  ...accessWidgets<ManagedDeviceAssetIndicatorType, ManagedDeviceAssetIndicatorDisplayProps>(),
];

const BY_TYPE = new Map<ManagedDeviceAssetIndicatorType, ManagedDeviceAssetIndicatorWidget>(
  MANAGED_DEVICE_ASSET_INDICATORS.map((p) => [p.type, p]),
);

/**
 * The widget that can read this indicator, or "undefined": a type stored
 * by a version that knew one more must not crash the page.
 */
export const managedDeviceAssetIndicatorOf = (
  type: ManagedDeviceAssetIndicatorType,
): ManagedDeviceAssetIndicatorWidget | undefined => BY_TYPE.get(type);

export type { ManagedDeviceAssetIndicatorWidget } from "./types";
