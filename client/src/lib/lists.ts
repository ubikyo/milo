// Each list widget owns its items (shared, LIST_KEY): two
// "Projets" of the same board do not show the same projects. An item
// without a key — from before, or created with no widget to go to — shows everywhere.

import { listKey } from "@milo/shared";

/** What each list widget owns, to say so before deleting it. */
export const LIST_ITEMS: Record<string, string> = {
  "project.list": "Les projets qu'il montre, ses catégories, ses étiquettes et ses types de jalons",
  "task.list": "Les listes de tâches qu'il montre, leurs cartes et ses étiquettes",
  "support.list": "Les tickets qu'il montre et ses étiquettes",
  "managed_device_asset.list": "Les assets qu'il montre, ses étiquettes et ses tables",
  "unmanaged_device_asset.list":
    "Les équipements qu'il montre, leurs photos, leurs documents, ses étiquettes et ses listes",
  "application_asset.list":
    "Les applications qu'il montre, leurs photos, leurs documents, ses étiquettes et ses listes",
  "contact.list": "Les contacts qu'il montre, ses étiquettes et ses listes",
  "product.list":
    "Les produits qu'il montre, leurs photos, leurs documents, leurs commentaires, ses étiquettes et ses catégories",
  "order.list": "Les commandes qu'il montre, leurs commentaires et ses étiquettes",
  "warehouse.list": "Les entrepôts qu'il montre et ses étiquettes",
  "location.list": "Les emplacements qu'il montre, ses étiquettes et ses formats",
};

/** The filter of a widget's items, from its configuration. */
export const inList = (config: unknown) => {
  const key = listKey(config);
  return (element: { list_key: string }): boolean =>
    !element.list_key || !key || element.list_key === key;
};
