import { BarChart } from "@mantine/charts";
import { Stack } from "@mantine/core";
import { IconHourglass } from "@tabler/icons-react";
import dayjs from "dayjs";
import { ongoing, NAME, IndicatorTitle } from "./common";
import type { SupportIndicatorWidget } from "./types";

// Depuis combien de temps les demandes en cours attendent : le reste à faire,
// rangé par âge. Une barre qui grossit à droite, ce sont des demandes oubliées.

const LABEL = "Ancienneté";

/** Les tranches d'âge, en jours depuis la réception : la borne haute est exclue. */
const BANDS = [
  { label: "< 1 j", upTo: 1, color: "green.6" },
  { label: "1–3 j", upTo: 3, color: "teal.6" },
  { label: "3–7 j", upTo: 7, color: "yellow.6" },
  { label: "7–30 j", upTo: 30, color: "orange.6" },
  { label: "> 30 j", upTo: Infinity, color: "red.6" },
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
    const data = BANDS.map((t, i) => ({ age: t.label, tickets: accounts[i] ?? 0, color: t.color }));

    return (
      <Stack gap={4} style={{ flex: 1 }}>
        <IndicatorTitle config={config} defaultValue={`${LABEL} des tickets en cours`} />
        <BarChart
          h={160}
          data={data}
          dataKey="age"
          series={[{ name: "tickets", label: "Tickets" }]}
          getBarColor={(_, seriesEntry) => seriesEntry.color ?? "teal.6"}
          barProps={{ isAnimationActive: false }}
          gridAxis="none"
          yAxisProps={{ allowDecimals: false, width: 24 }}
          withTooltip
        />
      </Stack>
    );
  },
};
