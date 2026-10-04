// Les rappels des échéances, relevés chaque minute (lib/notify.ts) :
//
//   - le rappel d'une carte, à l'avance choisie dans sa fiche ;
//   - le dépassement de l'échéance d'une carte ;
//   - le dépassement de la date d'un élément de checklist encore à faire ;
//   - la récurrence : une échéance récurrente dépassée, et signalée, avance à
//     sa prochaine occurrence. Son rappel et son dépassement se réarment
//     d'eux-mêmes, puisqu'ils retiennent la date dont ils sont partis.
//
// Chacun ne part qu'une fois par date : la ligne retient celle dont il est
// parti, et une date ou un rappel qui change le rouvre. Un dépassement trop
// ancien — plus d'un jour : le serveur était arrêté, ou la date a été posée
// dans le passé — est marqué sans être signalé, pour ne pas déverser d'un coup
// des alertes périmées.

import { instantDuRappel } from "@milo/shared";
import type { Id, Rappel } from "@milo/shared";
import type { Recurrence } from "@milo/shared";
import { mutation, selection } from "../db/query.js";
import { signalerEcriture } from "../middleware/events.js";
import { heureDeParis } from "./time.js";
import { env } from "../env.js";
import { notifierRappel } from "./notify.js";

/** La relève de fond regarde chaque minute : c'est le pas du plus court rappel. */
export const INTERVALLE_RAPPELS = 60 * 1000;

const enAttente = selection<{
  id: Id;
  text: string;
  due_date: string;
  reminder: Rappel;
}>(
  `SELECT id, text, due_date, reminder FROM task_cards
   WHERE kind = 'card' AND due_date != '' AND reminder != '' AND reminded_for != due_date`,
);

const acteurs = selection<{ user_id: Id }>(
  "SELECT user_id FROM card_members WHERE card_id = ?",
);

const marquer = mutation("UPDATE task_cards SET reminded_for = ? WHERE id = ?");

const cartesEchues = selection<{ id: Id; text: string; due_date: string }>(
  `SELECT id, text, due_date FROM task_cards
   WHERE kind = 'card' AND due_date != '' AND overdue_for != due_date`,
);
const marquerCarte = mutation(
  "UPDATE task_cards SET overdue_for = ? WHERE id = ?",
);

const elementsEchus = selection<{
  id: Id;
  text: string;
  due_date: string;
  card_id: Id;
  card_text: string;
}>(
  `SELECT checklist_items.id, checklist_items.text, checklist_items.due_date,
          task_cards.id AS card_id, task_cards.text AS card_text
   FROM checklist_items
   JOIN card_checklists ON card_checklists.id = checklist_items.checklist_id
   JOIN task_cards ON task_cards.id = card_checklists.card_id
   WHERE checklist_items.done = 0 AND checklist_items.due_date != ''
     AND checklist_items.overdue_for != checklist_items.due_date`,
);
const membresElement = selection<{ user_id: Id }>(
  "SELECT user_id FROM checklist_item_members WHERE item_id = ?",
);
const marquerElement = mutation(
  "UPDATE checklist_items SET overdue_for = ? WHERE id = ?",
);

/** Au-delà, un dépassement n'est plus une nouvelle : il est marqué sans être signalé. */
const PEREMPTION = 24 * 60 * 60 * 1000;
const JOUR = 24 * 60 * 60 * 1000;

/** Minuit à Paris, le lendemain de ce jour (« AAAA-MM-JJ »). */
const lendemainAParis = (jour: string): Date | null => {
  const minuit = heureDeParis(`${jour} 00:00`);
  return minuit ? new Date(new Date(minuit).getTime() + JOUR) : null;
};

/**
 * Quand une échéance de carte est dépassée. Comme à l'écran (lib/echeance.ts
 * du client) : une échéance avec une heure l'est à cette heure ; sans heure —
 * minuit à Paris —, le jour entier compte, et elle ne l'est que le lendemain.
 */
