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

/**
 * Une heure de Paris sans fuseau — « 2026-09-28 14:22:31 », comme la donne un
 * agent d'inventaire —, ramenée en ISO 8601 UTC comme les autres dates de la
 * base. Rien si le texte ne se lit pas comme une date.
 *
 * Le décalage de Paris se mesure à l'instant même : il vaut une heure l'hiver,
 * deux l'été, et c'est l'heure d'hiver ou d'été du jour de l'inventaire qui
 * compte, pas celle d'aujourd'hui.
 */
export const heureDeParis = (texte: string): string | null => {
  const morceaux = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?$/.exec(texte.trim());
  if (!morceaux) return null;
  const [, an, mois, jour, heure, minute, seconde = "0"] = morceaux;
  const commeUtc = Date.UTC(+an!, +mois! - 1, +jour!, +heure!, +minute!, +seconde);
  if (Number.isNaN(commeUtc)) return null;

  // Ce qu'affichent les horloges de Paris à cet instant, relu comme de l'UTC :
  // l'écart avec l'instant lui-même est le décalage.
  const aParis = new Date(commeUtc).toLocaleString("sv-SE", { timeZone: "Europe/Paris" });
  const decalage = Date.parse(`${aParis.replace(" ", "T")}Z`) - commeUtc;
  return new Date(commeUtc - decalage).toISOString();
};
