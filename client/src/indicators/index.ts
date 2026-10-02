// Le registre des widgets du panneau des statistiques du mode Support. Un seul
// endroit les connaît : le tiroir des widgets, le panneau et celui des réglages
// y prennent ce qu'il leur faut.

import { acteursIndicator } from "./acteurs";
import { ancienneteIndicator } from "./anciennete";
import { demandeursIndicator } from "./demandeurs";
import { echeancesIndicator } from "./echeances";
import { etiquettesIndicator } from "./etiquettes";
import { evolutionIndicator } from "./evolution";
import { listeIndicator } from "./liste";
import { statutsIndicator } from "./statuts";
import { ticketsIndicator } from "./tickets";
import { widgetsDAcces } from "../widgets/en-section";
import type { IndicatorDisplayProps, SupportIndicatorWidget } from "./types";
import type { SupportIndicatorType } from "@milo/shared";

/** Dans l'ordre où le tiroir des widgets les présente. */
export const INDICATORS: SupportIndicatorWidget[] = [
  listeIndicator,
  ...widgetsDAcces<SupportIndicatorType, IndicatorDisplayProps>(),
  ticketsIndicator,
  statutsIndicator,
  acteursIndicator,
  evolutionIndicator,
  ancienneteIndicator,
  echeancesIndicator,
  etiquettesIndicator,
  demandeursIndicator,
];

const PAR_TYPE = new Map<SupportIndicatorType, SupportIndicatorWidget>(
  INDICATORS.map((p) => [p.type, p]),
);

/**
 * Le widget qui sait lire cet indicateur, ou « undefined » : un type rangé
 * par une version qui en connaissait un de plus n'a pas à faire tomber la page.
 */
export const indicateurDe = (type: SupportIndicatorType): SupportIndicatorWidget | undefined =>
  PAR_TYPE.get(type);

export type { SupportIndicatorWidget } from "./types";
