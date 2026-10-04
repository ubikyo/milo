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
import inset from "../assets/styles/AccessNumber.module.css";
import AddButton from "../components/ui/AddButton";
import {
  ROUNDING,
  EmptyList,
  Handle,
  NAME_INSET,
  move,
  nameFieldStyle,
  rowStyle,
} from "../components/ui/DrawerRows";
import PointMenu, { menuPosition, type PointMenuPosition } from "../components/ui/PointMenu";
import ConfigurationProblem from "../components/ui/ConfigurationProblem";
import { RED } from "../themes/colors";
import { withField, count, text } from "./types";
import type { AccessWidget, WidgetConfigProps } from "./types";
import {
  ACCESS_FEED_INTERVAL_DEFAULT,
  ACCESS_FEED_INTERVAL_MAX,
  ACCESS_FEED_INTERVAL_MIN,
  ACCESS_FEED_QUANTITY_MAX,
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
const FEED_URL = "url";
/** Vrai quand les articles se regroupent par source plutôt que de se mêler par date. */
const GROUP = "group";
const QUANTITY = "count";
const DATES = "dates";
const INTERVAL = "interval";
const FRAMED = "framed";

/** Assez pour suivre une source, assez peu pour ne pas envahir la colonne. */
const QUANTITY_DEFAULT = 5;
const QUANTITY_MIN = 1;
const QUANTITY_MAX = ACCESS_FEED_QUANTITY_MAX;

/**
 * La colonne relit ce que la base garde à ce rythme : c'est une lecture en
 * base, pas une relève de la source, et elle montre ainsi la dernière relève
 * du serveur sans attendre qu'on recharge la page.
 */
const RELOAD_INTERVAL = 5 * 60_000;

/** Même interligne qu'un lien de la colonne (lien.tsx). */
const LINK_ROW = {
  lineHeight: 1.3,
  display: "-webkit-box" as const,
  width: "fit-content" as const,
  maxWidth: "100%" as const,
};

interface Article {
  title: string;
  link: string;
  date: Date | null;
}

/** Une source lue : ses articles, ou ce qui a empêché de les lire. */
interface Source {
  url: string;
  articles: Article[];
  error: string | null;
}

/**
 * Ce que certaines sources ajoutent à leurs titres et que la colonne dit déjà
 * ou n'a pas à dire : la mention « [MàJ] » d'un article mis à jour, et la date
 * entre parenthèses en fin de titre — « … (23 septembre 2026) », comme le fait
 * le CERT-FR — que la colonne montre déjà en tête de ligne.
 */
const UPDATED = /\[\s*m[aà]j\s*\]/giu;
const TRAILING_DATE =
  /\s*\(\s*(?:\d{1,2}(?:er)?\s+\p{L}+\.?\s+\d{4}|\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4}|\d{4}-\d{2}-\d{2})\s*\)\s*$/u;

const clean = (title: string): string =>
  title.replace(UPDATED, " ").replace(TRAILING_DATE, "").replace(/\s+/g, " ").trim();

/**
 * La date en tête de ligne prend toujours la même largeur, celle de la plus
 * longue (« 26 sept. ») : sans quoi chaque titre commencerait ailleurs.
 */
const DATE_COLUMN = {
  display: "inline-block" as const,
  width: "calc(4.2em + 20px)",
  fontVariantNumeric: "tabular-nums" as const,
};

const sourcesRead = (feed: AccessFeed): Source[] =>
  feed.sources.map((s) => ({
    url: s.url,
    error: s.error,
    articles: s.articles.map((a) => ({
      title: a.title,
      link: a.url,
      date: a.date ? new Date(a.date) : null,
    })),
  }));

/**
 * Les articles que chaque source montre, « quantite » en tout : chacune
 * fournit le sien à tour de rôle, dans l'ordre de la liste — cinq articles
 * pour deux sources en prennent trois à la première, deux à la seconde. Une
 * source à court laisse sa part aux suivantes.
 */
const distributed = (sources: Source[], quantity: number): Article[][] => {
  const parts: Article[][] = sources.map(() => []);
  let taken = 0;
  for (let round = 0; taken < quantity; round++) {
    let provided = false;
    sources.forEach((s, i) => {
      if (taken >= quantity || round >= s.articles.length) return;
      parts[i]!.push(s.articles[round]!);
      taken++;
      provided = true;
    });
    if (!provided) break;
  }
  return parts;
};

