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

import { reminderInstant } from "@milo/shared";
import type { Id, Reminder } from "@milo/shared";
import type { Recurrence } from "@milo/shared";
import { mutation, selection } from "../db/query.js";
import { signalWrite } from "../middleware/events.js";
import { parisTime } from "./time.js";
import { env } from "../env.js";
import { notifyReminder } from "./notify.js";

/** La relève de fond regarde chaque minute : c'est le pas du plus court rappel. */
export const REMINDERS_INTERVAL = 60 * 1000;

const pending = selection<{
  id: Id;
  text: string;
  due_date: string;
  reminder: Reminder;
}>(
  `SELECT id, text, due_date, reminder FROM task_cards
   WHERE kind = 'card' AND due_date != '' AND reminder != '' AND reminded_for != due_date`,
);

const actors = selection<{ user_id: Id }>(
  "SELECT user_id FROM card_members WHERE card_id = ?",
);

const mark = mutation("UPDATE task_cards SET reminded_for = ? WHERE id = ?");

const overdueCards = selection<{ id: Id; text: string; due_date: string }>(
  `SELECT id, text, due_date FROM task_cards
   WHERE kind = 'card' AND due_date != '' AND overdue_for != due_date`,
);
const markCard = mutation(
  "UPDATE task_cards SET overdue_for = ? WHERE id = ?",
);

