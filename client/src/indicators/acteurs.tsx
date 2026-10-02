import { RadialBarChart } from "@mantine/charts";
import { Stack, Text } from "@mantine/core";
import { IconUsers } from "@tabler/icons-react";
import { NOM, TitreIndicateur } from "./commun";
import type { SupportIndicatorWidget } from "./types";
import type { Actor, Id } from "@milo/shared";

// La part de chaque acteur dans les demandes de la société regardée, en barres
// radiales. Un anneau « Total » porte toutes les demandes : c'est lui qui fixe
// l'échelle, et chaque acteur se lit par rapport à lui. Une demande à deux
// acteurs compte pour chacun.

const LIBELLE = "Acteurs";

/** Toutes les demandes : l'anneau qui donne l'échelle. */
const TOTAL = "Total";

/** Le total en gris, puis une couleur par acteur ; la palette reboucle au-delà. */
const COULEUR_TOTAL = "gray.6";
const COULEURS = ["blue.6", "teal.6", "orange.6", "grape.6", "yellow.6", "red.6", "cyan.6", "pink.6", "lime.6", "indigo.6"];
const couleur = (rang: number) =>
  rang === 0 ? COULEUR_TOTAL : COULEURS[(rang - 1) % COULEURS.length];

const HAUTEUR_GRAPHIQUE = 240;

/**
 * Les anneaux des acteurs : « acteurs » donne, élément par élément — demande,
 * projet, carte —, ceux qui le portent. Les modes Projet et Tâche s'en
 * servent aussi. « unite » nomme ce qui se compte, dans la bulle du survol.
 */
export function AnneauxActeurs({ acteurs, unite }: { acteurs: Actor[][]; unite: string }) {
  const parActeur = new Map<Id, { name: string; value: number }>();
  for (const portes of acteurs) {
    for (const acteur of portes) {
      const deja = parActeur.get(acteur.id);
      if (deja) deja.value += 1;
      else parActeur.set(acteur.id, { name: acteur.name, value: 1 });
    }
  }
  const tries = [...parActeur.values()].sort(
    (a, b) => b.value - a.value || a.name.localeCompare(b.name),
  );
  if (tries.length === 0) {
    return (
      <Text size="sm" c="dimmed">
        Aucun acteur
      </Text>
    );
  }
  const data = [{ name: TOTAL, value: acteurs.length }, ...tries].map((ligne, rang) => ({
    name: ligne.name,
    [unite]: ligne.value,
    color: couleur(rang),
  }));
  return (
    <RadialBarChart
      h={HAUTEUR_GRAPHIQUE}
      data={data}
      dataKey={unite}
      withBackground
      withTooltip
      withLegend
    />
  );
}

export const acteursIndicator: SupportIndicatorWidget = {
  type: "actors",
  kind: "helpdesk",
  label: LIBELLE,
  icon: IconUsers,
  defaultConfig: { [NOM]: "" },

  Display: ({ config, requests }) => (
    <Stack gap={4} style={{ flex: 1 }}>
      <TitreIndicateur config={config} defaut={LIBELLE} />
      <AnneauxActeurs acteurs={requests.map((d) => d.actors)} unite="tickets" />
    </Stack>
  ),
};
