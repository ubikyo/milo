// The width of a section — a column of an access category as well as a
// statistics panel. It is received and validated the same way everywhere.

import { SECTIONS_GAP_MAX, isSectionWidthUnit } from "@milo/shared";
import type { SectionWidthUnit } from "@milo/shared";
import { badRequest } from "./http.js";

/**
 * The width unit received from the client. An unknown value is not silently
 * corrected: it would be stored as is and the column would no longer have a
 * readable width.
 */
export const widthUnit = (value: unknown, defaultValue: SectionWidthUnit): SectionWidthUnit => {
  if (value === undefined) return defaultValue;
  if (!isSectionWidthUnit(value)) badRequest("Largeur inconnue");
  return value as SectionWidthUnit;
};

/**
 * The value that goes with the unit: null for an automatic width, a positive
 * number otherwise. Percentages stop at 100 — beyond that, the column would
 * overflow the row.
 */
export const widthValue = (unit: SectionWidthUnit, value: unknown): number | null => {
  if (unit === "auto") return null;
  const count = Number(value);
  if (!Number.isFinite(count) || count <= 0) badRequest("La largeur est requise");
  if (unit === "percent" && count > 100) badRequest("Une largeur en % ne dépasse pas 100");
  return count;
};

/** The position requested when creating a section, if it is readable. */
export const requestedRank = (value: unknown): number | null => {
  const rank = Number(value);
  return value !== undefined && Number.isInteger(rank) && rank >= 0 ? rank : null;
};

/**
 * The gap following a column, as its field sends it. When absent, the previous
 * one is kept. A number out of bounds is rejected rather than silently clamped:
 * clamped, the field would display something other than what was just entered.
 */
export const columnsGap = (value: unknown, defaultValue: number): number => {
  if (value === undefined || value === null || value === "") return defaultValue;
  const count = Number(value);
  if (!Number.isFinite(count) || count < 0 || count > SECTIONS_GAP_MAX) {
    badRequest(`L'écart des colonnes va de 0 à ${SECTIONS_GAP_MAX} pixels`);
  }
  return Math.round(count);
};
