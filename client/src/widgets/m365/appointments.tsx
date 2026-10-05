import { Box, Group, Loader, Select, Stack, Text } from "@mantine/core";
import { IconCalendarClock, IconCalendarOff, IconCalendarStats } from "@tabler/icons-react";
import dayjs from "dayjs";
import type { Dayjs } from "dayjs";
import { Fragment } from "react";
import alignment from "../../assets/styles/Alignment.module.css";
import EmptyPanel from "../../components/ui/EmptyPanel";
import { isSized } from "../height";
import type { WidgetRender } from "../../components/ui/IndicatorsPanel";
import { NameField, NAME, Nothing, IndicatorTitle, IndicatorValue } from "../support/common";
import type { IndicatorConfigProps } from "../support/types";
import { text, withField } from "../types";
import { CALENDAR_SOURCE, shownCalendarsOf } from "@milo/shared";
import type { Id } from "@milo/shared";
import type { MailCountWidget } from "./mail-counts";
import {
  appointmentKey,
  appointmentsIn,
  calendarLabel,
  ownerName,
  useCalendarSource,
  useCalendarSources,
  useCalendarWidgets,
  useLastChosenDay,
  useFollowedAgenda,
} from "./agenda";
import type { AgendaState } from "./agenda";

// The calendar widgets that follow the Calendar widgets of their board — all
// of them, unless their drawer names one (CALENDAR_SOURCE) — and read what
// they read, under their consent: "Rendez-vous", which lists the appointments of
// a period — by default the day chosen on that calendar —, and its
// "Indicateur", which counts them.

/** The period a widget reads, as its configuration stores it. */
const PERIOD = "period";

type Period = "chosen" | "today" | "tomorrow" | "week" | "next7" | "month";

const PERIODS: { value: Period; label: string; title: string }[] = [
  { value: "chosen", label: "Jour choisi dans le calendrier", title: "Rendez-vous du jour" },
  { value: "today", label: "Aujourd'hui", title: "Rendez-vous aujourd'hui" },
  { value: "tomorrow", label: "Demain", title: "Rendez-vous demain" },
  { value: "week", label: "Cette semaine", title: "Rendez-vous cette semaine" },
  { value: "next7", label: "7 prochains jours", title: "Rendez-vous à 7 jours" },
  { value: "month", label: "Ce mois-ci", title: "Rendez-vous ce mois-ci" },
];

/** The stored period, among those offered; an unknown one gives the first offered. */
const periodOf = (config: unknown, offered: readonly Period[]) => {
  const value = text(config, PERIOD) as Period;
  return PERIODS.find((p) => p.value === (offered.includes(value) ? value : offered[0]))!;
};

/** The days of a period, the first and the last included. "chosen": the calendar's chosen day. */
const daysOfPeriod = (period: Period, chosen: string): [Dayjs, Dayjs] => {
  const today = dayjs().startOf("day");
  switch (period) {
    case "chosen":
      return [dayjs(chosen), dayjs(chosen)];
    case "tomorrow":
      return [today.add(1, "day"), today.add(1, "day")];
    case "week": {
      // The week starts on Monday, whatever dayjs's locale.
      const monday = today.subtract((today.day() + 6) % 7, "day");
      return [monday, monday.add(6, "day")];
    }
    case "next7":
      return [today, today.add(6, "day")];
    case "month":
      return [today.startOf("month"), today.endOf("month").startOf("day")];
    default:
      return [today, today];
  }
};

/** The days a widget reads, from its configuration and its calendar's chosen day. */
const usePeriod = (config: unknown, offered: readonly Period[]) => {
  const period = periodOf(config, offered);
  const sources = useCalendarSources(config);
  const chosen = useLastChosenDay(sources.map((s) => s.id));
  const [first, last] = daysOfPeriod(period.value, chosen);
  return { period, first, last };
};

/** The value of the "all the board's Calendar widgets" option. */
const ALL = "all";

