// Les indicateurs du panneau des statistiques du mode Support. Communs à
// toutes les sociétés, comme les étiquettes : ils se calculent, côté client,
// sur les demandes de celle qu'on regarde. Leur configuration appartient au
// widget qui les lit (client/src/indicators).

import type { SupportIndicatorType } from "@milo/shared";
import { panneauIndicateurs } from "./indicators.js";

export const supportIndicators = panneauIndicateurs<SupportIndicatorType>(
  "support_indicators",
  "support",
  "support_indicators_locked",
);
