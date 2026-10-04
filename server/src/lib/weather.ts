// La météo des widgets Météo, par Open-Meteo : un service ouvert, sans clé,
// qui donne l'instant, les heures et les jours à venir d'un point du globe, et
// cherche un lieu par son nom.
//
// C'est le serveur qui l'interroge, comme il relève les flux RSS : la page ne
// sort pas de l'application, et deux widgets du même lieu — ou cent
// personnes devant le même tableau — ne coûtent qu'un appel par quart d'heure.

import type { AccessWeather, WeatherPlace, WeatherPoint } from "@milo/shared";
import { fail } from "./http.js";

const FORECASTS = "https://api.open-meteo.com/v1/forecast";
const GEOCODING = "https://geocoding-api.open-meteo.com/v1/search";

/** Au-delà, la source est tenue pour muette. */
const TIMEOUT = 10_000;

/** La météo ne change pas d'une minute à l'autre : un quart d'heure suffit. */
const FRESHNESS = 15 * 60_000;

/** Les heures montrées en courbe : la journée qui vient. */
const HOURS = 24;

/** Les jours montrés : la semaine. */
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

// --- Lieux -----------------------------------------------------------------

interface OpenMeteoPlace {
  name: string;
  latitude: number;
  longitude: number;
  admin1?: string;
  country?: string;
}

/** Les lieux qui répondent à ce qu'on tape, deux caractères au moins. */
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

// --- Prévisions ------------------------------------------------------------

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

/** Les coordonnées que la configuration d'un widget Météo porte, ou « null ». */
export const weatherCoordinates = (config: unknown): { latitude: number; longitude: number } | null => {
  const c = (config as Record<string, unknown> | null) ?? {};
  const latitude = Number(c.latitude);
  const longitude = Number(c.longitude);
  if (c.latitude === undefined || c.longitude === undefined) return null;
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  if (Math.abs(latitude) > 90 || Math.abs(longitude) > 180) return null;
  return { latitude, longitude };
};

/** Les dernières prévisions de chaque lieu, au centième de degré près. */
const cached = new Map<string, { value: AccessWeather; readValue: number }>();

const toWeather = (p: OpenMeteoForecasts): AccessWeather => {
  // Les heures commencent à minuit : on garde celles qui suivent l'instant.
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

/** La météo d'un lieu : celle du cache tant qu'elle est fraîche. */
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
