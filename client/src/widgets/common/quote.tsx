import { ActionIcon, Box, Group, Loader, Select, Stack, Switch, Text, Tooltip } from "@mantine/core";
import { IconQuote, IconRefresh } from "@tabler/icons-react";
import { useEffect, useState } from "react";
import { QUOTE_SOURCES } from "@milo/shared";
import type { AccessQuote, Id, QuoteSource } from "@milo/shared";
import { api } from "../../api";
import { Frame } from "../margins";
import { insertRow } from "../../components/ui/SettingRows";
import { formatOf, formatReset, formatRow, formatStyle, NO_FORMAT } from "../text-format";
import type { TextFormat } from "../text-format";
import { withField, count, text } from "../types";
import type { AccessWidget, Padding, WidgetDisplayProps } from "../types";

// A quote, or a joke, renewed at the interval chosen in its drawer. Several
// sources can be switched on: each renewal draws one of them at random.
//
// The server fetches them and keeps each widget's for the interval
// (server/src/lib/quotes.ts): everyone in front of the board reads the same
// one. Whoever can modify the widget draws another with the button that
// shows on hover.

const SOURCES = "sources";
const INTERVAL = "interval";
const AUTHOR = "author";
const SIZE = "size";
const COLOR = "color";
const AUTHOR_COLOR = "authorColor";
const FRAMED = "framed";
/** The author's format is stored under this prefix: "authorBold"… */
const AUTHOR_FORMAT = "author";

/** A quote's own format: in italics; a joke's has none. */
const QUOTE_FORMAT: TextFormat = { bold: false, italic: true, underline: false };
const BOLD_WEIGHT = 600;

const DEFAULT_SOURCES: QuoteSource[] = ["quote"];

/** The renewal intervals offered, in minutes. */
const INTERVALS = [
  { value: "15", label: "Toutes les 15 minutes" },
  { value: "60", label: "Toutes les heures" },
  { value: "240", label: "Toutes les 4 heures" },
  { value: "1440", label: "Tous les jours" },
];
const DEFAULT_INTERVAL = 60;

/**
 * How often the page asks the server: it answers from what it keeps until
 * the interval runs out, so asking often costs nothing and catches a quote
 * renewed by someone else.
 */
const POLL = 60_000;

const DEFAULT_SIZE = 16;
const SIZE_MIN = 10;
const SIZE_MAX = 48;

/** The padding around the text while the drawer's "Apparence" block sets none. */
const PADDING = 20;
const LOW_MARGIN = 15;

const DEFAULT_INK = "var(--mantine-color-text)";

/** The sources switched on; none readable, the quotes. */
const sourcesOf = (config: unknown): QuoteSource[] => {
  const value = (config as Record<string, unknown> | null)?.[SOURCES];
  const sources = Array.isArray(value)
    ? QUOTE_SOURCES.map((s) => s.value).filter((s) => value.includes(s))
    : [];
  return sources.length > 0 ? sources : DEFAULT_SOURCES;
};

/** A switch on by default until it has been set. */
const isChecked = (config: unknown, key: string, defaultValue: boolean): boolean => {
  const value = (config as Record<string, unknown> | null)?.[key];
  return value === undefined ? defaultValue : Boolean(value);
};

const isFramed = (config: unknown): boolean =>
  Boolean((config as Record<string, unknown> | null)?.[FRAMED]);

const paddingOf = (): Padding => PADDING;

/** The last quote read for each widget: back on the board, it shows at once. */
const alreadyRead = new Map<Id, AccessQuote>();

type State =
  | { phase: "loading" }
  | { phase: "ready"; quote: AccessQuote }
  | { phase: "error"; message: string };

