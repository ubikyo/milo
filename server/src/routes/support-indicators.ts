// Les indicateurs du panneau des statistiques du mode Support.

import { isSupportIndicatorType } from "@milo/shared";
import { supportIndicators } from "../repositories/support-indicators.js";
import { indicatorRoutes } from "./indicators.js";

export const supportIndicatorRoutes = indicatorRoutes(
  "support-indicators",
  supportIndicators,
  isSupportIndicatorType,
);
