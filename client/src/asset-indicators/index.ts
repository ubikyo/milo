// Le registre des widgets du panneau des statistiques du mode Assets. Un seul
// endroit les connaît : le tiroir des widgets, le panneau et celui des réglages
// y prennent ce qu'il leur faut.

import { conformiteIndicator } from "./conformite";
import { disquesIndicator } from "./disques";
import { listeAssetIndicator } from "./liste";
import { postesIndicator } from "./postes";
import { systemesIndicator } from "./systemes";
import { widgetsDAcces } from "../widgets/en-section";
import type { AssetIndicatorDisplayProps, AssetIndicatorWidget } from "./types";
import type { AssetIndicatorType } from "@milo/shared";

/** Dans l'ordre où le tiroir des widgets les présente. */
export const ASSET_INDICATORS: AssetIndicatorWidget[] = [
  listeAssetIndicator,
  ...widgetsDAcces<AssetIndicatorType, AssetIndicatorDisplayProps>(),
  postesIndicator,
  conformiteIndicator,
  systemesIndicator,
  disquesIndicator,
];

const PAR_TYPE = new Map<AssetIndicatorType, AssetIndicatorWidget>(
  ASSET_INDICATORS.map((p) => [p.type, p]),
);

/**
 * Le widget qui sait lire cet indicateur, ou « undefined » : un type rangé
 * par une version qui en connaissait un de plus n'a pas à faire tomber la page.
 */
export const indicateurAssetDe = (type: AssetIndicatorType): AssetIndicatorWidget | undefined =>
  PAR_TYPE.get(type);

export type { AssetIndicatorWidget } from "./types";
