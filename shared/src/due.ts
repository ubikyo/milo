// A card's due date: its recurrence and its reminder. The client offers them
// in lists, the server checks them and sends the reminder: both read
// the same keys here.

/** The rotation interval of cover images, in seconds; zero for "Jamais". */
export const COVER_ROTATIONS = [
  { value: 0, label: "Jamais" },
  { value: 5, label: "5s" },
  { value: 10, label: "10s" },
  { value: 30, label: "30s" },
  { value: 60, label: "1min" },
] as const;

export const isCoverRotation = (value: unknown): value is number =>
  COVER_ROTATIONS.some((r) => r.value === value);

/**
 * The shape of a due date: a single date ("Du"), or a period ("Du /
 * au"), which also carries a start.
 */
export const DUE_SHAPES = [
  { value: "date", label: "Du" },
  { value: "period", label: "Du / au" },
] as const;

export type DueShape = (typeof DUE_SHAPES)[number]["value"];

export const isDueForm = (value: unknown): value is DueShape =>
  DUE_SHAPES.some((f) => f.value === value);

/** The recurrence of a due date; empty for "Jamais". */
export const RECURRENCES = [
  { value: "", label: "Jamais" },
  { value: "daily", label: "Tous les jours" },
  { value: "weekdays", label: "Tous les jours ouvrés" },
  { value: "weekly", label: "Toutes les semaines" },
  { value: "monthly", label: "Tous les mois" },
  { value: "yearly", label: "Tous les ans" },
] as const;

export type Recurrence = (typeof RECURRENCES)[number]["value"];

export const isRecurrence = (value: unknown): value is Recurrence =>
  RECURRENCES.some((r) => r.value === value);

/**
 * The reminder of a due date, ahead of it; empty for "Aucun". A month
 * has no fixed duration: it is counted by the calendar (`reminderInstant`).
 */
export const REMINDERS = [
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

export type Reminder = (typeof REMINDERS)[number]["value"];

export const isReminder = (value: unknown): value is Reminder =>
  REMINDERS.some((r) => r.value === value);

const MINUTE = 60 * 1000;
const ADVANCED: Record<Exclude<Reminder, "" | "1M">, number> = {
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

/** The instant the reminder goes out, for an ISO due date; null without a reminder. */
export const reminderInstant = (due: string, reminder: Reminder): Date | null => {
  const date = new Date(due);
  if (!reminder || Number.isNaN(date.getTime())) return null;
  if (reminder === "1M") {
    date.setMonth(date.getMonth() - 1);
    return date;
  }
  return new Date(date.getTime() - ADVANCED[reminder]);
};
