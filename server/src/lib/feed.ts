// Feed polling for the RSS widget of Access mode.
//
// The browser cannot read a feed hosted on another site: most do not answer
// requests from another origin (CORS). The server therefore fetches it in its
// place — and keeps it. Each source is polled at its own pace, the interval
// set by the items that follow it (30 minutes by default), and its latest
// articles are stored in the database, already read, up to the largest
// quantity requested. The page reads them there: opening the page no longer
// hits the source.
//
// The feed is therefore read here, whether it is XML (RSS, Atom) or JSON. A
// feed's XML is simple — articles, a title, a link, a date —, and a
// hand-written reader is enough, as for the inventories (lib/inventory.ts). A
// JSON feed can weigh several megabytes — CISA's catalog of exploited
// vulnerabilities makes up nearly two — for the few articles that are kept.
//
// Fetching an address given by someone is also a door for a request to what
// only the server sees. We therefore refuse whatever does not leave the
// machine — the loopback, link-local addresses, where hosting providers keep
// their metadata — and follow redirects by hand to check each one. Internal
// network addresses remain allowed: an intranet feed is an ordinary use.

import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import {
  ACCESS_FEED_INTERVAL_DEFAULT,
  ACCESS_FEED_INTERVAL_MAX,
  ACCESS_FEED_INTERVAL_MIN,
  ACCESS_FEED_QUANTITY_MAX,
} from "@milo/shared";
import type {
  AccessFeed,
  AccessFeedArticle,
  AccessFeedProbe,
  AccessFeedSource,
} from "@milo/shared";
import type { AccessFeedRow } from "../db/rows.js";
import { accessFeeds } from "../repositories/access.js";
import { HttpError, badRequest } from "./http.js";
import { now } from "./time.js";

/** Beyond that, the source is too slow: the column is already waiting. */
const TIMEOUT = 8_000;

/**
 * An XML feed fits in a few hundred kilobytes; a JSON catalog like CISA's
 * approaches two megabytes and is growing. Beyond that, it is no longer a
 * feed.
 */
const SIZE_MAX = 10 * 1024 * 1024;

const REDIRECTIONS_MAX = 3;

/** The background poll checks at this pace which feeds have come due. */
export const FEED_POLL_INTERVAL = 60_000;

/**
 * A poll that failed is retried sooner than the set interval: a source that
 * was down for a minute must not leave the item empty for half an hour.
 */
const RETRY_DELAY = 5 * 60_000;

/** Polls in progress, by address: two requests make only one. */
const ongoing = new Map<string, Promise<void>>();

/** An IP address that does not leave the machine or its link. */
const isForbidden = (ip: string): boolean => {
  const v4 = ip.startsWith("::ffff:") ? ip.slice(7) : ip;
  if (isIP(v4) === 4) {
    const [a, b] = v4.split(".").map(Number);
    return a === 0 || a === 127 || (a === 169 && b === 254);
  }
  const lowercased = ip.toLowerCase();
  return lowercased === "::" || lowercased === "::1" || lowercased.startsWith("fe80:");
};

/** The address, checked: http or https, to a host that leaves the machine. */
const verify = async (raw: string): Promise<URL> => {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return badRequest("Adresse du flux invalide");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    badRequest("Le flux doit être en http ou https");
  }
  const host = url.hostname.replace(/^\[|\]$/g, "");
  let addresses: string[];
  try {
    addresses = isIP(host) ? [host] : (await lookup(host, { all: true })).map((a) => a.address);
  } catch {
    throw new HttpError(502, `Hôte introuvable : ${host}`);
  }
  if (addresses.some(isForbidden)) badRequest("Cette adresse n'est pas autorisée");
  return url;
};

