import { BarChart, DonutChart, RadarChart } from "@mantine/charts";
import {
  Group,
  NumberInput,
  RingProgress,
  Select,
  Stack,
  Switch,
  Text,
} from "@mantine/core";
import {
  IconChartBar,
  IconChartDonut,
  IconChartHistogram,
  IconChartLine,
  IconChartRadar,
  IconNumber,
  IconShieldCheck,
  IconUsers,
} from "@tabler/icons-react";
import dayjs from "dayjs";
import { useLayoutEffect, useMemo, useRef, useState } from "react";
import type { ComponentType, ReactNode } from "react";
import {
  INDICATOR_DATA,
  INDICATOR_DATE,
  INDICATOR_DIMENSION,
  INDICATOR_LIMIT,
  INDICATOR_MEASURE,
  INDICATOR_ORDER,
  INDICATOR_PERIOD,
  INDICATOR_ZEROS,
  SOURCES,
} from "@milo/shared";
import type { IndicatorOrder, IndicatorType } from "@milo/shared";
import {
  CARD_HEIGHT,
  CARD_PADDING,
  type IndicatorWidgetBase,
  type WidgetRender,
} from "../../components/ui/IndicatorsPanel";
import { textLine } from "../../components/ui/AppearanceFields";
import { appearanceOf, TITLE, VALUE } from "../../components/ui/IndicatorTitle";
import type { SettingRow } from "../../components/ui/SettingRows";
import { insertRow } from "../../components/ui/SettingRows";
import { useSources } from "../../lib/sources";
import { WidgetLinksField } from "../../components/ui/WidgetLinks";
import { themeColor } from "../../lib/themeColors";
import { RED } from "../../themes/colors";
import {
  CHART_COLORS,
  barChartProps,
  barChartRows,
  colorOf,
  colorRow,
  donutChartProps,
  donutChartRows,
  partRows,
} from "../chart-colors";
import {
  IndicatorTitle,
  IndicatorValue,
  NAME,
  NameField,
  Nothing,
} from "../support/common";
import { RINGS_HEIGHT, Rings, actorsAppearance } from "../support/actors";
import { LabelBars } from "../support/labels";
import type { IndicatorConfigProps } from "../support/types";
import {
  alignmentRows,
  figureLayout,
  NAME_ALIGNMENT,
  VALUE_ALIGNMENT,
} from "../alignment";
import { isSized, PX_HEIGHT } from "../height";
import { paddingOf } from "../margins";
import { count, isFramed, text, withField } from "../types";
import type { BoardData } from "..";
import {
  applicationAssetSource,
  unmanagedDeviceAssetSource,
} from "./sources/declared";
import { contactSource, orderSource, productSource } from "./sources/logistics";
import { mailSource } from "./sources/mail";
import { managedDeviceAssetSource } from "./sources/managed";
import { projectSource } from "./sources/project";
import { supportSource } from "./sources/support";
import { taskSource } from "./sources/task";
import type {
  AnySource,
  Dimension,
  Measure,
  Slice,
  SourceContext,
} from "./types";

// The "Indicateurs" widgets ("indicator."): each knows how to show a figure —
// a number, bars, a ring, a radar, rings, an evolution, a compliance rate —
// but nothing of what it counts. A new one reads nothing: the widgets its
// drawer associates give it its data — tickets, assets… —, each list widget
// kind declaring what it gives (types.ts, sources/). They must all give the
// same, and one the type can show: the evolution those that date their
// items, the compliance those that check them. The data chosen is stored
// (INDICATOR_DATA) for the server, which reads the Mail counts by it.

/** The data sources, in the order "Données" offers them. */
const DATA_SOURCES: AnySource[] = [
  supportSource,
  projectSource,
  taskSource,
  managedDeviceAssetSource,
  unmanagedDeviceAssetSource,
  applicationAssetSource,
  contactSource,
  productSource,
  orderSource,
  mailSource,
];

/** How many bars or shares while none is chosen; beyond, the smallest are left out — or merged. */
const DEFAULT_LIMIT = 10;
const DONUT_LIMIT = 5;
const LIMIT_MAX = 50;

/** The periods an evolution covers, in days. */
const PERIODS = [7, 14, 30, 90];
const PERIOD_DEFAULT = 14;

/** The stored choice, or the first: an unknown value does not bring anything down. */
const chosen = <T extends { value: string }>(
  list: T[],
  config: unknown,
  key: string,
): T => list.find((m) => m.value === text(config, key)) ?? list[0]!;

/** What the panel passes to an indicator's display. */
export interface IndicatorDisplayProps extends WidgetRender {
  config: unknown;
  board: BoardData;
}

export interface IndicatorWidget extends IndicatorWidgetBase<IndicatorType> {
  Display: ComponentType<IndicatorDisplayProps>;
}

/** What a type needs of a source to be fed by it. */
type Needs = (source: AnySource) => boolean;

const anySource: Needs = () => true;
const withDimensions: Needs = (s) => s.dimensions.length > 0;

/** The sources a type can show, and the one its associated widgets give; none before. */
const sourcesFor = (needs: Needs) => DATA_SOURCES.filter(needs);
const sourceOf = (needs: Needs, config: unknown): AnySource | null =>
  sourcesFor(needs).find((s) => s.data === text(config, INDICATOR_DATA)) ??
  null;

/** The source of a widget associated: its kind's. */
const sourceOfWidget = (needs: Needs, type: string): AnySource | undefined =>
  sourcesFor(needs).find((s) => s.sourceType === type);

/** The measures that add up item by item: those a breakdown may count. */
const additive = (source: AnySource) =>
  source.measures.filter((m) => !m.useTotal);

// --- The drawer --------------------------------------------------------------

/**
 * The "Widgets associés" field: one input, for the widgets of every kind the
 * type can show, on every board one sees — all of one kind. Those associated
 * give the data: another kind moves the indicator to it, and starts from its
 * own choices, those of the former one forgotten ("initial", the type's own).
 */
