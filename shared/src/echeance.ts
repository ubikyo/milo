// L'échéance d'une carte : sa récurrence et son rappel. Le client les propose
// dans des listes, le serveur les vérifie et envoie le rappel : les deux lisent
// les mêmes clés ici.

/** L'intervalle de rotation des images de couverture, en secondes ; zéro pour « Jamais ». */
export const ROTATIONS_COUVERTURE = [
  { value: 0, label: "Jamais" },
  { value: 5, label: "5s" },
  { value: 10, label: "10s" },
  { value: 30, label: "30s" },
  { value: 60, label: "1min" },
] as const;

export const isRotationCouverture = (valeur: unknown): valeur is number =>
  ROTATIONS_COUVERTURE.some((r) => r.value === valeur);

/**
 * La forme d'une échéance : une date seule (« Du »), ou une période (« Du /
 * au »), qui porte en plus un début.
 */
export const FORMES_ECHEANCE = [
  { value: "date", label: "Du" },
  { value: "periode", label: "Du / au" },
] as const;

export type FormeEcheance = (typeof FORMES_ECHEANCE)[number]["value"];

export const isFormeEcheance = (valeur: unknown): valeur is FormeEcheance =>
  FORMES_ECHEANCE.some((f) => f.value === valeur);

/** La récurrence d'une échéance ; vide pour « Jamais ». */
export const RECURRENCES = [
  { value: "", label: "Jamais" },
  { value: "daily", label: "Tous les jours" },
  { value: "weekdays", label: "Tous les jours ouvrés" },
  { value: "weekly", label: "Toutes les semaines" },
  { value: "monthly", label: "Tous les mois" },
  { value: "yearly", label: "Tous les ans" },
] as const;

export type Recurrence = (typeof RECURRENCES)[number]["value"];

export const isRecurrence = (valeur: unknown): valeur is Recurrence =>
  RECURRENCES.some((r) => r.value === valeur);

/**
 * Le rappel d'une échéance, en avance sur elle ; vide pour « Aucun ». Un mois
 * n'a pas de durée fixe : il se compte au calendrier (`instantDuRappel`).
 */
export const RAPPELS = [
  { value: "", label: "Aucun" },
  { value: "5m", label: "5 min" },
  { value: "10m", label: "10 min" },
  { value: "15m", label: "15 min" },
  { value: "1h", label: "1 heure" },
  { value: "2h", label: "2 heures" },
  { value: "1d", label: "1 jour" },
  { value: "2d", label: "2 jours" },
  { value: "1w", label: "1 sem." },
  { value: "2w", label: "2 sem." },
  { value: "1M", label: "1 mois" },
] as const;

export type Rappel = (typeof RAPPELS)[number]["value"];

export const isRappel = (valeur: unknown): valeur is Rappel =>
  RAPPELS.some((r) => r.value === valeur);

const MINUTE = 60 * 1000;
const AVANCES: Record<Exclude<Rappel, "" | "1M">, number> = {
  "5m": 5 * MINUTE,
  "10m": 10 * MINUTE,
  "15m": 15 * MINUTE,
  "1h": 60 * MINUTE,
  "2h": 120 * MINUTE,
  "1d": 24 * 60 * MINUTE,
  "2d": 2 * 24 * 60 * MINUTE,
  "1w": 7 * 24 * 60 * MINUTE,
  "2w": 14 * 24 * 60 * MINUTE,
};

/** L'instant où le rappel part, pour une échéance ISO ; null sans rappel. */
export const instantDuRappel = (echeance: string, rappel: Rappel): Date | null => {
  const date = new Date(echeance);
  if (!rappel || Number.isNaN(date.getTime())) return null;
  if (rappel === "1M") {
    date.setMonth(date.getMonth() - 1);
    return date;
  }
  return new Date(date.getTime() - AVANCES[rappel]);
};
