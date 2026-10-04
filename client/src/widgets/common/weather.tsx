import { Box, Checkbox, Group, Loader, NumberInput, Select, SimpleGrid, Stack, Text } from "@mantine/core";
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
import classes from "../../assets/styles/AccessNumber.module.css";
import { withField, count, text } from "../types";
import type { AccessWidget, WidgetConfigProps } from "../types";
import type { AccessWeather, Id, WeatherPlace } from "@milo/shared";

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
const DETAILS = "details";
const FORECASTS = "forecast";
const FRAMED = "framed";

const DEFAULT_SIZE = 32;
const SIZE_MIN = 12;
const SIZE_MAX = 96;

/** The page rereads the server at this rate: it is the server that queries the source. */
const RELOAD_INTERVAL = 15 * 60_000;

/** The height of a forecast chart. */
const CHART_HEIGHT = 110;

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
      : { label: "Ciel clair", icon: IconMoon, color: "#c4c4c4" };
  }
  if (code <= 2) {
    return day
      ? { label: "Éclaircies", icon: IconSunHigh, color: "#fab005" }
      : { label: "Éclaircies", icon: IconSunMoon, color: "#c4c4c4" };
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

const degrees = (value: number) => `${Math.round(value)}°`;

/** A box is checked by default when it has never been set. */
const isChecked = (config: unknown, key: string, defaultValue: boolean): boolean => {
  const value = (config as Record<string, unknown> | null)?.[key];
  return value === undefined ? defaultValue : Boolean(value);
};

const hasLocation = (config: unknown): boolean => {
  const c = (config as Record<string, unknown> | null) ?? {};
  return typeof c[LATITUDE] === "number" && typeof c[LONGITUDE] === "number";
};

/** The latest forecasts of each element, for the duration of the page. */
const alreadyRead = new Map<string, AccessWeather>();

type State =
  | { phase: "loading" }
  | { phase: "ready"; weather: AccessWeather }
  | { phase: "error"; message: string };

function Forecasts({ weather, what }: { weather: AccessWeather; what: string }) {
  if (what === "temperature") {
    const data = weather.hourly.map((h) => ({ hour: `${h.time.slice(11, 13)} h`, temperature: h.temperature }));
    return (
      <AreaChart
        h={CHART_HEIGHT}
        data={data}
        dataKey="hour"
        series={[{ name: "temperature", label: "Température", color: "orange.6" }]}
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
        series={[{ name: "rain", label: "Risque de pluie", color: "blue.6" }]}
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
              <Text size="xs" c="dimmed" tt="capitalize">
                {day.format(new Date(`${j.time}T12:00:00`)).replace(".", "")}
              </Text>
              <sky.icon size={20} color={sky.color} stroke={1.6} />
              <Text size="xs" fw={600}>
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
      return (
        <Group gap="xs" c="dimmed" h={size * 1.4}>
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
    return (
      <Stack gap="xs">
        <Group gap="sm" wrap="nowrap" justify="center">
          <sky.icon size={Math.round(size * 1.3)} color={sky.color} stroke={1.5} />
          <Stack gap={0}>
            <Text fz={size} fw={600} lh={1.1}>
              {degrees(current.temperature)}
            </Text>
            <Text size="xs" c="dimmed" lineClamp={1}>
              {isChecked(config, SHOW_LOCATION, true) && place ? `${place} · ` : ""}
              {sky.label}
            </Text>
          </Stack>
        </Group>
        {isChecked(config, DETAILS, false) && (
          <Group gap="md" justify="center" c="dimmed">
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
        <Forecasts weather={state.weather} what={forecasts} />
      </Stack>
    );
  })();

  if (!isChecked(config, FRAMED, false)) return content;
  return (
    <Box className={classes.inset} style={{ border: "none" }}>
      {content}
    </Box>
  );
}

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
    [SHOW_LOCATION]: true,
    [DETAILS]: false,
    [FORECASTS]: "none",
    [FRAMED]: false,
  },
  ownClicks: true,

  Display: Weather,

  margins: () => ({ top: 0, bottom: 15 }),

  // It draws its own frame, set in the drawer's "Apparence" block.
  ownFrame: true,

  Config: ({ config, onChange }) => (
    <Stack gap="xl">
      <PlaceField config={config} onChange={onChange} />
      <NumberInput
        label="Taille de la température"
        placeholder={String(DEFAULT_SIZE)}
        value={count(config, SIZE, DEFAULT_SIZE)}
        onChange={(v) => onChange(withField(config, SIZE, v === "" ? DEFAULT_SIZE : Number(v)))}
        min={SIZE_MIN}
        max={SIZE_MAX}
        suffix=" px"
        allowNegative={false}
        allowDecimal={false}
        w={120}
      />
      <Select
        label="Prévisions"
        data={SUGGESTED_FORECASTS}
        value={text(config, FORECASTS, "none")}
        onChange={(v) => v && onChange(withField(config, FORECASTS, v))}
        allowDeselect={false}
        w={240}
      />
      <Stack gap="sm">
        <Checkbox
          label="Afficher le nom du lieu"
          checked={isChecked(config, SHOW_LOCATION, true)}
          onChange={(e) => onChange(withField(config, SHOW_LOCATION, e.currentTarget.checked))}
          color="teal"
        />
        <Checkbox
          label="Afficher le ressenti, l'humidité et le vent"
          checked={isChecked(config, DETAILS, false)}
          onChange={(e) => onChange(withField(config, DETAILS, e.currentTarget.checked))}
          color="teal"
        />
      </Stack>
    </Stack>
  ),

};
