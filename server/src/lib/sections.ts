// La largeur d'une section — une colonne d'une catégorie d'accès comme d'un
// panneau des statistiques. Elle se reçoit et se vérifie de la même façon
// partout.

import { SECTIONS_GAP_MAX, isSectionWidthUnit } from "@milo/shared";
import type { SectionWidthUnit } from "@milo/shared";
import { badRequest } from "./http.js";

/**
 * L'unité de largeur reçue du client. Une valeur inconnue n'est pas corrigée
 * en silence : elle serait rangée telle quelle et la colonne n'aurait plus de
 * largeur lisible.
 */
export const widthUnit = (value: unknown, defaultValue: SectionWidthUnit): SectionWidthUnit => {
  if (value === undefined) return defaultValue;
  if (!isSectionWidthUnit(value)) badRequest("Largeur inconnue");
  return value as SectionWidthUnit;
};

/**
 * La valeur qui accompagne l'unité : nulle pour une largeur automatique, un
 * nombre positif sinon. Les pour-cent s'arrêtent à 100 — au-delà, la colonne
 * déborderait de la rangée.
 */
export const widthValue = (unit: SectionWidthUnit, value: unknown): number | null => {
  if (unit === "auto") return null;
  const count = Number(value);
  if (!Number.isFinite(count) || count <= 0) badRequest("La largeur est requise");
  if (unit === "percent" && count > 100) badRequest("Une largeur en % ne dépasse pas 100");
  return count;
};

/** Le rang demandé à la création d'une section, s'il est lisible. */
export const requestedRank = (value: unknown): number | null => {
  const rank = Number(value);
  return value !== undefined && Number.isInteger(rank) && rank >= 0 ? rank : null;
};

/**
 * L'écart qui suit une colonne, tel que son champ l'envoie. Absent, celui d'avant
 * reste. Un nombre hors des bornes est refusé plutôt que ramené en silence :
 * ramené, le champ afficherait autre chose que ce qui vient d'être saisi.
 */
export const columnsGap = (value: unknown, defaultValue: number): number => {
  if (value === undefined || value === null || value === "") return defaultValue;
  const count = Number(value);
  if (!Number.isFinite(count) || count < 0 || count > SECTIONS_GAP_MAX) {
    badRequest(`L'écart des colonnes va de 0 à ${SECTIONS_GAP_MAX} pixels`);
  }
  return Math.round(count);
};
