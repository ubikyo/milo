import { badRequest } from "./http.js";

export const now = (): string => new Date().toISOString();

/**
 * « 22/09/2026 à 20:15 ». Le fuseau est celui de Paris : l'application est
 * française, et la base, elle, garde ses dates en temps universel.
 */
export const horodatage = (iso: string): string => {
  const date = new Date(iso);
  const jour = date.toLocaleDateString("fr-FR", { timeZone: "Europe/Paris" });
  const heure = date.toLocaleTimeString("fr-FR", {
    timeZone: "Europe/Paris",
    hour: "2-digit",
    minute: "2-digit",
  });
  return `${jour} à ${heure}`;
};

/**
 * Une échéance reçue du client, ramenée à une forme unique. Le client envoie
 * l'heure de son fuseau ; la base garde de l'ISO 8601 en UTC, comme toutes les
 * autres dates. Une chaîne vide retire l'échéance ; une date incompréhensible
 * est refusée plutôt que rangée telle quelle. Les cartes et les demandes de
 * support la lisent de la même façon.
 */
export const echeance = (valeur: unknown, actuelle: string): string => {
  if (valeur === undefined) return actuelle;
  const texte = String(valeur ?? "").trim();
  if (!texte) return "";
  const date = new Date(texte);
  if (Number.isNaN(date.getTime())) badRequest("Date d'échéance invalide");
  return date.toISOString();
};
