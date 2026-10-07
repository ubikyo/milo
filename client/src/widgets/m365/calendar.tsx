import { Box, Indicator, Stack } from "@mantine/core";
import { Calendar } from "@mantine/dates";
import type { CalendarLevel } from "@mantine/dates";
import { IconCalendar, IconCalendarUser } from "@tabler/icons-react";
import dayjs from "dayjs";
import { useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";
import classes from "../../assets/styles/Calendar.module.css";
import { api } from "../../api";
import { ConfirmationActions, State, looksLikeAddress } from "../../components/support/Inboxes";
import ChoicePicker, { CALENDAR_NOUN, calendarsOf } from "../../components/ui/ChoicePicker";
import ReceptionField, { inboxesOf } from "../../components/ui/ReceptionField";
import { useConfirmations } from "../../lib/confirmations";
import { notifyError } from "../../lib/errors";
import { Frame } from "../margins";
import { colorRow, defaultAxes, defaultText } from "../chart-colors";
import { text, withField } from "../types";
import type { AccessWidget, WidgetConfigProps } from "../types";
import { CALENDAR_PEOPLE, SHOWN_CALENDARS, calendarKey, m365Event, shownCalendarsOf } from "@milo/shared";
import type { AccessCalendar, AccessCalendarEvent, Id } from "@milo/shared";
import MailTemplates from "../../components/settings/MailTemplates";
import { useSettingsMode, useTemplatesAccess } from "../../lib/rights";
import type { MailTemplateKey } from "@milo/shared";
import { BLUE, PALETTE_GREEN, PALETTE_RED } from "../../themes/colors";
import {
  DAY,
  NOTIFICATION_DELAY,
  RELOAD_INTERVAL,
  chooseDay,
  daysOf,
  ownerName,
  shownKeyOf,
  useChosenDay,
} from "./agenda";
import { themeColor } from "../../lib/themeColors";

/** The template of the e-mail that carries the code. */
const CALENDAR_TEMPLATES: readonly MailTemplateKey[] = ["calendar_confirmation"];

// A calendar: the current month, Mantine's. Optionally, it marks with a dot
// the days of appointments in Outlook calendars, read from Entra by the
// server (server/src/lib/entra.ts, Calendars.Read application permission):
// those of the people the widget names. Each of these
// receives a code by e-mail when the widget is saved, and their calendar is
// only read once that code, passed on, is entered from the "Actions" menu
// (server, lib/calendar-optin.ts). Once it is, the drawer chooses, to the
// right of the address, which of their calendars are read. A chosen day is
// that of the "Rendez-vous" widgets that follow the calendar
// (appointments.tsx): they list its appointments.

const FRAMED = "framed";

/**
 * The calendar's colors, set in the "Apparence" block: each one, stored,
 * fills a CSS variable that Calendar.module.css reads; left as is, the
 * variable is absent and the calendar keeps Mantine's color, in the current
 * scheme. The defaults, in hexadecimal, are those the picker shows.
 */
const COLORS = [
  { key: "monthColor", name: "Mois", what: "du mois et des flèches", cssVar: "--calendar-month", defaultColor: defaultText },
  { key: "weekdaysColor", name: "Semaine", what: "des jours de la semaine", cssVar: "--calendar-weekdays", defaultColor: defaultAxes },
  { key: "daysColor", name: "Jours", what: "des jours", cssVar: "--calendar-days", defaultColor: defaultText },
  { key: "weekendColor", name: "Week-end", what: "des jours du week-end", cssVar: "--calendar-weekend", defaultColor: () => PALETTE_RED.toLowerCase() },
  { key: "outsideColor", name: "Hors mois", what: "des jours des mois voisins", cssVar: "--calendar-outside", defaultColor: defaultAxes },
  { key: "todayColor", name: "Aujourd'hui", what: "du cadre d'aujourd'hui", cssVar: "--calendar-today", defaultColor: () => themeColor("m365-today") },
  // Only with appointments: a day is chosen, and marked.
  { key: "selectedColor", name: "Sélection", what: "du jour choisi", cssVar: "--calendar-selected", defaultColor: () => BLUE.toLowerCase(), appointments: true },
  { key: "dotColor", name: "Rendez-vous", what: "du point des rendez-vous", cssVar: "", defaultColor: () => PALETTE_GREEN.toLowerCase(), appointments: true },
] as const;

const DOT_COLOR = "dotColor";

/** The stored colors, as the CSS variables of the calendar. */
const colorVars = (config: unknown): CSSProperties =>
  Object.fromEntries(
    COLORS.filter((c) => c.cssVar && text(config, c.key)).map((c) => [c.cssVar, text(config, c.key)]),
  ) as CSSProperties;

const isChecked = (config: unknown, key: string, defaultValue: boolean): boolean => {
  const value = (config as Record<string, unknown> | null)?.[key];
  return value === undefined ? defaultValue : Boolean(value);
};

/** The addresses of the people the widget names, in lowercase. */
const peopleOf = (config: unknown): string[] => [
  ...new Set(
    inboxesOf(config, CALENDAR_PEOPLE)
      .map((r) => (typeof r.email === "string" ? r.email.trim().toLowerCase() : ""))
      .filter(looksLikeAddress),
  ),
];

type LoadState =
  | { phase: "loading" }
  | { phase: "ready"; calendar: AccessCalendar }
  | { phase: "error"; message: string };

function CalendarWidget({ blockId, config }: { blockId: Id; config: unknown }) {
  const shown = [...shownCalendarsOf(config)];
  const shownKey = shownKeyOf(config);
  const withAppointments = shown.length > 0;
  // Several people: each failure says whose calendar it is.
  const severalCalendars = shown.length > 1;
  const [months, setMonth] = useState(() => dayjs().startOf("month").format(DAY));
  const selected = useChosenDay(blockId);
  const [state, setState] = useState<LoadState>({ phase: "loading" });
  const [level, setLevel] = useState<CalendarLevel>("month");

  // The year level keeps the month's height: it is measured while the month shows.
  const calendarRef = useRef<HTMLDivElement>(null);
  const [monthHeight, setMonthHeight] = useState<number>();
  useEffect(() => {
    const el = calendarRef.current;
    if (!el || level !== "month") return;
    const observer = new ResizeObserver(() => setMonthHeight(el.offsetHeight));
    observer.observe(el);
    return () => observer.disconnect();
  }, [level]);

  // The grid shows a few days of the neighboring months: the period covers them.
  useEffect(() => {
    if (!withAppointments || !blockId) return;
    let active = true;
    const start = dayjs(months).startOf("month").subtract(7, "day").toDate();
    const end = dayjs(months).endOf("month").add(8, "day").startOf("day").toDate();
    const read = () =>
      api
        .getAccessCalendar(blockId, start, end)
        .then((calendar) => active && setState({ phase: "ready", calendar }))
        .catch((e: Error) => active && setState({ phase: "error", message: e.message }));
    read();
    const heartbeat = setInterval(read, RELOAD_INTERVAL);
    let pending: ReturnType<typeof setTimeout> | undefined;
    const onChange = () => {
      clearTimeout(pending);
      pending = setTimeout(read, NOTIFICATION_DELAY);
    };
    window.addEventListener(m365Event("calendar"), onChange);
    return () => {
      active = false;
      clearInterval(heartbeat);
      clearTimeout(pending);
      window.removeEventListener(m365Event("calendar"), onChange);
    };
    // The shown calendars are read again when they change.
  }, [withAppointments, blockId, months, shownKey]);

  const byDay = useMemo(() => {
    const card = new Map<string, AccessCalendarEvent[]>();
    if (state.phase !== "ready") return card;
    for (const r of state.calendar.events) {
      for (const day of daysOf(r)) card.set(day, [...(card.get(day) ?? []), r]);
    }
    return card;
  }, [state]);

  const errors = state.phase === "ready" ? state.calendar.errors : [];

  // A refusal — Graph's "Access denied" — goes out as a notification, not in
  // the widget; a calendar that cannot be read does not hide the others. The
  // notification's id is its message: the rereads do not stack it.
  const failures =
    state.phase === "error"
      ? [state.message]
      : errors.map((e) => `${severalCalendars ? `${ownerName(e.owner)} : ` : ""}${e.message}`);
  const failuresKey = withAppointments ? failures.join("\n") : "";
  useEffect(() => {
    if (!failuresKey) return;
    for (const message of failuresKey.split("\n")) notifyError(message, "Calendrier illisible");
  }, [failuresKey]);

  const content = (
    <Box ref={calendarRef} h={level === "year" ? monthHeight : undefined}>
      <Calendar
        fullWidth
        className={classes.calendar}
        classNames={{
          levelsGroup: classes.levelsGroup,
          monthsList: classes.monthsList,
          calendarHeaderLevel: classes.month,
          calendarHeaderControl: classes.month,
          weekday: classes.weekday,
          day: classes.day,
          monthsListControl: classes.monthsListControl,
        }}
        style={colorVars(config)}
        date={months}
        onDateChange={setMonth}
        level={level}
        onLevelChange={setLevel}
        // The calendar does not go below the month: the "year" and "decade"
        // levels have nothing to show here.
        maxLevel="year"
        highlightToday
        // Without an address, there is no appointment: no day to choose.
        static={!withAppointments}
        getDayProps={(date) =>
          withAppointments ? { selected: date === selected, onClick: () => chooseDay(blockId, date) } : {}
        }
        renderDay={(date) => {
          const count = byDay.get(date)?.length ?? 0;
          return (
            <Indicator size={5} color={text(config, DOT_COLOR) || "teal"} offset={-3} disabled={!count} position="bottom-center">
              <div>{dayjs(date).date()}</div>
            </Indicator>
          );
        }}
      />
    </Box>
  );

  return (
    <Frame config={config} framed={isChecked(config, FRAMED, false)}>
      {content}
    </Frame>
  );
}

export const calendarWidget: AccessWidget = {
  type: "calendar",
  kind: "m365",
  label: "Calendrier",
  icon: IconCalendar,
  defaultConfig: { [FRAMED]: false },
  // The days and the month arrows receive their clicks.
  ownClicks: true,

  Display: CalendarWidget,

  margins: () => ({ top: 0, bottom: 15 }),

  // It draws its own frame, set in the drawer's "Apparence" block.
  ownFrame: true,

  // Its colors: the choice and the dot only matter once a calendar is read.
  appearance: (config, onChange) => {
    const withAppointments = shownCalendarsOf(config).size > 0;
    return COLORS.filter((c) => !("appointments" in c) || withAppointments).map((c) =>
      colorRow(config, onChange, { name: c.name, what: c.what, key: c.key, defaultColor: c.defaultColor() }),
    );
  },

  Config: CalendarConfig,
};

/**
 * The drawer: the people whose calendar may be
 * shown — each with its consent state —, and those it shows.
 */
function CalendarConfig({ config, onChange }: WidgetConfigProps) {
  // The widget's key: a widget not yet saved has none — everything waits.
  const key = calendarKey(config);
  const people = peopleOf(config);
  const { confirmed } = useConfirmations(key, people, "calendar");
  const pending = people.filter((e) => !confirmed(e));
  // A person removed from the list, or not yet confirmed, is no longer read.
  const shown = new Map([...shownCalendarsOf(config)].filter(([e]) => people.includes(e) && confirmed(e)));
  const canEditSettings = useSettingsMode();
  const canEditTemplates = useTemplatesAccess();

  /** A person's calendars, chosen; null: none of them is read any more. */
  const choose = (email: string, ids: string[] | null) => {
    const next = new Map(shown);
    if (ids) next.set(email, ids);
    else next.delete(email);
    onChange(
      withField(
        config,
        SHOWN_CALENDARS,
        [...next].map(([e, calendars]) => ({ email: e, calendars })),
      ),
    );
  };

  return (
    <Stack gap="lg">
      <ConfirmationActions scope="calendar" owner={key} pending={pending} />
      <ReceptionField
        configKey={CALENDAR_PEOPLE}
        field="email"
        label="Calendriers"
        description={
          <>
            L'ajout d'un calendrier nécessite un code d'activation de 4 chiffres envoyé sur
            l'adresse e-mail. Une fois ce code reçu, cliquer sur le menu « Actions » puis
            « Confirmer une adresse » pour terminer la configuration de l'adresse.
          </>
        }
        placeholder="Adresse e-mail"
        add="Ajouter une adresse e-mail"
        icon={IconCalendarUser}
        empty="Aucun calendrier"
        normalizeValue={(value) => value.trim()}
        // Confirmed, the address offers its calendars; until then, it waits.
        state={(value) => {
          const email = value.trim().toLowerCase();
          if (!email) return null;
          if (!looksLikeAddress(email) || !confirmed(email)) return <State confirmed={false} />;
          return (
            <ChoicePicker
              load={calendarsOf(key, email)}
              chosen={shown.get(email)}
              onChange={(ids) => choose(email, ids)}
              noun={CALENDAR_NOUN}
              errorTitle="Calendriers illisibles"
            />
          );
        }}
        config={config}
        onChange={onChange}
      />
      {/* The code e-mail's template, as in the Tickets widget: it falls
          under the Paramétrage. */}
      {canEditSettings && <MailTemplates canEdit={canEditTemplates} only={CALENDAR_TEMPLATES} />}
    </Stack>
  );
}
