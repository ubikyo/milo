import { insertRow, type SettingRow } from "../components/ui/SettingRows";
import { BLUE, ORANGE, PALETTE_GREEN, PALETTE_RED } from "../themes/colors";
import { text } from "./types";
import { themeColor } from "../lib/themeColors";

// The colors of the indicators' charts, set in the "Apparence du graphique"
// block of their drawer (chartAppearance). Each field shows its default in
// hexadecimal, so the picker shows it: a palette color, or Mantine's own in
// the current scheme. Brought back to it, a color is no longer stored, and the
// chart keeps following the scheme.

type Config = Record<string, unknown>;
type OnChange = (config: Config) => void;

/**
 * The palette's colors in hexadecimal, as the picker writes them. The theme
 * fills "green", "teal", "red", "orange" and "blue" with the application's
 * own (main.tsx); the others are Mantine's sixth shade.
 */
export const CHART_COLORS = {
  green: PALETTE_GREEN.toLowerCase(),
  red: PALETTE_RED.toLowerCase(),
  orange: ORANGE.toLowerCase(),
  blue: BLUE.toLowerCase(),
  yellow: "#fab005",
  grape: "#be4bdb",
  cyan: "#15aabf",
  pink: "#e64980",
  lime: "#82c91e",
  indigo: "#4c6ef5",
  gray5: "#adb5bd",
  gray6: "#868e96",
};


/** Mantine's dimmed: the axes of a bar chart. */
export const defaultAxes = () => themeColor("widget-dimmed");

/** Mantine's text: a ring's legend and the figure at its center. */
export const defaultText = () => themeColor("widget-text");

/** The page's background: the line between a ring's parts. */
export const defaultSeparator = () => themeColor("chart-separator");

/** A bar chart's grid, translucent. */
export const defaultGrid = () => themeColor("chart-grid");

/** The band under the hovered bar, barely visible. */
export const defaultHover = () => themeColor("chart-hover");

/** The empty part of a radial bar's ring. */
export const defaultTrack = () => themeColor("chart-track");

/** The stored color, or the default. */
export const colorOf = (config: unknown, key: string, defaultColor: string) => text(config, key) || defaultColor;

/** The stored color, or nothing: the chart then takes Mantine's own. */
export const chosenColor = (config: unknown, key: string) => text(config, key) || undefined;

/** A row with a single color. */
export const colorRow = (
  config: unknown,
  onChange: OnChange,
  { name, what, key, defaultColor, alpha = false }: { name: string; what: string; key: string; defaultColor: string; alpha?: boolean },
): SettingRow => {
  const color = text(config, key);
  return {
    name,
    what,
    color: {
      value: color || defaultColor,
      onChange: (v) => onChange(insertRow(config, { [key]: v === defaultColor ? "" : v })),
      alpha,
    },
    modified: color !== "" && color !== defaultColor,
    reset: () => onChange(insertRow(config, { [key]: "" })),
  };
};

export const AXES_COLOR = "legendColor";
export const GRID = "grid";
export const GRID_COLOR = "gridColor";
export const HOVER_COLOR = "hoverColor";

/** The horizontal grid of a bar chart shows only when asked. */
export const hasGrid = (config: unknown) => (config as Config | null)?.[GRID] === true;

/** What a bar chart takes from its configuration: its axes, its grid, its hover band. */
export const barChartProps = (config: unknown) => ({
  textColor: chosenColor(config, AXES_COLOR),
  gridAxis: hasGrid(config) ? ("x" as const) : ("none" as const),
  gridColor: chosenColor(config, GRID_COLOR),
  cursorFill: chosenColor(config, HOVER_COLOR),
});

/**
 * The rows common to bar charts, after their bars': the axes, the grid — its
 * switch shows it, hidden by default —, the hover band.
 */
export const barChartRows = (config: unknown, onChange: OnChange): SettingRow[] => {
  const grid = colorRow(config, onChange, {
    name: "Grille",
    what: "de la grille",
    key: GRID_COLOR,
    defaultColor: defaultGrid(),
    alpha: true,
  });
  return [
    colorRow(config, onChange, { name: "Légende", what: "de la légende", key: AXES_COLOR, defaultColor: defaultAxes() }),
    {
      ...grid,
      toggle: {
        value: hasGrid(config),
        onChange: (v) => onChange(insertRow(config, { [GRID]: v || "" })),
      },
      modified: grid.modified || hasGrid(config),
      reset: () => onChange(insertRow(config, { [GRID]: "", [GRID_COLOR]: "" })),
    },
    colorRow(config, onChange, {
      name: "Survol",
      what: "du survol",
      key: HOVER_COLOR,
      defaultColor: defaultHover(),
      alpha: true,
    }),
  ];
};

/** A colored part of a chart — a bar, a ring's share —, set in its own row. */
export interface ChartPart {
  key: string;
  name: string;
  what: string;
  defaultColor: string;
}

export const partRows = (config: unknown, onChange: OnChange, parts: ChartPart[]): SettingRow[] =>
  parts.map(({ key, name, what, defaultColor }) => colorRow(config, onChange, { name, what, key, defaultColor }));

export const LEGEND_COLOR = "legendColor";
export const LABEL_COLOR = "labelColor";
export const SEPARATOR_COLOR = "separatorColor";

/** What a ring takes from its configuration: its legend, its center, its separators. */
export const donutChartProps = (config: unknown) => {
  const legend = chosenColor(config, LEGEND_COLOR);
  const label = chosenColor(config, LABEL_COLOR);
  return {
    strokeColor: chosenColor(config, SEPARATOR_COLOR),
    styles: {
      ...(legend ? { legendItemName: { color: legend } } : {}),
      ...(label ? { label: { fill: label } } : {}),
    },
  };
};

/**
 * The rows common to rings, after their shares': the legend, the figure at
 * the center when there is one, the line between the shares.
 */
export const donutChartRows = (config: unknown, onChange: OnChange, { withLabel }: { withLabel: boolean }): SettingRow[] => [
  colorRow(config, onChange, { name: "Légende", what: "de la légende", key: LEGEND_COLOR, defaultColor: defaultText() }),
  ...(withLabel
    ? [colorRow(config, onChange, { name: "Total", what: "du total", key: LABEL_COLOR, defaultColor: defaultText() })]
    : []),
  colorRow(config, onChange, {
    name: "Séparation",
    what: "de la séparation",
    key: SEPARATOR_COLOR,
    defaultColor: defaultSeparator(),
  }),
];
