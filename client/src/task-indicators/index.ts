// Le registre des widgets des sections du mode Tâche. Un seul endroit les
// connaît : le tiroir des widgets, le panneau et celui des réglages y prennent
// ce qu'il leur faut.

import { cartesIndicator } from "./cartes";
import { echeancesTachesIndicator } from "./echeances";
import { etiquettesTachesIndicator } from "./etiquettes";
import { listesIndicator } from "./listes";
import { listeTachesIndicator } from "./liste";
import { membresIndicator } from "./membres";
import { widgetsDAcces } from "../widgets/en-section";
import type { TaskIndicatorDisplayProps, TaskIndicatorWidget } from "./types";
import type { TaskIndicatorType } from "@milo/shared";

/** Dans l'ordre où le tiroir des widgets les présente. */
export const TASK_INDICATORS: TaskIndicatorWidget[] = [
  listeTachesIndicator,
  ...widgetsDAcces<TaskIndicatorType, TaskIndicatorDisplayProps>(),
  cartesIndicator,
  listesIndicator,
  echeancesTachesIndicator,
  membresIndicator,
  etiquettesTachesIndicator,
];

const PAR_TYPE = new Map<TaskIndicatorType, TaskIndicatorWidget>(
  TASK_INDICATORS.map((p) => [p.type, p]),
);

/**
 * Le widget qui sait lire cet indicateur, ou « undefined » : un type rangé
 * par une version qui en connaissait un de plus n'a pas à faire tomber la page.
 */
export const indicateurTacheDe = (type: TaskIndicatorType): TaskIndicatorWidget | undefined =>
  PAR_TYPE.get(type);

export type { TaskIndicatorWidget } from "./types";
