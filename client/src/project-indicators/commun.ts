// Ce que les widgets du mode Projet partagent. Le titre, le champ « Nom » et
// les barres sont ceux du Support.

import type { Project } from "@milo/shared";

export { ChampNom, NOM, Rien, TitreIndicateur, ValeurIndicateur } from "../indicators/commun";
export { BarresEtiquettes, type Barre } from "../indicators/etiquettes";

/** Un projet à 100 % est terminé ; en deçà, il est en cours. */
export const termine = (p: Project): boolean => p.status >= 100;