/** The response body, stopped as soon as it exceeds the allowed size. */
const readBound = async (response: Response): Promise<string> => {
  const declaredLength = Number(response.headers.get("content-length"));
  if (declaredLength > SIZE_MAX) throw new HttpError(502, "Le flux est trop volumineux");
  if (!response.body) return "";
  const chunks: Uint8Array[] = [];
  let total = 0;
  for await (const chunk of response.body as AsyncIterable<Uint8Array>) {
    total += chunk.length;
    if (total > SIZE_MAX) throw new HttpError(502, "Le flux est trop volumineux");
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString("utf8");
};

type Subject = Record<string, unknown>;

const isObject = (value: unknown): value is Subject =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/**
 * The fields to look in for an article's title, address and date, from the
 * most common to the rarest. JSON Feed (jsonfeed.org) first, then the names
 * used by catalogs that follow none — "vulnerabilityName" and "dateAdded" are
 * CISA's.
 */
const TITLE_FIELDS = ["title", "name", "headline", "vulnerabilityName", "summary"];
const LINK_FIELDS = ["url", "external_url", "link", "href", "permalink"];
const DATE_FIELDS = [
  "date_published", "datePublished", "published", "pubDate", "date",
  "dateAdded", "date_modified", "dateModified", "updated",
];

/** The names under which a JSON feed stores its articles. */
const ARTICLE_FIELDS = ["items", "entries", "articles", "vulnerabilities", "posts", "data"];

const CVE = /^CVE-\d{4}-\d+$/i;

const firstText = (subject: Subject, fields: string[]): string => {
  for (const field of fields) {
    const value = subject[field];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
};

/** The article's CVE identifier, when it has one. */
const cveDe = (subject: Subject): string => {
  const id = firstText(subject, ["cveID", "cveId", "cve", "id"]);
  return CVE.test(id) ? id.toUpperCase() : "";
};

const safeAddress = (link: string, source: string): string => {
  try {
    const url = new URL(link, source);
    return url.protocol === "http:" || url.protocol === "https:" ? url.href : "";
  } catch {
    return "";
  }
};

/**
 * An article of a JSON feed. A vulnerability is named by its CVE identifier,
 * which is what one looks for when reading it, and leads to its NVD record
 * when the source gives no other address.
 */
const articleJson = (subject: Subject, source: string): AccessFeedArticle => {
  const cve = cveDe(subject);
  const name = firstText(subject, TITLE_FIELDS);
  const title = cve && !name.includes(cve) ? (name ? `${cve} · ${name}` : cve) : name;
  const link =
    firstText(subject, LINK_FIELDS) || (cve ? `https://nvd.nist.gov/vuln/detail/${cve}` : "");
  const raw = firstText(subject, DATE_FIELDS);
  const date = raw ? new Date(raw) : null;
  return {
    title,
    url: safeAddress(link, source),
    date: date && !Number.isNaN(date.getTime()) ? date.toISOString() : null,
  };
};

/**
 * The most recent articles, from most recent to oldest: a source is not
 * always sorted by date — a JSON catalog, or CERT-FR, which keeps bulletins
 * from 2014 at the head of its RSS feed —, and it is by the latest ones that
 * it is read. Articles without a date keep their rank, after the others.
 */
const latest = (articles: AccessFeedArticle[], quantity: number): AccessFeedArticle[] => {
  const articleTime = (a: AccessFeedArticle) => (a.date ? Date.parse(a.date) : -Infinity);
  return articles.sort((a, b) => articleTime(b) - articleTime(a)).slice(0, quantity);
};

/** The articles of a JSON feed, most recent first. */
const readJson = (text: string, source: string, quantity: number): AccessFeedArticle[] => {
  let root: unknown;
  try {
    root = JSON.parse(text);
  } catch {
    throw new HttpError(502, "Flux JSON illisible");
  }
  const list = Array.isArray(root)
    ? root
    : isObject(root)
      ? (ARTICLE_FIELDS.map((c) => root[c]).find(Array.isArray)
        ?? Object.values(root).find((v) => Array.isArray(v) && v.some(isObject)))
      : undefined;
  if (!Array.isArray(list)) throw new HttpError(502, "Aucun article dans ce flux JSON");

  return latest(
    list.filter(isObject).map((subject) => articleJson(subject, source)),
    quantity,
  );
};

/** A JSON feed announces itself by its type, or failing that by its first character. */
const isJson = (type: string, text: string): boolean =>
  /json/i.test(type) || /^[\s\uFEFF]*[[{]/.test(text);

// --- Reading an XML feed ---------------------------------------------------

const ENTITIES: Record<string, string> = { lt: "<", gt: ">", amp: "&", quot: '"', apos: "'" };

/** The text's entities, brought back to the characters they stand for. */
const stripTags = (text: string): string =>
  text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, code: string) => {
    if (code[0] !== "#") return ENTITIES[code] ?? match;
    const point = code[1] === "x" || code[1] === "X"
      ? parseInt(code.slice(2), 16)
      : parseInt(code.slice(1), 10);
    return point <= 0x10ffff ? String.fromCodePoint(point) : match;
  });

/**
 * CDATA sections are set aside while tags are read: their content — often an
 * article's HTML — carries "<" that would fool the reader. Each leaves a
 * marker in its place, between two private-use characters that a feed does
 * not contain.
 */
const MARKER = /\uE000(\d+)\uE000/;

/** The elements of this name, whatever their namespace prefix. */
const items = (into: string, name: string): { attributes: string; content: string }[] =>
  Array.from(
    into.matchAll(
      new RegExp(`<((?:[\\w.-]+:)?${name})(?=[\\s/>])([^>]*?)(?:/>|>([\\s\\S]*?)</\\1\\s*>)`, "g"),
    ),
    (m) => ({ attributes: m[2] ?? "", content: m[3] ?? "" }),
  );

const attribute = (attributes: string, name: string): string | undefined => {
  const m = attributes.match(new RegExp(`(?:^|\\s)${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`));
  return m ? stripTags(m[1] ?? m[2] ?? "") : undefined;
};

/**
 * The articles of an RSS or Atom feed, most recent first. XML that is not
 * one — an HTML page, most often — throws: the column says so rather than
 * staying empty.
 */
const readXml = (xml: string, source: string, quantity: number): AccessFeedArticle[] => {
  const cdata: string[] = [];
  const masked = xml
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, (_whole, content: string) =>
      `\uE000${cdata.push(content) - 1}\uE000`,
    )
    .replace(/<!--[\s\S]*?-->/g, "");

  /** An element's text: tags removed, entities and CDATA resolved. */
  const text = (content: string): string =>
    content
      .split(MARKER)
      .map((chunk, i) => (i % 2 ? cdata[Number(chunk)]! : stripTags(chunk.replace(/<[^>]*>/g, ""))))
      .join("")
      .replace(/\s+/g, " ")
      .trim();

  const first = (into: string, ...names: string[]): string => {
    for (const name of names) {
      const found = items(into, name).map((e) => text(e.content)).find(Boolean);
      if (found) return found;
    }
    return "";
  };

  /**
   * An article's address. In RSS, it is the text of "link"; in Atom, its
   * "href" attribute — that of the page ("alternate") when there are several.
   */
  const linkOf = (article: string): string => {
    const links = items(article, "link");
    const link =
      links.find((l) => (attribute(l.attributes, "rel") ?? "alternate") === "alternate") ?? links[0];
    return (link && (attribute(link.attributes, "href") || text(link.content)))
      || first(article, "guid");
  };

  const root = masked
    .replace(/<\?[\s\S]*?\?>/g, "")
    .replace(/<!DOCTYPE[^>]*>/gi, "")
    .match(/<(?:[\w.-]+:)?([\w.-]+)/)?.[1];
  const articles = Array.from(
    masked.matchAll(/<((?:[\w.-]+:)?(?:item|entry))(?=[\s>])[^>]*>([\s\S]*?)<\/\1\s*>/g),
    (m) => m[2]!,
  );
  if (!articles.length && !["rss", "feed", "RDF"].includes(root ?? "")) {
    throw new HttpError(502, "Ce n'est pas un flux RSS ou Atom");
  }

  return latest(
    articles.map((article) => {
      const raw = first(article, "pubDate", "updated", "published", "date");
      const date = raw ? new Date(raw) : null;
      return {
        title: first(article, "title"),
        url: safeAddress(linkOf(article), source),
        date: date && !Number.isNaN(date.getTime()) ? date.toISOString() : null,
      };
    }),
    quantity,
  );
};

// --- Polling ---------------------------------------------------------------

/** What the source returned: its text, its announced type, the final address. */
interface Downloaded {
  text: string;
  type: string;
  url: URL;
}

/** The source's content, redirects followed and checked. */
const download = async (address: string): Promise<Downloaded> => {
  let url = await verify(address);
  let response: Response | undefined;
  for (let hop = 0; hop <= REDIRECTIONS_MAX; hop++) {
    try {
      response = await fetch(url, {
        redirect: "manual",
        signal: AbortSignal.timeout(TIMEOUT),
        headers: {
          Accept:
            "application/rss+xml, application/atom+xml, application/feed+json, "
            + "application/xml, text/xml, application/json, */*",
          "User-Agent": "Milo (lecteur de flux)",
        },
      });
    } catch {
      throw new HttpError(502, `La source ne répond pas : ${url.hostname}`);
    }
    const followUp = response.headers.get("location");
    if (response.status < 300 || response.status >= 400 || !followUp) break;
    if (hop === REDIRECTIONS_MAX) throw new HttpError(502, "Trop de redirections");
    url = await verify(new URL(followUp, url).toString());
  }
  if (!response!.ok) throw new HttpError(502, `La source a répondu ${response!.status}`);
  return { text: await readBound(response!), type: response!.headers.get("content-type") ?? "", url };
};

const readDownloaded = ({ text, type, url }: Downloaded, quantity: number): AccessFeedArticle[] =>
  isJson(type, text) ? readJson(text, url.href, quantity) : readXml(text, url.href, quantity);

/** The source's latest articles, read, at most "quantity". */
const readSource = async (address: string, quantity: number): Promise<AccessFeedArticle[]> =>
  readDownloaded(await download(address), quantity);

/**
 * The name of the format of a feed already read without error: the version
 * an RSS feed announces, "RSS 1.0" for RDF, "Atom", and "JSON Feed" for a
 * feed that follows jsonfeed.org — "JSON" for a catalog that follows none.
 */
const formatDe = ({ text, type }: Downloaded): string => {
  if (isJson(type, text)) {
    const root: unknown = JSON.parse(text);
    const version = isObject(root) ? root["version"] : undefined;
    return typeof version === "string" && /jsonfeed\.org/i.test(version) ? "JSON Feed" : "JSON";
  }
  const withoutPreamble = text
    .replace(/<\?[\s\S]*?\?>/g, "")
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<!DOCTYPE[^>]*>/gi, "");
  const root = withoutPreamble.match(/<(?:[\w.-]+:)?([\w.-]+)([^>]*)>/);
  if (root?.[1] === "feed") return "Atom";
  if (root?.[1] === "RDF") return "RSS 1.0";
  if (root?.[1] === "rss") return `RSS ${attribute(root[2] ?? "", "version") || "2.0"}`;
  return "RSS";
};

