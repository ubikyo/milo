import { Group, Loader, Select, SimpleGrid, Stack, Switch, Text } from "@mantine/core";
import { AreaChart, BarChart } from "@mantine/charts";
import { useDebouncedValue } from "@mantine/hooks";
import {
  IconCloud,
  IconCloudBolt,
  IconCloudFog,
  IconCloudRain,
  IconCloudSnow,
  IconDroplet,
  IconMoon,
  IconSun,
  IconSunHigh,
  IconSunMoon,
  IconTemperature,
  IconWind,
} from "@tabler/icons-react";
import { useEffect, useState } from "react";
import type { ComponentType } from "react";
import { api } from "../../api";
import { BLUE, ORANGE } from "../../themes/colors";
import { insertRow, type SettingRow } from "../../components/ui/SettingRows";
import { Frame } from "../margins";
import { withField, count, text } from "../types";
import type { AccessWidget, WidgetConfigProps } from "../types";
import type { AccessWeather, Id, WeatherPlace } from "@milo/shared";
import { themeColor } from "../../lib/themeColors";
import { lastRead } from "../../lib/lastRead";

// The weather of a place: the temperature, a pictogram of the sky's state,
// and optionally the feels-like temperature, humidity and wind, then the
// forecasts — the temperature curve or the rain of the coming hours (Mantine's
// charts), or the week ahead.
//
// The forecasts come from Open-Meteo, through the server
// (server/src/lib/weather.ts), which keeps them for a quarter of an hour: the
// page does not leave the application. The place is searched by name in the
// drawer; only its coordinates and name are stored.
//
// The "latitude" and "longitude" keys are also read by the server
// (weatherCoordinates): they do not change.

const PLACE = "place";
const LATITUDE = "latitude";
const LONGITUDE = "longitude";
const SIZE = "size";
const SHOW_LOCATION = "showPlace";
const SHOW_ICON = "showIcon";
const SHOW_TEMPERATURE = "showTemperature";
const SHOW_SKY = "showSky";
const DETAILS = "details";
const FORECASTS = "forecast";
const FRAMED = "framed";
const TEMPERATURE_COLOR = "temperatureColor";
const SKY_COLOR = "skyColor";
const LOCATION_COLOR = "placeColor";
const DETAILS_COLOR = "detailsColor";
const FORECASTS_COLOR = "forecastColor";
const LEGEND_COLOR = "legendColor";

const DEFAULT_SIZE = 32;

/** The padding while the drawer sets none, framed or not. */
const DEFAULT_PADDING = 20;
const SIZE_MIN = 12;
const SIZE_MAX = 96;

/** The page rereads the server at this rate: it is the server that queries the source. */
const RELOAD_INTERVAL = 15 * 60_000;

/** The height of a forecast chart. */
const CHART_HEIGHT = 110;

/**
 * The width the forecasts take at least: aligned left, center or right, the
 * content keeps its own width (widgets/alignment.ts), and a chart has none of
 * its own — it would shrink to the pictogram's and the temperature's.
 */
const FORECASTS_MIN_WIDTH = 260;

/** The height of the week's forecasts: the day, the pictogram, the high and the low. */
const WEEK_HEIGHT = 84;

/** A line of "xs" text, and the "xs" gap between the rows. */
const SMALL_LINE = 19;
const ROW_GAP = 10;

const SUGGESTED_FORECASTS = [
  { value: "none", label: "Aucune" },
  { value: "temperature", label: "Températures sur 24 h" },
  { value: "rain", label: "Risque de pluie sur 24 h" },
  { value: "week", label: "La semaine" },
];

interface Sky {
  label: string;
  icon: ComponentType<{ size?: number; color?: string; stroke?: number }>;
  color: string;
}

/**
 * The sky's state from the WMO code (WMO 4677) that Open-Meteo provides.
 * At night, a clear sky shows the moon rather than the sun.
 */
