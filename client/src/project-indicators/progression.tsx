import { DonutChart } from "@mantine/charts";
import { Stack } from "@mantine/core";
import { IconProgress } from "@tabler/icons-react";
import { NAME, Nothing, TitreIndicateur } from "./commun";
import type { ProjectIndicatorWidget } from "./types";

// Où en sont les projets du tableau ouvert, en anneau : ceux qui n'ont pas
// commencé, ceux qui avancent — avant ou après la moitié —, ceux qui sont
// terminés.

const LABEL = "Progression";

// « Non démarrés » en gris foncé — un gris neutre, ceux de Mantine tirent sur
// le bleu.
const BANDS = [
  { name: "Non démarrés", color: "#383838", matches: (s: number) => s === 0 },
  { name: "Moins de 50 %", color: "orange.6", matches: (s: number) => s > 0 && s < 50 },
  { name: "50 % et plus", color: "blue.6", matches: (s: number) => s >= 50 && s < 100 },
  { name: "Terminés", color: "green.6", matches: (s: number) => s >= 100 },
];

export const progressIndicator: ProjectIndicatorWidget = {
  type: "progress",
  kind: "project",
  label: LABEL,
  icon: IconProgress,
  defaultConfig: { [NAME]: "" },

  Display: ({ config, projects }) => {
    const data = BANDS.map(({ name, color, matches }) => ({
      name,
      color,
      value: projects.filter((p) => matches(p.status)).length,
    })).filter((part) => part.value > 0);

    return (
      <Stack gap={4} align="center" style={{ flex: 1 }}>
        <div style={{ alignSelf: "stretch" }}>
          <TitreIndicateur config={config} defaultValue={LABEL} />
        </div>
        {data.length === 0 ? (
          <div style={{ alignSelf: "stretch" }}>
            <Nothing>Aucun projet</Nothing>
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