/**
 * What an address yields, for an item's setting: "unreachable" when the
 * source returns nothing — host not found, no answer, an error —, "invalid"
 * when what it returns does not read as a feed, and otherwise the name of its
 * format. Nothing is stored: polling remains that of the saved items.
 */
export const probeFeed = async (address: string): Promise<AccessFeedProbe> => {
  let downloaded: Downloaded;
  try {
    downloaded = await download(address);
  } catch (error) {
    return { state: "unreachable", message: (error as Error).message };
  }
  try {
    readDownloaded(downloaded, 1);
    return { state: "ok", format: formatDe(downloaded) };
  } catch (error) {
    return { state: "invalid", message: (error as Error).message };
  }
};

/**
 * Polls the source and stores what it gives. A failure is stored too: the
 * earlier articles remain, and the error waits for the next attempt.
 */
const poll = (url: string, quantity: number): Promise<void> => {
  const already = ongoing.get(url);
  if (already) return already;
  const attempt = (async () => {
    const instant = now();
    try {
      const articles = await readSource(url, quantity);
      accessFeeds.store.run(url, JSON.stringify(articles), quantity, instant, instant);
    } catch (error) {
      accessFeeds.fail.run(url, instant, (error as Error).message || "Relève impossible");
    }
  })().finally(() => ongoing.delete(url));
  ongoing.set(url, attempt);
  return attempt;
};

