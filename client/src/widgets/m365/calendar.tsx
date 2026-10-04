import { Anchor, Box, Checkbox, Group, Indicator, Stack, Text } from "@mantine/core";
import { Calendar } from "@mantine/dates";
import { IconCalendar, IconCalendarUser } from "@tabler/icons-react";
import dayjs from "dayjs";
import { useEffect, useMemo, useState } from "react";
import { api } from "../../api";
import { ConfirmationActions, State, looksLikeAddress } from "../../components/support/Inboxes";
import ChoicePicker, { CALENDAR_NOUN, calendarsOf } from "../../components/ui/ChoicePicker";
import ReceptionField, { inboxesOf } from "../../components/ui/ReceptionField";
import { useConfirmations } from "../../lib/confirmations";
import { notifyError } from "../../lib/errors";
import { Frame } from "../margins";
import { withField } from "../types";
import type { AccessWidget, WidgetConfigProps } from "../types";
import { CALENDAR_PEOPLE, SHOWN_CALENDARS, calendarKey, m365Event, shownCalendarsOf } from "@milo/shared";
import type { AccessCalendar, AccessCalendarEvent, Id } from "@milo/shared";

// A calendar: the current month, Mantine's. Optionally, it marks with a dot
// the days of appointments in Outlook calendars, read from Entra by the
// server (server/src/lib/entra.ts, Calendars.Read application permission):
// the viewer's own, and those of the people the widget names. Each of these
// receives a code by e-mail when the widget is saved, and their calendar is
// only read once that code, passed on, is entered from the "Actions" menu
// (server, lib/calendar-optin.ts). Once it is, the drawer chooses, to the
// right of the address, which of their calendars are read. A chosen day shows
// its appointments below the month.

const APPOINTMENTS = "showEvents";
const LIST = "showList";
const FRAMED = "framed";

/**
 * The page rereads the calendar at this rate: an appointment made elsewhere
 * eventually shows up. When Graph notifies the server (lib/m365-webhooks.ts),
 * it rereads at once.
 */
const RELOAD_INTERVAL = 5 * 60_000;

/** Graph sends several notifications for one change: a single reread follows them. */
const NOTIFICATION_DELAY = 1_000;

/** At most, the appointments listed below the month. */
const LIST_MAX = 6;

const isChecked = (config: unknown, key: string, defaultValue: boolean): boolean => {
  const value = (config as Record<string, unknown> | null)?.[key];
  return value === undefined ? defaultValue : Boolean(value);
};

/** The days an appointment covers, in the calendar's day format. */
const daysOf = (r: AccessCalendarEvent): string[] => {
  // An all-day appointment ends at midnight the next day, in UTC: we read it
  // by date, without a time zone, so as not to overflow by a day.
  const start = r.all_day ? dayjs(r.start.slice(0, 10)) : dayjs(r.start);
  const end = r.all_day ? dayjs(r.end.slice(0, 10)).subtract(1, "day") : dayjs(r.end).subtract(1, "minute");
  const days: string[] = [];
  for (let j = start.startOf("day"); !j.isAfter(end, "day") && days.length < 62; j = j.add(1, "day")) {
    days.push(j.format("YYYY-MM-DD"));
  }
  return days.length ? days : [start.format("YYYY-MM-DD")];
};

const hour = (iso: string) => dayjs(iso).format("HH:mm");

/** The addresses of the people the widget names, in lowercase. */
const peopleOf = (config: unknown): string[] => [
  ...new Set(
    inboxesOf(config, CALENDAR_PEOPLE)
      .map((r) => (typeof r.email === "string" ? r.email.trim().toLowerCase() : ""))
      .filter(looksLikeAddress),
  ),
];


/** A calendar's name: the start of its address, the viewer's own being "Moi". */
const ownerName = (owner: string) => (owner ? owner.split("@")[0]! : "Moi");

type LoadState =
  | { phase: "loading" }
  | { phase: "ready"; calendar: AccessCalendar }
  | { phase: "error"; message: string };

