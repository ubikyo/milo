import { DonutChart } from "@mantine/charts";
import { Stack } from "@mantine/core";
import { IconCalendarDue } from "@tabler/icons-react";
import { donutChartProps } from "../chart-colors";
import { dueAppearance, dueParts } from "../support/dueDates";
import { NAME, Nothing, IndicatorTitle, tasksOf } from "./common";
import type { TaskIndicatorWidget } from "./types";

// Where the open board's cards' due dates stand, as in Support:
// past, near, far, or absent. The "soon" rule is that
// of cards (lib/due).

const LABEL = "Échéances";

export const taskDuesIndicator: TaskIndicatorWidget = {
  type: "due",
  kind: "task",
  label: LABEL,
  icon: IconCalendarDue,
  defaultConfig: { [NAME]: "" },

  Display: ({ config, lists }) => {
    const cards = tasksOf(lists);
    const account = (filter: (due: string) => boolean) =>
      cards.filter((c) => filter(c.due_date)).length;
    const data = dueParts(config, account);

    return (
      <Stack gap={4} align="center" style={{ flex: 1 }}>
        <div style={{ alignSelf: "stretch" }}>
          <IndicatorTitle config={config} defaultValue={`${LABEL} des cartes`} />
        </div>
        {data.length === 0 ? (
          <div style={{ alignSelf: "stretch" }}>
            <Nothing>Aucune carte</Nothing>
          </div>
        ) : (
          <DonutChart
            data={data}
            size={150}
            thickness={22}
            chartLabel={cards.length}
            withTooltip
            withLegend
            pieProps={{ isAnimationActive: false }}
            {...donutChartProps(config)}
          />
        )}
      </Stack>
    );
  },

  chartAppearance: dueAppearance,
};
