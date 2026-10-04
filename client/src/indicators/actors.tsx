import { RadialBarChart } from "@mantine/charts";
import { Stack, Text } from "@mantine/core";
import { IconUsers } from "@tabler/icons-react";
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

/** The total in gray, then one color per actor; the palette loops beyond that. */
const TOTAL_COLOR = "gray.6";
const COLORS = ["blue.6", "teal.6", "orange.6", "grape.6", "yellow.6", "red.6", "cyan.6", "pink.6", "lime.6", "indigo.6"];
const color = (rank: number) =>
  rank === 0 ? TOTAL_COLOR : COLORS[(rank - 1) % COLORS.length];

const CHART_HEIGHT = 240;

/**
 * The actors' rings: "actors" gives, item by item — request,
 * project, card —, those who carry it. Project and Task modes use it
 * too. "unit" names what is counted, in the hover bubble.
 */
export function ActorRings({ actors, unit }: { actors: Actor[][]; unit: string }) {
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
    color: color(rank),
  }));
  return (
    <RadialBarChart
      h={CHART_HEIGHT}
      data={data}
      dataKey={unit}
      withBackground
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
      <ActorRings actors={requests.map((d) => d.actors)} unit="tickets" />
    </Stack>
  ),
};