const skyOf = (code: number, day = true): Sky => {
  if (code === 0) {
    return day
      ? { label: "Ensoleillé", icon: IconSun, color: "#fab005" }
      : { label: "Ciel clair", icon: IconMoon, color: "#c9c9c9" };
  }
  if (code <= 2) {
    return day
      ? { label: "Éclaircies", icon: IconSunHigh, color: "#fab005" }
      : { label: "Éclaircies", icon: IconSunMoon, color: "#c9c9c9" };
  }
  if (code === 3) return { label: "Couvert", icon: IconCloud, color: "#a6a6a6" };
  if (code === 45 || code === 48) return { label: "Brouillard", icon: IconCloudFog, color: "#a6a6a6" };
  if (code >= 51 && code <= 57) return { label: "Bruine", icon: IconCloudRain, color: "#4dabf7" };
  if (code >= 61 && code <= 67) return { label: "Pluie", icon: IconCloudRain, color: "#228be6" };
  if (code >= 71 && code <= 77) return { label: "Neige", icon: IconCloudSnow, color: "#74c0fc" };
  if (code >= 80 && code <= 82) return { label: "Averses", icon: IconCloudRain, color: "#228be6" };
  if (code === 85 || code === 86) return { label: "Averses de neige", icon: IconCloudSnow, color: "#74c0fc" };
  if (code >= 95) return { label: "Orage", icon: IconCloudBolt, color: "#7048e8" };
  return { label: "Nuageux", icon: IconCloud, color: "#a6a6a6" };
};

/** The switches, each with its default: on or off when never set. */
const SWITCHES = [
  { key: SHOW_ICON, label: "Afficher le pictogramme", defaultValue: true },
  { key: SHOW_TEMPERATURE, label: "Afficher la température", defaultValue: true },
  { key: SHOW_SKY, label: "Afficher le type de temps", defaultValue: false },
  { key: SHOW_LOCATION, label: "Afficher le nom du lieu", defaultValue: false },
  { key: DETAILS, label: "Afficher le ressenti, l'humidité et le vent", defaultValue: false },
];

const degrees = (value: number) => `${Math.round(value)}°`;

/** A switch is on by default when it has never been set. */
const isChecked = (config: unknown, key: string, defaultValue: boolean): boolean => {
  const value = (config as Record<string, unknown> | null)?.[key];
  return value === undefined ? defaultValue : Boolean(value);
};

const hasLocation = (config: unknown): boolean => {
  const c = (config as Record<string, unknown> | null) ?? {};
  return typeof c[LATITUDE] === "number" && typeof c[LONGITUDE] === "number";
};

/** The latest forecasts of each element, kept in the browser (lib/lastRead.ts). */
const alreadyRead = lastRead<AccessWeather>("weather");

type State =
  | { phase: "loading" }
  | { phase: "ready"; weather: AccessWeather }
  | { phase: "error"; message: string };

/** The forecasts' colors; empty, the default's. */
interface ForecastColors {
  /** The curve, the bars, the week's highs: orange, blue, the text's. */
  chart: string;
  /** The axes' hours and degrees, the week's days: dimmed. */
  legend: string;
}

function Forecasts({ weather, what, colors }: { weather: AccessWeather; what: string; colors: ForecastColors }) {
  const legend = colors.legend || "var(--milo-widget-dimmed)";
  if (what === "temperature") {
    const data = weather.hourly.map((h) => ({ hour: `${h.time.slice(11, 13)} h`, temperature: h.temperature }));
    return (
      <AreaChart
        h={CHART_HEIGHT}
        data={data}
        dataKey="hour"
        series={[{ name: "temperature", label: "Température", color: colors.chart || ORANGE }]}
        textColor={legend}
        curveType="natural"
        gridAxis="none"
        withDots={false}
        unit="°"
        yAxisProps={{ width: 28, domain: ["dataMin - 2", "dataMax + 2"], tickFormatter: (v: number) => `${Math.round(v)}` }}
        xAxisProps={{ interval: 5 }}
        valueFormatter={(v) => `${Math.round(v)}`}
      />
    );
  }
  if (what === "rain") {
    const data = weather.hourly.map((h) => ({ hour: `${h.time.slice(11, 13)} h`, rain: h.precipitation }));
    return (
      <BarChart
        h={CHART_HEIGHT}
        data={data}
        dataKey="hour"
        series={[{ name: "rain", label: "Risque de pluie", color: colors.chart || BLUE }]}
        textColor={legend}
        gridAxis="none"
        unit=" %"
        yAxisProps={{ width: 28, domain: [0, 100] }}
        xAxisProps={{ interval: 5 }}
      />
    );
  }
  if (what === "week") {
    const day = new Intl.DateTimeFormat("fr-FR", { weekday: "short" });
    return (
      <SimpleGrid cols={weather.daily.length} spacing={4}>
        {weather.daily.map((j) => {
          const sky = skyOf(j.code);
          return (
            <Stack key={j.time} gap={2} align="center" title={sky.label}>
              <Text size="xs" c={legend} tt="capitalize">
                {day.format(new Date(`${j.time}T12:00:00`)).replace(".", "")}
              </Text>
              <sky.icon size={20} color={sky.color} stroke={1.6} />
              <Text size="xs" fw={600} c={colors.chart || undefined}>
                {degrees(j.temperature)}
              </Text>
              <Text size="xs" c="dimmed">
                {degrees(j.min ?? j.temperature)}
              </Text>
            </Stack>
          );
        })}
      </SimpleGrid>
    );
  }
  return null;
}

