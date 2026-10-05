import {
  Anchor,
  Badge,
  Box,
  Group,
  Input,
  NumberInput,
  Stack,
  Switch,
  Text,
  TextInput,
} from "@mantine/core";
import { IconRss } from "@tabler/icons-react";
import { Fragment, useEffect, useState } from "react";
import type { DragEvent } from "react";
import { api } from "../../api";
import classes from "../../assets/styles/AccessLink.module.css";
import { Frame } from "../margins";
import {
  ROUNDING,
  EmptyList,
  editKeys,
  Handle,
  ListFooter,
  RowCheckbox,
  useRowSelection,
  NAME_INSET,
  move,
  nameFieldStyle,
  rowStyle,
} from "../../components/ui/DrawerRows";
import ConfigurationProblem from "../../components/ui/ConfigurationProblem";
import EmptyPanel from "../../components/ui/EmptyPanel";
import { insertRow } from "../../components/ui/SettingRows";
import { RED } from "../../themes/colors";
import { withField, count, text } from "../types";
import type { AccessWidget, WidgetConfigProps, WidgetDisplayProps } from "../types";
import {
  ACCESS_FEED_INTERVAL_DEFAULT,
  ACCESS_FEED_INTERVAL_MAX,
  ACCESS_FEED_INTERVAL_MIN,
  ACCESS_FEED_QUANTITY_MAX,
} from "@milo/shared";
import type { AccessFeed, AccessFeedProbe, Id } from "@milo/shared";

// An RSS feed: the latest articles from one or several sources, each linking
// to its page. It is used to follow news — a publisher, a supplier, a service
// — without leaving the column. Sources can mix formats (RSS, Atom, JSON):
// their articles are merged by date, or grouped by source, in the order the
// drawer sorts them.
//
// The browser cannot read another site's feed: the server fetches it in its
// place (server/src/lib/feed.ts), at the interval the element sets, and keeps
// the latest articles in the database, already parsed — RSS, Atom or JSON. The
// column reads them from there: opening the page does not hit the source.
//
// Each article is presented as a column link: a click opens it alongside, a
// right click opens the drawer — the sources and their order, the number of
// articles and the fetch interval are set there.
//
// The configuration keys are also read by the server (feedSettings): they
// do not change.

/** The sources, in order: one "{ url }" entry per drawer row. */
const SOURCES = "sources";
/** The single address from before the list, reread until the list has been saved. */
const FEED_URL = "url";
/** True when articles are grouped by source rather than merged by date. */
const GROUP = "group";
const QUANTITY = "count";
const DATES = "dates";
const INTERVAL = "interval";
const FRAMED = "framed";
const COLOR = "color";
const DATE_COLOR = "dateColor";

/** The titles' ink while the drawer's "Apparence" block sets none: the theme's text. */
const DEFAULT_INK = "var(--mantine-color-text)";
/** The space below the feed, by default: it keeps it off what follows. */
const LOW_MARGIN = 15;

/** Enough to follow a source, few enough not to overrun the column. */
const QUANTITY_DEFAULT = 5;
const QUANTITY_MIN = 1;
const QUANTITY_MAX = ACCESS_FEED_QUANTITY_MAX;

/**
 * The column rereads what the database holds at this rate: it is a database
 * read, not a fetch of the source, and it thus shows the server's latest fetch
 * without waiting for the page to be reloaded.
 */
const RELOAD_INTERVAL = 5 * 60_000;

/** Same line height as a column link (link.tsx). */
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

/** A source that has been read: its articles, or what prevented reading them. */
interface Source {
  url: string;
  articles: Article[];
  error: string | null;
}

/**
 * What some sources add to their titles and that the column already says or
 * need not say: the "[MàJ]" mention of an updated article, and the date in
 * parentheses at the end of the title — "… (23 septembre 2026)", as CERT-FR
 * does — which the column already shows at the start of the line.
 */
const UPDATED = /\[\s*m[aà]j\s*\]/giu;
const TRAILING_DATE =
  /\s*\(\s*(?:\d{1,2}(?:er)?\s+\p{L}+\.?\s+\d{4}|\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4}|\d{4}-\d{2}-\d{2})\s*\)\s*$/u;

