// The registry of the Access mode's widgets.
//
// Only one place knows them: the widget drawer takes its list from it, the
// column takes the display of an element from it, the drawer takes its fields
// from it. Adding a kind of element is therefore done in two steps — a file
// next to it, a line here — and one more value in "ACCESS_BLOCK_TYPES"
// (shared/domain.ts), which is what the database stores.

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

/** In the order in which the widget drawer presents them. */
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
 * The widget that can read this element, or "undefined": a type stored by a
 * version that knew one more must not bring the page down.
 */
export const widgetFor = (type: AccessBlockType): AccessWidget | undefined => BY_TYPE.get(type);

export type { AccessWidget } from "./types";