function Weather({ blockId, config }: { blockId: Id; config: unknown }) {
  const place = text(config, PLACE);
  const latitude = count(config, LATITUDE, Number.NaN);
  const longitude = count(config, LONGITUDE, Number.NaN);
  const key = `${blockId}|${latitude}|${longitude}`;
  const size = count(config, SIZE, DEFAULT_SIZE);
  const forecasts = text(config, FORECASTS, "none");
  const [state, setState] = useState<State>(() => {
    const weather = alreadyRead.get(key);
    return weather ? { phase: "ready", weather } : { phase: "loading" };
  });

  useEffect(() => {
    if (!hasLocation(config) || !blockId) return;
    let active = true;
    const read = () =>
      api
        .getAccessWeather(blockId)
        .then((weather) => {
          alreadyRead.set(key, weather);
          if (active) setState({ phase: "ready", weather });
        })
        .catch((e: Error) => active && setState({ phase: "error", message: e.message }));
    const known = alreadyRead.get(key);
    setState(known ? { phase: "ready", weather: known } : { phase: "loading" });
    read();
    const heartbeat = setInterval(read, RELOAD_INTERVAL);
    return () => {
      active = false;
      clearInterval(heartbeat);
    };
    // The key carries the element and its coordinates: that is what changes the weather.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const content = (() => {
    if (!hasLocation(config)) {
      return (
        <Group gap={6} c="dimmed">
          <IconSun size={16} />
          <Text size="sm">Météo : choisissez un lieu</Text>
        </Group>
      );
    }
    if (state.phase === "loading") {
      // The height the weather will take, row by row: it does not grow on
      // arrival and push what follows.
      const caption = (isChecked(config, SHOW_LOCATION, false) && place) || isChecked(config, SHOW_SKY, false);
      const rows = [
        isChecked(config, SHOW_ICON, true) || isChecked(config, SHOW_TEMPERATURE, true) || caption
          ? Math.max(
              isChecked(config, SHOW_ICON, true) ? Math.round(size * 1.3) : 0,
              (isChecked(config, SHOW_TEMPERATURE, true) ? size * 1.1 : 0) + (caption ? SMALL_LINE : 0),
            )
          : 0,
        isChecked(config, DETAILS, false) ? SMALL_LINE : 0,
        forecasts === "week" ? WEEK_HEIGHT : forecasts !== "none" ? CHART_HEIGHT : 0,
      ].filter((h) => h > 0);
      const height = rows.reduce((sum, h) => sum + h, 0) + ROW_GAP * Math.max(0, rows.length - 1);
      return (
        <Group gap="xs" c="dimmed" h={Math.max(height, SMALL_LINE)} justify="center">
          <Loader size="xs" color="gray" />
          <Text size="sm">Météo{place ? ` de ${place}` : ""}…</Text>
        </Group>
      );
    }
    if (state.phase === "error") {
      return (
        <Text size="sm" c="red" lineClamp={2}>
          {state.message}
        </Text>
      );
    }

    const { current } = state.weather;
    const sky = skyOf(current.code, current.is_day);
    // The place and the sky's state, side by side, each in its own color.
    const caption = [
      isChecked(config, SHOW_LOCATION, false) && place
        ? { label: place, color: text(config, LOCATION_COLOR) }
        : null,
      isChecked(config, SHOW_SKY, false) ? { label: sky.label, color: text(config, SKY_COLOR) } : null,
    ].filter((part) => part !== null);
    const showsIcon = isChecked(config, SHOW_ICON, true);
    const showsTemperature = isChecked(config, SHOW_TEMPERATURE, true);
    return (
      <Stack gap="xs" style={forecasts !== "none" ? { minWidth: `min(${FORECASTS_MIN_WIDTH}px, 100%)` } : undefined}>
        {(showsIcon || showsTemperature || caption.length > 0) && (
          <Group gap="sm" wrap="nowrap" justify="center">
            {showsIcon && (
              <sky.icon size={Math.round(size * 1.3)} color={sky.color} stroke={1.5} />
            )}
            <Stack gap={0}>
              {showsTemperature && (
                <Text fz={size} fw={600} lh={1.1} c={text(config, TEMPERATURE_COLOR) || undefined}>
                  {degrees(current.temperature)}
                </Text>
              )}
              {caption.length > 0 && (
                <Text size="xs" c="dimmed" lineClamp={1}>
                  {caption.map((part, i) => (
                    <span key={part.label}>
                      {i > 0 && " · "}
                      <span style={part.color ? { color: part.color } : undefined}>{part.label}</span>
                    </span>
                  ))}
                </Text>
              )}
            </Stack>
          </Group>
        )}
        {isChecked(config, DETAILS, false) && (
          <Group gap="md" justify="center" c={text(config, DETAILS_COLOR) || "var(--milo-widget-dimmed)"}>
            <Group gap={4} title="Ressenti">
              <IconTemperature size={14} />
              <Text size="xs">{degrees(current.feelsLike)}</Text>
            </Group>
            <Group gap={4} title="Humidité">
              <IconDroplet size={14} />
              <Text size="xs">{Math.round(current.humidity)} %</Text>
            </Group>
            <Group gap={4} title="Vent">
              <IconWind size={14} />
              <Text size="xs">{Math.round(current.wind)} km/h</Text>
            </Group>
          </Group>
        )}
        <Forecasts
          weather={state.weather}
          what={forecasts}
          colors={{ chart: text(config, FORECASTS_COLOR), legend: text(config, LEGEND_COLOR) }}
        />
      </Stack>
    );
  })();

  return (
    <Frame config={config} framed={isChecked(config, FRAMED, false)} padding={DEFAULT_PADDING}>
      {content}
    </Frame>
  );
}

