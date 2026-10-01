// Les indicateurs du panneau des statistiques du mode Assets.

import { isAssetIndicatorType } from "@milo/shared";
import { assetIndicators } from "../repositories/asset-indicators.js";
import { indicatorRoutes } from "./indicators.js";

export const assetIndicatorRoutes = indicatorRoutes(
  "asset-indicators",
  assetIndicators,
  isAssetIndicatorType,
);
