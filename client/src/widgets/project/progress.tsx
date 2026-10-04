import { DonutChart } from "@mantine/charts";
import { Stack } from "@mantine/core";
import { IconProgress } from "@tabler/icons-react";
import { NAME, Nothing, IndicatorTitle } from "./common";
import type { ProjectIndicatorWidget } from "./types";

// Where the open board's projects stand, as a ring: those that have not
// started, those moving forward — before or after halfway —, those that are
// finished.

const LABEL = "Progression";

// "Non démarrés" in dark gray — a neutral gray, Mantine's lean toward
// blue.
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
          <IndicatorTitle config={config} defaultValue={LABEL} />
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