function IndicatorSourcesField({
  needs,
  config,
  onChange,
  initial,
}: IndicatorConfigProps & {
  needs: Needs;
  initial?: (source: AnySource) => Record<string, unknown>;
}) {
  const types = sourcesFor(needs).map((s) => s.sourceType);
  return (
    <WidgetLinksField
      inputs={[{ field: SOURCES, label: "Widget", types, sameType: true }]}
      config={config}
      onChange={onChange}
      apply={(base, links, byKey) => {
        const kept = links[SOURCES] ?? [];
        const type = byKey.get(kept[0] ?? "")?.type;
        const source = type ? sourceOfWidget(needs, type) : undefined;
        const {
          [INDICATOR_MEASURE]: _measure,
          [INDICATOR_DIMENSION]: _dimension,
          [INDICATOR_DATE]: _date,
          ...rest
        } = base;
        const same = source !== undefined && source === sourceOf(needs, base);
        return {
          ...(same ? base : rest),
          ...(!same && source ? (initial?.(source) ?? {}) : {}),
          [SOURCES]: source ? kept : [],
          [INDICATOR_DATA]: source?.data ?? "",
        };
      }}
    />
  );
}

/** A choice among a source's measures, dimensions or dates. */
function ChoiceSelect({
  label,
  list,
  field,
  config,
  onChange,
}: IndicatorConfigProps & {
  label: string;
  list: { value: string; label: string }[];
  field: string;
}) {
  return (
    <Select
      label={label}
      data={list.map(({ value, label }) => ({ value, label }))}
      value={chosen(list, config, field).value}
      onChange={(value) => value && onChange(withField(config, field, value))}
      allowDeselect={false}
    />
  );
}

/** How many bars or shares are shown. */
function LimitField({
  config,
  onChange,
  defaultValue,
  label,
}: IndicatorConfigProps & {
  defaultValue: number;
  label: string;
}) {
  return (
    <NumberInput
      label={label}
      value={count(config, INDICATOR_LIMIT, defaultValue)}
      onChange={(value) =>
        typeof value === "number" &&
        onChange(withField(config, INDICATOR_LIMIT, value))
      }
      min={1}
      max={LIMIT_MAX}
      allowDecimal={false}
      clampBehavior="strict"
    />
  );
}

/**
 * An indicator's drawer: the widgets it reads and what its source asks for,
 * then its name, its data and what the type adds — the dimension, the
 * measure, the bars shown…
 */
function IndicatorFields({
  needs,
  config,
  onChange,
  title,
  initial,
  children,
}: IndicatorConfigProps & {
  needs: Needs;
  title: string;
  initial?: (source: AnySource) => Record<string, unknown>;
  children?: ReactNode;
}) {
  const source = sourceOf(needs, config);
  return (
    <Stack gap="xl">
      <IndicatorSourcesField
        needs={needs}
        config={config}
        onChange={onChange}
        initial={initial}
      />
      {source?.Config && <source.Config config={config} onChange={onChange} />}
      <Stack gap="md">
        <NameField config={config} onChange={onChange} defaultValue={title} />
        {/* What the type asks for, once the widgets associated say the data. */}
        {source && children}
      </Stack>
    </Stack>
  );
}

/** What an indicator shows while no widget gives it data. */
function Unlinked({ config, title }: { config: unknown; title: string }) {
  return (
    <Stack gap="xs" style={{ flex: 1 }}>
      <IndicatorTitle config={config} defaultValue={title} />
      <Nothing>Aucun widget associé</Nothing>
    </Stack>
  );
}

/** The fields of a type that breaks items down: the dimension, its own fields, the measure. */
function DimensionFields({
  needs,
  config,
  onChange,
}: IndicatorConfigProps & { needs: Needs }) {
  const source = sourceOf(needs, config)!;
  const dimension = chosen<Dimension<unknown>>(
    source.dimensions,
    config,
    INDICATOR_DIMENSION,
  );
  return (
    <>
      <ChoiceSelect
        label="Répartition"
        list={source.dimensions}
        field={INDICATOR_DIMENSION}
        config={config}
        onChange={onChange}
      />
      {dimension.Config && (
        <dimension.Config config={config} onChange={onChange} />
      )}
      <ChoiceSelect
        label="Compter"
        list={additive(source)}
        field={INDICATOR_MEASURE}
        config={config}
        onChange={onChange}
      />
    </>
  );
}

// --- What is counted ---------------------------------------------------------

/** The context of a source's hooks, from what the panel passes. */
const contextOf = (
  source: AnySource,
  { config, board, id }: IndicatorDisplayProps,
  sources: SourceContext["sources"],
): SourceContext => ({
  sources,
  config,
  board,
  widgetId: id,
});

/** A slice and what it weighs. */
interface Weighed extends Slice {
  value: number;
}

/** The slice of the items in none, after the others. */
const EMPTY_KEY = "\u0000empty";

/** The slices by name, numbers in their order. */
const byName = (a: Weighed, b: Weighed) =>
  a.name.localeCompare(b.name, "fr", { numeric: true });

/** How each order sorts the slices; "default" keeps the fixed ones in theirs. */
const ORDERS: Record<
  IndicatorOrder,
  ((a: Weighed, b: Weighed) => number) | null
> = {
  default: null,
  desc: (a, b) => b.value - a.value || byName(a, b),
  asc: (a, b) => a.value - b.value || byName(a, b),
  name: byName,
};

/**
 * The slices of the items, each with what they weigh: the fixed ones in their
 * order — those that weigh nothing only when asked —, the others the "limit"
 * largest; then sorted by "order", from the largest by default; the items in
 * no slice last, under the dimension's "empty". "total", what all the items
 * weigh.
 */
