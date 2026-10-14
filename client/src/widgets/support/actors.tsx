import { RadialBarChart } from "@mantine/charts";
import { Text } from "@mantine/core";
import { CHART_COLORS, chosenColor, colorOf, colorRow, defaultText, defaultTrack, partRows } from "../chart-colors";

// Each slice's share — an actor's, a label's… — in the items counted, as
// radial bars (widgets/indicators, "Contributions"). A "Total" ring holds all
// the items: it sets the scale, and each slice is read relative to it.

/** All the requests: the ring that gives the scale. */
const TOTAL = "Total";

/**
 * The total in gray, then one color per actor; the palette loops beyond that.
 * Each is set in its own row: the total's, then each rank's.
 */
const TOTAL_COLOR = CHART_COLORS.gray6;
const COLORS = [
  CHART_COLORS.blue,
  CHART_COLORS.green,
  CHART_COLORS.orange,
  CHART_COLORS.grape,
  CHART_COLORS.yellow,
  CHART_COLORS.red,
  CHART_COLORS.cyan,
  CHART_COLORS.pink,
  CHART_COLORS.lime,
  CHART_COLORS.indigo,
];
const TOTAL_KEY = "colorTotal";
const rankKey = (rank: number) => `color${rank + 1}`;
const LEGEND_COLOR = "legendColor";
const TRACK_COLOR = "trackColor";

const color = (config: unknown, rank: number) => {
  if (rank === 0) return colorOf(config, TOTAL_KEY, TOTAL_COLOR);
  const shade = (rank - 1) % COLORS.length;
  return colorOf(config, rankKey(shade), COLORS[shade] as string);
};

/** The "Apparence du graphique" rows of the rings. */
export const actorsAppearance = (config: unknown, onChange: (config: Record<string, unknown>) => void) => [
  ...partRows(config, onChange, [
    { key: TOTAL_KEY, name: TOTAL, what: "du total", defaultColor: TOTAL_COLOR },
    ...COLORS.map((c, rank) => ({
      key: rankKey(rank),
      name: `Rang ${rank + 1}`,
      what: `de l'acteur au rang ${rank + 1}`,
      defaultColor: c,
    })),
  ]),
  colorRow(config, onChange, { name: "Légende", what: "de la légende", key: LEGEND_COLOR, defaultColor: defaultText() }),
  colorRow(config, onChange, { name: "Fond", what: "du fond des anneaux", key: TRACK_COLOR, defaultColor: defaultTrack() }),
];

/** The rings' usual height, legend included. */
export const RINGS_HEIGHT = 240;

/**
 * Contribution rings: a "Total" ring that sets the scale — all the items
 * counted —, then each slice — an actor, a label… —, the largest first. An
 * item that falls in two counts for each. "unit" names what is counted, in
 * the hover bubble.
 */
export function Rings({
  rows,
  total,
  unit,
  config,
  none,
  h,
}: {
  rows: { name: string; value: number }[];
  total: number;
  unit: string;
  config: unknown;
  none: string;
  /** Its height, when the widget gives it one; failing that, the usual one. */
  h?: number;
}) {
  if (rows.length === 0) {
    return (
      <Text size="sm" c="dimmed">
        {none}
      </Text>
    );
  }
  const data = [{ name: TOTAL, value: total }, ...rows].map((row, rank) => ({
    name: row.name,
    [unit]: row.value,
    color: color(config, rank),
  }));
  const legend = chosenColor(config, LEGEND_COLOR);
  return (
    <RadialBarChart
      h={h ?? RINGS_HEIGHT}
      data={data}
      dataKey={unit}
      withBackground
      emptyBackgroundColor={chosenColor(config, TRACK_COLOR)}
      styles={legend ? { legendItemName: { color: legend } } : undefined}
      withTooltip
      withLegend
    />
  );
}
