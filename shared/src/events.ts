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