const overdueItems = selection<{
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
const itemMember = selection<{ user_id: Id }>(
  "SELECT user_id FROM checklist_item_members WHERE item_id = ?",
);
const markItem = mutation(
  "UPDATE checklist_items SET overdue_for = ? WHERE id = ?",
);

/** Au-delà, un dépassement n'est plus une nouvelle : il est marqué sans être signalé. */
const EXPIRY = 24 * 60 * 60 * 1000;
const DAY = 24 * 60 * 60 * 1000;

/** Minuit à Paris, le lendemain de ce jour (« AAAA-MM-JJ »). */
const tomorrowInParis = (day: string): Date | null => {
  const midnight = parisTime(`${day} 00:00`);
  return midnight ? new Date(new Date(midnight).getTime() + DAY) : null;
};

/**
 * Quand une échéance de carte est dépassée. Comme à l'écran (lib/echeance.ts
 * du client) : une échéance avec une heure l'est à cette heure ; sans heure —
 * minuit à Paris —, le jour entier compte, et elle ne l'est que le lendemain.
 */
const cardOverdueAt = (iso: string): Date | null => {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  const hour = new Intl.DateTimeFormat("fr-FR", {
    timeZone: "Europe/Paris",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
  return hour === "00:00" ? new Date(date.getTime() + DAY) : date;
};

/** « du 5 octobre 2026 », pour une date seule. */
const dayLabel = (day: string): string => {
  const date = new Date(`${day}T12:00:00Z`);
  return `du ${new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "long", year: "numeric" }).format(date)}`;
};

/** « le 5 octobre à 17:00 », à l'heure de Paris ; la date seule à minuit. */
const whenLabel = (iso: string): string => {
  const date = new Date(iso);
  const part = (options: Intl.DateTimeFormatOptions) =>
    new Intl.DateTimeFormat("fr-FR", {
      timeZone: "Europe/Paris",
      ...options,
    }).format(date);
  const hour = part({ hour: "2-digit", minute: "2-digit" });
  const day = part({ day: "numeric", month: "long", year: "numeric" });
  return hour === "00:00" ? `du ${day}` : `du ${day} à ${hour}`;
};

export const sendReminders = (currentTime: Date = new Date()): void => {
  for (const card of pending.all()) {
    const instant = reminderInstant(card.due_date, card.reminder);
    if (!instant || instant > currentTime) continue;
    // Une échéance déjà passée ne se rappelle plus : le rappel serait faux.
    // Elle est tout de même marquée, pour ne plus être relue.
    if (new Date(card.due_date) > currentTime) {
      notifyReminder({
        card,
        message: `vous rappelle l'échéance ${whenLabel(card.due_date)}`,
        recipients: actors.all(card.id).map((a) => a.user_id),
        base: env.publicUrl,
      });
    }
    mark.run(card.due_date, card.id);
  }

  for (const card of overdueCards.all()) {
    const overdueAt = cardOverdueAt(card.due_date);
    if (!overdueAt || overdueAt > currentTime) continue;
    if (currentTime.getTime() - overdueAt.getTime() < EXPIRY) {
      notifyReminder({
        card,
        message: `signale que l'échéance ${whenLabel(card.due_date)} est dépassée`,
        recipients: actors.all(card.id).map((a) => a.user_id),
        base: env.publicUrl,
      });
    }
    markCard.run(card.due_date, card.id);
  }

  advanceRecurrences(currentTime);

  // Un élément prévient ses personnes ; sans personne, les acteurs de la carte.
  for (const element of overdueItems.all()) {
    const overdueAt = tomorrowInParis(element.due_date);
    if (!overdueAt || overdueAt > currentTime) continue;
    if (currentTime.getTime() - overdueAt.getTime() < EXPIRY) {
      const ownIds = itemMember.all(element.id).map((m) => m.user_id);
      const name = element.text ? `« ${element.text} »` : "sans libellé";
      notifyReminder({
        card: { id: element.card_id, text: element.card_text },
        message: `signale que l'élément ${name} d'une checklist a dépassé sa date ${dayLabel(element.due_date)}`,
        recipients: ownIds.length
          ? ownIds
          : actors.all(element.card_id).map((a) => a.user_id),
        base: env.publicUrl,
      });
    }
    markItem.run(element.due_date, element.id);
  }
};

// --- Récurrence --------------------------------------------------------------

const recurring = selection<{
  id: Id;
  due_date: string;
  start_date: string;
  recurrence: Recurrence;
}>(
  `SELECT id, due_date, start_date, recurrence FROM task_cards
   WHERE kind = 'card' AND due_date != '' AND recurrence != ''`,
);
const postpone = mutation(
  "UPDATE task_cards SET due_date = ?, start_date = ? WHERE id = ?",
);

/** Une heure de Paris, lue comme des chiffres : on compte au calendrier, pas en millisecondes. */
interface Clock {
  year: number;
  months: number;
  day: number;
  hour: number;
  minute: number;
}

const parisClock = (iso: string): Clock => {
  const dateParts = Object.fromEntries(
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
    year: dateParts["year"]!,
    months: dateParts["month"]!,
    day: dateParts["day"]!,
    hour: dateParts["hour"]!,
    minute: dateParts["minute"]!,
  };
};

const pad2 = (n: number) => String(n).padStart(2, "0");

/** Le jour d'une horloge, décalé au calendrier ; un 31 qui n'existe pas tombe au dernier du mois. */
const shift = (h: Clock, days: number, months: number): Clock => {
  const target = new Date(Date.UTC(h.year, h.months - 1 + months, 1));
  const last = new Date(
    Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0),
  ).getUTCDate();
  const d = new Date(
    Date.UTC(
      target.getUTCFullYear(),
      target.getUTCMonth(),
      Math.min(h.day, last) + days,
    ),
  );
  return {
    ...h,
    year: d.getUTCFullYear(),
    months: d.getUTCMonth() + 1,
    day: d.getUTCDate(),
  };
};

/** Le pas d'une récurrence depuis ce jour : en jours, ou en mois. */
const pas = (
  recurrence: Recurrence,
  h: Clock,
): { days: number; months: number } => {
  switch (recurrence) {
    case "daily":
      return { days: 1, months: 0 };
    case "weekdays": {
      // Le vendredi mène au lundi, le samedi aussi.
      const week = new Date(Date.UTC(h.year, h.months - 1, h.day)).getUTCDay();
      return { days: week === 5 ? 3 : week === 6 ? 2 : 1, months: 0 };
    }
    case "weekly":
      return { days: 7, months: 0 };
    case "monthly":
      return { days: 0, months: 1 };
    case "yearly":
      return { days: 0, months: 12 };
    default:
      return { days: 0, months: 0 };
  }
};

const toIso = (h: Clock): string | null =>
  parisTime(
    `${h.year}-${pad2(h.months)}-${pad2(h.day)} ${pad2(h.hour)}:${pad2(h.minute)}`,
  );

/**
 * Les échéances récurrentes dépassées passent à leur prochaine occurrence non
 * encore dépassée — plusieurs pas s'il le faut, après un arrêt du serveur. Le
 * début d'une période avance du même pas que sa fin : la période garde sa
 * longueur. Le jour d'origine est gardé : un « tous les mois » du 31 revient au
 * 31 quand le mois l'a.
 */
const advanceRecurrences = (currentTime: Date): void => {
  let advanced = 0;
  for (const card of recurring.all()) {
    const overdueAt = cardOverdueAt(card.due_date);
    if (!overdueAt || overdueAt > currentTime) continue;

    const origin = parisClock(card.due_date);
    const start = card.start_date
      ? parisClock(`${card.start_date}T12:00:00Z`)
      : null;
    let end = origin;
    let days = 0;
    let months = 0;
    let nextDueDate: string | null = card.due_date;
    // Mille pas au plus : une date absurde ne fait pas tourner la boucle sans fin.
    for (let i = 0; i < 1000; i += 1) {
      const p = pas(card.recurrence, end);
      if (!p.days && !p.months) break;
      days += p.days;
      months += p.months;
      end = shift(origin, days, months);
      nextDueDate = toIso(end);
      const next = nextDueDate ? cardOverdueAt(nextDueDate) : null;
      if (!next || next > currentTime) break;
    }
    if (!nextDueDate || nextDueDate === card.due_date) continue;

    const newStart = start ? shift(start, days, months) : null;
    postpone.run(
      nextDueDate,
      newStart
        ? `${newStart.year}-${pad2(newStart.months)}-${pad2(newStart.day)}`
        : "",
      card.id,
    );
    advanced += 1;
  }
  // Les tableaux ouverts montrent la nouvelle date sans attendre.
  if (advanced) signalWrite("task-lists");
};
