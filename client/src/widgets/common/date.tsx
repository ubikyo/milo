import { Select, Stack, Switch, Text } from "@mantine/core";
import { IconCalendarEvent } from "@tabler/icons-react";
import { useEffect, useState } from "react";
import { Frame } from "../margins";
import { insertRow } from "../../components/ui/SettingRows";
import { formatOf, formatRow, formatStyle } from "../text-format";
import type { TextFormat } from "../text-format";
import { withField, count, text } from "../types";
import type { AccessWidget, Padding } from "../types";
import { themeColor } from "../../lib/themeColors";

// Today's date, in the format chosen in its drawer — spelled out with the
// day's name, short in digits, ISO… Like the clock, it shows only the date,
// centered in its column, and turns over at midnight by itself.

const FORMAT = "format";
const CAPITALIZED = "capitalized";
const SIZE = "size";
const FRAMED = "framed";
const COLOR = "color";

/**
 * The formats offered, each with what "Intl" needs to write it. ISO and the
 * week number are not "Intl" formats: they are assembled by hand.
 */
const FORMATS: { value: string; options?: Intl.DateTimeFormatOptions }[] = [
  { value: "full", options: { weekday: "long", day: "numeric", month: "long", year: "numeric" } },
  { value: "weekday", options: { weekday: "long", day: "numeric", month: "long" } },
  { value: "long", options: { day: "numeric", month: "long", year: "numeric" } },
  { value: "dayMonth", options: { day: "numeric", month: "long" } },
  { value: "medium", options: { day: "numeric", month: "short", year: "numeric" } },
  { value: "short", options: { day: "2-digit", month: "2-digit", year: "numeric" } },
  { value: "monthYear", options: { month: "long", year: "numeric" } },
  { value: "iso" },
  { value: "week" },
  { value: "weekShort" },
];

const DEFAULT_FORMAT = "full";

/** Sizes, in pixels: those of the clock in digits, the date being read from afar too. */
const DEFAULT_SIZE = 24;
const SIZE_MIN = 8;
const SIZE_MAX = 96;

/** The frame's padding, and the space above and below, as the clock's. */
const INSET = 5;
const VERTICAL_PADDING = 20;
const LOW_MARGIN = 15;

const DEFAULT_INK = "var(--milo-widget-text)";

/** The date's own format: bold, at its weight below. */
const DEFAULT_TEXT_FORMAT: TextFormat = { bold: true, italic: false, underline: false };
const BOLD_WEIGHT = 600;

/** A switch on by default until it has been set. */
const isChecked = (config: unknown, key: string, defaultValue: boolean): boolean => {
  const value = (config as Record<string, unknown> | null)?.[key];
  return value === undefined ? defaultValue : Boolean(value);
};

/**
 * The ISO 8601 week number, the one French calendars print: weeks start on
 * Monday, and the first is the one holding the year's first Thursday.
 */
const weekNumber = (date: Date): number => {
  const thursday = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  thursday.setDate(thursday.getDate() + 3 - ((thursday.getDay() + 6) % 7));
  const firstThursday = new Date(thursday.getFullYear(), 0, 4);
  firstThursday.setDate(firstThursday.getDate() + 3 - ((firstThursday.getDay() + 6) % 7));
  return 1 + Math.round((thursday.getTime() - firstThursday.getTime()) / (7 * 86_400_000));
};

/** The date in this format; an unknown format falls back to the default. */
const formatDate = (date: Date, format: string, capitalized: boolean): string => {
  const chosen = FORMATS.find((f) => f.value === format) ?? FORMATS[0]!;
  if (chosen.value === "week") {
    return `${capitalized ? "Semaine" : "semaine"} ${weekNumber(date)}`;
  }
  // Abbreviated as calendars print it: always a capital "S".
  if (chosen.value === "weekShort") return `S${weekNumber(date)}`;
  if (!chosen.options) {
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  }
  const written = new Intl.DateTimeFormat("fr-FR", chosen.options).format(date);
  return capitalized ? written.charAt(0).toUpperCase() + written.slice(1) : written;
};

