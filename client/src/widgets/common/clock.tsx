import { Group, Input, SegmentedControl, Select, Stack, Switch, Text } from "@mantine/core";
import { IconClock } from "@tabler/icons-react";
import { useEffect, useState } from "react";
import classes from "../../assets/styles/Clock.module.css";
import { Frame } from "../margins";
import { insertRow, type SettingRow } from "../../components/ui/SettingRows";
import { formatOf, formatRow, formatStyle } from "../text-format";
import type { TextFormat } from "../text-format";
import { withField, count, text } from "../types";
import { SEGMENTS_BG } from "../../themes/colors";
import type { AccessWidget, Padding } from "../types";
import { themeColor } from "../../lib/themeColors";

// A clock: the time it is elsewhere. Useful when calling a site in another
// time zone — you see at a glance whether it is open.
//
// It shows only the time, centered in its column: the time zone is chosen in
// its drawer, and the element does not repeat that choice — a title placed
// above says which place it is, when that needs saying.
//
// It reads in digits, or on a dial with hands ("analogique"): the size then
// gives the dial's diameter. Either can show the seconds — in digits, or as a
// second hand.

const TIMEZONE = "timezone";
const SIZE = "size";
const FRAMED = "framed";
const MODE = "mode";
const SECONDS = "seconds";
const DIGITS = "numerals";
const DIAL_COLOR = "dialColor";
const STROKE_COLOR = "strokeColor";
const NUMERALS_COLOR = "numeralsColor";
const HANDS_COLOR = "handsColor";
const SECONDS_COLOR_KEY = "secondsColor";

/**
 * The dial's colors while they are given none, in hexadecimal: the picker
 * shows them as is. The face and its outline are two of the application's
 * grays (widgets/style-fields), the dial standing out on both themes; the
 * marks, digits and hands are light grays that read on it — the text's color
 * would vanish there in the light theme —; the second hand is the
 * application's green (Mantine's teal 6).
 */
const defaultFace = () => themeColor("clock-face");
const defaultStroke = () => themeColor("clock-stroke");
const defaultNumerals = () => themeColor("clock-numerals");
const defaultHands = () => themeColor("clock-hands");
const defaultSeconds = () => themeColor("clock-seconds");

/** The colors that follow the text's while none is chosen, depending on the theme. */
const DEFAULT_INK = "var(--milo-widget-text)";

/** The time's own format, in digits: bold, at its weight below. */
const DEFAULT_TEXT_FORMAT: TextFormat = { bold: true, italic: false, underline: false };
const BOLD_WEIGHT = 600;

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
const DEFAULT_SIZE = 36;
const SIZE_MIN = 8;
const SIZE_MAX = 96;

/**
 * The padding the frame leaves around the time, while the drawer's
 * "Apparence" block sets none.
 */
const INSET = 5;

/** Above and below the clock, the space that sets it apart from its neighbors. */
const VERTICAL_PADDING = 20;

/**
 * The space the clock leaves below itself, which the column sets
 * (components/ui/SectionsBoard.tsx): without it the time would touch the
 * link that follows.
 */
const LOW_MARGIN = 15;

/**
 * The time in this time zone, with or without seconds. A time zone the browser does
 * not know would make "Intl" throw: we then fall back to local time rather
 * than bring down the whole column.
 */
const timeIn = (timezone: string, currentTime: Date, seconds: boolean): string => {
  const format: Intl.DateTimeFormatOptions = {
    hour: "2-digit",
    minute: "2-digit",
    ...(seconds ? { second: "2-digit" } : {}),
  };
  try {
    return new Intl.DateTimeFormat("fr-FR", {
      ...format,
      timeZone: timezone || DEFAULT_TIMEZONE,
    }).format(currentTime);
  } catch {
    return new Intl.DateTimeFormat("fr-FR", format).format(currentTime);
  }
};

/**
 * The seconds elapsed since midnight in this time zone, milliseconds
 * included, to place the hands.
 */
