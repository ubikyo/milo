// Chaque widget de liste possède ses éléments (shared, CLE_DE_LISTE) : deux
// « Projets » d'un même tableau ne montrent pas les mêmes projets. Un élément
// sans clé — venu d'avant, ou créé sans widget où aller — se montre partout.

import { listKey } from "@milo/shared";

/** Ce que chaque widget de liste possède, pour le dire avant de le supprimer. */
export const LIST_ITEMS: Record<string, string> = {
  "project.list": "Les projets qu'il montre",
  "task.list": "Les listes de tâches qu'il montre, et leurs cartes,",
  "support.list": "Les tickets qu'il montre",
  "asset.list": "Les assets qu'il montre",
};

/** Le filtre des éléments d'un widget, d'après sa configuration. */
export const inList = (config: unknown) => {
  const key = listKey(config);
  return (element: { list_key: string }): boolean =>
    !element.list_key || !key || element.list_key === key;
};
