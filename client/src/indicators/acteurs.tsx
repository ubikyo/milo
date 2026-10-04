import { RadialBarChart } from "@mantine/charts";
import { Stack, Text } from "@mantine/core";
import { IconUsers } from "@tabler/icons-react";
import { NAME, TitreIndicateur } from "./commun";
import type { SupportIndicatorWidget } from "./types";
import type { Actor, Id } from "@milo/shared";

// La part de chaque acteur dans les demandes de la société regardée, en barres
// radiales. Un anneau « Total » porte toutes les demandes : c'est lui qui fixe
// l'échelle, et chaque acteur se lit par rapport à lui. Une demande à deux
// acteurs compte pour chacun.

const LABEL = "Acteurs";

/** Toutes les demandes : l'anneau qui donne l'échelle. */
const TOTAL = "Total";

/** Le total en gris, puis une couleur par acteur ; la palette reboucle au-delà. */
const TOTAL_COLOR = "gray.6";
const COLORS = ["blue.6", "teal.6", "orange.6", "grape.6", "yellow.6", "red.6", "cyan.6", "pink.6", "lime.6", "indigo.6"];
const color = (rank: number) =>
  rank === 0 ? TOTAL_COLOR : COLORS[(rank - 1) % COLORS.length];

const CHART_HEIGHT = 240;

/**
 * Les anneaux des acteurs : « acteurs » donne, élément par élément — demande,
 * projet, carte —, ceux qui le portent. Les modes Projet et Tâche s'en
 * servent aussi. « unite » nomme ce qui se compte, dans la bulle du survol.
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
      <TitreIndicateur config={config} defaultValue={LABEL} />
      <ActorRings actors={requests.map((d) => d.actors)} unit="tickets" />
    </Stack>
  ),
};