const elapsedIn = (timezone: string, currentTime: Date): number => {
  const read = (timeZone?: string) => {
    const dateParts = new Intl.DateTimeFormat("fr-FR", {
      hour: "numeric",
      minute: "numeric",
      second: "numeric",
      hourCycle: "h23",
      ...(timeZone ? { timeZone } : {}),
    }).formatToParts(currentTime);
    const value = (type: string) => Number(dateParts.find((p) => p.type === type)?.value ?? 0);
    return value("hour") * 3600 + value("minute") * 60 + value("second");
  };
  const ms = currentTime.getMilliseconds() / 1000;
  try {
    return read(timezone || DEFAULT_TIMEZONE) + ms;
  } catch {
    return read() + ms;
  }
};

const isAnalog = (config: unknown): boolean => text(config, MODE, "digital") === "analog";

/** A box checked by default until it has been set. */
const isChecked = (config: unknown, key: string, defaultValue: boolean): boolean => {
  const value = (config as Record<string, unknown> | null)?.[key];
  return value === undefined ? defaultValue : Boolean(value);
};

/**
 * True when the seconds show. Until it is set, a dial has its second hand,
 * and the time in digits stops at the minute.
 */
const showsSeconds = (config: unknown): boolean =>
  isChecked(config, SECONDS, isAnalog(config));

/**
 * The dial: sixty marks — longer every five minutes —, optional digits, the
 * hour and minute hands, and the second hand if requested, which jumps from
 * second to second leaving a short trail. Drawn on a grid 100 on a side, it
 * takes the set diameter. Its face is a plain fill, a dark gray unless given a
 * color, as its outline; the marks and digits share one color, the hour and
 * minute hands another, the second hand a third — each with its default.
 *
 * The hands turn by CSS animations (assets/styles/Clock.module.css), which a
 * negative delay sets on the time: "elapsed" is the seconds since midnight.
 */
function Dial({
  diameter,
  elapsed,
  seconds,
  digits,
  face,
  stroke,
  numerals,
  hands,
  secondsColor,
}: {
  diameter: number;
  elapsed: number;
  seconds: boolean;
  digits: boolean;
  face: string;
  stroke: string;
  numerals: string;
  hands: string;
  secondsColor: string;
}) {
  const h = Math.floor(elapsed / 3600);
  const m = Math.floor((elapsed % 3600) / 60);
  const delay = (period: number) => ({ animationDelay: `${-(elapsed % period)}s` });
  // A hand: a straight bar, that goes a little past the center.
  const bar = (length: number, thickness: number, tail: number, color: string) => (
    <rect
      x={50 - thickness / 2}
      y={50 - length}
      width={thickness}
      height={length + tail}
      fill={color}
    />
  );
  const secondHand = bar(40, 1.6, 10, secondsColor);
  return (
    <svg
      width={diameter}
      height={diameter}
      viewBox="0 0 100 100"
      role="img"
      aria-label={`${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`}
      style={{ display: "block", margin: "0 auto" }}
    >
      <circle cx={50} cy={50} r={48} fill={face} stroke={stroke} strokeWidth={1.5} />
      {Array.from({ length: 60 }, (_, i) => {
        const major = i % 5 === 0;
        const thickness = major ? 1.4 : 0.7;
        return (
          <rect
            key={i}
            x={50 - thickness / 2}
            y={4.5}
            width={thickness}
            height={major ? 6.5 : 3}
            fill={numerals}
            transform={`rotate(${i * 6} 50 50)`}
          />
        );
      })}
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
              fill={numerals}
            >
              {i + 1}
            </text>
          );
        })}
      {/* The hour hand turns twice a day: its animation lasts a day. */}
      <g className={`${classes.hand} ${classes.hours}`} style={delay(86_400)}>
        {bar(23.5, 3.4, 6.5, hands)}
      </g>
      <g className={`${classes.hand} ${classes.minutes}`} style={delay(3_600)}>
        {bar(36.5, 3.4, 6.5, hands)}
      </g>
      {seconds ? (
        <g className={`${classes.hand} ${classes.seconds}`} style={delay(60)}>
          {/* The trail, copies of the hand that fade behind it each second. */}
          <g>
            {Array.from({ length: 8 }, (_, i) => (
              <g key={i} className={`${classes.hand} ${classes.trail}`} style={delay(1)}>
                {secondHand}
              </g>
            ))}
          </g>
          {secondHand}
          <circle cx={50} cy={50} r={2.5} fill={secondsColor} />
        </g>
      ) : (
        <circle cx={50} cy={50} r={2.5} fill={hands} />
      )}
    </svg>
  );
}