const depassementDeCarte = (iso: string): Date | null => {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  const heure = new Intl.DateTimeFormat("fr-FR", {
    timeZone: "Europe/Paris",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
  return heure === "00:00" ? new Date(date.getTime() + JOUR) : date;
};

/** « du 5 octobre 2026 », pour une date seule. */
const leJour = (jour: string): string => {
  const date = new Date(`${jour}T12:00:00Z`);
  return `du ${new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "long", year: "numeric" }).format(date)}`;
};

/** « le 5 octobre à 17:00 », à l'heure de Paris ; la date seule à minuit. */
const quand = (iso: string): string => {
  const date = new Date(iso);
  const partie = (options: Intl.DateTimeFormatOptions) =>
    new Intl.DateTimeFormat("fr-FR", {
      timeZone: "Europe/Paris",
      ...options,
    }).format(date);
  const heure = partie({ hour: "2-digit", minute: "2-digit" });
  const jour = partie({ day: "numeric", month: "long", year: "numeric" });
  return heure === "00:00" ? `du ${jour}` : `du ${jour} à ${heure}`;
};

export const envoyerLesRappels = (maintenant: Date = new Date()): void => {
  for (const carte of enAttente.all()) {
    const instant = instantDuRappel(carte.due_date, carte.reminder);
    if (!instant || instant > maintenant) continue;
    // Une échéance déjà passée ne se rappelle plus : le rappel serait faux.
    // Elle est tout de même marquée, pour ne plus être relue.
    if (new Date(carte.due_date) > maintenant) {
      notifierRappel({
        carte,
        message: `vous rappelle l'échéance ${quand(carte.due_date)}`,
        destinataires: acteurs.all(carte.id).map((a) => a.user_id),
        base: env.publicUrl,
      });
    }
    marquer.run(carte.due_date, carte.id);
  }

  for (const carte of cartesEchues.all()) {
    const depasse = depassementDeCarte(carte.due_date);
    if (!depasse || depasse > maintenant) continue;
    if (maintenant.getTime() - depasse.getTime() < PEREMPTION) {
      notifierRappel({
        carte,
        message: `signale que l'échéance ${quand(carte.due_date)} est dépassée`,
        destinataires: acteurs.all(carte.id).map((a) => a.user_id),
        base: env.publicUrl,
      });
    }
    marquerCarte.run(carte.due_date, carte.id);
  }

  avancerLesRecurrences(maintenant);

  // Un élément prévient ses personnes ; sans personne, les acteurs de la carte.
  for (const element of elementsEchus.all()) {
    const depasse = lendemainAParis(element.due_date);
    if (!depasse || depasse > maintenant) continue;
    if (maintenant.getTime() - depasse.getTime() < PEREMPTION) {
      const siennes = membresElement.all(element.id).map((m) => m.user_id);
      const nom = element.text ? `« ${element.text} »` : "sans libellé";
      notifierRappel({
        carte: { id: element.card_id, text: element.card_text },
        message: `signale que l'élément ${nom} d'une checklist a dépassé sa date ${leJour(element.due_date)}`,
        destinataires: siennes.length
          ? siennes
          : acteurs.all(element.card_id).map((a) => a.user_id),
        base: env.publicUrl,
      });
    }
    marquerElement.run(element.due_date, element.id);
  }
};

// --- Récurrence --------------------------------------------------------------

const recurrentes = selection<{
  id: Id;
  due_date: string;
  start_date: string;
  recurrence: Recurrence;
}>(
  `SELECT id, due_date, start_date, recurrence FROM task_cards
   WHERE kind = 'card' AND due_date != '' AND recurrence != ''`,
);
const reporter = mutation(
  "UPDATE task_cards SET due_date = ?, start_date = ? WHERE id = ?",
);

/** Une heure de Paris, lue comme des chiffres : on compte au calendrier, pas en millisecondes. */
interface Horloge {
  an: number;
  mois: number;
  jour: number;
  heure: number;
  minute: number;
}

const horlogeDeParis = (iso: string): Horloge => {
  const parties = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: "Europe/Paris",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(new Date(iso))
      .map((p) => [p.type, Number(p.value)]),
  );
  return {
    an: parties["year"]!,
    mois: parties["month"]!,
    jour: parties["day"]!,
    heure: parties["hour"]!,
    minute: parties["minute"]!,
  };
};

const deux = (n: number) => String(n).padStart(2, "0");

/** Le jour d'une horloge, décalé au calendrier ; un 31 qui n'existe pas tombe au dernier du mois. */
const decaler = (h: Horloge, jours: number, mois: number): Horloge => {
  const cible = new Date(Date.UTC(h.an, h.mois - 1 + mois, 1));
  const dernier = new Date(
    Date.UTC(cible.getUTCFullYear(), cible.getUTCMonth() + 1, 0),
  ).getUTCDate();
  const d = new Date(
    Date.UTC(
      cible.getUTCFullYear(),
      cible.getUTCMonth(),
      Math.min(h.jour, dernier) + jours,
    ),
  );
  return {
    ...h,
    an: d.getUTCFullYear(),
    mois: d.getUTCMonth() + 1,
    jour: d.getUTCDate(),
  };
};

/** Le pas d'une récurrence depuis ce jour : en jours, ou en mois. */
const pas = (
  recurrence: Recurrence,
  h: Horloge,
): { jours: number; mois: number } => {
  switch (recurrence) {
    case "daily":
      return { jours: 1, mois: 0 };
    case "weekdays": {
      // Le vendredi mène au lundi, le samedi aussi.
      const semaine = new Date(Date.UTC(h.an, h.mois - 1, h.jour)).getUTCDay();
      return { jours: semaine === 5 ? 3 : semaine === 6 ? 2 : 1, mois: 0 };
    }
    case "weekly":
      return { jours: 7, mois: 0 };
    case "monthly":
      return { jours: 0, mois: 1 };
    case "yearly":
      return { jours: 0, mois: 12 };
    default:
      return { jours: 0, mois: 0 };
  }
};

const enIso = (h: Horloge): string | null =>
  heureDeParis(
    `${h.an}-${deux(h.mois)}-${deux(h.jour)} ${deux(h.heure)}:${deux(h.minute)}`,
  );

/**
 * Les échéances récurrentes dépassées passent à leur prochaine occurrence non
 * encore dépassée — plusieurs pas s'il le faut, après un arrêt du serveur. Le
 * début d'une période avance du même pas que sa fin : la période garde sa
 * longueur. Le jour d'origine est gardé : un « tous les mois » du 31 revient au
 * 31 quand le mois l'a.
 */
const avancerLesRecurrences = (maintenant: Date): void => {
  let avancees = 0;
  for (const carte of recurrentes.all()) {
    const depasse = depassementDeCarte(carte.due_date);
    if (!depasse || depasse > maintenant) continue;

    const origine = horlogeDeParis(carte.due_date);
    const debut = carte.start_date
      ? horlogeDeParis(`${carte.start_date}T12:00:00Z`)
      : null;
    let fin = origine;
    let jours = 0;
    let mois = 0;
    let suivante: string | null = carte.due_date;
    // Mille pas au plus : une date absurde ne fait pas tourner la boucle sans fin.
    for (let i = 0; i < 1000; i += 1) {
      const p = pas(carte.recurrence, fin);
      if (!p.jours && !p.mois) break;
      jours += p.jours;
      mois += p.mois;
      fin = decaler(origine, jours, mois);
      suivante = enIso(fin);
      const prochain = suivante ? depassementDeCarte(suivante) : null;
      if (!prochain || prochain > maintenant) break;
    }
    if (!suivante || suivante === carte.due_date) continue;

    const nouveauDebut = debut ? decaler(debut, jours, mois) : null;
    reporter.run(
      suivante,
      nouveauDebut
        ? `${nouveauDebut.an}-${deux(nouveauDebut.mois)}-${deux(nouveauDebut.jour)}`
        : "",
      carte.id,
    );
    avancees += 1;
  }
  // Les tableaux ouverts montrent la nouvelle date sans attendre.
  if (avancees) signalerEcriture("task-lists");
};
