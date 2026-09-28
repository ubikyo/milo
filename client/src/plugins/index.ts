// Le registre des greffons du mode Accès.
//
// Un seul endroit les connaît : la boîte de choix y prend sa liste, la colonne
// y prend l'affichage d'un élément, le tiroir y prend ses champs. Ajouter une
// sorte d'élément se fait donc en deux gestes — un fichier à côté, une ligne
// ici — et une valeur de plus dans « ACCESS_BLOCK_TYPES » (shared/domain.ts),
// qui est ce que la base range.

import { categoriePlugin } from "./categorie";
import { horlogePlugin } from "./horloge";
import { lienPlugin } from "./lien";
import { numeroPlugin } from "./numero";
import { sousCategoriePlugin } from "./sous-categorie";
import type { AccessPlugin } from "./types";
import type { AccessBlockType } from "@milo/shared";

/** Dans l'ordre où la boîte de choix les présente. */
export const PLUGINS: AccessPlugin[] = [
  categoriePlugin,
  sousCategoriePlugin,
  lienPlugin,
  numeroPlugin,
  horlogePlugin,
];

const PAR_TYPE = new Map<AccessBlockType, AccessPlugin>(PLUGINS.map((p) => [p.type, p]));

/**
 * Le greffon qui sait lire cet élément, ou « undefined » : un type rangé par
 * une version qui en connaissait un de plus n'a pas à faire tomber la page.
 */
export const pluginDe = (type: AccessBlockType): AccessPlugin | undefined => PAR_TYPE.get(type);

export type { AccessPlugin } from "./types";
