import { BarChart } from "@mantine/charts";
import { Select, Stack } from "@mantine/core";
import { IconChartHistogram } from "@tabler/icons-react";
import dayjs from "dayjs";
import { withField, count } from "../types";
import { NameField, NAME, IndicatorTitle } from "./common";
import type { SupportIndicatorWidget } from "./types";

// Requests received day after day, over the chosen period: enough to see
// an influx coming, or the calm of a vacation week.

const LABEL = "Évolution";
const PERIOD = "days";
const PERIODS = [7, 14, 30];
const PERIOD_DEFAULT = 14;

/** The stored period, or the default one: an unknown value does not bring anything down. */
const periodOf = (config: unknown) => {
  const days = count(config, PERIOD, PERIOD_DEFAULT);
  return PERIODS.includes(days) ? days : PERIOD_DEFAULT;
};

export const evolutionIndicator: SupportIndicatorWidget = {
  type: "trend",
  kind: "helpdesk",
  label: LABEL,
  icon: IconChartHistogram,
  defaultConfig: { [NAME]: "", [PERIOD]: PERIOD_DEFAULT },

  Display: ({ config, requests }) => {
    const days = periodOf(config);
    const start = dayjs().startOf("day").subtract(days - 1, "day");
    const byDay = new Map<string, number>();
    for (const request of requests) {
      const day = dayjs(request.created_at).startOf("day");
      if (day.isBefore(start)) continue;
      const key = day.format("YYYY-MM-DD");
      byDay.set(key, (byDay.get(key) ?? 0) + 1);
    }
    const data = Array.from({ length: days }, (_, i) => {
      const day = start.add(i, "day");
      return { day: day.format("DD/MM"), tickets: byDay.get(day.format("YYYY-MM-DD")) ?? 0 };
    });

    return (
      <Stack gap={4} style={{ flex: 1 }}>
        <IndicatorTitle config={config} defaultValue={`${LABEL} sur ${days} jours`} />
        <BarChart
          h={160}
          data={data}
          dataKey="day"
          series={[{ name: "tickets", label: "Tickets", color: "teal.6" }]}
          gridAxis="none"
          yAxisProps={{ allowDecimals: false, width: 24 }}
          withTooltip
        />
      </Stack>
    );
  },

  Config: ({ config, onChange }) => (
    <Stack gap="xl">
      <NameField config={config} onChange={onChange} defaultValue={LABEL} />
      <Select
        label="Période"
        data={PERIODS.map((j) => ({ value: String(j), label: `${j} derniers jours` }))}
        value={String(periodOf(config))}
        onChange={(value) => value && onChange(withField(config, PERIOD, Number(value)))}
        allowDeselect={false}
      />
    </Stack>
  ),
};
