import { DonutChart } from "@mantine/charts";
import { Stack } from "@mantine/core";
import { IconProgress } from "@tabler/icons-react";
import { CHART_COLORS, colorOf, donutChartProps, donutChartRows, partRows } from "../chart-colors";
import { NAME, Nothing, IndicatorTitle } from "./common";
import type { ProjectIndicatorWidget } from "./types";
import { themeColor } from "../../lib/themeColors";

// Where the open board's projects stand, as a ring: those that have not
// started, those moving forward — before or after halfway —, those that are
// finished.

const LABEL = "Progression";

// "Non démarrés" in dark gray — a neutral gray, Mantine's lean toward
// blue. Each share's color is set in its own row, named short ("short");
// "key" is where it is stored.
const BANDS = [
  { name: "Non démarrés", short: "0 %", key: "colorNotStarted", get color() { return themeColor("chart-not-started"); }, matches: (s: number) => s === 0 },
  { name: "Moins de 50 %", short: "< 50 %", key: "colorStarted", color: CHART_COLORS.orange, matches: (s: number) => s > 0 && s < 50 },
  { name: "50 % et plus", short: "≥ 50 %", key: "colorHalf", color: CHART_COLORS.blue, matches: (s: number) => s >= 50 && s < 100 },
  { name: "Terminés", short: "Terminés", key: "colorFinished", color: CHART_COLORS.green, matches: (s: number) => s >= 100 },
];

export const progressIndicator: ProjectIndicatorWidget = {
  type: "progress",
  kind: "project",
  label: LABEL,
  icon: IconProgress,
  defaultConfig: { [NAME]: "" },

  Display: ({ config, projects }) => {
    const data = BANDS.map(({ name, key, color, matches }) => ({
      name,
      color: colorOf(config, key, color),
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
            {...donutChartProps(config)}
          />
        )}
      </Stack>
    );
  },

  chartAppearance: (config, onChange) => [
    ...partRows(
      config,
      onChange,
      BANDS.map((b) => ({ key: b.key, name: b.short, what: `des projets ${b.name.toLowerCase()}`, defaultColor: b.color })),
    ),
    ...donutChartRows(config, onChange, { withLabel: false }),
  ],
};
