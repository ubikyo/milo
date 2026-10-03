import { Anchor, Badge, Box, Group, Input, NumberInput, Stack, Switch, Text, TextInput } from "@mantine/core";
import { IconRss } from "@tabler/icons-react";
import { useEffect, useState } from "react";
import { api } from "../api";
import classes from "../assets/styles/AccessLink.module.css";
import encart from "../assets/styles/AccessNumero.module.css";
import ProblemeDeConfiguration from "../components/ui/ProblemeDeConfiguration";
import { RED } from "../themes/colors";
import { avec, nombre, texte } from "./types";
import type { AccessWidget, WidgetConfigProps } from "./types";
import {
  ACCESS_FEED_INTERVAL_DEFAUT,
  ACCESS_FEED_INTERVAL_MAX,
  ACCESS_FEED_INTERVAL_MIN,
  ACCESS_FEED_QUANTITE_MAX,
} from "@milo/shared";
import type { AccessFeed, AccessFeedProbe, Id } from "@milo/shared";

// Un flux RSS : les derniers articles d'une source, chacun en lien vers sa
// page. On y suit une actualité — un éditeur, un fournisseur, un service —
// sans quitter la colonne.
//
// Le navigateur ne peut pas lire le flux d'un autre site : le serveur le relève
// à sa place (server/src/lib/feed.ts), à l'intervalle que l'élément règle, et
// en garde les derniers articles en base, déjà lus — RSS, Atom ou JSON. La
// colonne les lit là : ouvrir la page ne sollicite pas la source.
//
// Chaque article se présente comme un lien de la colonne : le clic l'ouvre à
// côté, le clic droit ouvre le tiroir — l'adresse du flux, la quantité
// d'articles et l'intervalle de relève s'y règlent.
//
// Les clés de la configuration sont lues aussi par le serveur (reglagesFlux) :
// elles ne changent pas.

const URL_FLUX = "url";
const QUANTITE = "quantite";
const DATES = "dates";
const INTERVALLE = "intervalle";
const ENCADRE = "encadre";

/** Assez pour suivre une source, assez peu pour ne pas envahir la colonne. */
const QUANTITE_PAR_DEFAUT = 5;
const QUANTITE_MIN = 1;
const QUANTITE_MAX = ACCESS_FEED_QUANTITE_MAX;

/**
 * La colonne relit ce que la base garde à ce rythme : c'est une lecture en
 * base, pas une relève de la source, et elle montre ainsi la dernière relève
 * du serveur sans attendre qu'on recharge la page.
 */
const RELECTURE = 5 * 60_000;

/** Même interligne qu'un lien de la colonne (lien.tsx). */
const LIGNE_DE_LIEN = {
  lineHeight: 1.3,
  display: "-webkit-box" as const,
  width: "fit-content" as const,
  maxWidth: "100%" as const,
};

interface Article {
  titre: string;
  lien: string;
  date: Date | null;
}

/**
 * Ce que certaines sources ajoutent à leurs titres et que la colonne dit déjà
 * ou n'a pas à dire : la mention « [MàJ] » d'un article mis à jour, et la date
 * entre parenthèses en fin de titre — « … (23 septembre 2026) », comme le fait
 * le CERT-FR — que la colonne montre déjà en tête de ligne.
 */
const MISE_A_JOUR = /\[\s*m[aà]j\s*\]/giu;
const DATE_FINALE =
  /\s*\(\s*(?:\d{1,2}(?:er)?\s+\p{L}+\.?\s+\d{4}|\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4}|\d{4}-\d{2}-\d{2})\s*\)\s*$/u;

const nettoyer = (titre: string): string =>
  titre.replace(MISE_A_JOUR, " ").replace(DATE_FINALE, "").replace(/\s+/g, " ").trim();

/**
 * La date en tête de ligne prend toujours la même largeur, celle de la plus
 * longue (« 26 sept. ») : sans quoi chaque titre commencerait ailleurs.
 */
