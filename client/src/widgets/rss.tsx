import { Anchor, Checkbox, NumberInput, Stack, Text, TextInput } from "@mantine/core";
import { IconRss } from "@tabler/icons-react";
import { useEffect, useState } from "react";
import { api } from "../api";
import classes from "../assets/styles/AccessLink.module.css";
import { avec, nombre, texte } from "./types";
import type { AccessWidget } from "./types";
import {
  ACCESS_FEED_INTERVAL_DEFAUT,
  ACCESS_FEED_INTERVAL_MAX,
  ACCESS_FEED_INTERVAL_MIN,
  ACCESS_FEED_QUANTITE_MAX,
} from "@milo/shared";
import type { AccessFeed, Id } from "@milo/shared";

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

/** La quantité, ramenée dans ses bornes quoi que la configuration porte. */
const quantiteDe = (config: unknown): number =>
  Math.min(
    QUANTITE_MAX,
    Math.max(QUANTITE_MIN, Math.round(nombre(config, QUANTITE, QUANTITE_PAR_DEFAUT))),
  );

type Etat =
  | { phase: "attente" }
  | { phase: "pret"; articles: Article[] }
  | { phase: "erreur"; message: string };

function Flux({ blockId, config }: { blockId: Id; config: unknown }) {
  const url = texte(config, URL_FLUX).trim();
  const quantite = quantiteDe(config);
  const dates = avecDates(config);
  const [etat, setEtat] = useState<Etat>({ phase: "attente" });

  // L'adresse et la quantité sont celles que le serveur lit dans l'élément
  // enregistré : quand elles changent, ce qu'il garde change aussi.
  useEffect(() => {
    if (!url) return;
    // Une réponse arrivée après un changement d'adresse ne doit pas écraser
    // celle de la nouvelle.
    let actif = true;
    const lire = () =>
      api
        .getAccessFeed(blockId)
        .then((flux) => actif && setEtat({ phase: "pret", articles: articlesDe(flux) }))
        .catch((e: Error) => actif && setEtat({ phase: "erreur", message: e.message }));
    setEtat({ phase: "attente" });
    lire();
    const battement = setInterval(lire, RELECTURE);
    return () => {
      actif = false;
      clearInterval(battement);
    };
  }, [blockId, url, quantite]);

  if (!url) {
    return (
      <Text size="sm" c="dimmed">
        Flux RSS
      </Text>
    );
  }
  if (etat.phase === "attente") {
    return (
      <Text size="sm" c="dimmed">
        Chargement du flux…
      </Text>
    );
  }
  if (etat.phase === "erreur") {
    return (
      <Text size="sm" c="red" lineClamp={2} title={url}>
        {etat.message}
      </Text>
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

export const rssWidget: AccessWidget = {
  type: "rss",
  label: "Flux RSS",
  icon: IconRss,
  defaultConfig: {
    [URL_FLUX]: "",
    [QUANTITE]: QUANTITE_PAR_DEFAUT,
    [INTERVALLE]: ACCESS_FEED_INTERVAL_DEFAUT,
    [DATES]: true,
  },
  // Le clic appartient aux articles : chacun ouvre sa page.
  ownClicks: true,

  Display: Flux,

  // Une liste de liens : rien de plus que les liens eux-mêmes.
  marges: () => ({ haute: 0, basse: 0 }),

  Config: ({ config, onChange }) => (
    <Stack gap="xl">
      <TextInput
        label="Adresse du flux"
        placeholder="https://"
        value={texte(config, URL_FLUX)}
        onChange={(e) => onChange(avec(config, URL_FLUX, e.currentTarget.value))}
        autoFocus
      />
      {/* Un champ vidé le temps d'une saisie range la quantité par défaut
          plutôt qu'un zéro, qui viderait l'élément. */}
      <NumberInput
        label="Nombre d'articles affichés"
        placeholder={String(QUANTITE_PAR_DEFAUT)}
        value={nombre(config, QUANTITE, QUANTITE_PAR_DEFAUT)}
        onChange={(valeur) =>
          onChange(avec(config, QUANTITE, valeur === "" ? QUANTITE_PAR_DEFAUT : Number(valeur)))
        }
        min={QUANTITE_MIN}
        max={QUANTITE_MAX}
        allowNegative={false}
        allowDecimal={false}
      />
      {/* Le serveur relève la source à ce rythme et garde ses articles : la
          page lit ce qu'il garde. Même règle que la quantité pour un champ
          vidé. */}
      <NumberInput
        label="Actualisation (minutes)"
        placeholder={String(ACCESS_FEED_INTERVAL_DEFAUT)}
        value={nombre(config, INTERVALLE, ACCESS_FEED_INTERVAL_DEFAUT)}
        onChange={(valeur) =>
          onChange(
            avec(config, INTERVALLE, valeur === "" ? ACCESS_FEED_INTERVAL_DEFAUT : Number(valeur)),
          )
        }
        min={ACCESS_FEED_INTERVAL_MIN}
        max={ACCESS_FEED_INTERVAL_MAX}
        allowNegative={false}
        allowDecimal={false}
      />
      <Checkbox
        label="Afficher la date"
        checked={avecDates(config)}
        onChange={(e) => onChange(avec(config, DATES, e.currentTarget.checked))}
        color="teal"
      />
    </Stack>
  ),
};
