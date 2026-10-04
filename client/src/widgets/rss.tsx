import {
  Anchor,
  Badge,
  Box,
  Group,
  Input,
  Menu,
  NumberInput,
  Stack,
  Switch,
  Text,
  TextInput,
} from "@mantine/core";
import { IconRss, IconTrash } from "@tabler/icons-react";
import { Fragment, useEffect, useState } from "react";
import type { DragEvent } from "react";
import { api } from "../api";
import classes from "../assets/styles/AccessLink.module.css";
import encart from "../assets/styles/AccessNumero.module.css";
import AddButton from "../components/ui/AddButton";
import {
  ARRONDI,
  ListeVide,
  Poignee,
  RETRAIT_NOM,
  deplacer,
  styleChampNom,
  styleLigne,
} from "../components/ui/LignesDuTiroir";
import PointMenu, { positionDuMenu, type PointMenuPosition } from "../components/ui/PointMenu";
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

// Un flux RSS : les derniers articles d'une ou de plusieurs sources, chacun en
// lien vers sa page. On y suit une actualité — un éditeur, un fournisseur, un
// service — sans quitter la colonne. Les sources peuvent mêler les formats
// (RSS, Atom, JSON) : leurs articles se mêlent par date, ou se regroupent par
// source, dans l'ordre où le tiroir les range.
//
// Le navigateur ne peut pas lire le flux d'un autre site : le serveur le relève
// à sa place (server/src/lib/feed.ts), à l'intervalle que l'élément règle, et
// en garde les derniers articles en base, déjà lus — RSS, Atom ou JSON. La
// colonne les lit là : ouvrir la page ne sollicite pas la source.
//
// Chaque article se présente comme un lien de la colonne : le clic l'ouvre à
// côté, le clic droit ouvre le tiroir — les sources et leur ordre, la
// quantité d'articles et l'intervalle de relève s'y règlent.
//
// Les clés de la configuration sont lues aussi par le serveur (reglagesFlux) :
// elles ne changent pas.

/** Les sources, dans l'ordre : une entrée « { url } » par ligne du tiroir. */
const SOURCES = "sources";
/** L'adresse unique d'avant la liste, relue tant que la liste n'a pas été enregistrée. */
const URL_FLUX = "url";
/** Vrai quand les articles se regroupent par source plutôt que de se mêler par date. */
const REGROUPER = "regrouper";
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

/** Une source lue : ses articles, ou ce qui a empêché de les lire. */
interface Source {
  url: string;
  articles: Article[];
  erreur: string | null;
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

const sourcesLues = (flux: AccessFeed): Source[] =>
  flux.sources.map((s) => ({
    url: s.url,
    erreur: s.error,
    articles: s.articles.map((a) => ({
      titre: a.title,
      lien: a.url,
      date: a.date ? new Date(a.date) : null,
    })),
  }));

/**
 * Les articles que chaque source montre, « quantite » en tout : chacune
 * fournit le sien à tour de rôle, dans l'ordre de la liste — cinq articles
 * pour deux sources en prennent trois à la première, deux à la seconde. Une
 * source à court laisse sa part aux suivantes.
 */
const repartis = (sources: Source[], quantite: number): Article[][] => {
  const parts: Article[][] = sources.map(() => []);
  let pris = 0;
  for (let tour = 0; pris < quantite; tour++) {
    let fourni = false;
    sources.forEach((s, i) => {
      if (pris >= quantite || tour >= s.articles.length) return;
      parts[i]!.push(s.articles[tour]!);
      pris++;
      fourni = true;
    });
    if (!fourni) break;
  }
  return parts;
};

/**
 * Les articles retenus de toutes les sources, du plus récent au plus ancien.
 * Ceux qui n'ont pas de date suivent, dans l'ordre des sources.
 */
const melanges = (parts: Article[][]): Article[] => {
  const temps = (a: Article) => a.date?.getTime() ?? -Infinity;
  return parts.flat().sort((a, b) => temps(b) - temps(a));
};

/** Le nom court d'une source : son hôte, sans « www. ». */
const nomDe = (url: string): string => {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
};

const formatDate = (date: Date): string =>
  new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short" }).format(date);

/** Une source neuve montre ses dates : c'est ce qui dit si elle vit encore. */
const avecDates = (config: unknown): boolean => {
  const valeur = (config as Record<string, unknown> | null)?.[DATES];
  return valeur === undefined ? true : Boolean(valeur);
};

/** Les articles se mêlent par date tant qu'on ne demande pas de les regrouper. */
const estRegroupe = (config: unknown): boolean =>
  Boolean((config as Record<string, unknown> | null)?.[REGROUPER]);

/**
 * Les adresses des lignes du tiroir, telles que saisies — vides comprises. Un
 * élément rangé avant la liste n'a que son « url ».
 */
const lignesDe = (config: unknown): string[] => {
  const liste = (config as Record<string, unknown> | null)?.[SOURCES];
  if (!Array.isArray(liste)) {
    const url = texte(config, URL_FLUX);
    return url.trim() ? [url] : [];
  }
  return liste.map((s) => texte(s, "url"));
};

/** Les adresses à relever : sans blanc ni doublon, dans l'ordre — comme le serveur les lit. */
const adressesDe = (config: unknown): string[] => [
  ...new Set(lignesDe(config).map((u) => u.trim()).filter(Boolean)),
];

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
const dejaLus = new Map<string, Source[]>();
const cleDe = (blockId: Id, urls: string[]) => `${blockId}|${urls.join("\n")}`;

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
  | { phase: "pret"; sources: Source[] }
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
  const urls = adressesDe(config);
  const cle = cleDe(blockId, urls);
  const quantite = quantiteDe(config);
  const dates = avecDates(config);
  const regroupe = estRegroupe(config) && urls.length > 1;
  const lisibles = urls.length > 0 && urls.every(adresseLisible);
  const [etat, setEtat] = useState<Etat>(() => {
    const sources = dejaLus.get(cle);
    return sources ? { phase: "pret", sources } : { phase: "attente" };
  });

