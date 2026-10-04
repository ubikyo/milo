// What Task mode's widgets share. The title, the "Nom" field and
// the bars are those of Support.

import type { TaskCard, TaskList } from "@milo/shared";

export { NameField, NAME, Nothing, IndicatorTitle, IndicatorValue } from "../indicators/common";
export { LabelBars, type Bar } from "../indicators/labels";

/** The board's cards, without its separators: those are not tasks. */
export const tasksOf = (lists: TaskList[]): TaskCard[] =>
  lists.flatMap((l) => l.cards).filter((c) => c.kind === "card");
