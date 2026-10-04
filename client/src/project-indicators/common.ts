// Ce que les widgets du mode Projet partagent. Le titre, le champ « Nom » et
// les barres sont ceux du Support.

import type { Project } from "@milo/shared";

export { NameField, NAME, Nothing, IndicatorTitle, IndicatorValue } from "../indicators/common";
export { LabelBars, type Bar } from "../indicators/labels";

/** Un projet à 100 % est terminé ; en deçà, il est en cours. */
export const isFinished = (p: Project): boolean => p.status >= 100;