function weigh<Item>(
  items: Item[],
  dimension: Dimension<Item>,
  slicer: ReturnType<Dimension<Item>["useSlicer"]>,
  measure: Measure<Item>,
  userId: number,
  {
    zeros,
    limit,
    order = "default",
  }: { zeros: boolean; limit: number; order?: IndicatorOrder },
): { slices: Weighed[]; total: number } {
  const bars = new Map<string, Weighed>();
  for (const s of slicer.fixed ?? []) bars.set(s.key, { ...s, value: 0 });
  let total = 0;
  for (const item of items) {
    const weight = measure.weight(item, { userId });
    total += weight;
    const slices = slicer.slices(item);
    const into = slices.length
      ? slices
      : dimension.empty
        ? [{ key: EMPTY_KEY, name: dimension.empty, color: CHART_COLORS.gray5 }]
        : [];
    for (const slice of into) {
      const bar = bars.get(slice.key);
      if (bar) bar.value += weight;
      else bars.set(slice.key, { ...slice, value: weight });
    }
  }
  const all = [...bars.values()].filter((b) => zeros || b.value > 0);
  const sort = ORDERS[order];
  if (slicer.fixed) return { slices: sort ? all.sort(sort) : all, total };
  const empty = all.filter((b) => b.key === EMPTY_KEY);
  const kept = all
    .filter((b) => b.key !== EMPTY_KEY)
    .sort(ORDERS.desc!)
    .slice(0, limit);
  return { slices: [...(sort ? kept.sort(sort) : kept), ...empty], total };
}

/**
 * What a breaking-down type shows, under the source and dimension chosen:
 * remounted when either changes, its hooks starting over.
 */
interface Breakdown {
  source: AnySource;
  dimension: Dimension<unknown>;
  measure: Measure<unknown>;
  props: IndicatorDisplayProps;
}

/** The items, the slicer and the pending message: what every breakdown reads. */
function useBreakdown({ source, dimension, props }: Breakdown) {
  const sources = useSources(source.sourceType, props.config);
  const context = contextOf(source, props, sources);
  const items = source.useItems(context);
  const slicer = dimension.useSlicer(context);
  const pending = source.usePending?.(context) ?? null;
  return { items, slicer, pending };
}

/** The space a chart has under the title: its place's, less the padding and the title. */
interface Space {
  width: number;
  height: number;
}

/** Below that, a chart no longer reads: it keeps it, and overflows. */
const MIN_CHART = 40;

/** The gap between the title and what the card shows: Stack's "xs". */
const TITLE_GAP = 10;

/**
 * The usual height of a card, padding and title included, around a chart of
 * "chart" pixels: where "Hauteur" starts in px.
 */
const cardHeight =
  (chart: (config: unknown) => number) => (config: unknown) => {
    const padding = paddingOf(
      config,
      isFramed(config, true) ? CARD_PADDING : 0,
    );
    // The title's line: its size, at Mantine's line height.
    const title = Math.ceil(appearanceOf(config, TITLE).fontSize * 1.55);
    return Math.max(
      CARD_HEIGHT,
      padding.Top + padding.Bottom + title + TITLE_GAP + chart(config),
    );
  };

/**
 * Its title on top, then what it shows — or why it shows nothing. With a
 * height of its own, a chart is given the space its place leaves under the
 * title (null until it is measured, or with no height of its own).
 */
function Card({
  config,
  title,
  pending,
  empty,
  centered = false,
  children,
}: {
  config: unknown;
  title: string;
  pending: string | null;
  empty: string | null;
  centered?: boolean;
  children: ReactNode | ((space: Space | null) => ReactNode);
}) {
  const message = pending ?? empty;
  const sized = isSized(config);
  const stack = useRef<HTMLDivElement>(null);
  const heading = useRef<HTMLDivElement>(null);
  const [space, setSpace] = useState<Space | null>(null);
  useLayoutEffect(() => {
    // The place is the card, whose height is the widget's: the card's
    // content keeps its own (Alignment.module.css), it cannot stretch to it.
    const place = stack.current?.parentElement;
    if (!sized || !place) {
      setSpace(null);
      return;
    }
    const measure = () => {
      const style = getComputedStyle(place);
      const height =
        place.clientHeight -
        parseFloat(style.paddingTop) -
        parseFloat(style.paddingBottom) -
        (heading.current?.offsetHeight ?? 0) -
        TITLE_GAP;
      const width =
        place.clientWidth -
        parseFloat(style.paddingLeft) -
        parseFloat(style.paddingRight);
      const next = {
        width: Math.max(MIN_CHART, Math.floor(width)),
        height: Math.max(MIN_CHART, Math.floor(height)),
      };
      setSpace((prev) =>
        prev?.width === next.width && prev.height === next.height ? prev : next,
      );
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(place);
    if (heading.current) observer.observe(heading.current);
    return () => observer.disconnect();
  }, [sized]);
  return (
    <Stack
      ref={stack}
      gap={TITLE_GAP}
      align={centered ? "center" : undefined}
      style={{ flex: 1 }}
    >
      <div ref={heading} style={{ alignSelf: "stretch" }}>
        <IndicatorTitle config={config} defaultValue={title} />
      </div>
      {message ? (
        <div style={{ alignSelf: "stretch" }}>
          <Nothing>{message}</Nothing>
        </div>
      ) : typeof children === "function" ? (
        children(space)
      ) : (
        children
      )}
    </Stack>
  );
}

/** The choices of a breaking-down type, from its configuration. */
const breakdownOf = (
  needs: Needs,
  props: IndicatorDisplayProps,
): Breakdown | null => {
  const source = sourceOf(needs, props.config);
  if (!source) return null;
  return {
    source,
    dimension: chosen<Dimension<unknown>>(
      source.dimensions,
      props.config,
      INDICATOR_DIMENSION,
    ),
    measure: chosen(additive(source), props.config, INDICATOR_MEASURE),
    props,
  };
};

/** Remounts "Inner" when the source or the dimension changes: their hooks are its own. */
const keyed = (needs: Needs, Inner: ComponentType<Breakdown>, title: string) =>
  function Indicator(props: IndicatorDisplayProps) {
    const b = breakdownOf(needs, props);
    if (!b) return <Unlinked config={props.config} title={title} />;
    return <Inner key={`${b.source.data}:${b.dimension.value}`} {...b} />;
  };

/** The title of a type that breaks items down: its dimension's, or the type's before any. */
const dimensionTitle = (needs: Needs, config: unknown, fallback: string) => {
  const source = sourceOf(needs, config);
  return source
    ? chosen(source.dimensions, config, INDICATOR_DIMENSION).label
    : fallback;
};

// --- Nombre ------------------------------------------------------------------

function CountFigure({
  source,
  measure,
  props,
}: {
  source: AnySource;
  measure: Measure<unknown>;
  props: IndicatorDisplayProps;
}) {
  const sources = useSources(source.sourceType, props.config);
  const context = contextOf(source, props, sources);
  const items = source.useItems(context);
  const pending = source.usePending?.(context) ?? null;
  const total = items?.reduce<number>(
    (sum, item) => sum + measure.weight(item, { userId: props.board.userId }),
    0,
  );
  return (
    <Figure
      config={props.config}
      measure={measure}
      value={total ?? null}
      pending={pending}
    />
  );
}

/** A figure the source reads itself: the e-mails received today. */
function RemoteFigure({
  source,
  measure,
  props,
}: {
  source: AnySource;
  measure: Measure<unknown>;
  props: IndicatorDisplayProps;
}) {
  const sources = useSources(source.sourceType, props.config);
  const context = contextOf(source, props, sources);
  const value = measure.useTotal!(context);
  const pending = source.usePending?.(context) ?? null;
  return (
    <Figure
      config={props.config}
      measure={measure}
      value={value}
      pending={pending}
    />
  );
}

function Figure({
  config,
  measure,
  value,
  pending,
}: {
  config: unknown;
  measure: Measure<unknown>;
  value: number | null;
  pending: string | null;
}) {
  const layout = figureLayout(config);
  // The free height between the gaps; the name and the value at least 4 px apart.
  const gap = (grow: number, min = 0) => (
    <div style={{ flex: `${grow} 1 0`, minHeight: min }} />
  );
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        flex: 1,
        minHeight: 0,
      }}
    >
      {gap(layout.gaps[0])}
      <div style={{ textAlign: layout.name }}>
        <IndicatorTitle config={config} defaultValue={measure.label} />
      </div>
      {gap(layout.gaps[1], 4)}
      <div style={{ textAlign: layout.value }}>
        {pending ? (
          <Nothing>{pending}</Nothing>
        ) : (
          <IndicatorValue config={config}>
            {value === null ? "…" : (measure.format?.(value) ?? value)}
          </IndicatorValue>
        )}
      </div>
      {gap(layout.gaps[2])}
    </div>
  );
}