/** The drawer's "Widget associé" field: all the board's Calendar widgets, or one of them. */
function SourceField({ config, onChange }: IndicatorConfigProps) {
  const calendars = useCalendarWidgets();
  const source = useCalendarSource(config);
  return (
    <Select
      label="Widget associé"
      data={[
        { value: ALL, label: "Tous les widgets" },
        ...calendars.map((w, rank) => ({ value: String(w.id), label: calendarLabel(w, rank) })),
      ]}
      value={source ? String(source.id) : ALL}
      onChange={(value) =>
        value && onChange(withField(config, CALENDAR_SOURCE, value === ALL ? null : Number(value)))
      }
      allowDeselect={false}
      w={180}
    />
  );
}

/** The drawer's "Période" field, among the periods the widget offers. */
function PeriodField({
  config,
  onChange,
  offered,
}: IndicatorConfigProps & { offered: readonly Period[] }) {
  return (
    <Select
      label="Période"
      data={PERIODS.filter((p) => offered.includes(p.value))}
      value={periodOf(config, offered).value}
      onChange={(value) => value && onChange(withField(config, PERIOD, value))}
      allowDeselect={false}
    />
  );
}

/** What an appointment widget shows while it has nothing to read, or cannot. */
function Pending({ state }: { state: AgendaState & { orphan: boolean; empty: boolean } }) {
  if (state.orphan) return <Nothing>Aucun widget Calendrier sur le tableau</Nothing>;
  if (state.empty) return <Nothing>Aucun calendrier</Nothing>;
  if (state.phase === "error") {
    return (
      <Text size="sm" c="red" lineClamp={2}>
        {state.message}
      </Text>
    );
  }
  return <Loader size="xs" color="gray" />;
}

const hour = (iso: string) => dayjs(iso).format("HH:mm");

const dayTitle = (day: string) => dayjs(day).locale("fr").format("dddd D MMMM");

/** The appointments' gray, also under the list when the widget has a height of its own. */
const APPOINTMENT_BACKGROUND = "var(--milo-m365-appointment)";

/** A day's date, in its own gray section, above its appointments. */
function DaySection({ day, mt }: { day: string; mt?: number }) {
  return (
    <Box
      p={20}
      mt={mt}
      bg="var(--milo-m365-day)"
      c="white"
      style={{ borderRadius: "10px 10px 0 0" }}
    >
      <Text size="xs" fw={700} tt="capitalize">
        {dayTitle(day)}
      </Text>
    </Box>
  );
}

// --- Rendez-vous ---------------------------------------------------------------

const LIST_PERIODS: readonly Period[] = ["chosen", "today", "tomorrow", "next7", "week"];

function Appointments({ config, id }: { config: unknown; id: Id }) {
  const { first, last } = usePeriod(config, LIST_PERIODS);
  const state = useFollowedAgenda(id, config, first, last);
  const sources = useCalendarSources(config);
  // Several people: each appointment says whose it is.
  const severalCalendars =
    new Set(sources.flatMap((s) => [...shownCalendarsOf(s.config).keys()])).size > 1;
  const severalDays = !first.isSame(last, "day");
  // A height of its own: the appointments' gray fills what the list leaves.
  const sized = isSized(config);

  if (state.phase !== "ready") return <Pending state={state} />;
  const listed = appointmentsIn(state.calendar.events, first, last);

  return (
    <Stack
      gap={2}
      className={sized ? alignment.frame : undefined}
      style={sized ? { flex: 1, minHeight: 0, overflow: "auto" } : undefined}
    >
      {!severalDays && <DaySection day={first.format("YYYY-MM-DD")} />}
      {listed.map(({ day, appointment: r }, rank) => (
        <Fragment key={appointmentKey(r)}>
          {/* Over several days, each day's appointments under its date. */}
          {severalDays && day !== listed[rank - 1]?.day && <DaySection day={day} mt={rank ? 6 : 0} />}
          <Group
            gap="xs"
            wrap="nowrap"
            align="baseline"
            p={20}
            bg={APPOINTMENT_BACKGROUND}
            // Under its date's section, only a day's last appointment closes
            // the block — the very last, when the gray fills below, does not.
            style={{
              borderRadius:
                day !== listed[rank + 1]?.day && !(sized && rank === listed.length - 1)
                  ? "0 0 10px 10px"
                  : 0,
            }}
          >
            <Text size="xs" c="dimmed" style={{ flexShrink: 0, fontVariantNumeric: "tabular-nums" }} w={94} pr={10}>
              {r.all_day ? "Journée" : `${hour(r.start)} – ${hour(r.end)}`}
            </Text>
            <Box style={{ minWidth: 0 }}>
              <Text
                size="sm"
                lineClamp={1}
                title={r.subject}
                style={{ opacity: r.show_as === "free" ? 0.6 : 1 }}
              >
                {r.subject || "Sans objet"}
              </Text>
              {(r.location || severalCalendars) && (
                <Text size="xs" c="dimmed" lineClamp={1}>
                  {[severalCalendars ? ownerName(r.owner) : "", r.location].filter(Boolean).join(" · ")}
                </Text>
              )}
            </Box>
          </Group>
        </Fragment>
      ))}
      {/* Under the list, the gray fills the height; without appointments, it
          says so — centered in that height when the widget has one. */}
      {(sized || listed.length === 0) && (
        <Box
          bg={APPOINTMENT_BACKGROUND}
          p={listed.length ? undefined : 20}
          style={{
            display: "flex",
            flexDirection: "column",
            ...(sized ? { flex: 1, minHeight: 20 } : {}),
            borderRadius: listed.length || !severalDays ? "0 0 10px 10px" : 10,
          }}
        >
          {listed.length === 0 && (
            <EmptyPanel icon={IconCalendarOff} message="Aucun rendez-vous" size="md" fill={sized} />
          )}
        </Box>
      )}
    </Stack>
  );
}

