import { Box, Checkbox, Input, NumberInput, SegmentedControl, Select, Stack, Text } from "@mantine/core";
import { IconClock } from "@tabler/icons-react";
import { useEffect, useState } from "react";
import classes from "../../assets/styles/AccessNumber.module.css";
import { withField, count, text } from "../types";
import type { AccessWidget } from "../types";

// A clock: the time it is elsewhere. Useful when calling a site in another
// time zone — you see at a glance whether it is open.
//
// It shows only the time, centered in its column: the time zone is chosen in
// its drawer, and the element does not repeat that choice — a title placed
// above says which place it is, when that needs saying.
//
// It reads in digits, or on a dial with hands ("analogique"): the size then
// gives the dial's diameter, and a second hand can be added.

const TIMEZONE = "timezone";
const SIZE = "size";
const FRAMED = "framed";
const MODE = "mode";
const SECONDS = "seconds";
const DIGITS = "numerals";

const MODES = [
  { value: "digital", label: "Numérique" },
  { value: "analog", label: "Analogique" },
];

/** A dial's diameter, in pixels, and its bounds. */
const DEFAULT_DIAMETER = 120;
const DIAMETER_MIN = 40;
const DIAMETER_MAX = 400;

// The time zones offered. The full list has hundreds: this one covers the
// places we work with, and entry remains possible otherwise if the need
// arises.
const TIMEZONES = [
  { value: "Europe/Paris", label: "Paris" },
  { value: "Europe/London", label: "Londres" },
  { value: "Europe/Lisbon", label: "Lisbonne" },
  { value: "Africa/Casablanca", label: "Casablanca" },
  { value: "America/New_York", label: "New York" },
  { value: "America/Los_Angeles", label: "Los Angeles" },
  { value: "Asia/Dubai", label: "Dubaï" },
  { value: "Asia/Shanghai", label: "Shanghai" },
  { value: "Asia/Tokyo", label: "Tokyo" },
  { value: "Australia/Sydney", label: "Sydney" },
];

const DEFAULT_TIMEZONE = "Europe/Paris";

/**
 * The size of the time, in pixels. Larger than a column's text: it is all the
 * element carries, and it is read from afar. The bounds hold the column —
 * below them the time is no longer legible, above them it overflows.
 */
const DEFAULT_SIZE = 18;
const SIZE_MIN = 8;
const SIZE_MAX = 96;

/** The padding the frame leaves around the time. */
const INSET = 5;

/**
 * The space the clock leaves below itself, which the column sets
 * (components/ui/SectionsBoard.tsx): without it the time would touch the
 * link that follows.
 */
const LOW_MARGIN = 15;

/**
 * The time in this time zone, without seconds. A time zone the browser does
 * not know would make "Intl" throw: we then fall back to local time rather
 * than bring down the whole column.
 */
const timeIn = (timezone: string, currentTime: Date): string => {
  try {
    return new Intl.DateTimeFormat("fr-FR", {
      hour: "2-digit",
      minute: "2-digit",
      timeZone: timezone || DEFAULT_TIMEZONE,
    }).format(currentTime);
  } catch {
    return new Intl.DateTimeFormat("fr-FR", { hour: "2-digit", minute: "2-digit" }).format(
      currentTime,
    );
  }
};

/** The hours, minutes and seconds it is in this time zone, to place the hands. */
const clockPartsIn = (timezone: string, currentTime: Date): { h: number; m: number; s: number } => {
  const read = (timeZone?: string) => {
    const dateParts = new Intl.DateTimeFormat("fr-FR", {
      hour: "numeric",
      minute: "numeric",
      second: "numeric",
      hourCycle: "h23",
      ...(timeZone ? { timeZone } : {}),
    }).formatToParts(currentTime);
    const value = (type: string) => Number(dateParts.find((p) => p.type === type)?.value ?? 0);
    return { h: value("hour"), m: value("minute"), s: value("second") };
  };
  try {
    return read(timezone || DEFAULT_TIMEZONE);
  } catch {
    return read();
  }
};