const countIndicator: IndicatorWidget = {
  type: "count",
  kind: "indicator",
  label: "Nombre",
  icon: IconNumber,
  withValue: true,
  // Its "Widgets associés" follow its data: it places them itself.
  ownSource: true,
  // A new one starts at the card's usual height, in px.
  defaultConfig: { [NAME]: "", ...PX_HEIGHT },
  defaultHeight: () => CARD_HEIGHT,
  // Its name and its value, each in its group: its text, then its alignment.
  ownAlignment: (config, onChange) => [
    {
      label: "Nom",
      rows: [
        textLine("Texte", "du nom", TITLE, config, onChange),
        ...alignmentRows(config, onChange, NAME_ALIGNMENT),
      ],
    },
    {
      label: "Valeur",
      rows: [
        textLine("Texte", "de la valeur", VALUE, config, onChange),
        ...alignmentRows(config, onChange, VALUE_ALIGNMENT),
      ],
    },
  ],

  Display: (props) => {
    const source = sourceOf(anySource, props.config);
    if (!source) return <Unlinked config={props.config} title="Nombre" />;
    const measure = chosen<Measure<unknown>>(
      source.measures,
      props.config,
      INDICATOR_MEASURE,
    );
    const key = `${source.data}:${measure.value}`;
    return measure.useTotal ? (
      <RemoteFigure key={key} source={source} measure={measure} props={props} />
    ) : (
      <CountFigure key={key} source={source} measure={measure} props={props} />
    );
  },

  Config: ({ config, onChange }) => {
    const source = sourceOf(anySource, config);
    return (
      <IndicatorFields
        needs={anySource}
        config={config}
        onChange={onChange}
        title={
          source
            ? chosen(source.measures, config, INDICATOR_MEASURE).label
            : "Nombre"
        }
      >
        <ChoiceSelect
          label="Mesure"
          list={source?.measures ?? []}
          field={INDICATOR_MEASURE}
          config={config}
          onChange={onChange}
        />
      </IndicatorFields>
    );
  },
};

// --- Répartition -------------------------------------------------------------

const zerosOf = (config: unknown) =>
  (config as Record<string, unknown> | null)?.[INDICATOR_ZEROS] === true;

/** The orders "Ordre d'affichage" offers. */
const ORDER_CHOICES: { value: IndicatorOrder; label: string }[] = [
  { value: "default", label: "Par défaut" },
  { value: "desc", label: "Valeur décroissante" },
  { value: "asc", label: "Valeur croissante" },
  { value: "name", label: "Alphabétique" },
];

/** The stored order, "default" for an unknown one. */
const orderOf = (config: unknown) =>
  chosen(ORDER_CHOICES, config, INDICATOR_ORDER).value;

