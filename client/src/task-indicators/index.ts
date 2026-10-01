// Le registre des widgets des sections du mode Tâche. Un seul endroit les
// connaît : la boîte de choix, le panneau et le tiroir y prennent ce qu'il
// leur faut.

import { cartesIndicator } from "./cartes";
import { echeancesTachesIndicator } from "./echeances";
import { etiquettesTachesIndicator } from "./etiquettes";
import { listesIndicator } from "./listes";
import { listeTachesIndicator } from "./liste";
import { membresIndicator } from "./membres";
import { titresDeSection } from "../widgets/titres-de-section";
import type { TaskIndicatorDisplayProps, TaskIndicatorWidget } from "./types";
import type { TaskIndicatorType } from "@milo/shared";

/** Dans l'ordre où la boîte de choix les présente. */
export const TASK_INDICATORS: TaskIndicatorWidget[] = [
  listeTachesIndicator,
  ...titresDeSection<TaskIndicatorType, TaskIndicatorDisplayProps>(),
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
