// Les réglages de la section « Support » du Paramétrage, et le calcul des
// jours ouvrés qui s'en sert. Ils valent pour toute l'application.

export interface SupportSettings {
  /**
   * L'échéance donnée d'office à une demande qui arrive par e-mail, en jours
   * ouvrés après sa réception. Zéro : pas d'échéance.
   */
  default_due_days: number;
}

/** Au-delà, une échéance « par défaut » n'en est plus une. */
export const SUPPORT_DUE_DAYS_MAX = 60;

export const emptySupportSettings = (): SupportSettings => ({ default_due_days: 0 });

/** Une date du calendrier, sans heure ni fuseau. */
export interface JourCalendrier {
  annee: number;
  /** De 1 à 12. */
  mois: number;
  jour: number;
}

const cle = (annee: number, mois: number, jour: number): string =>
  `${annee}-${String(mois).padStart(2, "0")}-${String(jour).padStart(2, "0")}`;

/** Le dimanche de Pâques (algorithme grégorien anonyme). */
const paques = (annee: number): Date => {
  const a = annee % 19;
  const b = Math.floor(annee / 100);
  const c = annee % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const mois = Math.floor((h + l - 7 * m + 114) / 31);
  const jour = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(Date.UTC(annee, mois - 1, jour));
};

const feries = new Map<number, Set<string>>();

/** Les jours fériés de France métropolitaine, pour une année. */
const feriesDe = (annee: number): Set<string> => {
  const deja = feries.get(annee);
  if (deja) return deja;
  const dimanche = paques(annee);
  const apresPaques = (n: number) => {
    const date = new Date(dimanche.getTime() + n * 86_400_000);
    return cle(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate());
  };
  const jours = new Set([
    cle(annee, 1, 1),
    apresPaques(1), // lundi de Pâques
    cle(annee, 5, 1),
    cle(annee, 5, 8),
    apresPaques(39), // Ascension
    apresPaques(50), // lundi de Pentecôte
    cle(annee, 7, 14),
    cle(annee, 8, 15),
    cle(annee, 11, 1),
    cle(annee, 11, 11),
    cle(annee, 12, 25),
  ]);
  feries.set(annee, jours);
  return jours;
};

/**
 * Le jour ouvré qui tombe `n` jours ouvrés après `depart` : ni samedi, ni
 * dimanche, ni jour férié. Le jour de départ ne compte pas — reçu un vendredi,
 * « un jour » tombe le lundi.
 */
export const ajouterJoursOuvres = (depart: JourCalendrier, n: number): JourCalendrier => {
  const date = new Date(Date.UTC(depart.annee, depart.mois - 1, depart.jour));
  let restants = Math.max(0, Math.floor(n));
  while (restants > 0) {
    date.setUTCDate(date.getUTCDate() + 1);
    const semaine = date.getUTCDay();
    const annee = date.getUTCFullYear();
    const ferie = feriesDe(annee).has(cle(annee, date.getUTCMonth() + 1, date.getUTCDate()));
    if (semaine !== 0 && semaine !== 6 && !ferie) restants -= 1;
  }
  return { annee: date.getUTCFullYear(), mois: date.getUTCMonth() + 1, jour: date.getUTCDate() };
};