const breakdownIndicator: IndicatorWidget = {
  type: "breakdown",
  kind: "indicator",
  label: "Répartition",
  icon: IconChartBar,
  ownSource: true,
  defaultConfig: { [NAME]: "", [INDICATOR_LIMIT]: DEFAULT_LIMIT },

  Display: keyed(
    withDimensions,
    function Bars(b) {
      const { items, slicer, pending } = useBreakdown(b);
      const { config, board } = b.props;
      const { slices } = useMemo(
        () =>
          weigh(items ?? [], b.dimension, slicer, b.measure, board.userId, {
            zeros: zerosOf(config),
            limit: count(config, INDICATOR_LIMIT, DEFAULT_LIMIT),
            order: orderOf(config),
          }),
        [items, slicer, b.dimension, b.measure, board.userId, config],
      );
      return (
        <Card
          config={config}
          title={b.dimension.label}
          pending={pending}
          empty={items === null ? "…" : slices.length ? null : b.source.none}
        >
          <LabelBars
            data={slices.map((s) => ({
              name: s.name,
              value: s.value,
              color: s.color ?? "teal.6",
            }))}
            ownColors={b.dimension.ownColors}
            insideLabel={b.dimension.insideLabel}
          />
        </Card>
      );
    },
    "Répartition",
  ),

  Config: ({ config, onChange }) => {
    return (
      <IndicatorFields
        needs={withDimensions}
        config={config}
        onChange={onChange}
        title={dimensionTitle(withDimensions, config, "Répartition")}
      >
        <DimensionFields
          needs={withDimensions}
          config={config}
          onChange={onChange}
        />
        <LimitField
          config={config}
          onChange={onChange}
          defaultValue={DEFAULT_LIMIT}
          label="Barres affichées"
        />
        <ChoiceSelect
          label="Ordre d'affichage"
          list={ORDER_CHOICES}
          field={INDICATOR_ORDER}
          config={config}
          onChange={onChange}
        />
        <Switch
          label="Afficher les valeurs nulles"
          checked={zerosOf(config)}
          onChange={(e) =>
            onChange(
              withField(config, INDICATOR_ZEROS, e.currentTarget.checked),
            )
          }
          color="teal"
        />
      </IndicatorFields>
    );
  },
};

// --- Colonnes ----------------------------------------------------------------

/** The bars' usual height, the columns' and the trend's. */
const BAR_HEIGHT = 160;

/** One color for all the columns, when the slices have none of their own. */
const COLUMN_COLOR = "color";

/** The rows of the fixed slices' colors — those of the dimension chosen. */
const dimensionPartRows = (
  needs: Needs,
  config: unknown,
  onChange: IndicatorConfigProps["onChange"],
): SettingRow[] => {
  const source = sourceOf(needs, config);
  if (!source) return [];
  const dimension = chosen<Dimension<unknown>>(
    source.dimensions,
    config,
    INDICATOR_DIMENSION,
  );
  return dimension.parts
    ? partRows(
        config,
        onChange,
        dimension.parts.map((p) => ({
          key: p.key,
          name: p.name,
          what: p.what ?? p.name,
          defaultColor: p.color,
        })),
      )
    : [];
};

const columnsIndicator: IndicatorWidget = {
  type: "columns",
  kind: "indicator",
  label: "Colonnes",
  icon: IconChartHistogram,
  ownSource: true,
  defaultConfig: { [NAME]: "", [INDICATOR_LIMIT]: DEFAULT_LIMIT, ...PX_HEIGHT },
  defaultHeight: cardHeight(() => BAR_HEIGHT),

  Display: keyed(
    withDimensions,
    function Columns(b) {
      const { items, slicer, pending } = useBreakdown(b);
      const { config, board } = b.props;
      const { slices } = useMemo(
        () =>
          weigh(items ?? [], b.dimension, slicer, b.measure, board.userId, {
            // The fixed slices all show: a column at zero says something.
            zeros: true,
            limit: count(config, INDICATOR_LIMIT, DEFAULT_LIMIT),
          }),
        [items, slicer, b.dimension, b.measure, board.userId, config],
      );
      const single = colorOf(config, COLUMN_COLOR, CHART_COLORS.green);
      const data = slices.map((s) => ({
        slice: s.name,
        [b.source.unit]: s.value,
        color: b.dimension.ownColors && s.color ? s.color : single,
      }));
      return (
        <Card
          config={config}
          title={b.dimension.label}
          pending={pending}
          empty={items === null ? "…" : slices.length ? null : b.source.none}
        >
          {(space) => (
            <BarChart
              h={space?.height ?? BAR_HEIGHT}
              data={data}
              dataKey="slice"
              series={[{ name: b.source.unit, label: b.measure.label }]}
              getBarColor={(_, entry) => entry.color ?? single}
              barProps={{ isAnimationActive: false }}
              {...barChartProps(config)}
              yAxisProps={{ allowDecimals: false, width: 24 }}
              withTooltip
            />
          )}
        </Card>
      );
    },
    "Colonnes",
  ),

  Config: ({ config, onChange }) => {
    return (
      <IndicatorFields
        needs={withDimensions}
        config={config}
        onChange={onChange}
        title={dimensionTitle(withDimensions, config, "Colonnes")}
      >
        <DimensionFields
          needs={withDimensions}
          config={config}
          onChange={onChange}
        />
        <LimitField
          config={config}
          onChange={onChange}
          defaultValue={DEFAULT_LIMIT}
          label="Colonnes affichées"
        />
      </IndicatorFields>
    );
  },

  chartAppearance: (config, onChange) => {
    const parts = dimensionPartRows(withDimensions, config, onChange);
    return [
      ...(parts.length
        ? parts
        : [
            colorRow(config, onChange, {
              name: "Colonnes",
              what: "des colonnes",
              key: COLUMN_COLOR,
              defaultColor: CHART_COLORS.green,
            }),
          ]),
      ...barChartRows(config, onChange),
    ];
  },
};

// --- Anneau ------------------------------------------------------------------

/** The ring's usual size, its thickness at that size, and the legend's height under it (DonutChart). */
const DONUT_SIZE = 150;
const DONUT_THICKNESS = 22;
const DONUT_LEGEND = 80;

/** The shares' colors by rank, when they have none of their own; then the empty ones', the merged ones'. */
const RANK_COLORS = [
  CHART_COLORS.blue,
  CHART_COLORS.green,
  CHART_COLORS.grape,
  CHART_COLORS.yellow,
  CHART_COLORS.cyan,
];
const rankKey = (rank: number) => `color${rank + 1}`;
const UNKNOWN_COLOR = "colorUnknown";
const OTHERS_COLOR = "colorOthers";

