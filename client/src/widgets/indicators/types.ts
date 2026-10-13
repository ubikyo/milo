// The contract between the "Indicateurs" widgets (widgets/indicators) and the
// data they show. Each list widget kind declares a source (IndicatorSource):
// its items — read from the list widgets named ("Widgets associés"), on any
// board one sees, those of the open board as the page already holds them —,
// what can be measured of them, how they can be broken down, dated, checked.
// The indicator types only know this contract: a source added shows in all
// those it can feed.

import type { ComponentType } from "react";
import type { Id, SourceWidget } from "@milo/shared";
import type { BoardData } from "..";

/** What every hook of a source receives. */
export interface SourceContext {
  /** The list widgets named, of the source's kind (or the Mail widgets). */
  sources: SourceWidget[];
  config: unknown;
  /** The open board's data, as the page reads it — its context applied. */
  board: BoardData;
  /** The indicator itself: the Mail counts are asked for by its id. */
  widgetId: Id;
}

/** What an item weighs in what is measured, and who is looking: "mine" counts through them. */
export interface MeasureContext {
  userId: Id;
}

/**
 * What can be measured of items: how many — all, the late ones… —, a sum.
 * A filter weighs 1 for the items it keeps, 0 for the others.
 */
export interface Measure<Item> {
  value: string;
  /** "Tickets ouverts": the choice, and the title while none is given. */
  label: string;
  weight(item: Item, context: MeasureContext): number;
  /** The figure as it reads: "1 250,00 €". As is without it. */
  format?(value: number): string;
  /**
   * A figure the source reads itself rather than from its items — the
   * e-mails received today, which Graph counts: "Nombre" only.
   */
  useTotal?(context: SourceContext): number | null;
}

/** A part of a breakdown: an item falls in one or several. */
export interface Slice {
  /** What tells two slices apart: an id, a name. */
  key: string;
  /** What the chart says: a label's name, a category's path. */
  name: string;
  /** Its own color — a label's, a list's, a band's —: a Mantine color or a CSS one. */
  color?: string;
}

/** How items fall in slices, as a dimension's hook gives it. */
export interface Slicer<Item> {
  slices(item: Item): Slice[];
  /**
   * The slices there always are, in their order — the statuses, the age
   * bands, a board's lists —: shown in it rather than by size, and
   * shown empty when asked.
   */
  fixed?: Slice[];
}

/** A way to break items down: by status, by label… */
export interface Dimension<Item> {
  value: string;
  /** "Étiquettes": the choice, and the title while none is given. */
  label: string;
  /** A hook: it may read what the slices need — the label groups, a tree. */
  useSlicer(context: SourceContext): Slicer<Item>;
  /**
   * The slice of the items that fall in none: "Aucun fournisseur". Without
   * it, they are left out.
   */
  empty?: string;
  /** The bars take their slice's color rather than the gradient of their values. */
  ownColors?: boolean;
  /** A bar is at least as wide as its name: an empty list keeps its color. */
  insideLabel?: boolean;
  /**
   * The fixed slices whose colors the chart's appearance changes: where the
   * configuration stores each — those the former widgets stored —, its name
   * and its color while none is chosen.
   */
  parts?: { key: string; slice: string; name: string; color: string; what?: string }[];
  /** More fields in the drawer: the label group counted. */
  Config?: ComponentType<{ config: unknown; onChange: (config: Record<string, unknown>) => void }>;
}

/** A date of the items, for "Évolution": received, created. */
export interface DateField<Item> {
  value: string;
  label: string;
  /** "Tickets reçus": the title. */
  title: string;
  of(item: Item): string | null;
}

/** A rule an item may miss, for "Conformité". */
export interface Check<Item> {
  /** Where the configuration stores it — on unless false. */
  key: string;
  /** What it requires, in the drawer. */
  label: string;
  /** What is missing, beside the ring: "non chiffrés". */
  missing: string;
  fails(item: Item): boolean;
}

/** What a list widget kind gives the indicators. */
export interface IndicatorSource<Item> {
  /** What the configuration stores (INDICATOR_DATA): the list widgets' prefix, or "mail". */
  data: string;
  /** "Tickets": the "Données" choice. */
  label: string;
  /** The widgets named: "<data>.list", or "mail". */
  sourceType: string;
  /** "tickets": what a chart counts, in its bubble. */
  unit: string;
  /** "Aucun ticket": nothing to count. */
  none: string;
  /** A hook: the items of the widgets named; null while they are read. */
  useItems(context: SourceContext): Item[] | null;
  /** The first is the default. */
  measures: Measure<Item>[];
  /** The first is the default. */
  dimensions: Dimension<Item>[];
  dates?: DateField<Item>[];
  checks?: Check<Item>[];
  /** More fields in the drawer, after "Widgets associés": the mail folders counted. */
  Config?: ComponentType<{ config: unknown; onChange: (config: Record<string, unknown>) => void }>;
  /** Shown in place of the figure while the items cannot be read, and why. */
  usePending?(context: SourceContext): string | null;
}

/** A source of any items, as the registry holds them. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnySource = IndicatorSource<any>;