/** How many switches are on. */
const switchesOn = (config: unknown) =>
  SWITCHES.filter(({ key, defaultValue }) => isChecked(config, key, defaultValue)).length;

/** A place as a list value: its coordinates, enough to find it again. */
const valueFor = (latitude: number, longitude: number) => `${latitude},${longitude}`;

function PlaceField({ config, onChange }: WidgetConfigProps) {
  const [input, setInput] = useState("");
  const [searched] = useDebouncedValue(input, 300);
  const [places, setPlaces] = useState<WeatherPlace[]>([]);
  const [search, setSearching] = useState(false);

  const name = text(config, PLACE);
  const current = hasLocation(config)
    ? valueFor(count(config, LATITUDE, 0), count(config, LONGITUDE, 0))
    : null;

  useEffect(() => {
    // The input that takes the chosen place back is not a search.
    if (searched.trim().length < 2 || searched === name) return;
    let active = true;
    setSearching(true);
    api
      .searchWeatherPlaces(searched)
      .then((matches) => active && setPlaces(matches))
      .catch(() => active && setPlaces([]))
      .finally(() => active && setSearching(false));
    return () => {
      active = false;
    };
  }, [searched, name]);

  const options = places.map((l) => ({
    value: valueFor(l.latitude, l.longitude),
    label: l.detail ? `${l.name} (${l.detail})` : l.name,
  }));
  if (current && !options.some((o) => o.value === current)) options.unshift({ value: current, label: name || current });

  return (
    <Select
      label="Lieu"
      placeholder="Chercher une ville"
      data={options}
      value={current}
      searchable
      searchValue={input}
      onSearchChange={setInput}
      // The server has already sorted: the list does not refilter what it found.
      filter={({ options: o }) => o}
      nothingFoundMessage={input.trim().length < 2 ? "Tapez au moins deux lettres" : "Aucun lieu"}
      rightSection={search ? <Loader size="xs" /> : undefined}
      onChange={(value) => {
        const place = places.find((l) => valueFor(l.latitude, l.longitude) === value);
        if (!place) return;
        onChange({ ...withField(config, PLACE, place.name), [LATITUDE]: place.latitude, [LONGITUDE]: place.longitude });
      }}
      allowDeselect={false}
      autoFocus
    />
  );
}

