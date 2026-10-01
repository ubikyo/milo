// Les sections du mode Projet et leurs widgets : la liste des projets et les
// indicateurs. Communes à tous les tableaux, elles se calculent, côté client,
// sur les projets de celui qu'on regarde (client/src/project-indicators).

import type { ProjectIndicatorType } from "@milo/shared";
import { panneauIndicateurs } from "./indicators.js";

export const projectIndicators = panneauIndicateurs<ProjectIndicatorType>(
  "project_indicators",
  "projects",
  "project_indicators_locked",
);
