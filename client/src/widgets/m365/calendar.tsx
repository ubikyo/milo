import { Anchor, Box, Checkbox, Group, Indicator, Stack, Text } from "@mantine/core";
import { Calendar } from "@mantine/dates";
import { IconCalendar } from "@tabler/icons-react";
import dayjs from "dayjs";
import { useEffect, useMemo, useState } from "react";
import { api } from "../../api";
import { Frame } from "../margins";
import { withField } from "../types";
import type { AccessWidget } from "../types";
import type { AccessCalendarEvent, Id } from "@milo/shared";

// A calendar: the current month, Mantine's. Optionally, it marks with a dot
// the days on which the viewer has appointments in their Outlook calendar,
// read from Entra by the server (server/src/lib/entra.ts, Calendars.Read
// application permission): everyone sees their own, whatever the board. A
// chosen day shows its appointments below the month.

const APPOINTMENTS = "showEvents";
const LIST = "showList";
const FRAMED = "framed";

/** The page rereads the calendar at this rate: an appointment made elsewhere eventually shows up. */
const RELOAD_INTERVAL = 5 * 60_000;

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

type State =
  | { phase: "loading" }
  | { phase: "ready"; appointments: AccessCalendarEvent[] }
  | { phase: "error"; message: string };

function CalendarWidget({ blockId, config }: { blockId: Id; config: unknown }) {
  const withAppointments = isChecked(config, APPOINTMENTS, false);
  const withList = isChecked(config, LIST, true);
  const [months, setMonth] = useState(() => dayjs().startOf("month").format("YYYY-MM-DD"));
  const [selected, setChosen] = useState(() => dayjs().format("YYYY-MM-DD"));
  const [state, setState] = useState<State>({ phase: "loading" });

  // The grid shows a few days of the neighboring months: the period covers them.
  useEffect(() => {
    if (!withAppointments || !blockId) return;
    let active = true;
    const start = dayjs(months).startOf("month").subtract(7, "day").toDate();
    const end = dayjs(months).endOf("month").add(8, "day").startOf("day").toDate();
    const read = () =>
      api
        .getAccessCalendar(blockId, start, end)
        .then((appointments) => active && setState({ phase: "ready", appointments }))
        .catch((e: Error) => active && setState({ phase: "error", message: e.message }));
    read();
    const heartbeat = setInterval(read, RELOAD_INTERVAL);
    return () => {
      active = false;
      clearInterval(heartbeat);
    };
  }, [withAppointments, blockId, months]);

  const byDay = useMemo(() => {
    const card = new Map<string, AccessCalendarEvent[]>();
    if (state.phase !== "ready") return card;
    for (const r of state.appointments) {
      for (const day of daysOf(r)) card.set(day, [...(card.get(day) ?? []), r]);
    }
    return card;
  }, [state]);

  const ofDay = byDay.get(selected) ?? [];

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
      {withAppointments && state.phase === "error" && (
        <Text size="xs" c="red" lineClamp={3}>
          {state.message}
        </Text>
      )}
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
            <Group key={r.id} gap="xs" wrap="nowrap" align="baseline">
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
                {r.location && (
                  <Text size="xs" c="dimmed" lineClamp={1}>
                    {r.location}
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

  Config: ({ config, onChange }) => (
    <Stack gap="sm">
      <Checkbox
        label="Marquer mes rendez-vous Outlook (Entra)"
        description="Chacun voit les siens. Demande la permission Calendars.Read sur l'application Entra."
        checked={isChecked(config, APPOINTMENTS, false)}
        onChange={(e) => onChange(withField(config, APPOINTMENTS, e.currentTarget.checked))}
        color="teal"
      />
      <Checkbox
        label="Lister les rendez-vous du jour choisi"
        checked={isChecked(config, LIST, true)}
        disabled={!isChecked(config, APPOINTMENTS, false)}
        onChange={(e) => onChange(withField(config, LIST, e.currentTarget.checked))}
        color="teal"
      />
    </Stack>
  ),

};