export const appointmentsWidget: MailCountWidget = {
  type: "appointments",
  kind: "m365",
  label: "Rendez-vous",
  icon: IconCalendarClock,
  defaultConfig: { [PERIOD]: "chosen" },
  // A list: no card frame, its drawer through a right click.
  ownClicks: true,
  // Its days' gray sections are its frame.
  frameless: true,

  Display: ({ config, id }: { config: unknown } & WidgetRender) => <Appointments config={config} id={id} />,

  Config: ({ config, onChange }: IndicatorConfigProps) => (
    <Stack gap="xl">
      <SourceField config={config} onChange={onChange} />
      <PeriodField config={config} onChange={onChange} offered={LIST_PERIODS} />
    </Stack>
  ),
};

// --- Indicateur ----------------------------------------------------------------

const COUNT_PERIODS: readonly Period[] = ["today", "tomorrow", "week", "next7", "month", "chosen"];

function AppointmentCount({ config, id }: { config: unknown } & WidgetRender) {
  const { period, first, last } = usePeriod(config, COUNT_PERIODS);
  const state = useFollowedAgenda(id, config, first, last);
  return (
    // The name at the top, the quantity at bottom left: the card gives the height.
    <Stack gap={4} justify="space-between" style={{ flex: 1 }}>
      <IndicatorTitle config={config} defaultValue={period.title} />
      {state.phase === "ready" ? (
        <IndicatorValue config={config}>{appointmentsIn(state.calendar.events, first, last).length}</IndicatorValue>
      ) : (
        <Pending state={state} />
      )}
    </Stack>
  );
}

export const appointmentCountWidget: MailCountWidget = {
  type: "appointment_count",
  kind: "m365",
  label: "Indicateur rendez-vous",
  icon: IconCalendarStats,
  withValue: true,
  defaultConfig: { [NAME]: "", [PERIOD]: "today" },

  Display: AppointmentCount,

  Config: ({ config, onChange }: IndicatorConfigProps) => (
    <Stack gap="xl">
      <SourceField config={config} onChange={onChange} />
      <NameField config={config} onChange={onChange} defaultValue={periodOf(config, COUNT_PERIODS).title} />
      <PeriodField config={config} onChange={onChange} offered={COUNT_PERIODS} />
    </Stack>
  ),
};

/** In the order the widgets drawer presents them, after the mail counts. */
export const APPOINTMENT_WIDGETS: MailCountWidget[] = [appointmentsWidget, appointmentCountWidget];