  // Les adresses et la quantité sont celles que le serveur lit dans l'élément
  // enregistré : quand elles changent, ce qu'il garde change aussi.
  useEffect(() => {
    if (!lisibles) return;
    // Une réponse arrivée après un changement d'adresse ne doit pas écraser
    // celle de la nouvelle.
    let actif = true;
    const lire = () =>
      api
        .getAccessFeed(blockId)
        .then((flux) => {
          const sources = sourcesLues(flux);
          dejaLus.set(cle, sources);
          if (actif) setEtat({ phase: "pret", sources });
        })
        .catch((e: Error) => actif && setEtat({ phase: "erreur", message: e.message }));
    // Déjà lus, les articles restent à l'écran le temps de la relecture.
    const connus = dejaLus.get(cle);
    setEtat(connus ? { phase: "pret", sources: connus } : { phase: "attente" });
    lire();
    const battement = setInterval(lire, RELECTURE);
    return () => {
      actif = false;
      clearInterval(battement);
    };
  }, [blockId, cle, lisibles, quantite]);

  // Sans adresse de flux lisible — aucune, ou une qui n'est pas en http(s) —,
  // le widget est à revoir : le triangle jaune, comme une liste de demandes
  // mal réglée.
  if (!lisibles) return <ProblemeDeConfiguration widget={rssWidget.label} />;
  // Le chargement tient déjà la hauteur des articles attendus, ligne pour
  // ligne : sans cela, chaque flux grandirait d'un coup à son arrivée et
  // repousserait ce qui le suit, l'un après l'autre.
  if (etat.phase === "attente") {
    // Regroupés, chaque source qui a sa part ajoute la ligne de son nom.
    const attendues = regroupe ? quantite + Math.min(urls.length, quantite) : quantite;
    return (
      <Stack gap={0}>
        {Array.from({ length: attendues }, (_, i) => (
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
  // Aucune source ne répond, ou ce qu'elles rendent n'est pas un flux : les
  // adresses sont à revoir aussi. Ce que le serveur a vu se lit au survol.
  // Une source en échec parmi d'autres qui répondent se tait simplement.
  const enEchec = etat.phase === "erreur" ? [] : etat.sources.filter((s) => s.erreur);
  if (etat.phase === "erreur" || enEchec.length === etat.sources.length) {
    const message =
      etat.phase === "erreur"
        ? etat.message
        : enEchec.map((s) => `${nomDe(s.url)} : ${s.erreur}`).join("\n");
    return (
      <div title={message}>
        <ProblemeDeConfiguration widget={rssWidget.label} />
      </div>
    );
  }

  const avecSource = etat.sources.length > 1;
  const lien = (a: Article, i: number, source?: string) => {
    const titre = nettoyer(a.titre) || "Sans titre";
    return (
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
        // Mêlés, les articles de plusieurs sources disent la leur au survol.
        title={source ? `${titre} — ${source}` : titre}
      >
        {dates && a.date && (
          <Text span size="xs" c="dimmed" style={COLONNE_DATE}>
            {formatDate(a.date)}
          </Text>
        )}
        {titre}
      </Anchor>
    );
  };

  // Le titre se nettoie à l'affichage plutôt qu'à la lecture : les articles
  // déjà lus profitent ainsi d'un nettoyage revu, sans attendre la prochaine
  // relève.
  const parts = repartis(etat.sources, quantite);
  if (regroupe) {
    const groupes = etat.sources
      .map((s, i) => ({ url: s.url, articles: parts[i]! }))
      .filter((s) => s.articles.length);
    if (!groupes.length) return <AucunArticle />;
    return (
      <Stack gap={0}>
        {groupes.map((s, g) => (
          <Fragment key={s.url}>
            <Text
              size="xs"
              c="dimmed"
              fw={600}
              lineClamp={1}
              title={s.url}
              mt={g === 0 ? 0 : 6}
              mb={2}
            >
              {nomDe(s.url)}
            </Text>
            {s.articles.map((a, i) => lien(a, i))}
          </Fragment>
        ))}
      </Stack>
    );
  }

  const articles = melanges(parts);
  if (!articles.length) return <AucunArticle />;
  const sourceDe = new Map(
    etat.sources.flatMap((s) => s.articles.map((a) => [a, nomDe(s.url)] as const)),
  );
  return (
    <Stack gap={0}>
      {articles.map((a, i) => lien(a, i, avecSource ? sourceDe.get(a) : undefined))}
    </Stack>
  );
}

function AucunArticle() {
  return (
    <Text size="sm" c="dimmed">
      Aucun article
    </Text>
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

interface LigneSourceProps {
  url: string;
  rang: number;
  total: number;
  tenue: boolean;
  aRemplir: boolean;
  onChange: (url: string) => void;
  onBlur: () => void;
  onDragStart: () => void;
  onDragEnd: () => void;
  onDragOver: (e: DragEvent<HTMLElement>) => void;
  onContextMenu: (position: PointMenuPosition) => void;
}

/**
 * Une source dans le tiroir, comme une boîte de réception d'une liste de
 * tickets : sa poignée, son adresse à même la ligne, et au bout le verdict de
 * la sonde — le format du flux, ou ce qui ne va pas.
 */
function LigneSource({
  url,
  rang,
  total,
  tenue,
  aRemplir,
  onChange,
  onBlur,
  onDragStart,
  onDragEnd,
  onDragOver,
  onContextMenu,
}: LigneSourceProps) {
  const sonde = useSonde(url.trim());
  const [saisie, setSaisie] = useState(false);
  return (
    <Group
      gap="sm"
      wrap="nowrap"
      onDragOver={onDragOver}
      onDrop={(e) => e.preventDefault()}
      onContextMenu={(e) => onContextMenu(positionDuMenu(e))}
      style={styleLigne(rang, total, tenue)}
    >
      <Poignee
        label={`Déplacer la source ${url}`}
        active={Boolean(url.trim())}
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
      />
      <TextInput
        size="sm"
        radius={ARRONDI}
        style={{ flex: 1, minWidth: 0, marginLeft: -RETRAIT_NOM }}
        styles={{ input: styleChampNom(saisie) }}
        placeholder="https://"
        aria-label="Adresse du flux"
        value={url}
        onChange={(e) => onChange(e.currentTarget.value)}
        autoFocus={aRemplir}
        onFocus={() => setSaisie(true)}
        onBlur={() => {
          setSaisie(false);
          onBlur();
        }}
      />
      {sonde && (
        <Box
          style={{
            width: LARGEUR_ETIQUETTE,
            flexShrink: 0,
            display: "flex",
            justifyContent: "flex-end",
            paddingRight: 4,
          }}
        >
          <Etiquette sonde={sonde} />
        </Box>
      )}
    </Group>
  );
}

/**
 * Les sources du flux, en lignes : la poignée les range — c'est l'ordre des
 * groupes quand les articles se regroupent par source —, le clic droit en
 * retire une, « Ajouter » en pose une vide au bout, qui s'efface si on la
 * quitte sans rien y écrire.
 */
function ChampSources({ config, onChange }: WidgetConfigProps) {
  const lignes = lignesDe(config);
  /** Le rang de la ligne qu'on glisse. */
  const [tenue, setTenue] = useState<number | null>(null);
  /** La ligne qu'on vient d'ajouter : son adresse prend le focus. */
  const [aRemplir, setARemplir] = useState<number | null>(null);
  const [menu, setMenu] = useState<{ rang: number; position: PointMenuPosition } | null>(null);

  const poser = (suivantes: string[]) =>
    onChange(avec(config, SOURCES, suivantes.map((url) => ({ url }))));
  const retirer = (rang: number) => poser(lignes.filter((_, i) => i !== rang));

  const ajouter = () => {
    poser([...lignes, ""]);
    setARemplir(lignes.length);
  };

  // La ligne tenue prend la place de celle qu'elle survole.
  const survoler = (e: DragEvent<HTMLElement>, rang: number) => {
    if (tenue === null) return;
    e.preventDefault();
    const suivante = deplacer(lignes, tenue, rang);
    if (!suivante) return;
    setTenue(rang);
    poser(suivante);
  };

  return (
    <Input.Wrapper label="Sources">
      {lignes.length === 0 ? (
        <ListeVide icon={IconRss} message="Aucun flux" />
      ) : (
        <Stack gap={1}>
          {lignes.map((url, rang) => (
            <LigneSource
              key={rang}
              url={url}
              rang={rang}
              total={lignes.length}
              tenue={tenue === rang}
              aRemplir={aRemplir === rang}
              onChange={(valeur) => poser(lignes.map((u, i) => (i === rang ? valeur : u)))}
              onBlur={() => {
                setARemplir(null);
                // Une ligne quittée sans adresse s'efface.
                if (!url.trim()) retirer(rang);
              }}
              onDragStart={() => setTenue(rang)}
              onDragEnd={() => setTenue(null)}
              onDragOver={(e) => survoler(e, rang)}
              onContextMenu={(position) => setMenu({ rang, position })}
            />
          ))}
        </Stack>
      )}

      {/* Au plus près de la liste qu'il allonge. */}
      <AddButton label="Ajouter un flux" onClick={ajouter} mt={4} />

      {menu && (
        <PointMenu position={menu.position} onClose={() => setMenu(null)}>
          <Menu.Item
            color={RED}
            leftSection={<IconTrash size={16} />}
            onClick={() => {
              retirer(menu.rang);
              setMenu(null);
            }}
          >
            Supprimer
          </Menu.Item>
        </PointMenu>
      )}
    </Input.Wrapper>
  );
}

function Reglages({ config, onChange }: WidgetConfigProps) {
  return (
    <Stack gap="xl">
      <ChampSources config={config} onChange={onChange} />
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
          {/* Les articles affichés se partagent entre les sources, à tour
              de rôle : mêlés, ils se rangent par date ; regroupés, chaque
              source montre sa part, dans l'ordre de la liste. */}
          <Switch
            label="Regrouper les articles par source"
            checked={estRegroupe(config)}
            onChange={(e) => onChange(avec(config, REGROUPER, e.currentTarget.checked))}
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
    [SOURCES]: [],
    [QUANTITE]: QUANTITE_PAR_DEFAUT,
    [INTERVALLE]: ACCESS_FEED_INTERVAL_DEFAUT,
    [DATES]: true,
    [REGROUPER]: false,
    [ENCADRE]: false,
  },
  // Le clic appartient aux articles : chacun ouvre sa page.
  ownClicks: true,

  Display: Flux,

  // Une liste de liens : rien de plus que les liens eux-mêmes.
  marges: () => ({ haute: 0, basse: 0 }),

  // Il dessine lui-même son cadre, réglé dans le bloc « Apparence » du tiroir.
  cadrePropre: true,
  Config: Reglages,
};
