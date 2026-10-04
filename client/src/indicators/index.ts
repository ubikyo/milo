// Le registre des widgets du panneau des statistiques du mode Support. Un seul
// endroit les connaît : le tiroir des widgets, le panneau et celui des réglages
// y prennent ce qu'il leur faut.

import { actorsIndicator } from "./actors";
import { ageIndicator } from "./age";
import { requestersIndicator } from "./requesters";
import { duesIndicator } from "./dueDates";
import { labelsIndicator } from "./labels";
import { evolutionIndicator } from "./trend";
import { listIndicator } from "./list";
import { statusesIndicator } from "./statuses";
import { ticketsIndicator } from "./tickets";
import { accessWidgets } from "../widgets/in-section";
import type { IndicatorDisplayProps, SupportIndicatorWidget } from "./types";
import type { SupportIndicatorType } from "@milo/shared";

/** Dans l'ordre où le tiroir des widgets les présente. */
export const INDICATORS: SupportIndicatorWidget[] = [
  listIndicator,
  ...accessWidgets<SupportIndicatorType, IndicatorDisplayProps>(),
  ticketsIndicator,
  statusesIndicator,
  actorsIndicator,
  evolutionIndicator,
  ageIndicator,
  duesIndicator,
  labelsIndicator,
  requestersIndicator,
];

const BY_TYPE = new Map<SupportIndicatorType, SupportIndicatorWidget>(
  INDICATORS.map((p) => [p.type, p]),
);

/**
 * Le widget qui sait lire cet indicateur, ou « undefined » : un type rangé
 * par une version qui en connaissait un de plus n'a pas à faire tomber la page.
 */
export const indicatorOf = (type: SupportIndicatorType): SupportIndicatorWidget | undefined =>
  BY_TYPE.get(type);

export type { SupportIndicatorWidget } from "./types";
