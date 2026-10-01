import { DonutChart } from "@mantine/charts";
import { Stack } from "@mantine/core";
import { IconProgress } from "@tabler/icons-react";
import { NOM, Rien, TitreIndicateur } from "./commun";
import type { ProjectIndicatorWidget } from "./types";

// Où en sont les projets du tableau ouvert, en anneau : ceux qui n'ont pas
// commencé, ceux qui avancent — avant ou après la moitié —, ceux qui sont
// terminés.

const LIBELLE = "Progression";

const TRANCHES = [
  { name: "Non démarrés", color: "gray.5", retient: (s: number) => s === 0 },
  { name: "Moins de 50 %", color: "orange.6", retient: (s: number) => s > 0 && s < 50 },
  { name: "50 % et plus", color: "blue.6", retient: (s: number) => s >= 50 && s < 100 },
  { name: "Terminés", color: "green.6", retient: (s: number) => s >= 100 },
];

export const progressionIndicator: ProjectIndicatorWidget = {
  type: "progress",
  label: LIBELLE,
  icon: IconProgress,
  defaultConfig: { [NOM]: "" },

  Display: ({ config, projects }) => {
    const data = TRANCHES.map(({ name, color, retient }) => ({
      name,
      color,
      value: projects.filter((p) => retient(p.status)).length,
    })).filter((part) => part.value > 0);

    return (
      <Stack gap={4} align="center" style={{ flex: 1 }}>
        <div style={{ alignSelf: "stretch" }}>
          <TitreIndicateur config={config} defaut={LIBELLE} />
        </div>
        {data.length === 0 ? (
          <div style={{ alignSelf: "stretch" }}>
            <Rien>Aucun projet</Rien>
          </div>
        ) : (
          <DonutChart
            data={data}
            size={150}
            thickness={22}
            withTooltip
            withLegend
            pieProps={{ isAnimationActive: false }}
          />
        )}
      </Stack>
    );
  },
};
