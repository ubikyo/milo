// The registry of the Task mode sections' widgets. Only one place
// knows them: the widgets drawer, the panel and the settings one take from it
// what they need.

import { cardsIndicator } from "./cards";
import { taskDuesIndicator } from "./dueDates";
import { taskLabelsIndicator } from "./labels";
import { listsIndicator } from "./lists";
import { taskListIndicator } from "./list";
import { membersIndicator } from "./members";
import { accessWidgets } from "../widgets/in-section";
import type { TaskIndicatorDisplayProps, TaskIndicatorWidget } from "./types";
import type { TaskIndicatorType } from "@milo/shared";

/** In the order in which the widgets drawer presents them. */
export const TASK_INDICATORS: TaskIndicatorWidget[] = [
  taskListIndicator,
  ...accessWidgets<TaskIndicatorType, TaskIndicatorDisplayProps>(),
  cardsIndicator,
  listsIndicator,
  taskDuesIndicator,
  membersIndicator,
  taskLabelsIndicator,
];

const BY_TYPE = new Map<TaskIndicatorType, TaskIndicatorWidget>(
  TASK_INDICATORS.map((p) => [p.type, p]),
);

/**
 * The widget that can read this indicator, or "undefined": a type stored
 * by a version that knew one more must not bring the page down.
 */
export const taskIndicatorOf = (type: TaskIndicatorType): TaskIndicatorWidget | undefined =>
  BY_TYPE.get(type);

export type { TaskIndicatorWidget } from "./types";