function CalendarWidget({ blockId, config }: { blockId: Id; config: unknown }) {
  const shown = [...shownCalendarsOf(config)];
  const shownKey = shown.map(([email, ids]) => `${email}:${ids.join("+")}`).join(",");
  const withAppointments = isChecked(config, APPOINTMENTS, false) || shown.length > 0;
  // Several people: each appointment says whose it is.
  const severalCalendars = (isChecked(config, APPOINTMENTS, false) ? 1 : 0) + shown.length > 1;
  const withList = isChecked(config, LIST, true);
  const [months, setMonth] = useState(() => dayjs().startOf("month").format("YYYY-MM-DD"));
  const [selected, setChosen] = useState(() => dayjs().format("YYYY-MM-DD"));
  const [state, setState] = useState<LoadState>({ phase: "loading" });

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

  // The day's appointments, in order, whoever's they are.
  const ofDay = [...(byDay.get(selected) ?? [])].sort((a, b) => a.start.localeCompare(b.start));
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
    <Stack gap="sm">
      <Calendar
        fullWidth
        date={months}
        onDateChange={setMonth}
        // The calendar does not go below the month: the "year" and "decade"
        // levels have nothing to show here.
        maxLevel="year"
        highlightToday
        getDayProps={(date) => ({
          selected: date === selected,
          onClick: () => setChosen(date),
        })}
        renderDay={(date) => {
          const count = byDay.get(date)?.length ?? 0;
          return (
            <Indicator size={5} color="teal" offset={-3} disabled={!count} position="bottom-center">
              <div>{dayjs(date).date()}</div>
            </Indicator>
          );
        }}
      />
      {withAppointments && withList && state.phase === "ready" && (
        <Stack gap={4}>
          <Text size="xs" c="dimmed" tt="capitalize">
            {dayjs(selected).format("dddd D MMMM")}
          </Text>
          {ofDay.length === 0 && (
            <Text size="sm" c="dimmed">
              Aucun rendez-vous
            </Text>
          )}
          {ofDay.slice(0, LIST_MAX).map((r) => (
            <Group key={`${r.owner}|${r.id}`} gap="xs" wrap="nowrap" align="baseline">
              <Text size="xs" c="dimmed" style={{ flexShrink: 0, fontVariantNumeric: "tabular-nums" }} w={84}>
                {r.all_day ? "Journée" : `${hour(r.start)} – ${hour(r.end)}`}
              </Text>
              <Box style={{ minWidth: 0 }}>
                <Anchor
                  href={r.url || undefined}
                  target="_blank"
                  rel="noopener noreferrer"
                  size="sm"
                  c="var(--mantine-color-text)"
                  underline="hover"
                  lineClamp={1}
                  title={r.subject}
                  style={{ opacity: r.show_as === "free" ? 0.6 : 1 }}
                >
                  {r.subject || "Sans objet"}
                </Anchor>
                {(r.location || severalCalendars) && (
                  <Text size="xs" c="dimmed" lineClamp={1}>
                    {[severalCalendars ? ownerName(r.owner) : "", r.location]
                      .filter(Boolean)
                      .join(" · ")}
                  </Text>
                )}
              </Box>
            </Group>
          ))}
          {ofDay.length > LIST_MAX && (
            <Text size="xs" c="dimmed">
              et {ofDay.length - LIST_MAX} de plus
            </Text>
          )}
        </Stack>
      )}
    </Stack>
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
  defaultConfig: { [APPOINTMENTS]: false, [LIST]: true, [FRAMED]: false },
  // The days and the month arrows receive their clicks.
  ownClicks: true,

  Display: CalendarWidget,

  margins: () => ({ top: 0, bottom: 15 }),

  // It draws its own frame, set in the drawer's "Apparence" block.
  ownFrame: true,

  Config: CalendarConfig,
};

/**
 * The drawer: the viewer's own calendar, the people whose calendar may be
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
  const withAppointments = isChecked(config, APPOINTMENTS, false) || shown.size > 0;

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
      <Checkbox
        label="Marquer mes rendez-vous Outlook (Entra)"
        description="Chacun voit les siens. Demande la permission Calendars.Read sur l'application Entra."
        checked={isChecked(config, APPOINTMENTS, false)}
        onChange={(e) => onChange(withField(config, APPOINTMENTS, e.currentTarget.checked))}
        color="teal"
      />
      <ReceptionField
        configKey={CALENDAR_PEOPLE}
        field="email"
        label="Calendriers"
        description={
          <>
            Chaque adresse ajoutée reçoit, à l'enregistrement, un code à quatre chiffres : son
            titulaire vous le communique s'il accepte que son calendrier soit affiché. Saisissez-le
            depuis le menu « Actions », puis « Confirmer une adresse ». Une fois l'adresse
            confirmée, choisissez à sa droite les calendriers à lire. Tous ceux qui voient ce
            tableau verront leurs rendez-vous.
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
      <Checkbox
        label="Lister les rendez-vous du jour choisi"
        checked={isChecked(config, LIST, true)}
        disabled={!withAppointments}
        onChange={(e) => onChange(withField(config, LIST, e.currentTarget.checked))}
        color="teal"
      />
    </Stack>
  );
}
