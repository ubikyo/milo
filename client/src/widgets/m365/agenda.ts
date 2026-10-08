import dayjs from "dayjs";
import type { Dayjs } from "dayjs";
import { useContext, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { api } from "../../api";
import { BoardWidgetsContext } from "../../components/ui/IndicatorsPanel";
import type { Indicator } from "../../components/ui/IndicatorsPanel";
import { notifyError } from "../../lib/errors";
import { usePublishedResults } from "../../lib/searchSources";
import { calendarSourceOf, m365Event, shownCalendarsOf, widgetReference } from "@milo/shared";
import type { AccessCalendar, AccessCalendarEvent, Id } from "@milo/shared";

// What the Calendar widget and those that follow it — "Rendez-vous" and its
// "Indicateur" (appointments.tsx) — share: the days an appointment covers, the
// day chosen on a calendar, and how its appointments are read.

/**
 * The page rereads the calendar at this rate: an appointment made elsewhere
 * eventually shows up. When Graph notifies the server (lib/m365-webhooks.ts),
 * it rereads at once.
 */
export const RELOAD_INTERVAL = 5 * 60_000;

/** Graph sends several notifications for one change: a single reread follows them. */
export const NOTIFICATION_DELAY = 1_000;

/** The calendar's day format. */
export const DAY = "YYYY-MM-DD";

/** The days an appointment covers, in the calendar's day format. */
export const daysOf = (r: AccessCalendarEvent): string[] => {
  // An all-day appointment ends at midnight the next day, in UTC: we read it
  // by date, without a time zone, so as not to overflow by a day.
  const start = r.all_day ? dayjs(r.start.slice(0, 10)) : dayjs(r.start);
  const end = r.all_day ? dayjs(r.end.slice(0, 10)).subtract(1, "day") : dayjs(r.end).subtract(1, "minute");
  const days: string[] = [];
  for (let j = start.startOf("day"); !j.isAfter(end, "day") && days.length < 62; j = j.add(1, "day")) {
    days.push(j.format(DAY));
  }
  return days.length ? days : [start.format(DAY)];
};

/** A calendar's name: the start of its address. */
export const ownerName = (owner: string) => owner.split("@")[0]!;

/** What identifies an appointment, whoever's calendar it is in. */
export const appointmentKey = (r: AccessCalendarEvent) => `${r.owner}|${r.id}`;

// --- The day chosen on a calendar ---------------------------------------------
//
// Clicking a day of a Calendar widget chooses it for the widgets that follow
// that calendar: its "Rendez-vous" lists that day's. Until then, and after
// reloading the page, it is today.

const chosenDays = new Map<Id, string>();
/** In which order the days were chosen: the latest wins among several calendars. */
const chosenOrder = new Map<Id, number>();
let chosenCount = 0;
const listeners = new Set<() => void>();

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

export const chooseDay = (calendarId: Id, day: string) => {
  chosenDays.set(calendarId, day);
  chosenOrder.set(calendarId, ++chosenCount);
  for (const listener of listeners) listener();
};

/** The day chosen on a calendar; none, today. */
export const useChosenDay = (calendarId: Id | undefined): string =>
  useSyncExternalStore(subscribe, () =>
    (calendarId !== undefined && chosenDays.get(calendarId)) || dayjs().format(DAY),
  );

/** The day last chosen on one of these calendars; none, today. */
export const useLastChosenDay = (calendarIds: Id[]): string =>
  useSyncExternalStore(subscribe, () => {
    const latest = calendarIds
      .filter((id) => chosenDays.has(id))
      .sort((a, b) => chosenOrder.get(b)! - chosenOrder.get(a)!)[0];
    return (latest !== undefined && chosenDays.get(latest)) || dayjs().format(DAY);
  });

// --- The Calendar widgets a widget follows ------------------------------------

/** The board's Calendar widgets, in column order. */
export const useCalendarWidgets = (): Indicator<string>[] =>
  useContext(BoardWidgetsContext).filter((w) => w.type === "calendar");

/**
 * The Calendar widget a widget names; undefined for all the board's — none
 * named, or one since removed.
 */
export const useCalendarSource = (config: unknown): Indicator<string> | undefined => {
  const calendars = useCalendarWidgets();
  const chosen = calendarSourceOf(config);
  return calendars.find((w) => w.id === chosen);
};

/** The Calendar widgets a widget follows: the one it names, otherwise all the board's. */
export const useCalendarSources = (config: unknown): Indicator<string>[] => {
  const calendars = useCalendarWidgets();
  const source = useCalendarSource(config);
  return source ? [source] : calendars;
};

/** A Calendar widget, as the drawer offers it: by its reference alone. */
export const calendarLabel = (w: Indicator<string>, rank: number) =>
  widgetReference(w.type, w.config) || String(rank + 1);

/** The calendars a Calendar widget reads, as a key: they are read again when they change. */
export const shownKeyOf = (config: unknown) =>
  [...shownCalendarsOf(config)].map(([email, ids]) => `${email}:${ids.join("+")}`).join(",");

// --- The search --------------------------------------------------------------

/** When an appointment is: its day, and its time unless it lasts all day. */
const whenOf = (r: AccessCalendarEvent): string =>
  r.all_day ? dayjs(r.start.slice(0, 10)).format("ddd D MMM YYYY") : dayjs(r.start).format("ddd D MMM YYYY · HH:mm");

/**
 * The appointments a widget has read, published to the search (SearchBox):
 * their subject, when and where. One found opens in Outlook. Each period read
 * has its own source: the months browsed stay known.
 */
export function usePublishedAppointments(blockId: Id, period: string, events: AccessCalendarEvent[] | null) {
  usePublishedResults(
    blockId,
    `appointments:${period}`,
    useMemo(
      () =>
        events?.map((r) => ({
          kind: "appointment" as const,
          title: r.subject || "Sans objet",
          context: [whenOf(r), r.location, r.owner && ownerName(r.owner)].filter(Boolean).join(" · "),
          keywords: r.location,
          url: r.url || undefined,
          item: appointmentKey(r),
        })) ?? null,
      [events],
    ),
  );
}

// --- Reading -----------------------------------------------------------------

export type AgendaState =
  | { phase: "loading" }
  | { phase: "ready"; calendar: AccessCalendar }
  | { phase: "error"; message: string };

/**
 * The appointments of the days from "first" to "last", included, of the
 * Calendar widget a widget follows: at once, then at an interval and on each
 * change Graph notifies. A reread that fails keeps what was shown. The period
 * asked for is a day wider on each side: the days are counted in the viewer's
 * time zone (daysOf), Graph's in UTC.
 */
export function useFollowedAgenda(
  blockId: Id,
  config: unknown,
  first: Dayjs,
  last: Dayjs,
): AgendaState & { orphan: boolean; empty: boolean } {
  const sources = useCalendarSources(config);
  const orphan = sources.length === 0;
  // The sources and the calendars they read: a change of either reads again.
  const shownKey = sources.map((s) => `${s.id}:${shownKeyOf(s.config)}`).join(";");
  const empty = orphan || sources.every((s) => shownKeyOf(s.config) === "");
  const startKey = first.format(DAY);
  const endKey = last.format(DAY);
  const [state, setState] = useState<AgendaState>({ phase: "loading" });

  useEffect(() => {
    if (!blockId || empty) return;
    let active = true;
    setState({ phase: "loading" });
    const start = dayjs(startKey).subtract(1, "day").toDate();
    const end = dayjs(endKey).add(2, "day").toDate();
    const load = (firstRead: boolean) =>
      api
        .getAppointments(blockId, start, end)
        .then((calendar) => {
          if (!active) return;
          if (firstRead) {
            for (const e of calendar.errors) {
              notifyError(`${ownerName(e.owner)} : ${e.message}`, "Calendrier illisible");
            }
          }
          setState({ phase: "ready", calendar });
        })
        .catch((e: Error) => active && firstRead && setState({ phase: "error", message: e.message }));
    load(true);
    const heartbeat = setInterval(() => load(false), RELOAD_INTERVAL);
    let pending: ReturnType<typeof setTimeout> | undefined;
    const onChange = () => {
      clearTimeout(pending);
      pending = setTimeout(() => load(false), NOTIFICATION_DELAY);
    };
    window.addEventListener(m365Event("calendar"), onChange);
    return () => {
      active = false;
      clearInterval(heartbeat);
      clearTimeout(pending);
      window.removeEventListener(m365Event("calendar"), onChange);
    };
  }, [blockId, shownKey, empty, startKey, endKey]);

  usePublishedAppointments(
    blockId,
    `${startKey}/${endKey}`,
    state.phase === "ready" ? state.calendar.events : null,
  );

  return { ...state, orphan, empty };
}

/**
 * The appointments that fall in the days from "first" to "last", each once,
 * in order — with the first of those days it covers.
 */
export const appointmentsIn = (
  events: AccessCalendarEvent[],
  first: Dayjs,
  last: Dayjs,
): { day: string; appointment: AccessCalendarEvent }[] => {
  const from = first.format(DAY);
  const to = last.format(DAY);
  const seen = new Set<string>();
  return events
    .flatMap((appointment) => {
      const day = daysOf(appointment).find((d) => d >= from && d <= to);
      if (!day || seen.has(appointmentKey(appointment))) return [];
      seen.add(appointmentKey(appointment));
      return [{ day, appointment }];
    })
    .sort((a, b) => a.day.localeCompare(b.day) || a.appointment.start.localeCompare(b.appointment.start));
};