/** The quote, in « », its author and work below; a joke, its answer below. */
function QuoteText({ quote, config }: { quote: AccessQuote; config: unknown }) {
  const size = count(config, SIZE, DEFAULT_SIZE);
  const color = text(config, COLOR) || DEFAULT_INK;
  const byline = [quote.author, quote.work].filter(Boolean).join(", ");
  const format = formatStyle(
    formatOf(config, quote.source === "quote" ? QUOTE_FORMAT : NO_FORMAT),
    BOLD_WEIGHT,
  );
  return (
    <Stack gap={6}>
      <Text fz={size} c={color} style={{ ...format, whiteSpace: "pre-line" }}>
        {quote.source === "quote" ? `« ${quote.text} »` : quote.text}
      </Text>
      {quote.answer && (
        // The answer follows the text's format, like the question.
        <Text fz={size} c={color} style={{ ...format, whiteSpace: "pre-line" }}>
          {quote.answer}
        </Text>
      )}
      {quote.source === "quote" && byline && isChecked(config, AUTHOR, true) && (
        <Text
          fz={Math.max(SIZE_MIN, size - 3)}
          c={text(config, AUTHOR_COLOR) || "dimmed"}
          ta="right"
          style={formatStyle(formatOf(config, NO_FORMAT, AUTHOR_FORMAT), BOLD_WEIGHT)}
        >
          — {byline}
        </Text>
      )}
    </Stack>
  );
}