const COLONNE_DATE = {
  display: "inline-block" as const,
  width: "calc(4.2em + 20px)",
  fontVariantNumeric: "tabular-nums" as const,
};

const articlesDe = (flux: AccessFeed): Article[] =>
  flux.articles.map((a) => ({
    titre: a.title,
    lien: a.url,
    date: a.date ? new Date(a.date) : null,
  }));

const formatDate = (date: Date): string =>
  new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short" }).format(date);

/** Une source neuve montre ses dates : c'est ce qui dit si elle vit encore. */
const avecDates = (config: unknown): boolean => {
  const valeur = (config as Record<string, unknown> | null)?.[DATES];
  return valeur === undefined ? true : Boolean(valeur);
};

/** Un flux est nu par défaut : c'est l'encadré qu'on demande, pas l'inverse. */
const estEncadre = (config: unknown): boolean =>
  Boolean((config as Record<string, unknown> | null)?.[ENCADRE]);

/** La quantité, ramenée dans ses bornes quoi que la configuration porte. */
const quantiteDe = (config: unknown): number =>
  Math.min(
    QUANTITE_MAX,
    Math.max(QUANTITE_MIN, Math.round(nombre(config, QUANTITE, QUANTITE_PAR_DEFAUT))),
  );

/**
 * Les derniers articles montrés par chaque élément, pour la durée de la page.
 * Revenu sur la catégorie, ou passé d'un mode à l'autre, l'élément se remonte :
 * il reprend aussitôt ce qu'il montrait, et la relecture le met à jour sans
 * rien faire sauter. La clé porte l'adresse : un flux changé ne montre pas les
 * articles de l'ancien.
 */
const dejaLus = new Map<string, Article[]>();
const cleDe = (blockId: Id, url: string) => `${blockId}|${url}`;

/** Une adresse de flux que le serveur peut relever : en http ou en https. */
const adresseLisible = (url: string): boolean => {
  try {
    return ["http:", "https:"].includes(new URL(url).protocol);
  } catch {
    return false;
  }
};

type Etat =
  | { phase: "attente" }
  | { phase: "pret"; articles: Article[] }
  | { phase: "erreur"; message: string };

function Flux({ blockId, config }: { blockId: Id; config: unknown }) {
  const contenu = <Articles blockId={blockId} config={config} />;
  if (!estEncadre(config)) return contenu;
  return (
    <Box className={encart.encart} style={{ border: "none" }}>
      {contenu}
    </Box>
  );
}