const clean = (title: string): string =>
  title.replace(UPDATED, " ").replace(TRAILING_DATE, "").replace(/\s+/g, " ").trim();

/**
 * The date at the start of the line always takes the same width, that of the
 * longest ("26 sept."): otherwise each title would start somewhere else.
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
 * The articles each source shows, "quantity" in all: each one supplies its
 * own in turn, in the list's order — five articles for two sources take three
 * from the first, two from the second. A source that runs short leaves its
 * share to the following ones.
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
 * The "quantity" latest articles of all sources together, from newest to
 * oldest: a busy source can take every place. Those without a date follow, in
 * the sources' order.
 */
const merged = (sources: Source[], quantity: number): Article[] => {
  const articleTime = (a: Article) => a.date?.getTime() ?? -Infinity;
  return sources
    .flatMap((s) => s.articles)
    .sort((a, b) => articleTime(b) - articleTime(a))
    .slice(0, quantity);
};

/** A source's short name: its host, without "www.". */
const nameOf = (url: string): string => {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
};

const formatDate = (date: Date): string =>
  new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short" }).format(date);

/** A new source shows its dates: that is what says whether it is still alive. */
const withDates = (config: unknown): boolean => {
  const value = (config as Record<string, unknown> | null)?.[DATES];
  return value === undefined ? true : Boolean(value);
};

/** Articles are merged by date unless grouping is requested. */
const isGrouped = (config: unknown): boolean =>
  Boolean((config as Record<string, unknown> | null)?.[GROUP]);

/**
 * The addresses of the drawer rows, as entered — empty ones included. An
 * element stored before the list has only its "url".
 */
const rowsOf = (config: unknown): string[] => {
  const list = (config as Record<string, unknown> | null)?.[SOURCES];
  if (!Array.isArray(list)) {
    const url = text(config, FEED_URL);
    return url.trim() ? [url] : [];
  }
  return list.map((s) => text(s, "url"));
};

/** The addresses to fetch: without blanks or duplicates, in order — as the server reads them. */
const addressesOf = (config: unknown): string[] => [
  ...new Set(rowsOf(config).map((u) => u.trim()).filter(Boolean)),
];

/** A feed is bare by default: the frame is what you ask for, not the reverse. */
const isFramed = (config: unknown): boolean =>
  Boolean((config as Record<string, unknown> | null)?.[FRAMED]);

/** The quantity, brought within its bounds whatever the configuration holds. */
const quantityOf = (config: unknown): number =>
  Math.min(
    QUANTITY_MAX,
    Math.max(QUANTITY_MIN, Math.round(count(config, QUANTITY, QUANTITY_DEFAULT))),
  );

/**
 * The latest articles shown by each element, for the duration of the page.
 * Back on the category, or switched from one mode to another, the element
 * remounts: it immediately resumes what it was showing, and the reread
 * updates it without making anything jump. The key carries the address: a
 * changed feed does not show the old one's articles.
 */
const alreadyRead = new Map<string, Source[]>();
const keyOf = (blockId: Id, urls: string[]) => `${blockId}|${urls.join("\n")}`;

/** A feed address the server can fetch: over http or https. */
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

