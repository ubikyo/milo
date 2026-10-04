// Ce que les widgets du mode Tâche partagent. Le titre, le champ « Nom » et
// les barres sont ceux du Support.

import type { TaskCard, TaskList } from "@milo/shared";

export { ChampNom, NOM, Rien, TitreIndicateur, ValeurIndicateur } from "../indicators/commun";
export { BarresEtiquettes, type Barre } from "../indicators/etiquettes";

/** Les cartes du tableau, sans ses séparateurs : eux ne sont pas des tâches. */
export const tachesDe = (lists: TaskList[]): TaskCard[] =>
  lists.flatMap((l) => l.cards).filter((c) => c.kind === "card");
