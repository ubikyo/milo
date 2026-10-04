import { badRequest } from "./http.js";

export const now = (): string => new Date().toISOString();

/**
 * "22/09/2026 à 20:15". The time zone is Paris: the application is French,
 * and the database keeps its dates in universal time.
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
 * A due date received from the client, normalized to a single form. The
 * client sends the time of its time zone; the database keeps ISO 8601 in UTC,
 * like all other dates. An empty string removes the due date; an
 * unintelligible date is rejected rather than stored as is. Cards and support
 * requests read it the same way.
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
 * A Paris time without time zone — "2026-09-28 14:22:31", as an inventory
 * agent gives it —, converted to ISO 8601 UTC like the database's other dates.
 * Nothing if the text does not read as a date.
 *
 * Paris's offset is measured at that very instant: it is one hour in winter,
 * two in summer, and it is the winter or summer time of the inventory day that
 * counts, not today's.
 */
export const parisTime = (text: string): string | null => {
  const chunks = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?$/.exec(text.trim());
  if (!chunks) return null;
  const [, year, months, day, hour, minute, secondValue = "0"] = chunks;
  const asUtc = Date.UTC(+year!, +months! - 1, +day!, +hour!, +minute!, +secondValue);
  if (Number.isNaN(asUtc)) return null;

  // What Paris clocks display at this instant, re-read as UTC: the gap with
  // the instant itself is the offset.
  const inParis = new Date(asUtc).toLocaleString("sv-SE", { timeZone: "Europe/Paris" });
  const offset = Date.parse(`${inParis.replace(" ", "T")}Z`) - asUtc;
  return new Date(asUtc - offset).toISOString();
};