const donutIndicator: IndicatorWidget = {
  type: "donut",
  kind: "indicator",
  label: "Anneau",
  icon: IconChartDonut,
  ownSource: true,
  defaultConfig: { [NAME]: "", [INDICATOR_LIMIT]: DONUT_LIMIT, ...PX_HEIGHT },
  defaultHeight: cardHeight(() => DONUT_SIZE + DONUT_LEGEND),

  Display: keyed(
    withDimensions,
    function Donut(b) {
      const { items, slicer, pending } = useBreakdown(b);
      const { config, board } = b.props;
      const limit = count(config, INDICATOR_LIMIT, DONUT_LIMIT);
      const data = useMemo(() => {
        const { slices } = weigh(
          items ?? [],
          b.dimension,
          slicer,
          b.measure,
          board.userId,
          { zeros: false, limit: Infinity },
        );
        // Beyond the limit, the smallest shares merge into "Autres" — unless they are fixed.
        const shown = slicer.fixed ? slices : slices.slice(0, limit);
        const others = slicer.fixed
          ? 0
          : slices.slice(limit).reduce((sum, s) => sum + s.value, 0);
        let rank = 0;
        return [
          ...shown.map((s) => ({
            name: s.name,
            value: s.value,
            color:
              s.key === EMPTY_KEY
                ? colorOf(config, UNKNOWN_COLOR, CHART_COLORS.gray5)
                : b.dimension.ownColors && s.color
                  ? s.color
                  : colorOf(
                      config,
                      rankKey(rank),
                      RANK_COLORS[rank++ % RANK_COLORS.length]!,
                    ),
          })),
          ...(others > 0
            ? [
                {
                  name: "Autres",
                  value: others,
                  color: colorOf(config, OTHERS_COLOR, CHART_COLORS.gray6),
                },
              ]
            : []),
        ];
      }, [items, slicer, b.dimension, b.measure, board.userId, config, limit]);
      const total = data.reduce((sum, s) => sum + s.value, 0);
      return (
        <Card
          config={config}
          title={b.dimension.label}
          pending={pending}
          empty={items === null ? "…" : data.length ? null : b.source.none}
          centered
        >
          {(space) => {
            // The ring fits the space left, legend under it, and keeps its proportions.
            const size = space
              ? Math.max(
                  MIN_CHART,
                  Math.min(space.width, space.height - DONUT_LEGEND),
                )
              : DONUT_SIZE;
            return (
              <DonutChart
                data={data}
                size={size}
                thickness={Math.max(
                  6,
                  Math.round((size * DONUT_THICKNESS) / DONUT_SIZE),
                )}
                chartLabel={total}
                withTooltip
                withLegend
                pieProps={{ isAnimationActive: false }}
                {...donutChartProps(config)}
              />
            );
          }}
        </Card>
      );
    },
    "Anneau",
  ),

  Config: ({ config, onChange }) => {
    return (
      <IndicatorFields
        needs={withDimensions}
        config={config}
        onChange={onChange}
        title={dimensionTitle(withDimensions, config, "Anneau")}
      >
        <DimensionFields
          needs={withDimensions}
          config={config}
          onChange={onChange}
        />
        <LimitField
          config={config}
          onChange={onChange}
          defaultValue={DONUT_LIMIT}
          label="Parts affichées"
        />
      </IndicatorFields>
    );
  },

  chartAppearance: (config, onChange) => {
    const parts = dimensionPartRows(withDimensions, config, onChange);
    return [
      ...(parts.length
        ? parts
        : partRows(config, onChange, [
            ...RANK_COLORS.map((color, rank) => ({
              key: rankKey(rank),
              name: `Rang ${rank + 1}`,
              what: `de la part au rang ${rank + 1}`,
              defaultColor: color,
            })),
            {
              key: UNKNOWN_COLOR,
              name: "Non renseigné",
              what: "des éléments non renseignés",
              defaultColor: CHART_COLORS.gray5,
            },
            {
              key: OTHERS_COLOR,
              name: "Autres",
              what: "des autres parts",
              defaultColor: CHART_COLORS.gray6,
            },
          ])),
      ...donutChartRows(config, onChange, { withLabel: true }),
    ];
  },
};

// --- Radar -------------------------------------------------------------------

/** The radar's height: enough so the labels do not overlap. */
const RADAR_HEIGHT = 220;
const RADAR_COLOR = "color";
const STROKE_COLOR = "strokeColor";
const LEGEND_COLOR = "legendColor";
const GRID_COLOR = "gridColor";

