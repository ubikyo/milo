// Le registre des widgets du panneau des statistiques du mode Assets. Un seul
// endroit les connaît : le tiroir des widgets, le panneau et celui des réglages
// y prennent ce qu'il leur faut.

import { complianceIndicator } from "./compliance";
import { disksIndicator } from "./disks";
import { assetListIndicator } from "./list";
import { workstationsIndicator } from "./workstations";
import { systemsIndicator } from "./systems";
import { accessWidgets } from "../widgets/in-section";
import type { AssetIndicatorDisplayProps, AssetIndicatorWidget } from "./types";
import type { AssetIndicatorType } from "@milo/shared";

/** Dans l'ordre où le tiroir des widgets les présente. */
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
 * Le widget qui sait lire cet indicateur, ou « undefined » : un type rangé
 * par une version qui en connaissait un de plus n'a pas à faire tomber la page.
 */
export const assetIndicatorOf = (type: AssetIndicatorType): AssetIndicatorWidget | undefined =>
  BY_TYPE.get(type);

export type { AssetIndicatorWidget } from "./types";