function Feed({ blockId, config, onEdit, locked }: WidgetDisplayProps) {
  // No feed: "Ajouter" opens the drawer, where they are named — as for Mail.
  if (addressesOf(config).length === 0) {
    return (
      <EmptyPanel
        icon={IconRss}
        message="Aucun flux RSS"
        actionLabel={locked ? undefined : "Ajouter"}
        onAction={onEdit}
        size="md"
        fill={false}
      />
    );
  }
  const content = <Articles blockId={blockId} config={config} />;
  return (
    <Frame config={config} framed={isFramed(config)}>
      {content}
    </Frame>
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

  // The addresses and the quantity are those the server reads in the stored
  // element: when they change, what it keeps changes too.
  useEffect(() => {
    if (!allReadable) return;
    // A response arriving after an address change must not overwrite that of
    // the new one.
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
    // Already read, the articles stay on screen during the reread.
    const known = alreadyRead.get(key);
    setState(known ? { phase: "ready", sources: known } : { phase: "loading" });
    read();
    const heartbeat = setInterval(read, RELOAD_INTERVAL);
    return () => {
      active = false;
      clearInterval(heartbeat);
    };
  }, [blockId, key, allReadable, quantity]);

  // With a feed address that is not http(s), the widget needs review: the
  // yellow triangle, like a misconfigured list of requests.
  if (!allReadable) return <ConfigurationProblem widget={rssWidget.label} />;
  // Loading already holds the height of the expected articles, line for
  // line: without it, each feed would grow all at once on arrival and push
  // what follows, one after the other.
  if (state.phase === "loading") {
    // Grouped, each source that has its share adds its name line.
    const expected = grouped ? quantity + Math.min(urls.length, quantity) : quantity;
    return (
      <Stack gap={0}>
        {Array.from({ length: expected }, (_, i) => (
          <Text
            key={i}
            size="sm"
            c="dimmed"
            lineClamp={1}
            // A link's padding (AccessLink.module.css), without its hover:
            // there is nothing to open yet.
            style={{ ...LINK_ROW, padding: 3, marginInline: -3 }}
          >
            {i === 0 ? "Chargement du flux…" : "\u00a0"}
          </Text>
        ))}
      </Stack>
    );
  }
  // No source responds, or what they return is not a feed: the addresses
  // need review too. What the server saw can be read on hover. A failing source
  // among others that respond simply stays quiet.
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
        c={text(config, COLOR) || DEFAULT_INK}
        underline="never"
        className={classes.link}
        // Merged, the articles of several sources state their own on hover.
        title={source ? `${title} — ${source}` : title}
      >
        {dates && a.date && (
          <Text span size="xs" c={text(config, DATE_COLOR) || "dimmed"} style={DATE_COLUMN}>
            {formatDate(a.date)}
          </Text>
        )}
        {title}
      </Anchor>
    );
  };

  // The title is cleaned at display time rather than at read time: articles
  // already read thus benefit from a revised cleanup, without waiting for the
  // next fetch.
  if (grouped) {
    const parts = distributed(state.sources, quantity);
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

  const articles = merged(state.sources, quantity);
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

/** The time to finish typing the address before probing it. */
const PROBE_DELAY = 600;

/** The label's room in the field: that of the longest, "Format invalide". */
const LABEL_WIDTH = 120;

/** The addresses already probed, for the duration of the page. */
const probed = new Map<string, AccessFeedProbe>();

/**
 * What the entered address yields, probed by the server: unreachable, not a
 * feed, or the feed's format. Nothing until the address is readable.
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
  // The label of the application's states (EntraTab): filled, green or red.
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
  checked: boolean;
  onCheck: (checked: boolean) => void;
}

/**
 * A source in the drawer, like an inbox in a list of tickets: its handle, its
 * selection box, its address right in the row, and at the end the probe's verdict — the feed's
 * format, or what is wrong.
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
  checked,
  onCheck,
}: SourceRowProps) {
  const probe = useProbe(url.trim());
  const [input, setInput] = useState(false);
  return (
    <Group
      gap="sm"
      wrap="nowrap"
      onDragOver={onDragOver}
      onDrop={(e) => e.preventDefault()}
      style={rowStyle(rank, total, held)}
    >
      <Handle
        label={`Déplacer la source ${url}`}
        active={Boolean(url.trim())}
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
      />
      <RowCheckbox
        label={`Sélectionner ${url || "la source"}`}
        checked={checked}
        onChange={onCheck}
        afterHandle
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
        {...editKeys(onChange)}
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
 * The feed's sources, as rows: the handle orders them — it is the order of the
 * groups when articles are grouped by source —, their boxes select those that
 * the button in place of "Ajouter" removes together meanwhile, "Ajouter" puts an empty one at the end, which clears itself if left without
 * anything written in it.
 */
function SourcesField({ config, onChange }: WidgetConfigProps) {
  const rows = rowsOf(config);
  /** The rank of the row being dragged. */
  const [held, setHeld] = useState<number | null>(null);
  /** The row just added: its address takes focus. */
  const [toFill, setToFill] = useState<number | null>(null);
  /** The checked rows, by rank. */
  const selection = useRowSelection(rows.map((_, rank) => rank));

  const insertRow = (nextItems: string[]) =>
    onChange(withField(config, SOURCES, nextItems.map((url) => ({ url }))));
  // Rows are known by their rank: those after the removed one move up, their
  // checks with them.
  const remove = (rank: number) => {
    insertRow(rows.filter((_, i) => i !== rank));
    selection.reset(selection.checked.filter((i) => i !== rank).map((i) => (i > rank ? i - 1 : i)));
  };
  const removeChecked = () => {
    insertRow(rows.filter((_, i) => !selection.isChecked(i)));
    selection.reset();
  };

  const add = () => {
    insertRow([...rows, ""]);
    setToFill(rows.length);
  };

  // The held row takes the place of the one it hovers.
  const dragHover = (e: DragEvent<HTMLElement>, rank: number) => {
    if (held === null) return;
    e.preventDefault();
    const next = move(rows, held, rank);
    if (!next) return;
    setHeld(rank);
    insertRow(next);
    // The checks follow their rows.
    const checks = move(
      rows.map((_, i) => selection.isChecked(i)),
      held,
      rank,
    )!;
    selection.reset(checks.flatMap((on, i) => (on ? [i] : [])));
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
                // A row left without an address clears itself.
                if (!url.trim()) remove(rank);
              }}
              onDragStart={() => setHeld(rank)}
              onDragEnd={() => setHeld(null)}
              onDragOver={(e) => dragHover(e, rank)}
              checked={selection.isChecked(rank)}
              onCheck={(on) => selection.toggle(rank, on)}
            />
          ))}
        </Stack>
      )}

      {/* As close as possible to the list it lengthens. */}
      <ListFooter
        addLabel="Ajouter un flux"
        onAdd={add}
        checkedCount={selection.checked.length}
        onDeleteChecked={removeChecked}
      />
    </Input.Wrapper>
  );
}