const radarIndicator: IndicatorWidget = {
  type: "radar",
  kind: "indicator",
  label: "Radar",
  icon: IconChartRadar,
  ownSource: true,
  defaultConfig: { [NAME]: "", [INDICATOR_LIMIT]: 6, ...PX_HEIGHT },
  defaultHeight: cardHeight(() => RADAR_HEIGHT),

  Display: keyed(
    withDimensions,
    function Radar(b) {
      const { items, slicer, pending } = useBreakdown(b);
      const { config, board } = b.props;
      const { slices } = useMemo(
        () =>
          weigh(items ?? [], b.dimension, slicer, b.measure, board.userId, {
            // A branch at zero says something.
            zeros: true,
            limit: count(config, INDICATOR_LIMIT, 6),
          }),
        [items, slicer, b.dimension, b.measure, board.userId, config],
      );
      const stroke =
        text(config, STROKE_COLOR) || themeColor("chart-status-stroke");
      return (
        <Card
          config={config}
          title={b.dimension.label}
          pending={pending}
          empty={items === null ? "…" : slices.length ? null : b.source.none}
        >
          {(space) => (
            <RadarChart
              h={space?.height ?? RADAR_HEIGHT}
              data={slices.map((s) => ({
                slice: s.name,
                [b.source.unit]: s.value,
              }))}
              dataKey="slice"
              // The fill carries its own transparency: the chart adds none. The
              // dots take the outline's color — the fill's would fade them.
              series={[
                {
                  name: b.source.unit,
                  label: b.measure.label,
                  color:
                    text(config, RADAR_COLOR) ||
                    themeColor("chart-status-fill"),
                  strokeColor: stroke,
                  opacity: 1,
                },
              ]}
              dotProps={{ fill: stroke, stroke }}
              textColor={text(config, LEGEND_COLOR) || undefined}
              gridColor={text(config, GRID_COLOR) || undefined}
              withPolarRadiusAxis={false}
              withTooltip
              withDots
            />
          )}
        </Card>
      );
    },
    "Radar",
  ),

  Config: ({ config, onChange }) => {
    return (
      <IndicatorFields
        needs={withDimensions}
        config={config}
        onChange={onChange}
        title={dimensionTitle(withDimensions, config, "Radar")}
      >
        <DimensionFields
          needs={withDimensions}
          config={config}
          onChange={onChange}
        />
        <LimitField
          config={config}
          onChange={onChange}
          defaultValue={6}
          label="Branches affichées"
        />
      </IndicatorFields>
    );
  },

  // Each color shows its default; brought back to it, it is no longer stored.
  chartAppearance: (config, onChange) => {
    const row = (
      name: string,
      what: string,
      key: string,
      defaultColor: string,
      alpha = false,
    ): SettingRow => {
      const color = text(config, key);
      return {
        name,
        what,
        color: {
          value: color || defaultColor,
          onChange: (v) =>
            onChange(insertRow(config, { [key]: v === defaultColor ? "" : v })),
          alpha,
        },
        modified: color !== "" && color !== defaultColor,
        reset: () => onChange(insertRow(config, { [key]: "" })),
      };
    };
    return [
      row(
        "Surface",
        "de la surface du graphique",
        RADAR_COLOR,
        themeColor("chart-status-fill"),
        true,
      ),
      row(
        "Trait",
        "du trait du graphique",
        STROKE_COLOR,
        themeColor("chart-status-stroke"),
      ),
      row(
        "Légendes",
        "des légendes",
        LEGEND_COLOR,
        themeColor("widget-dimmed"),
      ),
      row("Grille", "de la grille", GRID_COLOR, themeColor("chart-grid"), true),
    ];
  },
};

// --- Contributions -----------------------------------------------------------

/** Rings read best by who carries the items: the actors, the members, when the data has them. */
const actorsInitial = (source: AnySource) => {
  const people = source.dimensions.find(
    (d) => d.value === "actors" || d.value === "members",
  );
  return people ? { [INDICATOR_DIMENSION]: people.value } : {};
};

const actorsIndicator: IndicatorWidget = {
  type: "actors",
  kind: "indicator",
  label: "Contributions",
  icon: IconUsers,
  ownSource: true,
  defaultConfig: { [NAME]: "", [INDICATOR_LIMIT]: DEFAULT_LIMIT, ...PX_HEIGHT },
  defaultHeight: cardHeight(() => RINGS_HEIGHT),

  Display: keyed(
    withDimensions,
    function Contributions(b) {
      const { items, slicer, pending } = useBreakdown(b);
      const { config, board } = b.props;
      const { slices, total } = useMemo(
        () =>
          weigh(items ?? [], b.dimension, slicer, b.measure, board.userId, {
            zeros: false,
            limit: count(config, INDICATOR_LIMIT, DEFAULT_LIMIT),
          }),
        [items, slicer, b.dimension, b.measure, board.userId, config],
      );
      return (
        <Card
          config={config}
          title={b.dimension.label}
          pending={pending}
          empty={items === null ? "…" : null}
        >
          {(space) => (
            <Rings
              h={space?.height}
              rows={slices.filter((s) => s.key !== EMPTY_KEY)}
              total={total}
              unit={b.source.unit}
              config={config}
              none={b.source.none}
            />
          )}
        </Card>
      );
    },
    "Contributions",
  ),

  Config: ({ config, onChange }) => {
    return (
      <IndicatorFields
        needs={withDimensions}
        config={config}
        onChange={onChange}
        title={dimensionTitle(withDimensions, config, "Contributions")}
        initial={actorsInitial}
      >
        <DimensionFields
          needs={withDimensions}
          config={config}
          onChange={onChange}
        />
        <LimitField
          config={config}
          onChange={onChange}
          defaultValue={DEFAULT_LIMIT}
          label="Anneaux affichés"
        />
      </IndicatorFields>
    );
  },

  chartAppearance: actorsAppearance,
};

// --- Évolution ---------------------------------------------------------------

const withDates: Needs = (s) => (s.dates?.length ?? 0) > 0;
const TREND_COLOR = "color";

const periodOf = (config: unknown) => {
  const days = count(config, INDICATOR_PERIOD, PERIOD_DEFAULT);
  return PERIODS.includes(days) ? days : PERIOD_DEFAULT;
};

function TrendBars({
  source,
  props,
}: {
  source: AnySource;
  props: IndicatorDisplayProps;
}) {
  const { config, board } = props;
  const sources = useSources(source.sourceType, config);
  const context = contextOf(source, props, sources);
  const items = source.useItems(context);
  const pending = source.usePending?.(context) ?? null;
  const date = chosen(source.dates!, config, INDICATOR_DATE);
  const measure = chosen(additive(source), config, INDICATOR_MEASURE);
  const days = periodOf(config);
  const data = useMemo(() => {
    const start = dayjs()
      .startOf("day")
      .subtract(days - 1, "day");
    const byDay = new Map<string, number>();
    for (const item of items ?? []) {
      const at = date.of(item);
      if (!at) continue;
      const day = dayjs(at).startOf("day");
      if (day.isBefore(start)) continue;
      const key = day.format("YYYY-MM-DD");
      byDay.set(
        key,
        (byDay.get(key) ?? 0) + measure.weight(item, { userId: board.userId }),
      );
    }
    return Array.from({ length: days }, (_, i) => {
      const day = start.add(i, "day");
      return {
        day: day.format("DD/MM"),
        [source.unit]: byDay.get(day.format("YYYY-MM-DD")) ?? 0,
      };
    });
  }, [items, date, measure, days, board.userId, source.unit]);
  return (
    <Card
      config={config}
      title={`${date.title} sur ${days} jours`}
      pending={pending}
      empty={items === null ? "…" : null}
    >
      {(space) => (
        <BarChart
          h={space?.height ?? BAR_HEIGHT}
          data={data}
          dataKey="day"
          series={[
            {
              name: source.unit,
              label: measure.label,
              color: colorOf(config, TREND_COLOR, CHART_COLORS.green),
            },
          ]}
          {...barChartProps(config)}
          yAxisProps={{ allowDecimals: false, width: 24 }}
          withTooltip
        />
      )}
    </Card>
  );
}

