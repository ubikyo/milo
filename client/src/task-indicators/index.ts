// Le registre des widgets des sections du mode Tâche. Un seul endroit les
// connaît : le tiroir des widgets, le panneau et celui des réglages y prennent
// ce qu'il leur faut.

import { cardsIndicator } from "./cards";
import { taskDuesIndicator } from "./dueDates";
import { taskLabelsIndicator } from "./labels";
import { listsIndicator } from "./lists";
import { taskListIndicator } from "./list";
import { membersIndicator } from "./members";
import { accessWidgets } from "../widgets/in-section";
import type { TaskIndicatorDisplayProps, TaskIndicatorWidget } from "./types";
import type { TaskIndicatorType } from "@milo/shared";

/** Dans l'ordre où le tiroir des widgets les présente. */
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
 * Le widget qui sait lire cet indicateur, ou « undefined » : un type rangé
 * par une version qui en connaissait un de plus n'a pas à faire tomber la page.
 */
export const taskIndicatorOf = (type: TaskIndicatorType): TaskIndicatorWidget | undefined =>
  BY_TYPE.get(type);

export type { TaskIndicatorWidget } from "./types";