/** What an RSS item sets, read from its configuration and clamped to its bounds. */
export interface FeedSettings {
  /** Its sources, in the set order, without duplicates. */
  urls: string[];
  /** The articles shown: at most, each source supplies that many. */
  quantity: number;
  /** In minutes. */
  interval: number;
}

const bound = (value: unknown, defaultValue: number, min: number, max: number): number => {
  const readValue = value === "" || value === null || value === undefined ? NaN : Number(value);
  return Number.isFinite(readValue) ? Math.min(max, Math.max(min, Math.round(readValue))) : defaultValue;
};

/**
 * The addresses of the sources: the "sources" list, one entry per line of the
 * drawer. An item stored before it only has its "url", re-read as long as the
 * list has not been saved.
 */
const addressesOf = (config: Record<string, unknown>): string[] => {
  const raw = Array.isArray(config.sources)
    ? config.sources.map((s: unknown) =>
        isObject(s) && typeof s.url === "string" ? s.url : "",
      )
    : [typeof config.url === "string" ? config.url : ""];
  return [...new Set(raw.map((u) => u.trim()).filter(Boolean))];
};

/**
 * The settings of an RSS item. The server does not ordinarily read a
 * widget's configuration; this one it reads because it polls the feed
 * itself. The keys and default values are the widget's
 * (client/src/widgets/common/rss.tsx).
 */
