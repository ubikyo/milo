// Due-date reminders, polled every minute (lib/notify.ts):
//
//   - a card's reminder, at the lead time chosen in its detail panel;
//   - a card's due date being overdue;
//   - the date of a still-pending checklist item being overdue;
//   - recurrence: an overdue, already-reported recurring due date advances to
//     its next occurrence. Its reminder and overdue notice re-arm themselves,
//     since they remember the date they started from.
//
// Each one fires only once per date: the row remembers the date it fired for,
// and a changed date or reminder reopens it. An overdue notice that is too
// old — more than a day: the server was down, or the date was set in the
// past — is marked without being reported, to avoid dumping stale alerts all
// at once.

import { reminderInstant } from "@milo/shared";
import type { Id, Reminder } from "@milo/shared";
import type { Recurrence } from "@milo/shared";
import { mutation, selection } from "../db/query.js";
import { signalWrite } from "../middleware/events.js";
import { parisTime } from "./time.js";
import { env } from "../env.js";
import { notifyReminder } from "./notify.js";

/** The background poll runs every minute: this is the step of the shortest reminder. */
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

/** Beyond this, an overdue notice is no longer news: it is marked without being reported. */
const EXPIRY = 24 * 60 * 60 * 1000;
const DAY = 24 * 60 * 60 * 1000;

/** Midnight in Paris, the day after this day ("YYYY-MM-DD"). */
const tomorrowInParis = (day: string): Date | null => {
  const midnight = parisTime(`${day} 00:00`);
  return midnight ? new Date(new Date(midnight).getTime() + DAY) : null;
};

/**
 * When a card's due date is overdue. As on screen (lib/due.ts on the client):
 * a due date with a time is overdue at that time; without a time — midnight in
 * Paris —, the whole day counts, and it is overdue only the next day.
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

/** "du 5 octobre 2026", for a date alone. */
const dayLabel = (day: string): string => {
  const date = new Date(`${day}T12:00:00Z`);
  return `du ${new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "long", year: "numeric" }).format(date)}`;
};

/** "le 5 octobre à 17:00", in Paris time; the date alone at midnight. */
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
    // A due date already past is no longer reminded: the reminder would be
    // wrong. It is still marked, so it is not read again.
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

  // An item notifies its people; with nobody, the card's actors.
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

// --- Recurrence --------------------------------------------------------------

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

/** A Paris hour, read as plain numbers: we count by calendar, not in milliseconds. */
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

/** A clock's day, shifted by calendar; a 31st that does not exist falls on the last day of the month. */
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

/** A recurrence's step from this day: in days, or in months. */
const pas = (
  recurrence: Recurrence,
  h: Clock,
): { days: number; months: number } => {
  switch (recurrence) {
    case "daily":
      return { days: 1, months: 0 };
    case "weekdays": {
      // Friday leads to Monday, and so does Saturday.
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
 * Overdue recurring due dates move to their next not-yet-overdue occurrence —
 * several steps if needed, after a server stop. A period's start advances by
 * the same step as its end: the period keeps its length. The original day is
 * kept: an "every month" from the 31st returns to the 31st when the month has it.
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
    // At most a thousand steps: an absurd date does not make the loop spin forever.
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
  // Open boards show the new date without waiting.
  if (advanced) signalWrite("task-lists");
};