function Settings({ config, onChange }: WidgetConfigProps) {
  return (
    <Stack gap="xl">
      <SourcesField config={config} onChange={onChange} />
      {/* A field emptied while typing stores the default value rather than a
          zero, which would empty the element. The server fetches the source at
          the refresh rate and keeps its articles: the page reads what it
          keeps. */}
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
          {/* Merged, the latest articles of all sources are shown, sorted by
              date; grouped, the displayed articles are shared among the
              sources, in turn, in the list's order. A single source has
              nothing to group: the switch only shows from two. */}
          {addressesOf(config).length > 1 && (
            <Switch
              label="Regrouper les articles par source"
              checked={isGrouped(config)}
              onChange={(e) => onChange(withField(config, GROUP, e.currentTarget.checked))}
              color="teal"
            />
          )}
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
  // The click belongs to the articles: each opens its page.
  ownClicks: true,

  Display: Feed,

  margins: () => ({ top: 0, bottom: LOW_MARGIN }),

  // It draws its own frame, set in the drawer's "Apparence" block.
  ownFrame: true,

  // The color fields show the defaults, Mantine's text and dimmed colors in
  // the current scheme; brought back to them, they are no longer stored: the
  // display keeps following the scheme.
  appearance: (config, onChange) => {
    const dark = document.documentElement.getAttribute("data-mantine-color-scheme") === "dark";
    const defaultColor = dark ? "#c9c9c9" : "#000000";
    const dimmed = dark ? "#828282" : "#868e96";
    const color = text(config, COLOR);
    const dateColor = text(config, DATE_COLOR);
    return [
      {
        name: "Texte",
        what: "du texte",
        color: {
          value: color || defaultColor,
          onChange: (v: string) =>
            onChange(insertRow(config, { [COLOR]: v === defaultColor ? "" : v })),
        },
        modified: color !== "" && color !== defaultColor,
        reset: () => onChange(insertRow(config, { [COLOR]: "" })),
      },
      // The date's row, while dates are shown.
      ...(withDates(config)
        ? [
            {
              name: "Date",
              what: "de la date",
              color: {
                value: dateColor || dimmed,
                onChange: (v: string) =>
                  onChange(insertRow(config, { [DATE_COLOR]: v === dimmed ? "" : v })),
              },
              modified: dateColor !== "" && dateColor !== dimmed,
              reset: () => onChange(insertRow(config, { [DATE_COLOR]: "" })),
            },
          ]
        : []),
    ];
  },
  Config: Settings,
};