const isAnalog = (config: unknown): boolean => text(config, MODE, "digital") === "analog";

/** A box checked by default until it has been set. */
const isChecked = (config: unknown, key: string, defaultValue: boolean): boolean => {
  const value = (config as Record<string, unknown> | null)?.[key];
  return value === undefined ? defaultValue : Boolean(value);
};

/**
 * The dial: twelve marks, optional digits, the hour and minute hands, and the
 * second hand if requested. Drawn on a grid 100 on a side, it takes the set
 * diameter; its strokes follow the text color, and the second hand takes the
 * application's color.
 */
function Dial({
  diameter,
  h,
  m,
  s,
  seconds,
  digits,
}: {
  diameter: number;
  h: number;
  m: number;
  s: number;
  seconds: boolean;
  digits: boolean;
}) {
  const hoursAngle = ((h % 12) + m / 60) * 30;
  const minutesAngle = (m + s / 60) * 6;
  const secondsAngle = s * 6;
  const hand = (angle: number, length: number, thickness: number, color: string, queue = 0) => (
    <line
      x1={50}
      y1={50 + queue}
      x2={50}
      y2={50 - length}
      stroke={color}
      strokeWidth={thickness}
      strokeLinecap="round"
      transform={`rotate(${angle} 50 50)`}
    />
  );
  return (
    <svg
      width={diameter}
      height={diameter}
      viewBox="0 0 100 100"
      role="img"
      aria-label={`${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`}
      style={{ display: "block", margin: "0 auto" }}
    >
      <circle cx={50} cy={50} r={48} fill="none" stroke="var(--mantine-color-dimmed)" strokeWidth={1.5} />
      {Array.from({ length: 12 }, (_, i) => (
        <line
          key={i}
          x1={50}
          y1={4}
          x2={50}
          y2={i % 3 === 0 ? 11 : 8}
          stroke="var(--mantine-color-text)"
          strokeWidth={i % 3 === 0 ? 2 : 1}
          strokeLinecap="round"
          transform={`rotate(${i * 30} 50 50)`}
        />
      ))}
      {digits &&
        Array.from({ length: 12 }, (_, i) => {
          const angle = ((i + 1) * 30 * Math.PI) / 180;
          return (
            <text
              key={i}
              x={50 + 31 * Math.sin(angle)}
              y={50 - 31 * Math.cos(angle)}
              textAnchor="middle"
              dominantBaseline="central"
              fontSize={9}
              fill="var(--mantine-color-text)"
            >
              {i + 1}
            </text>
          );
        })}
      {hand(hoursAngle, 24, 4, "var(--mantine-color-text)")}
      {hand(minutesAngle, 36, 2.5, "var(--mantine-color-text)")}
      {seconds && hand(secondsAngle, 40, 1, "var(--mantine-color-teal-6)", 8)}
      <circle cx={50} cy={50} r={2.5} fill={seconds ? "var(--mantine-color-teal-6)" : "var(--mantine-color-text)"} />
    </svg>
  );
}

/** A clock is bare by default: the frame is what you ask for, not the reverse. */
const isFramed = (config: unknown): boolean =>
  Boolean((config as Record<string, unknown> | null)?.[FRAMED]);

function Clock({ config }: { config: unknown }) {
  const [currentTime, setNow] = useState(() => new Date());
  const analog = isAnalog(config);
  const seconds = analog && isChecked(config, SECONDS, true);

  // The display stops at the minute: refreshing it every second would change
  // nothing on screen, and would make the page tick for nothing — except when
  // the second hand turns. Without it, the minute hand still moves forward in
  // small steps.
  useEffect(() => {
    const heartbeat = setInterval(() => setNow(new Date()), seconds ? 1_000 : analog ? 10_000 : 30_000);
    return () => clearInterval(heartbeat);
  }, [analog, seconds]);

  const framed = isFramed(config);
  const timezone = text(config, TIMEZONE, DEFAULT_TIMEZONE);

  const hour = analog ? (
    <Dial
      diameter={count(config, SIZE, DEFAULT_DIAMETER)}
      {...clockPartsIn(timezone, currentTime)}
      seconds={seconds}
      digits={isChecked(config, DIGITS, false)}
    />
  ) : (
    // Centered in the column, whatever its width: the time is short, and
    // flush left it would look placed there by accident.
    <Text ta="center" fz={count(config, SIZE, DEFAULT_SIZE)} fw={600}>
      {timeIn(timezone, currentTime)}
    </Text>
  );

  if (!framed) return hour;

  // Framed, the clock stands out from the rest of the column: the background
  // and stroke of the attributes inset (widgets/common/number), and the space needed
  // around so that the time does not touch its edges.
  return (
    <Box className={classes.inset} style={{ padding: INSET, border: "none" }}>
      {hour}
    </Box>
  );
}

