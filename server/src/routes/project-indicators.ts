// Les sections du mode Projet et leurs widgets.

import { isProjectIndicatorType } from "@milo/shared";
import { projectIndicators } from "../repositories/project-indicators.js";
import { indicatorRoutes } from "./indicators.js";

export const projectIndicatorRoutes = indicatorRoutes(
  "project-indicators",
  projectIndicators,
  isProjectIndicatorType,
);