function Articles({ blockId, config }: { blockId: Id; config: unknown }) {
  const url = texte(config, URL_FLUX).trim();
  const quantite = quantiteDe(config);
  const dates = avecDates(config);
  const [etat, setEtat] = useState<Etat>(() => {
    const articles = dejaLus.get(cleDe(blockId, url));
    return articles ? { phase: "pret", articles } : { phase: "attente" };
  });

  // L'adresse et la quantité sont celles que le serveur lit dans l'élément
  // enregistré : quand elles changent, ce qu'il garde change aussi.
  useEffect(() => {
    if (!adresseLisible(url)) return;
    // Une réponse arrivée après un changement d'adresse ne doit pas écraser
    // celle de la nouvelle.
    let actif = true;
    const cle = cleDe(blockId, url);
    const lire = () =>
      api
        .getAccessFeed(blockId)
        .then((flux) => {
          const articles = articlesDe(flux);
          dejaLus.set(cle, articles);
          if (actif) setEtat({ phase: "pret", articles });
        })
        .catch((e: Error) => actif && setEtat({ phase: "erreur", message: e.message }));
    // Déjà lus, les articles restent à l'écran le temps de la relecture.
    const connus = dejaLus.get(cle);
    setEtat(connus ? { phase: "pret", articles: connus } : { phase: "attente" });
    lire();
    const battement = setInterval(lire, RELECTURE);
    return () => {
      actif = false;
      clearInterval(battement);
    };
  }, [blockId, url, quantite]);

  // Sans adresse de flux lisible — vide, ou qui n'est pas en http(s) —, le
  // widget est à revoir : le triangle jaune, comme une liste de demandes mal
  // réglée.
  if (!adresseLisible(url)) return <ProblemeDeConfiguration widget={rssWidget.label} />;
  // Le chargement tient déjà la hauteur des articles attendus, ligne pour
  // ligne : sans cela, chaque flux grandirait d'un coup à son arrivée et
  // repousserait ce qui le suit, l'un après l'autre.
  if (etat.phase === "attente") {
    return (
      <Stack gap={0}>
        {Array.from({ length: quantite }, (_, i) => (
          <Text
            key={i}
            size="sm"
            c="dimmed"
            lineClamp={1}
            // Le retrait d'un lien (AccessLink.module.css), sans son survol :
            // il n'y a encore rien à ouvrir.
            style={{ ...LIGNE_DE_LIEN, padding: 3, marginInline: -3 }}
          >
            {i === 0 ? "Chargement du flux…" : "\u00a0"}
          </Text>
        ))}
      </Stack>
    );
  }
  // La source ne répond pas, ou ce qu'elle rend n'est pas un flux : l'adresse
  // est à revoir aussi. Ce que le serveur a vu se lit au survol.
  if (etat.phase === "erreur") {
    return (
      <div title={etat.message}>
        <ProblemeDeConfiguration widget={rssWidget.label} />
      </div>
    );
  }
  if (!etat.articles.length) {
    return (
      <Text size="sm" c="dimmed">
        Aucun article
      </Text>
    );
  }

  return (
    <Stack gap={0}>
      {/* Le titre se nettoie à l'affichage plutôt qu'à la lecture : les
          articles déjà lus profitent ainsi d'un nettoyage revu, sans attendre
          la prochaine relève. */}
      {etat.articles.slice(0, quantite).map((a, i) => (
        <Anchor
          key={`${a.lien}-${i}`}
          href={a.lien || undefined}
          target="_blank"
          rel="noopener noreferrer"
          size="sm"
          style={LIGNE_DE_LIEN}
          lineClamp={1}
          c="var(--mantine-color-text)"
          underline="never"
          className={classes.lien}
          title={nettoyer(a.titre) || "Sans titre"}
        >
          {dates && a.date && (
            <Text span size="xs" c="dimmed" style={COLONNE_DATE}>
              {formatDate(a.date)}
            </Text>
          )}
          {nettoyer(a.titre) || "Sans titre"}
        </Anchor>
      ))}
    </Stack>
  );
}

/** Le temps de finir de taper l'adresse avant de la sonder. */
const ATTENTE_SONDE = 600;

/** La place de l'étiquette dans le champ : celle de la plus longue, « Format invalide ». */
const LARGEUR_ETIQUETTE = 120;

/** Les adresses déjà sondées, pour la durée de la page. */
const sondees = new Map<string, AccessFeedProbe>();

/**
 * Ce que donne l'adresse saisie, sondée par le serveur : injoignable, pas un
 * flux, ou le format du flux. Rien tant que l'adresse n'est pas lisible.
 */
function useSonde(url: string): AccessFeedProbe | null {
  const [sonde, setSonde] = useState<AccessFeedProbe | null>(() => sondees.get(url) ?? null);
  useEffect(() => {
    if (!adresseLisible(url)) {
      setSonde(null);
      return;
    }
    const connue = sondees.get(url);
    setSonde(connue ?? null);
    if (connue) return;
    let actif = true;
    const minuterie = setTimeout(() => {
      api
        .probeAccessFeed(url)
        .then((s) => {
          sondees.set(url, s);
          if (actif) setSonde(s);
        })
        .catch((e: Error) => actif && setSonde({ state: "injoignable", message: e.message }));
    }, ATTENTE_SONDE);
    return () => {
      actif = false;
      clearTimeout(minuterie);
    };
  }, [url]);
  return sonde;
}

