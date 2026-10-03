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
  ACCESS_FEED_INTERVAL_DEFAUT,
  ACCESS_FEED_INTERVAL_MAX,
  ACCESS_FEED_INTERVAL_MIN,
  ACCESS_FEED_QUANTITE_MAX,
} from "@milo/shared";
import type { AccessFeed, AccessFeedArticle, AccessFeedProbe } from "@milo/shared";
import type { AccessFeedRow } from "../db/rows.js";
import { accessFeeds } from "../repositories/access.js";
import { HttpError, badRequest } from "./http.js";
import { now } from "./time.js";

/** Au-delà, la source est trop lente : la colonne attend déjà. */
const DELAI = 8_000;

/**
 * Un flux XML tient en quelques centaines de kilo-octets ; un catalogue JSON
 * comme celui de la CISA approche deux mégaoctets et grossit. Au-delà, ce
 * n'est plus un flux.
 */
const TAILLE_MAX = 10 * 1024 * 1024;

const REDIRECTIONS_MAX = 3;

/** La relève de fond regarde à ce rythme quels flux sont arrivés à échéance. */
export const INTERVALLE_RELEVE_FLUX = 60_000;

/**
 * Une relève qui a échoué se retente plus tôt que l'intervalle réglé : une
 * source tombée une minute ne doit pas laisser l'élément vide une demi-heure.
 */
const NOUVEL_ESSAI = 5 * 60_000;

/** Les relèves en cours, par adresse : deux demandes n'en font qu'une. */
const enCours = new Map<string, Promise<void>>();

/** Une adresse IP qui ne sort pas de la machine ou de son lien. */
const estInterdite = (ip: string): boolean => {
  const v4 = ip.startsWith("::ffff:") ? ip.slice(7) : ip;
  if (isIP(v4) === 4) {
    const [a, b] = v4.split(".").map(Number);
    return a === 0 || a === 127 || (a === 169 && b === 254);
  }
  const bas = ip.toLowerCase();
  return bas === "::" || bas === "::1" || bas.startsWith("fe80:");
};

/** L'adresse, vérifiée : http ou https, vers un hôte qui sort de la machine. */
const verifier = async (brute: string): Promise<URL> => {
  let url: URL;
  try {
    url = new URL(brute);
  } catch {
    return badRequest("Adresse du flux invalide");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    badRequest("Le flux doit être en http ou https");
  }
  const hote = url.hostname.replace(/^\[|\]$/g, "");
  let adresses: string[];
  try {
    adresses = isIP(hote) ? [hote] : (await lookup(hote, { all: true })).map((a) => a.address);
  } catch {
    throw new HttpError(502, `Hôte introuvable : ${hote}`);
  }
  if (adresses.some(estInterdite)) badRequest("Cette adresse n'est pas autorisée");
  return url;
};

/** Le corps de la réponse, arrêté dès qu'il dépasse la taille admise. */
const lireBorne = async (reponse: Response): Promise<string> => {
  const annonce = Number(reponse.headers.get("content-length"));
  if (annonce > TAILLE_MAX) throw new HttpError(502, "Le flux est trop volumineux");
  if (!reponse.body) return "";
  const morceaux: Uint8Array[] = [];
  let total = 0;
  for await (const morceau of reponse.body as AsyncIterable<Uint8Array>) {
    total += morceau.length;
    if (total > TAILLE_MAX) throw new HttpError(502, "Le flux est trop volumineux");
    morceaux.push(morceau);
  }
  return Buffer.concat(morceaux).toString("utf8");
};

type Objet = Record<string, unknown>;

const estObjet = (valeur: unknown): valeur is Objet =>
  typeof valeur === "object" && valeur !== null && !Array.isArray(valeur);

/**
 * Les champs où chercher le titre, l'adresse et la date d'un article, du plus
 * courant au plus rare. JSON Feed (jsonfeed.org) d'abord, puis les noms que
 * prennent les catalogues qui n'en suivent aucun — « vulnerabilityName » et
 * « dateAdded » sont ceux de la CISA.
 */
const CHAMPS_TITRE = ["title", "name", "headline", "vulnerabilityName", "summary"];
const CHAMPS_LIEN = ["url", "external_url", "link", "href", "permalink"];
const CHAMPS_DATE = [
  "date_published", "datePublished", "published", "pubDate", "date",
  "dateAdded", "date_modified", "dateModified", "updated",
];

