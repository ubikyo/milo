// Les sections du mode Tâche et leurs widgets.

import { isTaskIndicatorType } from "@milo/shared";
import { taskIndicators } from "../repositories/task-indicators.js";
import { indicatorRoutes } from "./indicators.js";

export const taskIndicatorRoutes = indicatorRoutes(
  "tasks",
  "task-indicators",
  taskIndicators,
  isTaskIndicatorType,
);
