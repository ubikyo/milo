import { Box, Checkbox, Input, NumberInput, SegmentedControl, Select, Stack, Text } from "@mantine/core";
import { IconClock } from "@tabler/icons-react";
import { useEffect, useState } from "react";
import classes from "../assets/styles/AccessNumber.module.css";
import { withField, count, text } from "./types";
import type { AccessWidget } from "./types";

// Une horloge : l'heure qu'il est ailleurs. Utile quand on appelle un site
// dans un autre fuseau — on voit d'un coup d'œil s'il est ouvert.
//
// Elle ne montre que l'heure, centrée dans sa colonne : le fuseau se choisit
// dans son tiroir, et l'élément ne répète pas ce choix — c'est un titre posé
// au-dessus qui dit de quel lieu il s'agit, quand il faut le dire.
//
// Elle se lit en chiffres, ou sur un cadran à aiguilles (« analogique ») : la
// taille dit alors le diamètre du cadran, et la trotteuse peut s'y ajouter.

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

/** Le diamètre d'un cadran, en pixels, et ses bornes. */
const DEFAULT_DIAMETER = 120;
const DIAMETER_MIN = 40;
const DIAMETER_MAX = 400;

// Les fuseaux proposés. La liste complète en compte des centaines : celle-ci
// couvre les lieux avec lesquels on travaille, et la saisie reste possible par
// ailleurs si le besoin vient.
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
 * La taille de l'heure, en pixels. Plus grosse que le texte d'une colonne :
 * c'est tout ce que l'élément porte, et elle se lit de loin. Les bornes
 * tiennent la colonne — en deçà l'heure ne se lit plus, au-delà elle déborde.
 */
const DEFAULT_SIZE = 18;
const SIZE_MIN = 8;
const SIZE_MAX = 96;

/** Le retrait que l'encadré laisse autour de l'heure. */
const INSET = 5;

/**
 * L'air que l'horloge laisse sous elle, que la colonne pose
 * (components/access/SectionBlocks.tsx) : sans cela l'heure toucherait le
 * lien qui la suit.
 */
const LOW_MARGIN = 15;

/**
 * L'heure dans ce fuseau, sans les secondes. Un fuseau que le navigateur ne
 * connaît pas ferait lever « Intl » : on retombe alors sur l'heure locale
 * plutôt que de faire tomber la colonne entière.
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

/** Les heures, minutes et secondes qu'il est dans ce fuseau, pour placer les aiguilles. */
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

/** Une case cochée par défaut tant qu'elle n'a pas été réglée. */
const isChecked = (config: unknown, key: string, defaultValue: boolean): boolean => {
  const value = (config as Record<string, unknown> | null)?.[key];
  return value === undefined ? defaultValue : Boolean(value);
};

/**
 * Le cadran : douze repères, les chiffres en option, les aiguilles des
 * heures et des minutes, et la trotteuse si on la demande. Dessiné sur une
 * grille de 100 de côté, il prend le diamètre réglé ; ses traits suivent la
 * couleur du texte, et la trotteuse prend la couleur de l'application.
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

/** Une horloge est nue par défaut : c'est l'encadré qu'on demande, pas l'inverse. */
const isFramed = (config: unknown): boolean =>
  Boolean((config as Record<string, unknown> | null)?.[FRAMED]);

function Clock({ config }: { config: unknown }) {
  const [currentTime, setNow] = useState(() => new Date());
  const analog = isAnalog(config);
  const seconds = analog && isChecked(config, SECONDS, true);

  // L'affichage s'arrête à la minute : la rafraîchir chaque seconde ne
  // changerait rien à l'écran, et ferait battre la page pour rien — sauf
  // quand la trotteuse tourne. Sans elle, l'aiguille des minutes avance tout
  // de même par petits pas.
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
    // Centrée sur la colonne, quelle que soit sa largeur : l'heure est courte,
    // et collée à gauche elle paraîtrait posée là par accident.
    <Text ta="center" fz={count(config, SIZE, DEFAULT_SIZE)} fw={600}>
      {timeIn(timezone, currentTime)}
    </Text>
  );

  if (!framed) return hour;

  // Encadrée, l'horloge se détache du reste de la colonne : le fond et le
  // trait de l'encart des attributs (widgets/numero), et l'air qu'il faut
  // autour pour que l'heure n'en touche pas les bords.
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

  // Il dessine lui-même son cadre, réglé dans le bloc « Apparence » du tiroir.
  ownFrame: true,

  Config: ({ config, onChange }) => (
    <Stack gap="xl">
      {/* Changer de mode ramène la taille à celle du mode : 18 px de texte ne
          font pas un cadran, ni 120 px de cadran un texte. */}
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
      {/* La taille de l'heure. Un champ vidé le temps d'une saisie ne dit
          rien : on range alors la taille par défaut plutôt qu'un zéro, qui
          ferait disparaître l'heure. */}
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