export const clockWidget: AccessWidget = {
  type: "clock",
  kind: "common",
  label: "Horloge",
  icon: IconClock,
  defaultConfig: {
    [TIMEZONE]: DEFAULT_TIMEZONE,
    [SIZE]: DEFAULT_SIZE,
    [FRAMED]: false,
    [MODE]: "digital",
  },

  Display: Clock,

  margins: () => ({ top: 0, bottom: LOW_MARGIN }),

  // It draws its own frame, set in the drawer's "Apparence" block.
  ownFrame: true,

  Config: ({ config, onChange }) => (
    <Stack gap="xl">
      {/* Changing mode brings the size back to the mode's: 18 px of text do
          not make a dial, nor 120 px of dial a text. */}
      <Input.Wrapper label="Affichage">
        <SegmentedControl
          display="flex"
          w="fit-content"
          mt={4}
          data={MODES}
          value={isAnalog(config) ? "analog" : "digital"}
          onChange={(mode) =>
            onChange({
              ...withField(config, MODE, mode),
              [SIZE]: mode === "analog" ? DEFAULT_DIAMETER : DEFAULT_SIZE,
            })
          }
        />
      </Input.Wrapper>
      <Select
        label="Fuseau horaire"
        data={TIMEZONES}
        value={text(config, TIMEZONE, DEFAULT_TIMEZONE)}
        onChange={(value) => value && onChange(withField(config, TIMEZONE, value))}
        allowDeselect={false}
        searchable
        autoFocus
        styles={{ wrapper: { width: 200 } }}
      />
      {/* The size of the time. A field emptied while typing says nothing:
          we then store the default size rather than a zero, which would make
          the time disappear. */}
      {isAnalog(config) ? (
        <>
          <NumberInput
            label="Diamètre du cadran"
            placeholder={String(DEFAULT_DIAMETER)}
            value={count(config, SIZE, DEFAULT_DIAMETER)}
            onChange={(value) =>
              onChange(withField(config, SIZE, value === "" ? DEFAULT_DIAMETER : Number(value)))
            }
            min={DIAMETER_MIN}
            max={DIAMETER_MAX}
            suffix=" px"
            allowNegative={false}
            allowDecimal={false}
            styles={{ wrapper: { width: 120 } }}
          />
          <Stack gap="sm">
            <Checkbox
              label="Trotteuse (secondes)"
              checked={isChecked(config, SECONDS, true)}
              onChange={(e) => onChange(withField(config, SECONDS, e.currentTarget.checked))}
              color="teal"
            />
            <Checkbox
              label="Chiffres sur le cadran"
              checked={isChecked(config, DIGITS, false)}
              onChange={(e) => onChange(withField(config, DIGITS, e.currentTarget.checked))}
              color="teal"
            />
          </Stack>
        </>
      ) : (
        <NumberInput
          label="Taille de la police"
          placeholder={String(DEFAULT_SIZE)}
          value={count(config, SIZE, DEFAULT_SIZE)}
          onChange={(value) =>
            onChange(withField(config, SIZE, value === "" ? DEFAULT_SIZE : Number(value)))
          }
          min={SIZE_MIN}
          max={SIZE_MAX}
          suffix=" px"
          allowNegative={false}
          allowDecimal={false}
          styles={{ wrapper: { width: 120 } }}
        />
      )}
    </Stack>
  ),

};
