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
export const uniteLargeur = (valeur: unknown, defaut: SectionWidthUnit): SectionWidthUnit => {
  if (valeur === undefined) return defaut;
  if (!isSectionWidthUnit(valeur)) badRequest("Largeur inconnue");
  return valeur as SectionWidthUnit;
};

/**
 * La valeur qui accompagne l'unité : nulle pour une largeur automatique, un
 * nombre positif sinon. Les pour-cent s'arrêtent à 100 — au-delà, la colonne
 * déborderait de la rangée.
 */
export const valeurLargeur = (unite: SectionWidthUnit, valeur: unknown): number | null => {
  if (unite === "auto") return null;
  const nombre = Number(valeur);
  if (!Number.isFinite(nombre) || nombre <= 0) badRequest("La largeur est requise");
  if (unite === "percent" && nombre > 100) badRequest("Une largeur en % ne dépasse pas 100");
  return nombre;
};

/** Le rang demandé à la création d'une section, s'il est lisible. */
export const rangDemande = (valeur: unknown): number | null => {
  const rang = Number(valeur);
  return valeur !== undefined && Number.isInteger(rang) && rang >= 0 ? rang : null;
};

/**
 * L'écart qui suit une colonne, tel que son champ l'envoie. Absent, celui d'avant
 * reste. Un nombre hors des bornes est refusé plutôt que ramené en silence :
 * ramené, le champ afficherait autre chose que ce qui vient d'être saisi.
 */
export const ecartColonnes = (valeur: unknown, defaut: number): number => {
  if (valeur === undefined || valeur === null || valeur === "") return defaut;
  const nombre = Number(valeur);
  if (!Number.isFinite(nombre) || nombre < 0 || nombre > SECTIONS_GAP_MAX) {
    badRequest(`L'écart des colonnes va de 0 à ${SECTIONS_GAP_MAX} pixels`);
  }
  return Math.round(nombre);
};
