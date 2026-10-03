// La météo des widgets Météo, par Open-Meteo : un service ouvert, sans clé,
// qui donne l'instant, les heures et les jours à venir d'un point du globe, et
// cherche un lieu par son nom.
//
// C'est le serveur qui l'interroge, comme il relève les flux RSS : la page ne
// sort pas de l'application, et deux widgets du même lieu — ou cent
// personnes devant le même tableau — ne coûtent qu'un appel par quart d'heure.

import type { AccessWeather, WeatherPlace, WeatherPoint } from "@milo/shared";
import { fail } from "./http.js";

const PREVISIONS = "https://api.open-meteo.com/v1/forecast";
const GEOCODAGE = "https://geocoding-api.open-meteo.com/v1/search";

/** Au-delà, la source est tenue pour muette. */
const DELAI = 10_000;

/** La météo ne change pas d'une minute à l'autre : un quart d'heure suffit. */
const FRAICHEUR = 15 * 60_000;

/** Les heures montrées en courbe : la journée qui vient. */
const HEURES = 24;

/** Les jours montrés : la semaine. */
const JOURS = 7;

const appeler = async <T>(url: string): Promise<T> => {
  let reponse: Response;
  try {
    reponse = await fetch(url, { signal: AbortSignal.timeout(DELAI) });
  } catch {
    return fail(502, "Le service météo ne répond pas");
  }
  const corps = (await reponse.json().catch(() => ({}))) as T & { reason?: string };
  if (!reponse.ok) fail(502, corps.reason || `Le service météo a répondu ${reponse.status}`);
  return corps;
};

// --- Lieux -----------------------------------------------------------------

interface LieuOpenMeteo {
  name: string;
  latitude: number;
  longitude: number;
  admin1?: string;
  country?: string;
}

/** Les lieux qui répondent à ce qu'on tape, deux caractères au moins. */
export const chercherUnLieu = async (saisie: string): Promise<WeatherPlace[]> => {
  const nom = saisie.trim().slice(0, 100);
  if (nom.length < 2) return [];
  const parametres = new URLSearchParams({ name: nom, count: "10", language: "fr", format: "json" });
  const { results = [] } = await appeler<{ results?: LieuOpenMeteo[] }>(
    `${GEOCODAGE}?${parametres.toString()}`,
  );
  return results.map((l) => ({
    name: l.name,
    detail: [l.admin1, l.country].filter(Boolean).join(", "),
    latitude: l.latitude,
    longitude: l.longitude,
  }));
};

// --- Prévisions ------------------------------------------------------------

interface PrevisionsOpenMeteo {
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
export const coordonneesMeteo = (config: unknown): { latitude: number; longitude: number } | null => {
  const c = (config as Record<string, unknown> | null) ?? {};
  const latitude = Number(c.latitude);
  const longitude = Number(c.longitude);
  if (c.latitude === undefined || c.longitude === undefined) return null;
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  if (Math.abs(latitude) > 90 || Math.abs(longitude) > 180) return null;
  return { latitude, longitude };
};

/** Les dernières prévisions de chaque lieu, au centième de degré près. */
const enCache = new Map<string, { valeur: AccessWeather; lue: number }>();

const versMeteo = (p: PrevisionsOpenMeteo): AccessWeather => {
  // Les heures commencent à minuit : on garde celles qui suivent l'instant.
  const debut = Math.max(
    0,
    p.hourly.time.findIndex((t) => t >= p.current.time.slice(0, 13)),
  );
  const hourly: WeatherPoint[] = p.hourly.time.slice(debut, debut + HEURES).map((time, i) => ({
    time,
    code: p.hourly.weather_code[debut + i] ?? 0,
    temperature: p.hourly.temperature_2m[debut + i] ?? 0,
    precipitation: p.hourly.precipitation_probability[debut + i] ?? 0,
  }));
  const daily: WeatherPoint[] = p.daily.time.slice(0, JOURS).map((time, i) => ({
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
      apparent: p.current.apparent_temperature,
      humidity: p.current.relative_humidity_2m,
      wind: p.current.wind_speed_10m,
      is_day: p.current.is_day === 1,
    },
    hourly,
    daily,
  };
};

/** La météo d'un lieu : celle du cache tant qu'elle est fraîche. */
export const meteoDe = async (latitude: number, longitude: number): Promise<AccessWeather> => {
  const cle = `${latitude.toFixed(2)}|${longitude.toFixed(2)}`;
  const connue = enCache.get(cle);
  if (connue && Date.now() - connue.lue < FRAICHEUR) return connue.valeur;

  const parametres = new URLSearchParams({
    latitude: latitude.toFixed(4),
    longitude: longitude.toFixed(4),
    current:
      "weather_code,temperature_2m,apparent_temperature,relative_humidity_2m,wind_speed_10m,is_day",
    hourly: "weather_code,temperature_2m,precipitation_probability",
    daily: "weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max",
    timezone: "auto",
    forecast_days: String(JOURS),
  });
  const valeur = versMeteo(await appeler<PrevisionsOpenMeteo>(`${PREVISIONS}?${parametres.toString()}`));
  enCache.set(cle, { valeur, lue: Date.now() });
  return valeur;
};