const trendIndicator: IndicatorWidget = {
  type: "trend",
  kind: "indicator",
  label: "Évolution",
  icon: IconChartLine,
  ownSource: true,
  defaultConfig: {
    [NAME]: "",
    [INDICATOR_PERIOD]: PERIOD_DEFAULT,
    ...PX_HEIGHT,
  },
  defaultHeight: cardHeight(() => BAR_HEIGHT),

  Display: (props) => {
    const source = sourceOf(withDates, props.config);
    if (!source) return <Unlinked config={props.config} title="Évolution" />;
    return <TrendBars key={source.data} source={source} props={props} />;
  },

  Config: ({ config, onChange }) => {
    const source = sourceOf(withDates, config);
    const date = source ? chosen(source.dates!, config, INDICATOR_DATE) : null;
    return (
      <IndicatorFields
        needs={withDates}
        config={config}
        onChange={onChange}
        title={
          date ? `${date.title} sur ${periodOf(config)} jours` : "Évolution"
        }
        initial={() => ({ [INDICATOR_MEASURE]: "total" })}
      >
        <ChoiceSelect
          label="Date"
          list={source?.dates ?? []}
          field={INDICATOR_DATE}
          config={config}
          onChange={onChange}
        />
        <ChoiceSelect
          label="Compter"
          list={source ? additive(source) : []}
          field={INDICATOR_MEASURE}
          config={config}
          onChange={onChange}
        />
        <Select
          label="Période"
          data={PERIODS.map((d) => ({
            value: String(d),
            label: `${d} derniers jours`,
          }))}
          value={String(periodOf(config))}
          onChange={(value) =>
            value &&
            onChange(withField(config, INDICATOR_PERIOD, Number(value)))
          }
          allowDeselect={false}
        />
      </IndicatorFields>
    );
  },

  chartAppearance: (config, onChange) => [
    colorRow(config, onChange, {
      name: "Barres",
      what: "des barres",
      key: TREND_COLOR,
      defaultColor: CHART_COLORS.green,
    }),
    ...barChartRows(config, onChange),
  ],
};

// --- Conformité --------------------------------------------------------------

const withChecks: Needs = (s) => (s.checks?.length ?? 0) > 0;
const COMPLIANCE_LABEL = "Conformité";

/** A rule counts until it is unticked: a new indicator takes them all. */
const active = (config: unknown, key: string): boolean =>
  (config as Record<string, unknown> | null)?.[key] !== false;

/** The ring's color: green at 90 % and above, orange at 70 %, red below. */
const rateColor = (part: number): string =>
  part >= 90 ? "teal" : part >= 70 ? "orange" : RED;

function ComplianceRing({
  source,
  props,
}: {
  source: AnySource;
  props: IndicatorDisplayProps;
}) {
  const { config } = props;
  const sources = useSources(source.sourceType, config);
  const items = source.useItems(contextOf(source, props, sources));
  const checks = source.checks!.filter((c) => active(config, c.key));
  const all = items ?? [];
  const compliant = all.filter(
    (item) => !checks.some((c) => c.fails(item)),
  ).length;
  const part = all.length ? Math.round((compliant / all.length) * 100) : 0;
  const missing = checks
    .map((c) => ({ check: c, count: all.filter(c.fails).length }))
    .filter((m) => m.count > 0);
  return (
    <Card
      config={config}
      title={COMPLIANCE_LABEL}
      pending={null}
      empty={items === null ? "…" : all.length ? null : source.none}
    >
      <Group gap="md" wrap="nowrap">
        <RingProgress
          size={110}
          thickness={12}
          roundCaps
          sections={[{ value: part, color: rateColor(part) }]}
          label={
            <Text ta="center" fw={600} fz="lg">
              {part} %
            </Text>
          }
        />
        <Stack gap={2} style={{ minWidth: 0 }}>
          <Text size="sm">
            {compliant} / {all.length} {source.unit} en règle
          </Text>
          {missing.map(({ check, count: n }) => (
            <Text key={check.key} size="sm" c="dimmed" truncate>
              {n} {check.missing}
            </Text>
          ))}
        </Stack>
      </Group>
    </Card>
  );
}

const complianceIndicator: IndicatorWidget = {
  type: "compliance",
  kind: "indicator",
  label: COMPLIANCE_LABEL,
  icon: IconShieldCheck,
  ownSource: true,
  defaultConfig: { [NAME]: "" },

  Display: (props) => {
    const source = sourceOf(withChecks, props.config);
    if (!source)
      return <Unlinked config={props.config} title={COMPLIANCE_LABEL} />;
    return <ComplianceRing key={source.data} source={source} props={props} />;
  },

  Config: ({ config, onChange }) => {
    const source = sourceOf(withChecks, config);
    return (
      <IndicatorFields
        needs={withChecks}
        config={config}
        onChange={onChange}
        title={COMPLIANCE_LABEL}
      >
        <Stack gap="xs">
          <Text size="sm" fw={500}>
            Règles
          </Text>
          {(source?.checks ?? []).map((check) => (
            <Switch
              key={check.key}
              label={check.label}
              checked={active(config, check.key)}
              onChange={(e) =>
                onChange(withField(config, check.key, e.currentTarget.checked))
              }
              color="teal"
            />
          ))}
        </Stack>
      </IndicatorFields>
    );
  },
};

/** The "Indicateurs" widgets, in the order the widgets drawer shows them. */
export const INDICATOR_WIDGETS: IndicatorWidget[] = [
  countIndicator,
  breakdownIndicator,
  columnsIndicator,
  donutIndicator,
  radarIndicator,
  actorsIndicator,
  trendIndicator,
  complianceIndicator,
];
