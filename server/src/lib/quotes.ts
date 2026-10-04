// What the Citation widgets show: a quote from citation.lecog.fr, or a joke
// from JokeAPI — both open services, without a key.
//
// The server is the one that queries them, as it does the weather: the page
// does not leave the application, and everyone in front of the same board
// reads the same quote until the widget renews it. Each widget keeps its
// own, for the interval it sets.

import { DomUtils, parseDocument } from "htmlparser2";
import type { AccessQuote, QuoteSource } from "@milo/shared";
import { isQuoteSource } from "@milo/shared";
import { fail } from "./http.js";

const QUOTES = "https://citation.lecog.fr/public/api/random-quote.php";
// Safe mode: nothing offensive in front of colleagues.
const JOKES = "https://v2.jokeapi.dev/joke/Any?lang=fr&safe-mode";

/** Beyond this, the source is considered silent. */
const TIMEOUT = 10_000;

/** The renewal interval while the widget sets none, in minutes, and its bounds. */
const DEFAULT_INTERVAL = 60;
const INTERVAL_MIN = 1;
const INTERVAL_MAX = 7 * 24 * 60;

const call = async <T>(url: string): Promise<T> => {
  let response: Response;
  try {
    response = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT) });
  } catch {
    return fail(502, "La source ne répond pas");
  }
  if (!response.ok) fail(502, `La source a répondu ${response.status}`);
  return (await response.json().catch(() => fail(502, "La source a répondu autre chose que du JSON"))) as T;
};

/**
 * Plain text from what a source sends: its line breaks kept, its tags
 * dropped, its entities decoded, and the indentation of its lines removed.
 */
const plainText = (html: string): string =>
  DomUtils.textContent(parseDocument(html.replace(/<br\s*\/?>/gi, "\n")))
    .split(/\r?\n/)
    .map((line) => line.trim())
    .join("\n")
    .trim();

// --- Sources ---------------------------------------------------------------

interface LecogQuote {
  success: boolean;
  data?: {
    text: string;
    author?: { name?: string; forename?: string };
    source?: { title?: string; year?: number | null };
  };
}

const quote = async (): Promise<AccessQuote> => {
  const { success, data } = await call<LecogQuote>(QUOTES);
  if (!success || !data?.text) return fail(502, "La source n'a pas donné de citation");
  const author = [data.author?.forename, data.author?.name].filter(Boolean).join(" ");
  const work = data.source?.title
    ? data.source.year
      ? `${data.source.title} (${data.source.year})`
      : data.source.title
    : "";
  return {
    source: "quote",
    text: plainText(data.text),
    ...(author ? { author } : {}),
    ...(work ? { work } : {}),
  };
};

interface JokeApiJoke {
  error: boolean;
  message?: string;
  type?: "single" | "twopart";
  joke?: string;
  setup?: string;
  delivery?: string;
}

const joke = async (): Promise<AccessQuote> => {
  const body = await call<JokeApiJoke>(JOKES);
  if (body.error) return fail(502, body.message || "La source n'a pas donné de blague");
  if (body.type === "twopart" && body.setup) {
    return { source: "joke", text: plainText(body.setup), answer: plainText(body.delivery ?? "") };
  }
  if (body.joke) return { source: "joke", text: plainText(body.joke) };
  return fail(502, "La source n'a pas donné de blague");
};

const FETCHERS: Record<QuoteSource, () => Promise<AccessQuote>> = { quote, joke };

// --- Settings --------------------------------------------------------------

export interface QuoteSettings {
  sources: QuoteSource[];
  /** Minutes. */
  interval: number;
}

/** A widget's settings, read from its configuration; unknown sources are dropped. */
export const quoteSettings = (config: Record<string, unknown>): QuoteSettings => {
  const received = Array.isArray(config["sources"]) ? (config["sources"] as unknown[]) : [];
  const sources = [...new Set(received.filter(isQuoteSource))];
  const interval = Number(config["interval"]);
  return {
    sources: sources.length > 0 ? sources : ["quote"],
    interval: Number.isFinite(interval)
      ? Math.min(INTERVAL_MAX, Math.max(INTERVAL_MIN, Math.round(interval)))
      : DEFAULT_INTERVAL,
  };
};

// --- Kept quotes -----------------------------------------------------------

interface Kept {
  quote: AccessQuote;
  at: number;
  /** The sources it was drawn from: changing them renews it. */
  sources: string;
}

/** Each widget's quote, in memory: a restart only draws new ones. */
const kept = new Map<string, Kept>();

/** The sources in random order: the first that answers wins. */
const shuffled = <T>(items: T[]): T[] => {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j]!, copy[i]!];
  }
  return copy;
};

/**
 * The widget's quote: the one it keeps while it is fresh, otherwise a new
 * one from one of its sources, drawn at random. A silent source gives way to
 * the next; when all are silent, the previous quote stays rather than an
 * error, if there is one. "renew" draws a new one right away.
 */
export const quoteOf = async (
  widgetId: string,
  { sources, interval }: QuoteSettings,
  renew = false,
): Promise<AccessQuote> => {
  const key = [...sources].sort().join(",");
  const previous = kept.get(widgetId);
  if (
    !renew &&
    previous &&
    previous.sources === key &&
    Date.now() - previous.at < interval * 60_000
  ) {
    return previous.quote;
  }

  let lastError: unknown;
  for (const source of shuffled(sources)) {
    try {
      const quote = await FETCHERS[source]();
      kept.set(widgetId, { quote, at: Date.now(), sources: key });
      return quote;
    } catch (error) {
      lastError = error;
    }
  }
  if (previous && previous.sources === key) return previous.quote;
  throw lastError;
};
