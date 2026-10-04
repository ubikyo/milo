import { badRequest } from "./http.js";

export const now = (): string => new Date().toISOString();

/**
 * « 22/09/2026 à 20:15 ». Le fuseau est celui de Paris : l'application est
 * française, et la base, elle, garde ses dates en temps universel.
 */
export const timestamp = (iso: string): string => {
  const date = new Date(iso);
  const day = date.toLocaleDateString("fr-FR", { timeZone: "Europe/Paris" });
  const hour = date.toLocaleTimeString("fr-FR", {
    timeZone: "Europe/Paris",
    hour: "2-digit",
    minute: "2-digit",
  });
  return `${day} à ${hour}`;
};

/**
 * Une échéance reçue du client, ramenée à une forme unique. Le client envoie
 * l'heure de son fuseau ; la base garde de l'ISO 8601 en UTC, comme toutes les
 * autres dates. Une chaîne vide retire l'échéance ; une date incompréhensible
 * est refusée plutôt que rangée telle quelle. Les cartes et les demandes de
 * support la lisent de la même façon.
 */
export const due = (value: unknown, current: string): string => {
  if (value === undefined) return current;
  const text = String(value ?? "").trim();
  if (!text) return "";
  const date = new Date(text);
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
export const parisTime = (text: string): string | null => {
  const chunks = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?$/.exec(text.trim());
  if (!chunks) return null;
  const [, an, months, day, hour, minute, secondValue = "0"] = chunks;
  const asUtc = Date.UTC(+an!, +months! - 1, +day!, +hour!, +minute!, +secondValue);
  if (Number.isNaN(asUtc)) return null;

  // Ce qu'affichent les horloges de Paris à cet instant, relu comme de l'UTC :
  // l'écart avec l'instant lui-même est le décalage.
  const inParis = new Date(asUtc).toLocaleString("sv-SE", { timeZone: "Europe/Paris" });
  const offset = Date.parse(`${inParis.replace(" ", "T")}Z`) - asUtc;
  return new Date(asUtc - offset).toISOString();
};