/** A clock is bare by default: the frame is what you ask for, not the reverse. */
const isFramed = (config: unknown): boolean =>
  Boolean((config as Record<string, unknown> | null)?.[FRAMED]);

/**
 * The padding while the drawer sets none: the frame's on the sides, or none
 * without it; above and below, the same in both modes.
 */
const paddingOf = (config: unknown): Padding => {
  const inset = isFramed(config) ? INSET : 0;
  return { Top: VERTICAL_PADDING, Right: inset, Bottom: VERTICAL_PADDING, Left: inset };
};

function Clock({ config }: { config: unknown }) {
  const [currentTime, setNow] = useState(() => new Date());
  const analog = isAnalog(config);
  const seconds = showsSeconds(config);

  // In digits, the display stops at the minute: refreshing it every second
  // would change nothing on screen, and would make the page tick for nothing —
  // except when the seconds show. A dial's hands turn by themselves: the
  // refresh only sets them back on the time, once a minute.
  useEffect(() => {
    const heartbeat = setInterval(
      () => setNow(new Date()),
      analog ? 60_000 : seconds ? 1_000 : 30_000,
    );
    return () => clearInterval(heartbeat);
  }, [analog, seconds]);

  const framed = isFramed(config);
  const timezone = text(config, TIMEZONE, DEFAULT_TIMEZONE);

  const hour = analog ? (
    <Dial
      diameter={count(config, SIZE, DEFAULT_DIAMETER)}
      elapsed={elapsedIn(timezone, currentTime)}
      seconds={seconds}
      digits={isChecked(config, DIGITS, false)}
      face={text(config, DIAL_COLOR) || defaultFace()}
      stroke={text(config, STROKE_COLOR) || defaultStroke()}
      numerals={text(config, NUMERALS_COLOR) || defaultNumerals()}
      hands={text(config, HANDS_COLOR) || defaultHands()}
      secondsColor={text(config, SECONDS_COLOR_KEY) || defaultSeconds()}
    />
  ) : (
    // Centered in the column, whatever its width: the time is short, and
    // flush left it would look placed there by accident.
    <Text
      ta="center"
      fz={count(config, SIZE, DEFAULT_SIZE)}
      style={formatStyle(formatOf(config, DEFAULT_TEXT_FORMAT), BOLD_WEIGHT)}
      c={text(config, NUMERALS_COLOR) || DEFAULT_INK}
    >
      {timeIn(timezone, currentTime, seconds)}
    </Text>
  );

  // Framed, the clock stands out from the rest of the column: the background
  // of the attributes inset (widgets/common/number), and the space needed
  // around so that the time does not touch its edges.
  return (
    <Frame config={config} framed={framed} padding={paddingOf(config)}>
      {hour}
    </Frame>
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
  padding: paddingOf,

  // In digits, the time is a text: its color and size, as a title's. On a
  // dial, the face has its color and diameter, the digits and marks, and the
  // hands each their color.
  appearance: (config, onChange) => {
    // A color with a default in hexadecimal shows it; brought back to it, it
    // is no longer stored.
    const colorOf = (key: string, defaultColor = "") => ({
      value: text(config, key) || defaultColor,
      onChange: (v: string) =>
        onChange(insertRow(config, { [key]: v === defaultColor ? "" : v })),
    });
    const isSet = (key: string, defaultColor = "") =>
      text(config, key) !== "" && text(config, key) !== defaultColor;
    const colorRow = (
      name: string,
      what: string,
      key: string,
      defaultColor?: string,
    ): SettingRow => ({
      name,
      what,
      color: colorOf(key, defaultColor),
      modified: isSet(key, defaultColor),
      reset: () => onChange(insertRow(config, { [key]: "" })),
    });
    if (isAnalog(config))
      return [
        // The face's background and its diameter, which an emptied field brings
        // back to the default rather than to a zero that would hide the dial.
        {
          name: "Cadran",
          what: "du cadran",
          color: colorOf(DIAL_COLOR, defaultFace()),
          size: {
            value: count(config, SIZE, DEFAULT_DIAMETER),
            defaultValue: DEFAULT_DIAMETER,
            min: DIAMETER_MIN,
            max: DIAMETER_MAX,
            onChange: (v) =>
              onChange(insertRow(config, { [SIZE]: v === DEFAULT_DIAMETER ? "" : v })),
          },
          modified:
            isSet(DIAL_COLOR, defaultFace()) || count(config, SIZE, DEFAULT_DIAMETER) !== DEFAULT_DIAMETER,
          reset: () => onChange(insertRow(config, { [DIAL_COLOR]: "", [SIZE]: "" })),
        },
        colorRow("Trait", "du trait du cadran", STROKE_COLOR, defaultStroke()),
        colorRow("Chiffres", "des chiffres", NUMERALS_COLOR, defaultNumerals()),
        colorRow("Aiguilles", "des aiguilles", HANDS_COLOR, defaultHands()),
        colorRow("Trotteuse", "de la trotteuse", SECONDS_COLOR_KEY, defaultSeconds()),
      ];

    // The size, brought back to the default, is no longer stored. The color
    // field shows the default, Mantine's text color in the current scheme, as
    // the date's (widgets/common/date): brought back to it, it is no longer
    // stored, and the time keeps following the scheme.
    const size = count(config, SIZE, DEFAULT_SIZE);
    const defaultInk = themeColor("widget-text");
    return [
      {
        name: "Texte",
        what: "de l'heure",
        color: colorOf(NUMERALS_COLOR, defaultInk),
        size: {
          value: size,
          defaultValue: DEFAULT_SIZE,
          min: SIZE_MIN,
          max: SIZE_MAX,
          onChange: (v) => onChange(insertRow(config, { [SIZE]: v === DEFAULT_SIZE ? "" : v })),
        },
        modified: isSet(NUMERALS_COLOR, defaultInk) || size !== DEFAULT_SIZE,
        reset: () => onChange(insertRow(config, { [NUMERALS_COLOR]: "", [SIZE]: "" })),
      },
      formatRow(config, onChange, DEFAULT_TEXT_FORMAT),
    ];
  },

  Config: ({ config, onChange }) => (
    <Stack gap="xl">
      {/* The display and, to its right, the time zone. */}
      <Group align="flex-end" gap="lg">
        {/* Changing mode brings the size back to the mode's: 36 px of text do
            not make a dial, nor 120 px of dial a text. */}
        <Input.Wrapper label="Affichage">
          <SegmentedControl
            display="flex"
            w="fit-content"
            mt={4}
            color="teal"
            data={MODES}
            // As the alignment's (components/ui/SettingRows): the chosen
            // option fills the control to its edges, in green on the gray. It
            // takes the height of the time zone's field, beside it.
            styles={{
              root: {
                padding: 0,
                backgroundColor: SEGMENTS_BG,
                // The 36 px of a field (Mantine defines its variable on inputs only).
                height: "calc(2.25rem * var(--mantine-scale))",
              },
              control: { display: "flex" },
              indicator: { borderRadius: "var(--sc-radius)" },
              label: {
                borderRadius: "var(--sc-radius)",
                display: "flex",
                alignItems: "center",
              },
            }}
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
      </Group>
      <Stack gap="sm">
        <Switch
          label="Afficher les secondes"
          checked={showsSeconds(config)}
          onChange={(e) => onChange(withField(config, SECONDS, e.currentTarget.checked))}
          color="teal"
        />
        {isAnalog(config) && (
          <Switch
            label="Chiffres sur le cadran"
            checked={isChecked(config, DIGITS, false)}
            onChange={(e) => onChange(withField(config, DIGITS, e.currentTarget.checked))}
            color="teal"
          />
        )}
      </Stack>
    </Stack>
  ),

};
