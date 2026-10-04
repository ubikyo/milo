// La relève des flux pour le widget RSS du mode Accès.
//
// Le navigateur ne peut pas lire un flux posé sur un autre site : la plupart
// ne répondent pas aux requêtes d'une autre origine (CORS). Le serveur va donc
// le chercher à sa place — et le garde. Chaque source est relevée à son rythme,
// l'intervalle que règlent les éléments qui la suivent (30 minutes par
// défaut), et ses derniers articles se rangent en base, déjà lus, à hauteur de
// la plus grande quantité demandée. La page les lit là : ouvrir la page ne
// sollicite plus la source.
//
// Le flux se lit donc ici, qu'il soit en XML (RSS, Atom) ou en JSON. Le XML
// d'un flux est simple — des articles, un titre, un lien, une date —, et une
// lecture à la main suffit, comme pour les inventaires (lib/inventory.ts). Un
// flux JSON peut peser plusieurs mégaoctets — le catalogue des vulnérabilités
// exploitées de la CISA en fait près de deux — pour les quelques articles
// qu'on en garde.
//
// Aller chercher une adresse donnée par quelqu'un, c'est aussi la porte d'une
// requête vers ce que seul le serveur voit. On refuse donc ce qui ne sort pas
// de la machine — la boucle locale, les adresses de lien local, où se tiennent
// les métadonnées des hébergeurs — et l'on suit les redirections à la main pour
// vérifier chacune. Les adresses du réseau interne restent permises : un flux
// d'intranet est un usage ordinaire.

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

/** Au-delà, la source est trop lente : la colonne attend déjà. */
const TIMEOUT = 8_000;

/**
 * Un flux XML tient en quelques centaines de kilo-octets ; un catalogue JSON
 * comme celui de la CISA approche deux mégaoctets et grossit. Au-delà, ce
 * n'est plus un flux.
 */
const SIZE_MAX = 10 * 1024 * 1024;

const REDIRECTIONS_MAX = 3;

/** La relève de fond regarde à ce rythme quels flux sont arrivés à échéance. */
export const FEED_POLL_INTERVAL = 60_000;

/**
 * Une relève qui a échoué se retente plus tôt que l'intervalle réglé : une
 * source tombée une minute ne doit pas laisser l'élément vide une demi-heure.
 */
const RETRY_DELAY = 5 * 60_000;

/** Les relèves en cours, par adresse : deux demandes n'en font qu'une. */
const ongoing = new Map<string, Promise<void>>();

/** Une adresse IP qui ne sort pas de la machine ou de son lien. */
const isForbidden = (ip: string): boolean => {
  const v4 = ip.startsWith("::ffff:") ? ip.slice(7) : ip;
  if (isIP(v4) === 4) {
    const [a, b] = v4.split(".").map(Number);
    return a === 0 || a === 127 || (a === 169 && b === 254);
  }
  const lowercased = ip.toLowerCase();
  return lowercased === "::" || lowercased === "::1" || lowercased.startsWith("fe80:");
};

/** L'adresse, vérifiée : http ou https, vers un hôte qui sort de la machine. */
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

/** Le corps de la réponse, arrêté dès qu'il dépasse la taille admise. */
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
 * Les champs où chercher le titre, l'adresse et la date d'un article, du plus
 * courant au plus rare. JSON Feed (jsonfeed.org) d'abord, puis les noms que
 * prennent les catalogues qui n'en suivent aucun — « vulnerabilityName » et
 * « dateAdded » sont ceux de la CISA.
 */
const TITLE_FIELDS = ["title", "name", "headline", "vulnerabilityName", "summary"];
const LINK_FIELDS = ["url", "external_url", "link", "href", "permalink"];
const DATE_FIELDS = [
  "date_published", "datePublished", "published", "pubDate", "date",
  "dateAdded", "date_modified", "dateModified", "updated",
];

/** Les noms sous lesquels un flux JSON range ses articles. */
const ARTICLE_FIELDS = ["items", "entries", "articles", "vulnerabilities", "posts", "data"];

const CVE = /^CVE-\d{4}-\d+$/i;