function QuoteDisplay({ blockId, config, locked }: WidgetDisplayProps) {
  const [state, setState] = useState<State>(() => {
    const known = alreadyRead.get(blockId);
    return known ? { phase: "ready", quote: known } : { phase: "loading" };
  });
  const [hovered, setHovered] = useState(false);
  const [renewing, setRenewing] = useState(false);
  // What makes the server draw another one: the widget, and its sources.
  const key = `${blockId}:${sourcesOf(config).join(",")}`;

  const show = (quote: AccessQuote) => {
    alreadyRead.set(blockId, quote);
    setState({ phase: "ready", quote });
  };

  useEffect(() => {
    if (!blockId) return;
    let active = true;
    const read = () =>
      api
        .getAccessQuote(blockId)
        .then((quote) => active && show(quote))
        .catch((e: Error) => active && setState({ phase: "error", message: e.message }));
    read();
    const heartbeat = setInterval(read, POLL);
    return () => {
      active = false;
      clearInterval(heartbeat);
    };
    // The key carries the element and its sources: that is what changes the quote.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const renew = () => {
    setRenewing(true);
    api
      .getAccessQuote(blockId, true)
      .then(show)
      .catch((e: Error) => setState({ phase: "error", message: e.message }))
      .finally(() => setRenewing(false));
  };

  const content =
    state.phase === "loading" ? (
      <Group gap="xs" c="dimmed">
        <Loader size="xs" color="gray" />
        <Text size="sm">Chargement…</Text>
      </Group>
    ) : state.phase === "error" ? (
      <Group gap={6} c="dimmed">
        <IconQuote size={16} />
        <Text size="sm">{state.message}</Text>
      </Group>
    ) : (
      <QuoteText quote={state.quote} config={config} />
    );

  return (
    <Frame config={config} framed={isFramed(config)} padding={paddingOf()}>
      <Box
        pos="relative"
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
      >
        {content}
        {!locked && (hovered || renewing) && (
          <Tooltip label="Une autre" withArrow>
            <ActionIcon
              data-no-widget-drag
              variant="subtle"
              color="gray"
              size="sm"
              loading={renewing}
              onClick={(e) => {
                e.stopPropagation();
                renew();
              }}
              style={{ position: "absolute", top: -4, right: -4 }}
              aria-label="Une autre"
            >
              <IconRefresh size={14} />
            </ActionIcon>
          </Tooltip>
        )}
      </Box>
    </Frame>
  );
}

export const quoteWidget: AccessWidget = {
  type: "quote",
  kind: "common",
  label: "Citation",
  icon: IconQuote,
  defaultConfig: {
    [SOURCES]: DEFAULT_SOURCES,
    [INTERVAL]: DEFAULT_INTERVAL,
    [FRAMED]: false,
  },

  Display: QuoteDisplay,

  margins: () => ({ top: 0, bottom: LOW_MARGIN }),

  ownFrame: true,
  padding: paddingOf,
  // Its button works outside edit mode, for whoever can modify the widget.
  ownClicks: true,
  liveContent: true,

  // The color field shows the default, Mantine's text color in the current
  // scheme; brought back to it, it is no longer stored: the display keeps
  // following the scheme.
  appearance: (config, onChange) => {
    const size = count(config, SIZE, DEFAULT_SIZE);
    const dark = document.documentElement.getAttribute("data-mantine-color-scheme") === "dark";
    const defaultColor = dark ? "#c9c9c9" : "#000000";
    const dimmed = dark ? "#828282" : "#868e96";
    const color = text(config, COLOR);
    const authorColor = text(config, AUTHOR_COLOR);
    // The author's row, while quotes are drawn and their author shown.
    const showsAuthor = sourcesOf(config).includes("quote") && isChecked(config, AUTHOR, true);
    // The format's default is a quote's as soon as quotes are drawn: jokes
    // alone have none.
    const textFormat = sourcesOf(config).includes("quote") ? QUOTE_FORMAT : NO_FORMAT;
    const authorFormat = formatRow(config, onChange, NO_FORMAT, AUTHOR_FORMAT);
    return [
      {
        name: "Citation",
        what: "de la citation",
        color: {
          value: color || defaultColor,
          onChange: (v) => onChange(insertRow(config, { [COLOR]: v === defaultColor ? "" : v })),
        },
        size: {
          value: size,
          defaultValue: DEFAULT_SIZE,
          min: SIZE_MIN,
          max: SIZE_MAX,
          onChange: (v) => onChange(insertRow(config, { [SIZE]: v === DEFAULT_SIZE ? "" : v })),
        },
        modified: (color !== "" && color !== defaultColor) || size !== DEFAULT_SIZE,
        reset: () => onChange(insertRow(config, { [COLOR]: "", [SIZE]: "" })),
      },
      { ...formatRow(config, onChange, textFormat), name: "Citation", what: "du format de la citation" },
      ...(showsAuthor
        ? [
            {
              name: "Auteur",
              what: "de l'auteur",
              color: {
                value: authorColor || dimmed,
                onChange: (v: string) =>
                  onChange(insertRow(config, { [AUTHOR_COLOR]: v === dimmed ? "" : v })),
              },
              formats: authorFormat.formats,
              modified: (authorColor !== "" && authorColor !== dimmed) || authorFormat.modified,
              reset: () =>
                onChange(insertRow(config, { [AUTHOR_COLOR]: "", ...formatReset(AUTHOR_FORMAT) })),
            },
          ]
        : []),
    ];
  },

  Config: ({ config, onChange }) => {
    const sources = sourcesOf(config);
    return (
      <Stack gap="xl">
        {/* One source at least: the last one on cannot be switched off. */}
        <Switch.Group
          label="Sources"
          value={sources}
          onChange={(value) => value.length > 0 && onChange(withField(config, SOURCES, value))}
        >
          <Stack gap="sm" mt="xs">
            {QUOTE_SOURCES.map((s) => (
              <Switch key={s.value} value={s.value} label={s.label} color="teal" />
            ))}
          </Stack>
        </Switch.Group>
        <Select
          label="Renouveler"
          data={INTERVALS}
          value={String(count(config, INTERVAL, DEFAULT_INTERVAL))}
          onChange={(value) => value && onChange(withField(config, INTERVAL, Number(value)))}
          allowDeselect={false}
          styles={{ wrapper: { width: 220 } }}
        />
        {sources.includes("quote") && (
          <Switch
            label="Afficher l'auteur des citations"
            checked={isChecked(config, AUTHOR, true)}
            onChange={(e) => onChange(withField(config, AUTHOR, e.currentTarget.checked))}
            color="teal"
          />
        )}
      </Stack>
    );
  },
};
