import { RadialBarChart } from "@mantine/charts";
import { Stack, Text } from "@mantine/core";
import { IconUsers } from "@tabler/icons-react";
import { CHART_COLORS, chosenColor, colorOf, colorRow, defaultText, defaultTrack, partRows } from "../chart-colors";
import { NAME, IndicatorTitle } from "./common";
import type { SupportIndicatorWidget } from "./types";
import type { Actor, Id } from "@milo/shared";

// Each actor's share in the requests of the company being viewed, as radial
// bars. A "Total" ring holds all the requests: it sets
// the scale, and each actor is read relative to it. A request with two
// actors counts for each.

const LABEL = "Acteurs";

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

/** The "Apparence du graphique" rows of the actors' rings: Project and Task modes share them. */
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

const CHART_HEIGHT = 240;

/**
 * The actors' rings: "actors" gives, item by item — request,
 * project, card —, those who carry it. Project and Task modes use it
 * too. "unit" names what is counted, in the hover bubble.
 */
export function ActorRings({ actors, unit, config }: { actors: Actor[][]; unit: string; config: unknown }) {
  const byActor = new Map<Id, { name: string; value: number }>();
  for (const actorGroup of actors) {
    for (const actor of actorGroup) {
      const already = byActor.get(actor.id);
      if (already) already.value += 1;
      else byActor.set(actor.id, { name: actor.name, value: 1 });
    }
  }
  const sorted = [...byActor.values()].sort(
    (a, b) => b.value - a.value || a.name.localeCompare(b.name),
  );
  if (sorted.length === 0) {
    return (
      <Text size="sm" c="dimmed">
        Aucun acteur
      </Text>
    );
  }
  const data = [{ name: TOTAL, value: actors.length }, ...sorted].map((row, rank) => ({
    name: row.name,
    [unit]: row.value,
    color: color(config, rank),
  }));
  const legend = chosenColor(config, LEGEND_COLOR);
  return (
    <RadialBarChart
      h={CHART_HEIGHT}
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

export const actorsIndicator: SupportIndicatorWidget = {
  type: "actors",
  kind: "helpdesk",
  label: LABEL,
  icon: IconUsers,
  defaultConfig: { [NAME]: "" },

  Display: ({ config, requests }) => (
    <Stack gap={4} style={{ flex: 1 }}>
      <IndicatorTitle config={config} defaultValue={LABEL} />
      <ActorRings actors={requests.map((d) => d.actors)} unit="tickets" config={config} />
    </Stack>
  ),

  chartAppearance: actorsAppearance,
};
