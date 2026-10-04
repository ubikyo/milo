// What Project mode's widgets share. The title, the "Nom" field and
// the bars are those of Support.

import type { Project } from "@milo/shared";

export { NameField, NAME, Nothing, IndicatorTitle, IndicatorValue } from "../indicators/common";
export { LabelBars, type Bar } from "../indicators/labels";

/** A project at 100% is finished; below that, it is in progress. */
export const isFinished = (p: Project): boolean => p.status >= 100;
