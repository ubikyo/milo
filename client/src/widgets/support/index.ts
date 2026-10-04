// The registry of Support mode's statistics panel widgets. Only one
// place knows them: the widgets drawer, the panel and the settings one
// take from it what they need.

import { actorsIndicator } from "./actors";
import { ageIndicator } from "./age";
import { requestersIndicator } from "./requesters";
import { duesIndicator } from "./dueDates";
import { labelsIndicator } from "./labels";
import { evolutionIndicator } from "./trend";
import { listIndicator } from "./list";
import { statusesIndicator } from "./statuses";
import { ticketsIndicator } from "./tickets";
import { accessWidgets } from "../in-section";
import type { IndicatorDisplayProps, SupportIndicatorWidget } from "./types";
import type { SupportIndicatorType } from "@milo/shared";

/** In the order in which the widgets drawer presents them. */
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
 * The widget that can read this indicator, or "undefined": a type stored
 * by a version that knew one more must not bring the page down.
 */
export const indicatorOf = (type: SupportIndicatorType): SupportIndicatorWidget | undefined =>
  BY_TYPE.get(type);

export type { SupportIndicatorWidget } from "./types";