export const weatherWidget: AccessWidget = {
  type: "weather",
  kind: "common",
  label: "Météo",
  icon: IconSun,
  defaultConfig: {
    [SIZE]: DEFAULT_SIZE,
    [SHOW_LOCATION]: false,
    [SHOW_ICON]: true,
    [SHOW_TEMPERATURE]: true,
    [SHOW_SKY]: false,
    [DETAILS]: false,
    [FORECASTS]: "none",
    [FRAMED]: false,
  },
  ownClicks: true,

  Display: Weather,

  margins: () => ({ top: 0, bottom: 15 }),

  // It draws its own frame, set in the drawer's "Apparence" block.
  ownFrame: true,
  padding: () => DEFAULT_PADDING,

  // The color of each element shown, and the temperature's size: a hidden one
  // has nothing to set. Each field shows its default, in hexadecimal: Mantine's
  // text and dimmed colors in the current scheme, orange or blue for the
  // charts. Brought back to it, a color is no longer stored: the display keeps
  // following the scheme. The pictogram has no color to set: it is the sky's,
  // which changes with the weather.
  appearance: (config, onChange) => {
    const textColor = themeColor("widget-text");
    const dimmed = themeColor("widget-dimmed");
    const colorOf = (key: string, defaultColor = "") => ({
      value: text(config, key) || defaultColor,
      onChange: (v: string) => onChange(insertRow(config, { [key]: v === defaultColor ? "" : v })),
    });
    const isSet = (key: string, defaultColor = "") =>
      text(config, key) !== "" && text(config, key) !== defaultColor;
    const colorRow = (name: string, what: string, key: string, defaultColor?: string): SettingRow => ({
      name,
      what,
      color: colorOf(key, defaultColor),
      modified: isSet(key, defaultColor),
      reset: () => onChange(insertRow(config, { [key]: "" })),
    });
    // The size, brought back to the default, is no longer stored.
    const size = count(config, SIZE, DEFAULT_SIZE);
    const forecasts = text(config, FORECASTS, "none");
    const temperature: SettingRow = {
      name: "Degrés",
      what: "de la température",
      color: colorOf(TEMPERATURE_COLOR, textColor),
      size: {
        value: size,
        defaultValue: DEFAULT_SIZE,
        min: SIZE_MIN,
        max: SIZE_MAX,
        onChange: (v) => onChange(insertRow(config, { [SIZE]: v === DEFAULT_SIZE ? "" : v })),
      },
      modified: isSet(TEMPERATURE_COLOR, textColor) || size !== DEFAULT_SIZE,
      reset: () => onChange(insertRow(config, { [TEMPERATURE_COLOR]: "", [SIZE]: "" })),
    };
    return [
      ...(isChecked(config, SHOW_TEMPERATURE, true) ? [temperature] : []),
      ...(isChecked(config, SHOW_SKY, false) ? [colorRow("Temps", "du type de temps", SKY_COLOR, dimmed)] : []),
      ...(isChecked(config, SHOW_LOCATION, false) ? [colorRow("Lieu", "du nom du lieu", LOCATION_COLOR, dimmed)] : []),
      ...(isChecked(config, DETAILS, false) ? [colorRow("Détails", "des détails", DETAILS_COLOR, dimmed)] : []),
      ...(forecasts !== "none"
        ? [
            colorRow("Légende", "de la légende des prévisions", LEGEND_COLOR, dimmed),
            colorRow(
              "Graphique",
              "du graphique des prévisions",
              FORECASTS_COLOR,
              forecasts === "temperature" ? ORANGE.toLowerCase() : forecasts === "rain" ? BLUE.toLowerCase() : textColor,
            ),
          ]
        : []),
    ];
  },

  Config: ({ config, onChange }) => (
    <Stack gap="xl">
      <PlaceField config={config} onChange={onChange} />
      <Select
        label="Prévisions"
        // Without a switch on, the forecasts are all that is left to show.
        data={SUGGESTED_FORECASTS.map((o) => ({ ...o, disabled: o.value === "none" && switchesOn(config) === 0 }))}
        value={text(config, FORECASTS, "none")}
        onChange={(v) => v && onChange(withField(config, FORECASTS, v))}
        allowDeselect={false}
        w={240}
      />
      <Stack gap="sm">
        {SWITCHES.map(({ key, label, defaultValue }) => {
          const checked = isChecked(config, key, defaultValue);
          // The last thing shown stays: the widget is never empty.
          const last = checked && switchesOn(config) === 1 && text(config, FORECASTS, "none") === "none";
          return (
            <Switch
              key={key}
              label={label}
              checked={checked}
              disabled={last}
              onChange={(e) => onChange(withField(config, key, e.currentTarget.checked))}
              color="teal"
            />
          );
        })}
      </Stack>
    </Stack>
  ),

};