/**
 * Les articles retenus de toutes les sources, du plus récent au plus ancien.
 * Ceux qui n'ont pas de date suivent, dans l'ordre des sources.
 */
const interleave = (parts: Article[][]): Article[] => {
  const articleTime = (a: Article) => a.date?.getTime() ?? -Infinity;
  return parts.flat().sort((a, b) => articleTime(b) - articleTime(a));
};

/** Le nom court d'une source : son hôte, sans « www. ». */
const nameOf = (url: string): string => {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
};

const formatDate = (date: Date): string =>
  new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short" }).format(date);

/** Une source neuve montre ses dates : c'est ce qui dit si elle vit encore. */
const withDates = (config: unknown): boolean => {
  const value = (config as Record<string, unknown> | null)?.[DATES];
  return value === undefined ? true : Boolean(value);
};

/** Les articles se mêlent par date tant qu'on ne demande pas de les regrouper. */
const isGrouped = (config: unknown): boolean =>
  Boolean((config as Record<string, unknown> | null)?.[GROUP]);

/**
 * Les adresses des lignes du tiroir, telles que saisies — vides comprises. Un
 * élément rangé avant la liste n'a que son « url ».
 */
const rowsOf = (config: unknown): string[] => {
  const list = (config as Record<string, unknown> | null)?.[SOURCES];
  if (!Array.isArray(list)) {
    const url = text(config, FEED_URL);
    return url.trim() ? [url] : [];
  }
  return list.map((s) => text(s, "url"));
};

/** Les adresses à relever : sans blanc ni doublon, dans l'ordre — comme le serveur les lit. */
const addressesOf = (config: unknown): string[] => [
  ...new Set(rowsOf(config).map((u) => u.trim()).filter(Boolean)),
];

/** Un flux est nu par défaut : c'est l'encadré qu'on demande, pas l'inverse. */
const isFramed = (config: unknown): boolean =>
  Boolean((config as Record<string, unknown> | null)?.[FRAMED]);

/** La quantité, ramenée dans ses bornes quoi que la configuration porte. */
const quantityOf = (config: unknown): number =>
  Math.min(
    QUANTITY_MAX,
    Math.max(QUANTITY_MIN, Math.round(count(config, QUANTITY, QUANTITY_DEFAULT))),
  );

/**
 * Les derniers articles montrés par chaque élément, pour la durée de la page.
 * Revenu sur la catégorie, ou passé d'un mode à l'autre, l'élément se remonte :
 * il reprend aussitôt ce qu'il montrait, et la relecture le met à jour sans
 * rien faire sauter. La clé porte l'adresse : un flux changé ne montre pas les
 * articles de l'ancien.
 */
const alreadyRead = new Map<string, Source[]>();
const keyOf = (blockId: Id, urls: string[]) => `${blockId}|${urls.join("\n")}`;

/** Une adresse de flux que le serveur peut relever : en http ou en https. */
const readableAddress = (url: string): boolean => {
  try {
    return ["http:", "https:"].includes(new URL(url).protocol);
  } catch {
    return false;
  }
};

type State =
  | { phase: "loading" }
  | { phase: "ready"; sources: Source[] }
  | { phase: "error"; message: string };

function Feed({ blockId, config }: { blockId: Id; config: unknown }) {
  const content = <Articles blockId={blockId} config={config} />;
  if (!isFramed(config)) return content;
  return (
    <Box className={inset.inset} style={{ border: "none" }}>
      {content}
    </Box>
  );
}

