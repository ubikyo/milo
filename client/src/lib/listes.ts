// Chaque widget de liste possède ses éléments (shared, CLE_DE_LISTE) : deux
// « Projets » d'un même tableau ne montrent pas les mêmes projets. Un élément
// sans clé — venu d'avant, ou créé sans widget où aller — se montre partout.

import { cleDeListe } from "@milo/shared";

/** Ce que chaque widget de liste possède, pour le dire avant de le supprimer. */
export const ELEMENTS_DE_LA_LISTE: Record<string, string> = {
  "project.list": "Les projets qu'il montre",
  "task.list": "Les listes de tâches qu'il montre, et leurs cartes,",
  "support.list": "Les demandes de support qu'il montre",
  "asset.list": "Les assets qu'il montre",
};

/** Le filtre des éléments d'un widget, d'après sa configuration. */
export const deLaListe = (config: unknown) => {
  const cle = cleDeListe(config);
  return (element: { list_key: string }): boolean =>
    !element.list_key || !cle || element.list_key === cle;
};
