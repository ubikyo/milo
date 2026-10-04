// Ce que les widgets du mode Tâche partagent. Le titre, le champ « Nom » et
// les barres sont ceux du Support.

import type { TaskCard, TaskList } from "@milo/shared";

export { NameField, NAME, Nothing, TitreIndicateur, IndicatorValue } from "../indicators/common";
export { LabelBars, type Bar } from "../indicators/labels";

/** Les cartes du tableau, sans ses séparateurs : eux ne sont pas des tâches. */
export const tasksOf = (lists: TaskList[]): TaskCard[] =>
  lists.flatMap((l) => l.cards).filter((c) => c.kind === "card");