function Articles({ blockId, config }: { blockId: Id; config: unknown }) {
  const urls = addressesOf(config);
  const key = keyOf(blockId, urls);
  const quantity = quantityOf(config);
  const dates = withDates(config);
  const grouped = isGrouped(config) && urls.length > 1;
  const allReadable = urls.length > 0 && urls.every(readableAddress);
  const [state, setState] = useState<State>(() => {
    const sources = alreadyRead.get(key);
    return sources ? { phase: "ready", sources } : { phase: "loading" };
  });

  // Les adresses et la quantité sont celles que le serveur lit dans l'élément
  // enregistré : quand elles changent, ce qu'il garde change aussi.
  useEffect(() => {
    if (!allReadable) return;
    // Une réponse arrivée après un changement d'adresse ne doit pas écraser
    // celle de la nouvelle.
    let active = true;
    const read = () =>
      api
        .getAccessFeed(blockId)
        .then((feed) => {
          const sources = sourcesRead(feed);
          alreadyRead.set(key, sources);
          if (active) setState({ phase: "ready", sources });
        })
        .catch((e: Error) => active && setState({ phase: "error", message: e.message }));
    // Déjà lus, les articles restent à l'écran le temps de la relecture.
    const known = alreadyRead.get(key);
    setState(known ? { phase: "ready", sources: known } : { phase: "loading" });
    read();
    const heartbeat = setInterval(read, RELOAD_INTERVAL);
    return () => {
      active = false;
      clearInterval(heartbeat);
    };
  }, [blockId, key, allReadable, quantity]);

  // Sans adresse de flux lisible — aucune, ou une qui n'est pas en http(s) —,
  // le widget est à revoir : le triangle jaune, comme une liste de demandes
  // mal réglée.
  if (!allReadable) return <ConfigurationProblem widget={rssWidget.label} />;
  // Le chargement tient déjà la hauteur des articles attendus, ligne pour
  // ligne : sans cela, chaque flux grandirait d'un coup à son arrivée et
  // repousserait ce qui le suit, l'un après l'autre.
  if (state.phase === "loading") {
    // Regroupés, chaque source qui a sa part ajoute la ligne de son nom.
    const expected = grouped ? quantity + Math.min(urls.length, quantity) : quantity;
    return (
      <Stack gap={0}>
        {Array.from({ length: expected }, (_, i) => (
          <Text
            key={i}
            size="sm"
            c="dimmed"
            lineClamp={1}
            // Le retrait d'un lien (AccessLink.module.css), sans son survol :
            // il n'y a encore rien à ouvrir.
            style={{ ...LINK_ROW, padding: 3, marginInline: -3 }}
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
  const failing = state.phase === "error" ? [] : state.sources.filter((s) => s.error);
  if (state.phase === "error" || failing.length === state.sources.length) {
    const message =
      state.phase === "error"
        ? state.message
        : failing.map((s) => `${nameOf(s.url)} : ${s.error}`).join("\n");
    return (
      <div title={message}>
        <ConfigurationProblem widget={rssWidget.label} />
      </div>
    );
  }

  const withSource = state.sources.length > 1;
  const link = (a: Article, i: number, source?: string) => {
    const title = clean(a.title) || "Sans titre";
    return (
      <Anchor
        key={`${a.link}-${i}`}
        href={a.link || undefined}
        target="_blank"
        rel="noopener noreferrer"
        size="sm"
        style={LINK_ROW}
        lineClamp={1}
        c="var(--mantine-color-text)"
        underline="never"
        className={classes.link}
        // Mêlés, les articles de plusieurs sources disent la leur au survol.
        title={source ? `${title} — ${source}` : title}
      >
        {dates && a.date && (
          <Text span size="xs" c="dimmed" style={DATE_COLUMN}>
            {formatDate(a.date)}
          </Text>
        )}
        {title}
      </Anchor>
    );
  };

  // Le titre se nettoie à l'affichage plutôt qu'à la lecture : les articles
  // déjà lus profitent ainsi d'un nettoyage revu, sans attendre la prochaine
  // relève.
  const parts = distributed(state.sources, quantity);
  if (grouped) {
    const groups = state.sources
      .map((s, i) => ({ url: s.url, articles: parts[i]! }))
      .filter((s) => s.articles.length);
    if (!groups.length) return <NoArticle />;
    return (
      <Stack gap={0}>
        {groups.map((s, g) => (
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
              {nameOf(s.url)}
            </Text>
            {s.articles.map((a, i) => link(a, i))}
          </Fragment>
        ))}
      </Stack>
    );
  }

  const articles = interleave(parts);
  if (!articles.length) return <NoArticle />;
  const sourceOf = new Map(
    state.sources.flatMap((s) => s.articles.map((a) => [a, nameOf(s.url)] as const)),
  );
  return (
    <Stack gap={0}>
      {articles.map((a, i) => link(a, i, withSource ? sourceOf.get(a) : undefined))}
    </Stack>
  );
}

function NoArticle() {
  return (
    <Text size="sm" c="dimmed">
      Aucun article
    </Text>
  );
}

/** Le temps de finir de taper l'adresse avant de la sonder. */
const PROBE_DELAY = 600;

/** La place de l'étiquette dans le champ : celle de la plus longue, « Format invalide ». */
const LABEL_WIDTH = 120;

/** Les adresses déjà sondées, pour la durée de la page. */
const probed = new Map<string, AccessFeedProbe>();

/**
 * Ce que donne l'adresse saisie, sondée par le serveur : injoignable, pas un
 * flux, ou le format du flux. Rien tant que l'adresse n'est pas lisible.
 */
function useProbe(url: string): AccessFeedProbe | null {
  const [probe, setProbe] = useState<AccessFeedProbe | null>(() => probed.get(url) ?? null);
  useEffect(() => {
    if (!readableAddress(url)) {
      setProbe(null);
      return;
    }
    const known = probed.get(url);
    setProbe(known ?? null);
    if (known) return;
    let active = true;
    const timeout = setTimeout(() => {
      api
        .probeAccessFeed(url)
        .then((s) => {
          probed.set(url, s);
          if (active) setProbe(s);
        })
        .catch((e: Error) => active && setProbe({ state: "unreachable", message: e.message }));
    }, PROBE_DELAY);
    return () => {
      active = false;
      clearTimeout(timeout);
    };
  }, [url]);
  return probe;
}

function Label({ probe }: { probe: AccessFeedProbe }) {
  const ok = probe.state === "ok";
  // L'étiquette des états de l'application (EntraTab) : pleine, verte ou rouge.
  return (
    <Badge
      color={ok ? "green" : RED}
      variant="filled"
      size="sm"
      radius="sm"
      tt="none"
      fw={600}
      title={ok ? undefined : probe.message}
      style={{ flexShrink: 0 }}
    >
      {ok ? probe.format : probe.state === "unreachable" ? "Injoignable" : "Format invalide"}
    </Badge>
  );
}

interface SourceRowProps {
  url: string;
  rank: number;
  total: number;
  held: boolean;
  toFill: boolean;
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
function SourceRow({
  url,
  rank,
  total,
  held,
  toFill,
  onChange,
  onBlur,
  onDragStart,
  onDragEnd,
  onDragOver,
  onContextMenu,
}: SourceRowProps) {
  const probe = useProbe(url.trim());
  const [input, setInput] = useState(false);
  return (
    <Group
      gap="sm"
      wrap="nowrap"
      onDragOver={onDragOver}
      onDrop={(e) => e.preventDefault()}
      onContextMenu={(e) => onContextMenu(menuPosition(e))}
      style={rowStyle(rank, total, held)}
    >
      <Handle
        label={`Déplacer la source ${url}`}
        active={Boolean(url.trim())}
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
      />
      <TextInput
        size="sm"
        radius={ROUNDING}
        style={{ flex: 1, minWidth: 0, marginLeft: -NAME_INSET }}
        styles={{ input: nameFieldStyle(input) }}
        placeholder="https://"
        aria-label="Adresse du flux"
        value={url}
        onChange={(e) => onChange(e.currentTarget.value)}
        autoFocus={toFill}
        onFocus={() => setInput(true)}
        onBlur={() => {
          setInput(false);
          onBlur();
        }}
      />
      {probe && (
        <Box
          style={{
            width: LABEL_WIDTH,
            flexShrink: 0,
            display: "flex",
            justifyContent: "flex-end",
            paddingRight: 4,
          }}
        >
          <Label probe={probe} />
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
function SourcesField({ config, onChange }: WidgetConfigProps) {
  const rows = rowsOf(config);
  /** Le rang de la ligne qu'on glisse. */
  const [held, setHeld] = useState<number | null>(null);
  /** La ligne qu'on vient d'ajouter : son adresse prend le focus. */
  const [toFill, setToFill] = useState<number | null>(null);
  const [menu, setMenu] = useState<{ rank: number; position: PointMenuPosition } | null>(null);

  const insertRow = (nextItems: string[]) =>
    onChange(withField(config, SOURCES, nextItems.map((url) => ({ url }))));
  const remove = (rank: number) => insertRow(rows.filter((_, i) => i !== rank));

  const add = () => {
    insertRow([...rows, ""]);
    setToFill(rows.length);
  };

  // La ligne tenue prend la place de celle qu'elle survole.
  const dragHover = (e: DragEvent<HTMLElement>, rank: number) => {
    if (held === null) return;
    e.preventDefault();
    const next = move(rows, held, rank);
    if (!next) return;
    setHeld(rank);
    insertRow(next);
  };

  return (
    <Input.Wrapper label="Sources">
      {rows.length === 0 ? (
        <EmptyList icon={IconRss} message="Aucun flux" />
      ) : (
        <Stack gap={1}>
          {rows.map((url, rank) => (
            <SourceRow
              key={rank}
              url={url}
              rank={rank}
              total={rows.length}
              held={held === rank}
              toFill={toFill === rank}
              onChange={(value) => insertRow(rows.map((u, i) => (i === rank ? value : u)))}
              onBlur={() => {
                setToFill(null);
                // Une ligne quittée sans adresse s'efface.
                if (!url.trim()) remove(rank);
              }}
              onDragStart={() => setHeld(rank)}
              onDragEnd={() => setHeld(null)}
              onDragOver={(e) => dragHover(e, rank)}
              onContextMenu={(position) => setMenu({ rank, position })}
            />
          ))}
        </Stack>
      )}

      {/* Au plus près de la liste qu'il allonge. */}
      <AddButton label="Ajouter un flux" onClick={add} mt={4} />

      {menu && (
        <PointMenu position={menu.position} onClose={() => setMenu(null)}>
          <Menu.Item
            color={RED}
            leftSection={<IconTrash size={16} />}
            onClick={() => {
              remove(menu.rank);
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

function Settings({ config, onChange }: WidgetConfigProps) {
  return (
    <Stack gap="xl">
      <SourcesField config={config} onChange={onChange} />
      {/* Un champ vidé le temps d'une saisie range la valeur par défaut
          plutôt qu'un zéro, qui viderait l'élément. Le serveur relève la
          source au rythme de l'actualisation et garde ses articles : la page
          lit ce qu'il garde. */}
      <Group align="flex-start">
        <NumberInput
          label="Articles affichés"
          placeholder={String(QUANTITY_DEFAULT)}
          value={count(config, QUANTITY, QUANTITY_DEFAULT)}
          onChange={(value) =>
            onChange(withField(config, QUANTITY, value === "" ? QUANTITY_DEFAULT : Number(value)))
          }
          min={QUANTITY_MIN}
          max={QUANTITY_MAX}
          allowNegative={false}
          allowDecimal={false}
          w={120}
        />
        <NumberInput
          label="Actualisation"
          placeholder={String(ACCESS_FEED_INTERVAL_DEFAULT)}
          value={count(config, INTERVAL, ACCESS_FEED_INTERVAL_DEFAULT)}
          onChange={(value) =>
            onChange(
              withField(config, INTERVAL, value === "" ? ACCESS_FEED_INTERVAL_DEFAULT : Number(value)),
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
            checked={withDates(config)}
            onChange={(e) => onChange(withField(config, DATES, e.currentTarget.checked))}
            color="teal"
          />
          {/* Les articles affichés se partagent entre les sources, à tour
              de rôle : mêlés, ils se rangent par date ; regroupés, chaque
              source montre sa part, dans l'ordre de la liste. */}
          <Switch
            label="Regrouper les articles par source"
            checked={isGrouped(config)}
            onChange={(e) => onChange(withField(config, GROUP, e.currentTarget.checked))}
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
    [QUANTITY]: QUANTITY_DEFAULT,
    [INTERVAL]: ACCESS_FEED_INTERVAL_DEFAULT,
    [DATES]: true,
    [GROUP]: false,
    [FRAMED]: false,
  },
  // Le clic appartient aux articles : chacun ouvre sa page.
  ownClicks: true,

  Display: Feed,

  // Une liste de liens : rien de plus que les liens eux-mêmes.
  margins: () => ({ top: 0, bottom: 0 }),

  // Il dessine lui-même son cadre, réglé dans le bloc « Apparence » du tiroir.
  ownFrame: true,
  Config: Settings,
};
