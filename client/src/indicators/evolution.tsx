import { BarChart } from "@mantine/charts";
import { Select, Stack } from "@mantine/core";
import { IconChartHistogram } from "@tabler/icons-react";
import dayjs from "dayjs";
import { withField, count } from "../widgets/types";
import { NameField, NAME, TitreIndicateur } from "./commun";
import type { SupportIndicatorWidget } from "./types";

// Les demandes reçues jour après jour, sur la période choisie : de quoi voir
// venir un afflux, ou le calme d'une semaine de vacances.

const LABEL = "Évolution";
const PERIOD = "jours";
const PERIODS = [7, 14, 30];
const PERIOD_DEFAULT = 14;

/** La période rangée, ou celle par défaut : une valeur inconnue ne fait rien tomber. */
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
        <TitreIndicateur config={config} defaultValue={`${LABEL} sur ${days} jours`} />
        <BarChart
          h={160}
          data={data}
          dataKey="jour"
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