/** Les noms sous lesquels un flux JSON range ses articles. */
const CHAMPS_ARTICLES = ["items", "entries", "articles", "vulnerabilities", "posts", "data"];

const CVE = /^CVE-\d{4}-\d+$/i;

const premierTexte = (objet: Objet, champs: string[]): string => {
  for (const champ of champs) {
    const valeur = objet[champ];
    if (typeof valeur === "string" && valeur.trim()) return valeur.trim();
  }
  return "";
};

/** L'identifiant CVE de l'article, quand il en porte un. */
const cveDe = (objet: Objet): string => {
  const id = premierTexte(objet, ["cveID", "cveId", "cve", "id"]);
  return CVE.test(id) ? id.toUpperCase() : "";
};

const adresseSure = (lien: string, source: string): string => {
  try {
    const url = new URL(lien, source);
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
const articleJson = (objet: Objet, source: string): AccessFeedArticle => {
  const cve = cveDe(objet);
  const nom = premierTexte(objet, CHAMPS_TITRE);
  const title = cve && !nom.includes(cve) ? (nom ? `${cve} · ${nom}` : cve) : nom;
  const lien =
    premierTexte(objet, CHAMPS_LIEN) || (cve ? `https://nvd.nist.gov/vuln/detail/${cve}` : "");
  const brute = premierTexte(objet, CHAMPS_DATE);
  const date = brute ? new Date(brute) : null;
  return {
    title,
    url: adresseSure(lien, source),
    date: date && !Number.isNaN(date.getTime()) ? date.toISOString() : null,
  };
};

/**
 * Les plus récents des articles, du plus récent au plus ancien : une source
 * n'est pas toujours rangée par date — un catalogue JSON, ou le CERT-FR, qui
 * garde en tête de son flux RSS des bulletins de 2014 —, et c'est par les
 * derniers qu'on la lit. Les articles sans date gardent leur rang, à la suite.
 */
const lesDerniers = (articles: AccessFeedArticle[], quantite: number): AccessFeedArticle[] => {
  const temps = (a: AccessFeedArticle) => (a.date ? Date.parse(a.date) : -Infinity);
  return articles.sort((a, b) => temps(b) - temps(a)).slice(0, quantite);
};

/** Les articles d'un flux JSON, les plus récents d'abord. */
const lireJson = (texte: string, source: string, quantite: number): AccessFeedArticle[] => {
  let racine: unknown;
  try {
    racine = JSON.parse(texte);
  } catch {
    throw new HttpError(502, "Flux JSON illisible");
  }
  const liste = Array.isArray(racine)
    ? racine
    : estObjet(racine)
      ? (CHAMPS_ARTICLES.map((c) => racine[c]).find(Array.isArray)
        ?? Object.values(racine).find((v) => Array.isArray(v) && v.some(estObjet)))
      : undefined;
  if (!Array.isArray(liste)) throw new HttpError(502, "Aucun article dans ce flux JSON");

  return lesDerniers(
    liste.filter(estObjet).map((objet) => articleJson(objet, source)),
    quantite,
  );
};

/** Un flux JSON s'annonce par son type, ou à défaut par son premier caractère. */
const estJson = (type: string, texte: string): boolean =>
  /json/i.test(type) || /^[\s\uFEFF]*[[{]/.test(texte);

// --- Lecture d'un flux XML -------------------------------------------------

const ENTITES: Record<string, string> = { lt: "<", gt: ">", amp: "&", quot: '"', apos: "'" };

/** Les entités du texte, ramenées aux caractères qu'elles désignent. */
const detexter = (texte: string): string =>
  texte.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (tout, code: string) => {
    if (code[0] !== "#") return ENTITES[code] ?? tout;
    const point = code[1] === "x" || code[1] === "X"
      ? parseInt(code.slice(2), 16)
      : parseInt(code.slice(1), 10);
    return point <= 0x10ffff ? String.fromCodePoint(point) : tout;
  });

/**
 * Les sections CDATA sont mises de côté le temps de lire les balises : leur
 * contenu — souvent le HTML d'un article — porte des « < » qui tromperaient la
 * lecture. Chacune laisse à sa place un repère, entre deux caractères d'usage
 * privé qu'un flux ne contient pas.
 */
const REPERE = /\uE000(\d+)\uE000/;

/** Les éléments de ce nom, quel que soit leur préfixe d'espace de noms. */
const elements = (dans: string, nom: string): { attributs: string; contenu: string }[] =>
  Array.from(
    dans.matchAll(
      new RegExp(`<((?:[\\w.-]+:)?${nom})(?=[\\s/>])([^>]*?)(?:/>|>([\\s\\S]*?)</\\1\\s*>)`, "g"),
    ),
    (m) => ({ attributs: m[2] ?? "", contenu: m[3] ?? "" }),
  );

const attribut = (attributs: string, nom: string): string | undefined => {
  const m = attributs.match(new RegExp(`(?:^|\\s)${nom}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`));
  return m ? detexter(m[1] ?? m[2] ?? "") : undefined;
};

/**
 * Les articles d'un flux RSS ou Atom, les plus récents d'abord. Un XML qui
 * n'en est pas un — une page HTML, le plus souvent — lève : la colonne le dit
 * plutôt que de rester vide.
 */
const lireXml = (xml: string, source: string, quantite: number): AccessFeedArticle[] => {
  const cdata: string[] = [];
  const masque = xml
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, (_tout, contenu: string) =>
      `\uE000${cdata.push(contenu) - 1}\uE000`,
    )
    .replace(/<!--[\s\S]*?-->/g, "");

  /** Le texte d'un élément : ses balises ôtées, ses entités et CDATA rendues. */
  const texte = (contenu: string): string =>
    contenu
      .split(REPERE)
      .map((morceau, i) => (i % 2 ? cdata[Number(morceau)]! : detexter(morceau.replace(/<[^>]*>/g, ""))))
      .join("")
      .replace(/\s+/g, " ")
      .trim();

  const premier = (dans: string, ...noms: string[]): string => {
    for (const nom of noms) {
      const trouve = elements(dans, nom).map((e) => texte(e.contenu)).find(Boolean);
      if (trouve) return trouve;
    }
    return "";
  };

  /**
   * L'adresse d'un article. En RSS, c'est le texte de « link » ; en Atom, son
   * attribut « href » — celui de la page (« alternate ») quand il y en a
   * plusieurs.
   */
  const lienDe = (article: string): string => {
    const liens = elements(article, "link");
    const lien =
      liens.find((l) => (attribut(l.attributs, "rel") ?? "alternate") === "alternate") ?? liens[0];
    return (lien && (attribut(lien.attributs, "href") || texte(lien.contenu)))
      || premier(article, "guid");
  };

  const racine = masque
    .replace(/<\?[\s\S]*?\?>/g, "")
    .replace(/<!DOCTYPE[^>]*>/gi, "")
    .match(/<(?:[\w.-]+:)?([\w.-]+)/)?.[1];
  const articles = Array.from(
    masque.matchAll(/<((?:[\w.-]+:)?(?:item|entry))(?=[\s>])[^>]*>([\s\S]*?)<\/\1\s*>/g),
    (m) => m[2]!,
  );
  if (!articles.length && !["rss", "feed", "RDF"].includes(racine ?? "")) {
    throw new HttpError(502, "Ce n'est pas un flux RSS ou Atom");
  }

  return lesDerniers(
    articles.map((article) => {
      const brute = premier(article, "pubDate", "updated", "published", "date");
      const date = brute ? new Date(brute) : null;
      return {
        title: premier(article, "title"),
        url: adresseSure(lienDe(article), source),
        date: date && !Number.isNaN(date.getTime()) ? date.toISOString() : null,
      };
    }),
    quantite,
  );
};

// --- Relève ----------------------------------------------------------------

/** Ce que la source a rendu : son texte, son type annoncé, l'adresse finale. */
interface Telecharge {
  texte: string;
  type: string;
  url: URL;
}

/** Le contenu de la source, redirections suivies et vérifiées. */
const telecharger = async (adresse: string): Promise<Telecharge> => {
  let url = await verifier(adresse);
  let reponse: Response | undefined;
  for (let saut = 0; saut <= REDIRECTIONS_MAX; saut++) {
    try {
      reponse = await fetch(url, {
        redirect: "manual",
        signal: AbortSignal.timeout(DELAI),
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
    const suite = reponse.headers.get("location");
    if (reponse.status < 300 || reponse.status >= 400 || !suite) break;
    if (saut === REDIRECTIONS_MAX) throw new HttpError(502, "Trop de redirections");
    url = await verifier(new URL(suite, url).toString());
  }
  if (!reponse!.ok) throw new HttpError(502, `La source a répondu ${reponse!.status}`);
  return { texte: await lireBorne(reponse!), type: reponse!.headers.get("content-type") ?? "", url };
};

const lireTelecharge = ({ texte, type, url }: Telecharge, quantite: number): AccessFeedArticle[] =>
  estJson(type, texte) ? lireJson(texte, url.href, quantite) : lireXml(texte, url.href, quantite);

/** Les derniers articles de la source, lus, au plus « quantite ». */
const lireSource = async (adresse: string, quantite: number): Promise<AccessFeedArticle[]> =>
  lireTelecharge(await telecharger(adresse), quantite);

/**
 * Le nom du format d'un flux déjà lu sans erreur : la version qu'annonce un
 * flux RSS, « RSS 1.0 » pour le RDF, « Atom », et « JSON Feed » pour un flux
 * qui suit jsonfeed.org — « JSON » pour un catalogue qui n'en suit aucun.
 */
const formatDe = ({ texte, type }: Telecharge): string => {
  if (estJson(type, texte)) {
    const racine: unknown = JSON.parse(texte);
    const version = estObjet(racine) ? racine["version"] : undefined;
    return typeof version === "string" && /jsonfeed\.org/i.test(version) ? "JSON Feed" : "JSON";
  }
  const sansPreambule = texte
    .replace(/<\?[\s\S]*?\?>/g, "")
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<!DOCTYPE[^>]*>/gi, "");
  const racine = sansPreambule.match(/<(?:[\w.-]+:)?([\w.-]+)([^>]*)>/);
  if (racine?.[1] === "feed") return "Atom";
  if (racine?.[1] === "RDF") return "RSS 1.0";
  if (racine?.[1] === "rss") return `RSS ${attribut(racine[2] ?? "", "version") || "2.0"}`;
  return "RSS";
};

/**
 * Ce que donne une adresse, pour le réglage d'un élément : « injoignable »
 * quand la source ne rend rien — hôte introuvable, pas de réponse, une
 * erreur —, « invalide » quand ce qu'elle rend ne se lit pas comme un flux, et
 * sinon le nom de son format. Rien n'est rangé : la relève reste celle des
 * éléments enregistrés.
 */
export const sonderFlux = async (adresse: string): Promise<AccessFeedProbe> => {
  let telecharge: Telecharge;
  try {
    telecharge = await telecharger(adresse);
  } catch (erreur) {
    return { state: "injoignable", message: (erreur as Error).message };
  }
  try {
    lireTelecharge(telecharge, 1);
    return { state: "ok", format: formatDe(telecharge) };
  } catch (erreur) {
    return { state: "invalide", message: (erreur as Error).message };
  }
};

/**
 * Relève la source et range ce qu'elle donne. Un échec se range aussi : les
 * articles d'avant restent, et l'erreur attend la prochaine tentative.
 */
const relever = (url: string, quantite: number): Promise<void> => {
  const deja = enCours.get(url);
  if (deja) return deja;
  const tentative = (async () => {
    const instant = now();
    try {
      const articles = await lireSource(url, quantite);
      accessFeeds.ranger.run(url, JSON.stringify(articles), quantite, instant, instant);
    } catch (erreur) {
      accessFeeds.echouer.run(url, instant, (erreur as Error).message || "Relève impossible");
    }
  })().finally(() => enCours.delete(url));
  enCours.set(url, tentative);
  return tentative;
};

/** Ce qu'un élément RSS règle, lu dans sa configuration et ramené à ses bornes. */
export interface ReglagesFlux {
  url: string;
  quantite: number;
  /** En minutes. */
  intervalle: number;
}

const borne = (valeur: unknown, defaut: number, min: number, max: number): number => {
  const lu = valeur === "" || valeur === null || valeur === undefined ? NaN : Number(valeur);
  return Number.isFinite(lu) ? Math.min(max, Math.max(min, Math.round(lu))) : defaut;
};

/**
 * Les réglages d'un élément RSS. Le serveur ne lit d'ordinaire pas la
 * configuration d'un widget ; celle-ci, il la lit parce qu'il relève le flux
 * lui-même. Les clés et les valeurs par défaut sont celles du widget
 * (client/src/widgets/rss.tsx).
 */
export const reglagesFlux = (config: Record<string, unknown>): ReglagesFlux => ({
  url: typeof config.url === "string" ? config.url.trim() : "",
  quantite: borne(config.quantite, 5, 1, ACCESS_FEED_QUANTITE_MAX),
  intervalle: borne(
    config.intervalle,
    ACCESS_FEED_INTERVAL_DEFAUT,
    ACCESS_FEED_INTERVAL_MIN,
    ACCESS_FEED_INTERVAL_MAX,
  ),
});

/**
 * Les sources suivies, chacune avec ce que ses éléments demandent : la plus
 * grande quantité, et l'intervalle le plus court.
 */
const sourcesSuivies = (): Map<string, { quantite: number; intervalle: number }> => {
  const sources = new Map<string, { quantite: number; intervalle: number }>();
  for (const { config } of accessFeeds.configurations.all()) {
    let lu: unknown;
    try {
      lu = JSON.parse(config);
    } catch {
      continue;
    }
    if (!lu || typeof lu !== "object" || Array.isArray(lu)) continue;
    const { url, quantite, intervalle } = reglagesFlux(lu as Record<string, unknown>);
    if (!url) continue;
    const connue = sources.get(url);
    sources.set(url, {
      quantite: Math.max(quantite, connue?.quantite ?? 0),
      intervalle: Math.min(intervalle, connue?.intervalle ?? Infinity),
    });
  }
  return sources;
};

/**
 * Vrai quand la source est à relever : son intervalle écoulé depuis la
 * dernière tentative, ou plus tôt après un échec, ou dès qu'un élément demande
 * plus d'articles que la base n'en garde.
 */
const aRelever = (ligne: AccessFeedRow | undefined, quantite: number, intervalle: number) => {
  if (!ligne) return true;
  if (ligne.fetched_at !== null && ligne.quantity < quantite) return true;
  const echeance = ligne.error ? Math.min(intervalle * 60_000, NOUVEL_ESSAI) : intervalle * 60_000;
  return Date.now() - Date.parse(ligne.tried_at) >= echeance;
};

let releveEnCours = false;

/**
 * La relève de fond : chaque source suivie dont l'échéance est passée est
 * relevée, une à une — rien ne presse, et les sources n'ont pas à recevoir
 * toutes leurs demandes à la même seconde. Les flux que plus aucun élément ne
 * suit quittent la base.
 */
export const releverLesFlux = async (): Promise<void> => {
  if (releveEnCours) return;
  releveEnCours = true;
  try {
    const sources = sourcesSuivies();
    for (const ligne of accessFeeds.all.all()) {
      if (!sources.has(ligne.url)) accessFeeds.remove.run(ligne.url);
    }
    for (const [url, { quantite, intervalle }] of sources) {
      if (aRelever(accessFeeds.byUrl.get(url), quantite, intervalle)) await relever(url, quantite);
    }
  } finally {
    releveEnCours = false;
  }
};

const articlesDe = (ligne: AccessFeedRow): AccessFeedArticle[] => {
  try {
    const lus: unknown = JSON.parse(ligne.articles);
    return Array.isArray(lus) ? (lus as AccessFeedArticle[]) : [];
  } catch {
    return [];
  }
};

/**
 * Le flux d'un élément, tel que la base le garde. La source n'est relevée sur
 * le champ que lorsque la base n'a rien à montrer — un élément neuf, une
 * adresse changée, une quantité relevée — ; sinon, c'est la relève de fond qui
 * la tient à jour, et la page n'attend jamais la source.
 */
export const fluxDe = async ({ url, quantite }: ReglagesFlux): Promise<AccessFeed> => {
  if (!url) badRequest("L'adresse du flux est requise");
  let ligne = accessFeeds.byUrl.get(url);
  const servable = ligne?.fetched_at != null && ligne.quantity >= quantite;
  // Une source qui vient d'échouer n'est pas relancée à chaque visite.
  const essaiPermis = !ligne || !ligne.error
    || Date.now() - Date.parse(ligne.tried_at) >= NOUVEL_ESSAI;
  if (!servable && essaiPermis) {
    const voulue = Math.max(quantite, sourcesSuivies().get(url)?.quantite ?? 0);
    await relever(url, voulue);
    ligne = accessFeeds.byUrl.get(url);
  }
  if (!ligne?.fetched_at) throw new HttpError(502, ligne?.error || "Relève impossible");
  return { articles: articlesDe(ligne).slice(0, quantite), fetched_at: ligne.fetched_at };
};
