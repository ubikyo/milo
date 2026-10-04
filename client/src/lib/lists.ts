// Each list widget owns its items (shared, LIST_KEY): two
// "Projets" of the same board do not show the same projects. An item
// without a key — from before, or created with no widget to go to — shows everywhere.

import { listKey } from "@milo/shared";

/** What each list widget owns, to say so before deleting it. */
export const LIST_ITEMS: Record<string, string> = {
  "project.list": "Les projets qu'il montre",
  "task.list": "Les listes de tâches qu'il montre, et leurs cartes,",
  "support.list": "Les tickets qu'il montre",
  "asset.list": "Les assets qu'il montre",
};

/** The filter of a widget's items, from its configuration. */
export const inList = (config: unknown) => {
  const key = listKey(config);
  return (element: { list_key: string }): boolean =>
    !element.list_key || !key || element.list_key === key;
};