const isFramed = (config: unknown): boolean =>
  Boolean((config as Record<string, unknown> | null)?.[FRAMED]);

const paddingOf = (config: unknown): Padding => {
  const inset = isFramed(config) ? INSET : 0;
  return { Top: VERTICAL_PADDING, Right: inset, Bottom: VERTICAL_PADDING, Left: inset };
};

function DateDisplay({ config }: { config: unknown }) {
  const [today, setToday] = useState(() => new Date());

  // Re-read every minute: the date changes only at midnight, and a screen
  // left open overnight must turn over without being reloaded.
  useEffect(() => {
    const heartbeat = setInterval(() => setToday(new Date()), 60_000);
    return () => clearInterval(heartbeat);
  }, []);

  return (
    <Frame config={config} framed={isFramed(config)} padding={paddingOf(config)}>
      <Text
        ta="center"
        fz={count(config, SIZE, DEFAULT_SIZE)}
        style={formatStyle(formatOf(config, DEFAULT_TEXT_FORMAT), BOLD_WEIGHT)}
        c={text(config, COLOR) || DEFAULT_INK}
      >
        {formatDate(
          today,
          text(config, FORMAT, DEFAULT_FORMAT),
          isChecked(config, CAPITALIZED, true),
        )}
      </Text>
    </Frame>
  );
}

export const dateWidget: AccessWidget = {
  type: "date",
  kind: "common",
  label: "Date",
  icon: IconCalendarEvent,
  defaultConfig: {
    [FORMAT]: DEFAULT_FORMAT,
    [SIZE]: DEFAULT_SIZE,
    [FRAMED]: false,
  },

  Display: DateDisplay,

  margins: () => ({ top: 0, bottom: LOW_MARGIN }),

  ownFrame: true,
  padding: paddingOf,

  // The date is a text: its color and size, as the clock in digits. The color
  // field shows the default, Mantine's text color in the current scheme;
  // brought back to it, it is no longer stored: the display keeps following
  // the scheme.
  appearance: (config, onChange) => {
    const size = count(config, SIZE, DEFAULT_SIZE);
    const defaultColor = themeColor("widget-text");
    const color = text(config, COLOR);
    return [
      {
        name: "Texte",
        what: "de la date",
        color: {
          value: color || defaultColor,
          onChange: (v) => onChange(insertRow(config, { [COLOR]: v === defaultColor ? "" : v })),
        },
        size: {
          value: size,
          defaultValue: DEFAULT_SIZE,
          min: SIZE_MIN,
          max: SIZE_MAX,
          onChange: (v) => onChange(insertRow(config, { [SIZE]: v === DEFAULT_SIZE ? "" : v })),
        },
        modified: (color !== "" && color !== defaultColor) || size !== DEFAULT_SIZE,
        reset: () => onChange(insertRow(config, { [COLOR]: "", [SIZE]: "" })),
      },
      formatRow(config, onChange, DEFAULT_TEXT_FORMAT),
    ];
  },

  // Each format is offered by today's date written in it: the example says
  // more than a name would.
  Config: ({ config, onChange }) => {
    const capitalized = isChecked(config, CAPITALIZED, true);
    const today = new Date();
    return (
      <Stack gap="xl">
        <Select
          label="Format"
          data={FORMATS.map((f) => ({
            value: f.value,
            label: formatDate(today, f.value, capitalized),
          }))}
          value={text(config, FORMAT, DEFAULT_FORMAT)}
          onChange={(value) => value && onChange(withField(config, FORMAT, value))}
          allowDeselect={false}
          autoFocus
          styles={{ wrapper: { width: 260 } }}
        />
        <Switch
          label="Majuscule initiale"
          checked={capitalized}
          onChange={(e) => onChange(withField(config, CAPITALIZED, e.currentTarget.checked))}
          color="teal"
        />
      </Stack>
    );
  },
};
