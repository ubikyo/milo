// Les indicateurs du panneau des statistiques du mode Assets. Comme ceux du
// Support : communs à toutes les sociétés, ils se calculent, côté client, sur
// les postes de celle qu'on regarde (client/src/asset-indicators).

import type { AssetIndicatorType } from "@milo/shared";
import { panneauIndicateurs } from "./indicators.js";

export const assetIndicators = panneauIndicateurs<AssetIndicatorType>(
  "asset_indicators",
  "assets",
);
