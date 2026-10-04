// A card's due date: where it stands, and how it is written.
//
// The rule lives here and not in the two screens that show it — a card's
// drawer and the card on the board. Otherwise, "soon" would end up
// not meaning the same thing in both.

import dayjs from "dayjs";

/**
 * Three states, and only three:
 *
 * - `late`: the time has passed. It is the only one that is a fact, not a
 *   forecast — hence the red.
 * - `soon`: it falls within three days. A warning.
 * - `none`: it is far enough away to signal nothing.
 */
export type DueState = "late" | "soon" | "none";

/** The delay within which a due date is "soon". */
export const DAYS_BEFORE_DUE = 3;

/**
 * Where this due date stands. `currentTime` is passed in so the
 * rule can be tested without depending on the time of day.
 *
 * The comparison is on days and not on instants: a card due
 * today is not "late" at noon because its time was
 * left at midnight. It is indeed "today's date" that decides, and lateness
 * only starts the next day.
 *
 * A past due date is "late", not "soon": lateness is a
 * finding, it takes precedence over the warning.
 */
export const dueState = (
  due: string | null | undefined,
  currentTime: Date = new Date(),
): DueState => {
  if (!due) return "none";
  const dueDay = dayjs(due);
  if (!dueDay.isValid()) return "none";

  const days = dueDay.startOf("day").diff(dayjs(currentTime).startOf("day"), "day");
  if (days < 0) return "late";
  return days <= DAYS_BEFORE_DUE ? "soon" : "none";
};

/** What the bubble says: "En retard", "Bientôt", or nothing. */
export const DUE_WORD: Record<DueState, string> = {
  late: "En retard",
  soon: "Bientôt",
  none: "",
};

/**
 * The bubble's color. The red of lateness is that of deletions and
 * errors — it is the same signal; the orange of "soon" is that of
 * halfway progress (themes/colors.ts).
 */
export const DUE_COLOR: Record<DueState, string | undefined> = {
  late: "red",
  soon: "orange",
  none: undefined,
};

// The server refuses a date it does not understand; an unreadable value
// should therefore never arrive here. If one did slip through, better to
// show nothing than an "Invalid Date" in the middle of a card.
const formatDue = (due: string | null | undefined, pattern: string): string => {
  const date = dayjs(due ?? "");
  return due && date.isValid() ? date.locale("fr").format(pattern) : "";
};

/** Short, for a board card: "5 oct.". */
export const shortDate = (due: string | null | undefined): string => formatDue(due, "D MMM");

/**
 * A due date without a time. The time is optional: left empty, the
 * calendar sets the date at midnight, and it is midnight — in local time — that
 * means "no time". A due date really at midnight thus reads as the
 * whole day, which comes to the same thing: the states rule compares
 * days, not hours.
 */
export const withoutTime = (due: string | null | undefined): boolean => {
  const date = dayjs(due ?? "");
  return date.isValid() && date.hour() === 0 && date.minute() === 0 && date.second() === 0;
};
