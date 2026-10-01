// Ce que le serveur pousse aux clients connectés après chaque écriture.
//
// Avant, il n'y avait qu'un compteur : n'importe quelle écriture, par
// n'importe qui, faisait recharger aux huit jeux de données de tous les
// clients. Renommer une étiquette rechargeait les projets, les sociétés, les
// utilisateurs et les tableaux. Chaque écriture nomme désormais ce qu'elle a
// touché, et le client ne relit que cela.

export const RESOURCES = [
  /** Sociétés et comptes : les listes de référence. */
  "lookups",
  "project-boards",
  "categories",
  "projects",
  "boards",
  "task-lists",
  "labels",
  "project-labels",
  /** Les catégories du mode Accès : le premier niveau de ce mode. */
  "access-categories",
  /** Les sections d'une catégorie d'accès : ses colonnes. */
  "access-sections",
  /** Ce que les sections portent : les éléments des widgets. */
  "access-blocks",
  /** Les demandes du mode Support, et les étiquettes qu'elles portent. */
  "support-requests",
  "support-labels",
  /** Les indicateurs du panneau des statistiques du mode Support. */
  "support-indicators",
  /** Les postes du mode Assets : ce que les agents d'inventaire remontent. */
  "assets",
  /** Les indicateurs du panneau des statistiques du mode Assets. */
  "asset-indicators",
  /** Les sections des modes Projet et Tâche, et ce qu'elles portent. */
  "project-indicators",
  "task-indicators",
  /** L'ordre des onglets fixes des modes Support et Assets. */
  "tab-orders",
] as const;

export type Resource = (typeof RESOURCES)[number];

/** Le compteur de chaque ressource. Il ne recule jamais. */
export type ResourceVersions = Record<Resource, number>;

export interface VersionPayload {
  /** Somme de tous les compteurs : une écriture, où qu'elle soit, la fait monter. */
  version: number;
  versions: ResourceVersions;
}

export const emptyVersions = (): ResourceVersions =>
  Object.fromEntries(RESOURCES.map((r) => [r, 0])) as ResourceVersions;