function Etiquette({ sonde }: { sonde: AccessFeedProbe }) {
  const ok = sonde.state === "ok";
  // L'étiquette des états de l'application (EntraTab) : pleine, verte ou rouge.
  return (
    <Badge
      color={ok ? "green" : RED}
      variant="filled"
      size="sm"
      radius="sm"
      tt="none"
      fw={600}
      title={ok ? undefined : sonde.message}
      style={{ flexShrink: 0 }}
    >
      {ok ? sonde.format : sonde.state === "injoignable" ? "Injoignable" : "Format invalide"}
    </Badge>
  );
}

function Reglages({ config, onChange }: WidgetConfigProps) {
  const url = texte(config, URL_FLUX);
  const sonde = useSonde(url.trim());
  return (
    <Stack gap="xl">
      {/* L'étiquette se tient dans le champ, à droite : on lit le verdict sur
          l'adresse même. */}
      <TextInput
        label="Adresse du flux"
        placeholder="https://"
        value={url}
        onChange={(e) => onChange(avec(config, URL_FLUX, e.currentTarget.value))}
        rightSection={sonde && <Etiquette sonde={sonde} />}
        rightSectionWidth={sonde ? LARGEUR_ETIQUETTE : undefined}
        rightSectionPointerEvents={sonde?.state === "ok" ? "none" : "all"}
        rightSectionProps={{ style: { justifyContent: "flex-end", paddingRight: 8 } }}
        autoFocus
      />
      {/* Un champ vidé le temps d'une saisie range la valeur par défaut
          plutôt qu'un zéro, qui viderait l'élément. Le serveur relève la
          source au rythme de l'actualisation et garde ses articles : la page
          lit ce qu'il garde. */}
      <Group align="flex-start">
        <NumberInput
          label="Articles affichés"
          placeholder={String(QUANTITE_PAR_DEFAUT)}
          value={nombre(config, QUANTITE, QUANTITE_PAR_DEFAUT)}
          onChange={(valeur) =>
            onChange(avec(config, QUANTITE, valeur === "" ? QUANTITE_PAR_DEFAUT : Number(valeur)))
          }
          min={QUANTITE_MIN}
          max={QUANTITE_MAX}
          allowNegative={false}
          allowDecimal={false}
          w={120}
        />
        <NumberInput
          label="Actualisation"
          placeholder={String(ACCESS_FEED_INTERVAL_DEFAUT)}
          value={nombre(config, INTERVALLE, ACCESS_FEED_INTERVAL_DEFAUT)}
          onChange={(valeur) =>
            onChange(
              avec(config, INTERVALLE, valeur === "" ? ACCESS_FEED_INTERVAL_DEFAUT : Number(valeur)),
            )
          }
          min={ACCESS_FEED_INTERVAL_MIN}
          max={ACCESS_FEED_INTERVAL_MAX}
          suffix=" min"
          allowNegative={false}
          allowDecimal={false}
          w={120}
        />
      </Group>
      <Input.Wrapper label="Options">
        <Stack gap="xs" mt={6}>
          <Switch
            label="Afficher la date"
            checked={avecDates(config)}
            onChange={(e) => onChange(avec(config, DATES, e.currentTarget.checked))}
            color="teal"
          />
          <Switch
            label="Encadrer"
            checked={estEncadre(config)}
            onChange={(e) => onChange(avec(config, ENCADRE, e.currentTarget.checked))}
            color="teal"
          />
        </Stack>
      </Input.Wrapper>
    </Stack>
  );
}
export const rssWidget: AccessWidget = {
  type: "rss",
  kind: "common",
  label: "Flux RSS",
  icon: IconRss,
  defaultConfig: {
    [URL_FLUX]: "",
    [QUANTITE]: QUANTITE_PAR_DEFAUT,
    [INTERVALLE]: ACCESS_FEED_INTERVAL_DEFAUT,
    [DATES]: true,
    [ENCADRE]: false,
  },
  // Le clic appartient aux articles : chacun ouvre sa page.
  ownClicks: true,

  Display: Flux,

  // Une liste de liens : rien de plus que les liens eux-mêmes.
  marges: () => ({ haute: 0, basse: 0 }),

  Config: Reglages,
};
