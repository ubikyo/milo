import { BarChart } from "@mantine/charts";
import { Stack } from "@mantine/core";
import { IconHourglass } from "@tabler/icons-react";
import dayjs from "dayjs";
import { CHART_COLORS, barChartProps, barChartRows, colorOf, partRows } from "../chart-colors";
import { ongoing, NAME, IndicatorTitle } from "./common";
import type { SupportIndicatorWidget } from "./types";

// How long the open requests have been waiting: the remaining work,
// arranged by age. A bar that grows to the right means forgotten requests.

const LABEL = "Ancienneté";

/**
 * The age brackets, in days since receipt: the upper bound is excluded. Each
 * bar's color is set in its own row; "key" is where it is stored.
 */
const BANDS = [
  { label: "< 1 j", upTo: 1, key: "colorDay", what: "de moins d'un jour", color: CHART_COLORS.green },
  { label: "1–3 j", upTo: 3, key: "colorDays", what: "de 1 à 3 jours", color: CHART_COLORS.green },
  { label: "3–7 j", upTo: 7, key: "colorWeek", what: "de 3 à 7 jours", color: CHART_COLORS.yellow },
  { label: "7–30 j", upTo: 30, key: "colorMonth", what: "de 7 à 30 jours", color: CHART_COLORS.orange },
  { label: "> 30 j", upTo: Infinity, key: "colorOlder", what: "de plus de 30 jours", color: CHART_COLORS.red },
];

export const ageIndicator: SupportIndicatorWidget = {
  type: "age",
  kind: "helpdesk",
  label: LABEL,
  icon: IconHourglass,
  defaultConfig: { [NAME]: "" },

  Display: ({ config, requests }) => {
    const currentTime = dayjs();
    const accounts = BANDS.map(() => 0);
    for (const request of requests.filter(ongoing)) {
      const age = currentTime.diff(dayjs(request.created_at), "day", true);
      const rank = BANDS.findIndex((t) => age < t.upTo);
      accounts[rank] = (accounts[rank] ?? 0) + 1;
    }
    const data = BANDS.map((t, i) => ({ age: t.label, tickets: accounts[i] ?? 0, color: colorOf(config, t.key, t.color) }));

    return (
      <Stack gap={4} style={{ flex: 1 }}>
        <IndicatorTitle config={config} defaultValue={`${LABEL} des tickets en cours`} />
        <BarChart
          h={160}
          data={data}
          dataKey="age"
          series={[{ name: "tickets", label: "Tickets" }]}
          getBarColor={(_, seriesEntry) => seriesEntry.color ?? CHART_COLORS.green}
          barProps={{ isAnimationActive: false }}
          {...barChartProps(config)}
          yAxisProps={{ allowDecimals: false, width: 24 }}
          withTooltip
        />
      </Stack>
    );
  },

  chartAppearance: (config, onChange) => [
    ...partRows(
      config,
      onChange,
      BANDS.map((t) => ({ key: t.key, name: t.label, what: `des tickets ${t.what}`, defaultColor: t.color })),
    ),
    ...barChartRows(config, onChange),
  ],
};
