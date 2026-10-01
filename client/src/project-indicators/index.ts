// Le registre des widgets des sections du mode Projet. Un seul endroit les
// connaît : la boîte de choix, le panneau et le tiroir y prennent ce qu'il
// leur faut.

import { acteursProjetsIndicator } from "./acteurs";
import { categoriesIndicator } from "./categories";
import { etiquettesProjetsIndicator } from "./etiquettes";
import { listeProjetsIndicator } from "./liste";
import { progressionIndicator } from "./progression";
import { projetsIndicator } from "./projets";
import { titresDeSection } from "../widgets/titres-de-section";
import type { ProjectIndicatorDisplayProps, ProjectIndicatorWidget } from "./types";
import type { ProjectIndicatorType } from "@milo/shared";

/** Dans l'ordre où la boîte de choix les présente. */
export const PROJECT_INDICATORS: ProjectIndicatorWidget[] = [
  listeProjetsIndicator,
  ...titresDeSection<ProjectIndicatorType, ProjectIndicatorDisplayProps>(),
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
