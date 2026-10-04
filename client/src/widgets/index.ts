// Le registre des widgets du mode Accès.
//
// Un seul endroit les connaît : le tiroir des widgets y prend sa liste, la colonne
// y prend l'affichage d'un élément, le tiroir y prend ses champs. Ajouter une
// sorte d'élément se fait donc en deux gestes — un fichier à côté, une ligne
// ici — et une valeur de plus dans « ACCESS_BLOCK_TYPES » (shared/domain.ts),
// qui est ce que la base range.

import { calendarWidget } from "./calendar";
import { categoryWidget } from "./category";
import { clockWidget } from "./clock";
import { imageWidget } from "./image";
import { linkWidget } from "./link";
import { mailWidget } from "./mail";
import { weatherWidget } from "./weather";
import { numberWidget } from "./number";
import { rssWidget } from "./rss";
import { subcategoryWidget } from "./subcategory";
import { todoWidget } from "./todo";
import type { AccessWidget } from "./types";
import type { AccessBlockType } from "@milo/shared";

/** Dans l'ordre où le tiroir des widgets les présente. */
export const WIDGETS: AccessWidget[] = [
  categoryWidget,
  subcategoryWidget,
  linkWidget,
  numberWidget,
  clockWidget,
  imageWidget,
  weatherWidget,
  calendarWidget,
  mailWidget,
  todoWidget,
  rssWidget,
];

const BY_TYPE = new Map<AccessBlockType, AccessWidget>(WIDGETS.map((p) => [p.type, p]));

/**
 * Le widget qui sait lire cet élément, ou « undefined » : un type rangé par
 * une version qui en connaissait un de plus n'a pas à faire tomber la page.
 */
export const widgetFor = (type: AccessBlockType): AccessWidget | undefined => BY_TYPE.get(type);

export type { AccessWidget } from "./types";
