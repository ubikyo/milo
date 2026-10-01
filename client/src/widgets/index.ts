// Le registre des widgets du mode Accès.
//
// Un seul endroit les connaît : la boîte de choix y prend sa liste, la colonne
// y prend l'affichage d'un élément, le tiroir y prend ses champs. Ajouter une
// sorte d'élément se fait donc en deux gestes — un fichier à côté, une ligne
// ici — et une valeur de plus dans « ACCESS_BLOCK_TYPES » (shared/domain.ts),
// qui est ce que la base range.

import { categorieWidget } from "./categorie";
import { horlogeWidget } from "./horloge";
import { lienWidget } from "./lien";
import { numeroWidget } from "./numero";
import { rssWidget } from "./rss";
import { sousCategorieWidget } from "./sous-categorie";
import { uptimeWidget } from "./uptime";
import type { AccessWidget } from "./types";
import type { AccessBlockType } from "@milo/shared";

/** Dans l'ordre où la boîte de choix les présente. */
export const WIDGETS: AccessWidget[] = [
  categorieWidget,
  sousCategorieWidget,
  lienWidget,
  numeroWidget,
  horlogeWidget,
  rssWidget,
  uptimeWidget,
];

const PAR_TYPE = new Map<AccessBlockType, AccessWidget>(WIDGETS.map((p) => [p.type, p]));

/**
 * Le widget qui sait lire cet élément, ou « undefined » : un type rangé par
 * une version qui en connaissait un de plus n'a pas à faire tomber la page.
 */
export const widgetDe = (type: AccessBlockType): AccessWidget | undefined => PAR_TYPE.get(type);

export type { AccessWidget } from "./types";
