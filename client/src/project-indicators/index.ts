// Le registre des widgets des sections du mode Projet. Un seul endroit les
// connaît : le tiroir des widgets, le panneau et celui des réglages y prennent
// ce qu'il leur faut.

import { acteursProjetsIndicator } from "./acteurs";
import { categoriesIndicator } from "./categories";
import { etiquettesProjetsIndicator } from "./etiquettes";
import { listeProjetsIndicator } from "./liste";
import { progressionIndicator } from "./progression";
import { projetsIndicator } from "./projets";
import { widgetsDAcces } from "../widgets/en-section";
import type { ProjectIndicatorDisplayProps, ProjectIndicatorWidget } from "./types";
import type { ProjectIndicatorType } from "@milo/shared";

/** Dans l'ordre où le tiroir des widgets les présente. */
export const PROJECT_INDICATORS: ProjectIndicatorWidget[] = [
  listeProjetsIndicator,
  ...widgetsDAcces<ProjectIndicatorType, ProjectIndicatorDisplayProps>(),
  projetsIndicator,
  progressionIndicator,
  categoriesIndicator,
  acteursProjetsIndicator,
  etiquettesProjetsIndicator,
];

const PAR_TYPE = new Map<ProjectIndicatorType, ProjectIndicatorWidget>(
  PROJECT_INDICATORS.map((p) => [p.type, p]),
);

/**
 * Le widget qui sait lire cet indicateur, ou « undefined » : un type rangé
 * par une version qui en connaissait un de plus n'a pas à faire tomber la page.
 */
export const indicateurProjetDe = (
  type: ProjectIndicatorType,
): ProjectIndicatorWidget | undefined => PAR_TYPE.get(type);

export type { ProjectIndicatorWidget } from "./types";
