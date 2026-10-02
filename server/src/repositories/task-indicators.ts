// Les sections du mode Tâche et leurs widgets : le tableau de listes et les
// indicateurs. Communes à tous les tableaux, elles se calculent, côté client,
// sur les cartes de celui qu'on regarde (client/src/task-indicators).

import type { TaskIndicatorType } from "@milo/shared";
import { panneauIndicateurs } from "./indicators.js";

export const taskIndicators = panneauIndicateurs<TaskIndicatorType>(
  "task_indicators",
  "tasks",
);
