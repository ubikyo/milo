// The registry of the Project mode sections' widgets. Only one place
// knows them: the widgets drawer, the panel and the settings one take from it
// what they need.

import { projectActorsIndicator } from "./actors";
import { categoriesIndicator } from "./categories";
import { projectLabelsIndicator } from "./labels";
import { projectsListIndicator } from "./list";
import { progressIndicator } from "./progress";
import { projectsIndicator } from "./projects";
import { accessWidgets } from "../widgets/in-section";
import type { ProjectIndicatorDisplayProps, ProjectIndicatorWidget } from "./types";
import type { ProjectIndicatorType } from "@milo/shared";

/** In the order in which the widgets drawer presents them. */
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
 * The widget that can read this indicator, or "undefined": a type stored
 * by a version that knew one more must not bring the page down.
 */
export const projectIndicatorOf = (
  type: ProjectIndicatorType,
): ProjectIndicatorWidget | undefined => BY_TYPE.get(type);

export type { ProjectIndicatorWidget } from "./types";
