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
