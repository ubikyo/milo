import { ActionIcon, Box, Checkbox, Group, Loader, Select, Stack, Text, Tooltip } from "@mantine/core";
import { IconQuote, IconRefresh } from "@tabler/icons-react";
import { useEffect, useState } from "react";
import { QUOTE_SOURCES } from "@milo/shared";
import type { AccessQuote, Id, QuoteSource } from "@milo/shared";
import { api } from "../../api";
import { Frame } from "../margins";
import { insertRow } from "../../components/ui/SettingRows";
import { withField, count, text } from "../types";
import type { AccessWidget, Padding, WidgetDisplayProps } from "../types";

// A quote, or a joke, renewed at the interval chosen in its drawer. Several
// sources can be checked: each renewal draws one of them at random.
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
const FRAMED = "framed";

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

/** The checked sources; none readable, the quotes. */
const sourcesOf = (config: unknown): QuoteSource[] => {
  const value = (config as Record<string, unknown> | null)?.[SOURCES];
  const sources = Array.isArray(value)
    ? QUOTE_SOURCES.map((s) => s.value).filter((s) => value.includes(s))
    : [];
  return sources.length > 0 ? sources : DEFAULT_SOURCES;
};

/** A box checked by default until it has been set. */
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

/** The quote, in « », its author and work below; a joke, its answer below in bold. */
function QuoteText({ quote, config }: { quote: AccessQuote; config: unknown }) {
  const size = count(config, SIZE, DEFAULT_SIZE);
  const color = text(config, COLOR) || DEFAULT_INK;
  const byline = [quote.author, quote.work].filter(Boolean).join(", ");
  return (
    <Stack gap={6}>
      <Text fz={size} c={color} fs={quote.source === "quote" ? "italic" : undefined} style={{ whiteSpace: "pre-line" }}>
        {quote.source === "quote" ? `« ${quote.text} »` : quote.text}
      </Text>
      {quote.answer && (
        <Text fz={size} c={color} fw={600} style={{ whiteSpace: "pre-line" }}>
          {quote.answer}
        </Text>
      )}
      {quote.source === "quote" && byline && isChecked(config, AUTHOR, true) && (
        <Text fz={Math.max(SIZE_MIN, size - 3)} c="dimmed" ta="right">
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

  appearance: (config, onChange) => {
    const size = count(config, SIZE, DEFAULT_SIZE);
    return [
      {
        name: "Texte",
        what: "du texte",
        color: {
          value: text(config, COLOR),
          onChange: (v) => onChange(insertRow(config, { [COLOR]: v })),
        },
        size: {
          value: size,
          defaultValue: DEFAULT_SIZE,
          min: SIZE_MIN,
          max: SIZE_MAX,
          onChange: (v) => onChange(insertRow(config, { [SIZE]: v === DEFAULT_SIZE ? "" : v })),
        },
        modified: text(config, COLOR) !== "" || size !== DEFAULT_SIZE,
        reset: () => onChange(insertRow(config, { [COLOR]: "", [SIZE]: "" })),
      },
    ];
  },

  Config: ({ config, onChange }) => {
    const sources = sourcesOf(config);
    return (
      <Stack gap="xl">
        {/* One source at least: the last one checked cannot be unchecked. */}
        <Checkbox.Group
          label="Sources"
          description="Plusieurs : chaque renouvellement en tire une au hasard."
          value={sources}
          onChange={(value) => value.length > 0 && onChange(withField(config, SOURCES, value))}
        >
          <Stack gap="sm" mt="xs">
            {QUOTE_SOURCES.map((s) => (
              <Checkbox key={s.value} value={s.value} label={s.label} color="teal" />
            ))}
          </Stack>
        </Checkbox.Group>
        <Select
          label="Renouveler"
          data={INTERVALS}
          value={String(count(config, INTERVAL, DEFAULT_INTERVAL))}
          onChange={(value) => value && onChange(withField(config, INTERVAL, Number(value)))}
          allowDeselect={false}
          styles={{ wrapper: { width: 220 } }}
        />
        <Checkbox
          label="Afficher l'auteur des citations"
          checked={isChecked(config, AUTHOR, true)}
          onChange={(e) => onChange(withField(config, AUTHOR, e.currentTarget.checked))}
          color="teal"
        />
      </Stack>
    );
  },
};
