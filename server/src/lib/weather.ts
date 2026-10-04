// Weather for the Météo widgets, via Open-Meteo: an open service, keyless,
// that gives the current moment, the coming hours and days for a point on the
// globe, and looks up a place by name.
//
// The server is the one that queries it, as it polls RSS feeds: the page does
// not leave the application, and two widgets for the same place — or a hundred
// people in front of the same board — cost only one call per quarter hour.

import type { AccessWeather, WeatherPlace, WeatherPoint } from "@milo/shared";
import { fail } from "./http.js";

const FORECASTS = "https://api.open-meteo.com/v1/forecast";
const GEOCODING = "https://geocoding-api.open-meteo.com/v1/search";

/** Beyond this, the source is considered silent. */
const TIMEOUT = 10_000;

/** The weather does not change from one minute to the next: a quarter hour is enough. */
const FRESHNESS = 15 * 60_000;

/** The hours shown as a curve: the coming day. */
const HOURS = 24;

/** The days shown: the week. */
const DAYS = 7;

const call = async <T>(url: string): Promise<T> => {
  let response: Response;
  try {
    response = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT) });
  } catch {
    return fail(502, "Le service météo ne répond pas");
  }
  const body = (await response.json().catch(() => ({}))) as T & { reason?: string };
  if (!response.ok) fail(502, body.reason || `Le service météo a répondu ${response.status}`);
  return body;
};

// --- Places ----------------------------------------------------------------

interface OpenMeteoPlace {
  name: string;
  latitude: number;
  longitude: number;
  admin1?: string;
  country?: string;
}

/** The places matching what is typed, two characters at least. */
export const searchPlace = async (input: string): Promise<WeatherPlace[]> => {
  const name = input.trim().slice(0, 100);
  if (name.length < 2) return [];
  const searchParams = new URLSearchParams({ name: name, count: "10", language: "fr", format: "json" });
  const { results = [] } = await call<{ results?: OpenMeteoPlace[] }>(
    `${GEOCODING}?${searchParams.toString()}`,
  );
  return results.map((l) => ({
    name: l.name,
    detail: [l.admin1, l.country].filter(Boolean).join(", "),
    latitude: l.latitude,
    longitude: l.longitude,
  }));
};

// --- Forecasts -------------------------------------------------------------

interface OpenMeteoForecasts {
  current: {
    time: string;
    weather_code: number;
    temperature_2m: number;
    apparent_temperature: number;
    relative_humidity_2m: number;
    wind_speed_10m: number;
    is_day: number;
  };
  hourly: {
    time: string[];
    weather_code: number[];
    temperature_2m: number[];
    precipitation_probability: (number | null)[];
  };
  daily: {
    time: string[];
    weather_code: number[];
    temperature_2m_max: number[];
    temperature_2m_min: number[];
    precipitation_probability_max: (number | null)[];
  };
}

/** The coordinates a Météo widget's configuration carries, or "null". */
export const weatherCoordinates = (config: unknown): { latitude: number; longitude: number } | null => {
  const c = (config as Record<string, unknown> | null) ?? {};
  const latitude = Number(c.latitude);
  const longitude = Number(c.longitude);
  if (c.latitude === undefined || c.longitude === undefined) return null;
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  if (Math.abs(latitude) > 90 || Math.abs(longitude) > 180) return null;
  return { latitude, longitude };
};

/** The latest forecasts for each place, to the hundredth of a degree. */
const cached = new Map<string, { value: AccessWeather; readValue: number }>();

const toWeather = (p: OpenMeteoForecasts): AccessWeather => {
  // The hours start at midnight: we keep those following the present moment.
  const start = Math.max(
    0,
    p.hourly.time.findIndex((t) => t >= p.current.time.slice(0, 13)),
  );
  const hourly: WeatherPoint[] = p.hourly.time.slice(start, start + HOURS).map((time, i) => ({
    time,
    code: p.hourly.weather_code[start + i] ?? 0,
    temperature: p.hourly.temperature_2m[start + i] ?? 0,
    precipitation: p.hourly.precipitation_probability[start + i] ?? 0,
  }));
  const daily: WeatherPoint[] = p.daily.time.slice(0, DAYS).map((time, i) => ({
    time,
    code: p.daily.weather_code[i] ?? 0,
    temperature: p.daily.temperature_2m_max[i] ?? 0,
    min: p.daily.temperature_2m_min[i] ?? 0,
    precipitation: p.daily.precipitation_probability_max[i] ?? 0,
  }));
  return {
    current: {
      time: p.current.time,
      code: p.current.weather_code,
      temperature: p.current.temperature_2m,
      feelsLike: p.current.apparent_temperature,
      humidity: p.current.relative_humidity_2m,
      wind: p.current.wind_speed_10m,
      is_day: p.current.is_day === 1,
    },
    hourly,
    daily,
  };
};

/** A place's weather: the cache's as long as it is fresh. */
export const weatherOf = async (latitude: number, longitude: number): Promise<AccessWeather> => {
  const key = `${latitude.toFixed(2)}|${longitude.toFixed(2)}`;
  const known = cached.get(key);
  if (known && Date.now() - known.readValue < FRESHNESS) return known.value;

  const searchParams = new URLSearchParams({
    latitude: latitude.toFixed(4),
    longitude: longitude.toFixed(4),
    current:
      "weather_code,temperature_2m,apparent_temperature,relative_humidity_2m,wind_speed_10m,is_day",
    hourly: "weather_code,temperature_2m,precipitation_probability",
    daily: "weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max",
    timezone: "auto",
    forecast_days: String(DAYS),
  });
  const value = toWeather(await call<OpenMeteoForecasts>(`${FORECASTS}?${searchParams.toString()}`));
  cached.set(key, { value, readValue: Date.now() });
  return value;
};
