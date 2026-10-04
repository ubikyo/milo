// Le registre des widgets des sections du mode Projet. Un seul endroit les
// connaît : le tiroir des widgets, le panneau et celui des réglages y prennent
// ce qu'il leur faut.

import { projectActorsIndicator } from "./acteurs";
import { categoriesIndicator } from "./categories";
import { projectLabelsIndicator } from "./etiquettes";
import { projectsListIndicator } from "./liste";
import { progressIndicator } from "./progression";
import { projectsIndicator } from "./projets";
import { accessWidgets } from "../widgets/en-section";
import type { ProjectIndicatorDisplayProps, ProjectIndicatorWidget } from "./types";
import type { ProjectIndicatorType } from "@milo/shared";

/** Dans l'ordre où le tiroir des widgets les présente. */
export const PROJECT_INDICATORS: ProjectIndicatorWidget[] = [
  projectsListIndicator,
  ...accessWidgets<ProjectIndicatorType, ProjectIndicatorDisplayProps>(),
  projectsIndicator,
  progressIndicator,
  categoriesIndicator,
  projectActorsIndicator,
  projectLabelsIndicator,
];

const BY_TYPE = new Map<ProjectIndicatorType, ProjectIndicatorWidget>(
  PROJECT_INDICATORS.map((p) => [p.type, p]),
);

/**
 * Le widget qui sait lire cet indicateur, ou « undefined » : un type rangé
 * par une version qui en connaissait un de plus n'a pas à faire tomber la page.
 */
export const projectIndicatorOf = (
  type: ProjectIndicatorType,
): ProjectIndicatorWidget | undefined => BY_TYPE.get(type);

export type { ProjectIndicatorWidget } from "./types";