const firstText = (subject: Subject, fields: string[]): string => {
  for (const field of fields) {
    const value = subject[field];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
};

/** L'identifiant CVE de l'article, quand il en porte un. */
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
 * Un article d'un flux JSON. Une vulnérabilité se nomme par son identifiant
 * CVE, qui est ce qu'on cherche en la lisant, et mène à sa fiche du NVD quand
 * la source ne donne pas d'autre adresse.
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
 * Les plus récents des articles, du plus récent au plus ancien : une source
 * n'est pas toujours rangée par date — un catalogue JSON, ou le CERT-FR, qui
 * garde en tête de son flux RSS des bulletins de 2014 —, et c'est par les
 * derniers qu'on la lit. Les articles sans date gardent leur rang, à la suite.
 */
const latest = (articles: AccessFeedArticle[], quantity: number): AccessFeedArticle[] => {
  const articleTime = (a: AccessFeedArticle) => (a.date ? Date.parse(a.date) : -Infinity);
  return articles.sort((a, b) => articleTime(b) - articleTime(a)).slice(0, quantity);
};

/** Les articles d'un flux JSON, les plus récents d'abord. */
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

/** Un flux JSON s'annonce par son type, ou à défaut par son premier caractère. */
const isJson = (type: string, text: string): boolean =>
  /json/i.test(type) || /^[\s\uFEFF]*[[{]/.test(text);

// --- Lecture d'un flux XML -------------------------------------------------

const ENTITIES: Record<string, string> = { lt: "<", gt: ">", amp: "&", quot: '"', apos: "'" };

/** Les entités du texte, ramenées aux caractères qu'elles désignent. */
const stripTags = (text: string): string =>
  text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, code: string) => {
    if (code[0] !== "#") return ENTITIES[code] ?? match;
    const point = code[1] === "x" || code[1] === "X"
      ? parseInt(code.slice(2), 16)
      : parseInt(code.slice(1), 10);
    return point <= 0x10ffff ? String.fromCodePoint(point) : match;
  });

/**
 * Les sections CDATA sont mises de côté le temps de lire les balises : leur
 * contenu — souvent le HTML d'un article — porte des « < » qui tromperaient la
 * lecture. Chacune laisse à sa place un repère, entre deux caractères d'usage
 * privé qu'un flux ne contient pas.
 */
const MARKER = /\uE000(\d+)\uE000/;

/** Les éléments de ce nom, quel que soit leur préfixe d'espace de noms. */
const items = (dans: string, name: string): { attributes: string; content: string }[] =>
  Array.from(
    dans.matchAll(
      new RegExp(`<((?:[\\w.-]+:)?${name})(?=[\\s/>])([^>]*?)(?:/>|>([\\s\\S]*?)</\\1\\s*>)`, "g"),
    ),
    (m) => ({ attributes: m[2] ?? "", content: m[3] ?? "" }),
  );

const attribute = (attributes: string, name: string): string | undefined => {
  const m = attributes.match(new RegExp(`(?:^|\\s)${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`));
  return m ? stripTags(m[1] ?? m[2] ?? "") : undefined;
};

/**
 * Les articles d'un flux RSS ou Atom, les plus récents d'abord. Un XML qui
 * n'en est pas un — une page HTML, le plus souvent — lève : la colonne le dit
 * plutôt que de rester vide.
 */
const readXml = (xml: string, source: string, quantity: number): AccessFeedArticle[] => {
  const cdata: string[] = [];
  const masked = xml
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, (_whole, content: string) =>
      `\uE000${cdata.push(content) - 1}\uE000`,
    )
    .replace(/<!--[\s\S]*?-->/g, "");

  /** Le texte d'un élément : ses balises ôtées, ses entités et CDATA rendues. */
  const text = (content: string): string =>
    content
      .split(MARKER)
      .map((chunk, i) => (i % 2 ? cdata[Number(chunk)]! : stripTags(chunk.replace(/<[^>]*>/g, ""))))
      .join("")
      .replace(/\s+/g, " ")
      .trim();

  const first = (dans: string, ...names: string[]): string => {
    for (const name of names) {
      const found = items(dans, name).map((e) => text(e.content)).find(Boolean);
      if (found) return found;
    }
    return "";
  };

  /**
   * L'adresse d'un article. En RSS, c'est le texte de « link » ; en Atom, son
   * attribut « href » — celui de la page (« alternate ») quand il y en a
   * plusieurs.
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

// --- Relève ----------------------------------------------------------------

/** Ce que la source a rendu : son texte, son type annoncé, l'adresse finale. */
interface Downloaded {
  text: string;
  type: string;
  url: URL;
}

/** Le contenu de la source, redirections suivies et vérifiées. */
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

/** Les derniers articles de la source, lus, au plus « quantite ». */
const readSource = async (address: string, quantity: number): Promise<AccessFeedArticle[]> =>
  readDownloaded(await download(address), quantity);

/**
 * Le nom du format d'un flux déjà lu sans erreur : la version qu'annonce un
 * flux RSS, « RSS 1.0 » pour le RDF, « Atom », et « JSON Feed » pour un flux
 * qui suit jsonfeed.org — « JSON » pour un catalogue qui n'en suit aucun.
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
 * Ce que donne une adresse, pour le réglage d'un élément : « injoignable »
 * quand la source ne rend rien — hôte introuvable, pas de réponse, une
 * erreur —, « invalide » quand ce qu'elle rend ne se lit pas comme un flux, et
 * sinon le nom de son format. Rien n'est rangé : la relève reste celle des
 * éléments enregistrés.
 */
export const probeFeed = async (address: string): Promise<AccessFeedProbe> => {
  let downloaded: Downloaded;
  try {
    downloaded = await download(address);
  } catch (error) {
    return { state: "injoignable", message: (error as Error).message };
  }
  try {
    readDownloaded(downloaded, 1);
    return { state: "ok", format: formatDe(downloaded) };
  } catch (error) {
    return { state: "invalide", message: (error as Error).message };
  }
};

/**
 * Relève la source et range ce qu'elle donne. Un échec se range aussi : les
 * articles d'avant restent, et l'erreur attend la prochaine tentative.
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

/** Ce qu'un élément RSS règle, lu dans sa configuration et ramené à ses bornes. */
export interface FeedSettings {
  /** Ses sources, dans l'ordre réglé, sans doublon. */
  urls: string[];
  /** Les articles montrés : au plus, chaque source en fournit autant. */
  quantity: number;
  /** En minutes. */
  interval: number;
}

const bound = (value: unknown, defaultValue: number, min: number, max: number): number => {
  const readValue = value === "" || value === null || value === undefined ? NaN : Number(value);
  return Number.isFinite(readValue) ? Math.min(max, Math.max(min, Math.round(readValue))) : defaultValue;
};

/**
 * Les adresses des sources : la liste « sources », une entrée par ligne du
 * tiroir. Un élément rangé avant elle n'a que son « url », relue tant que la
 * liste n'a pas été enregistrée.
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
 * Les réglages d'un élément RSS. Le serveur ne lit d'ordinaire pas la
 * configuration d'un widget ; celle-ci, il la lit parce qu'il relève le flux
 * lui-même. Les clés et les valeurs par défaut sont celles du widget
 * (client/src/widgets/rss.tsx).
 */
export const feedSettings = (config: Record<string, unknown>): FeedSettings => ({
  urls: addressesOf(config),
  quantity: bound(config.quantite, 5, 1, ACCESS_FEED_QUANTITY_MAX),
  interval: bound(
    config.intervalle,
    ACCESS_FEED_INTERVAL_DEFAULT,
    ACCESS_FEED_INTERVAL_MIN,
    ACCESS_FEED_INTERVAL_MAX,
  ),
});

/**
 * Les sources suivies, chacune avec ce que ses éléments demandent : la plus
 * grande quantité, et l'intervalle le plus court.
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
 * Vrai quand la source est à relever : son intervalle écoulé depuis la
 * dernière tentative, ou plus tôt après un échec, ou dès qu'un élément demande
 * plus d'articles que la base n'en garde.
 */
const toRecord = (row: AccessFeedRow | undefined, quantity: number, interval: number) => {
  if (!row) return true;
  if (row.fetched_at !== null && row.quantity < quantity) return true;
  const due = row.error ? Math.min(interval * 60_000, RETRY_DELAY) : interval * 60_000;
  return Date.now() - Date.parse(row.tried_at) >= due;
};

let pollInProgress = false;

/**
 * La relève de fond : chaque source suivie dont l'échéance est passée est
 * relevée, une à une — rien ne presse, et les sources n'ont pas à recevoir
 * toutes leurs demandes à la même seconde. Les flux que plus aucun élément ne
 * suit quittent la base.
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
 * Une source d'un élément, telle que la base la garde. Elle n'est relevée sur
 * le champ que lorsque la base n'a rien à montrer — une source neuve, une
 * adresse changée, une quantité relevée — ; sinon, c'est la relève de fond qui
 * la tient à jour, et la page n'attend jamais la source.
 */
const sourceOf = async (
  url: string,
  quantity: number,
  followed: () => Map<string, { quantity: number }>,
): Promise<AccessFeedSource> => {
  let row = accessFeeds.byUrl.get(url);
  const servable = row?.fetched_at != null && row.quantity >= quantity;
  // Une source qui vient d'échouer n'est pas relancée à chaque visite.
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
 * Le flux d'un élément : chacune de ses sources, dans l'ordre réglé. Elles se
 * lisent ensemble, et l'échec de l'une ne retient pas les autres.
 */
export const feedOf = async ({ urls, quantity }: FeedSettings): Promise<AccessFeed> => {
  if (!urls.length) badRequest("L'adresse du flux est requise");
  // Les sources suivies ne se relisent qu'une fois, et seulement s'il faut.
  let followed: Map<string, { quantity: number }> | undefined;
  const getFollowed = () => (followed ??= followedSources());
  return {
    sources: await Promise.all(urls.map((url) => sourceOf(url, quantity, getFollowed))),
  };
};