export const feedSettings = (config: Record<string, unknown>): FeedSettings => ({
  urls: addressesOf(config),
  quantity: bound(config.count, 5, 1, ACCESS_FEED_QUANTITY_MAX),
  interval: bound(
    config.interval,
    ACCESS_FEED_INTERVAL_DEFAULT,
    ACCESS_FEED_INTERVAL_MIN,
    ACCESS_FEED_INTERVAL_MAX,
  ),
});

/**
 * The followed sources, each with what its items ask for: the largest
 * quantity, and the shortest interval.
 */
const followedSources = (): Map<string, { quantity: number; interval: number }> => {
  const sources = new Map<string, { quantity: number; interval: number }>();
  for (const { config } of accessFeeds.configurations.all()) {
    let readValue: unknown;
    try {
      readValue = JSON.parse(config);
    } catch {
      continue;
    }
    if (!readValue || typeof readValue !== "object" || Array.isArray(readValue)) continue;
    const { urls, quantity, interval } = feedSettings(readValue as Record<string, unknown>);
    for (const url of urls) {
      const known = sources.get(url);
      sources.set(url, {
        quantity: Math.max(quantity, known?.quantity ?? 0),
        interval: Math.min(interval, known?.interval ?? Infinity),
      });
    }
  }
  return sources;
};

/**
 * True when the source is due for polling: its interval elapsed since the
 * last attempt, or sooner after a failure, or as soon as an item asks for
 * more articles than the database keeps.
 */
const toRecord = (row: AccessFeedRow | undefined, quantity: number, interval: number) => {
  if (!row) return true;
  if (row.fetched_at !== null && row.quantity < quantity) return true;
  const due = row.error ? Math.min(interval * 60_000, RETRY_DELAY) : interval * 60_000;
  return Date.now() - Date.parse(row.tried_at) >= due;
};

let pollInProgress = false;

/**
 * The background poll: each followed source whose due time has passed is
 * polled, one by one — nothing is urgent, and sources need not receive all
 * their requests in the same second. Feeds that no item follows any more
 * leave the database.
 */
export const pollAllFeeds = async (): Promise<void> => {
  if (pollInProgress) return;
  pollInProgress = true;
  try {
    const sources = followedSources();
    for (const row of accessFeeds.all.all()) {
      if (!sources.has(row.url)) accessFeeds.remove.run(row.url);
    }
    for (const [url, { quantity, interval }] of sources) {
      if (toRecord(accessFeeds.byUrl.get(url), quantity, interval)) await poll(url, quantity);
    }
  } finally {
    pollInProgress = false;
  }
};

const articlesOf = (row: AccessFeedRow): AccessFeedArticle[] => {
  try {
    const readItems: unknown = JSON.parse(row.articles);
    return Array.isArray(readItems) ? (readItems as AccessFeedArticle[]) : [];
  } catch {
    return [];
  }
};

/**
 * An item's source, as the database keeps it. It is only polled in the field
 * when the database has nothing to show — a new source, a changed address, a
 * raised quantity —; otherwise, the background poll keeps it up to date, and
 * the page never waits for the source.
 */
const sourceOf = async (
  url: string,
  quantity: number,
  followed: () => Map<string, { quantity: number }>,
): Promise<AccessFeedSource> => {
  let row = accessFeeds.byUrl.get(url);
  const servable = row?.fetched_at != null && row.quantity >= quantity;
  // A source that has just failed is not retried on every visit.
  const attemptAllowed = !row || !row.error
    || Date.now() - Date.parse(row.tried_at) >= RETRY_DELAY;
  if (!servable && attemptAllowed) {
    const desiredView = Math.max(quantity, followed().get(url)?.quantity ?? 0);
    await poll(url, desiredView);
    row = accessFeeds.byUrl.get(url);
  }
  if (!row?.fetched_at) {
    return { url, articles: [], fetched_at: null, error: row?.error || "Relève impossible" };
  }
  return {
    url,
    articles: articlesOf(row).slice(0, quantity),
    fetched_at: row.fetched_at,
    error: null,
  };
};

/**
 * An item's feed: each of its sources, in the set order. They are read
 * together, and the failure of one does not hold back the others.
 */
export const feedOf = async ({ urls, quantity }: FeedSettings): Promise<AccessFeed> => {
  if (!urls.length) badRequest("L'adresse du flux est requise");
  // Followed sources are only re-read once, and only if needed.
  let followed: Map<string, { quantity: number }> | undefined;
  const getFollowed = () => (followed ??= followedSources());
  return {
    sources: await Promise.all(urls.map((url) => sourceOf(url, quantity, getFollowed))),
  };
};
