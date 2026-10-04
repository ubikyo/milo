import { RadarChart } from "@mantine/charts";
import { Stack } from "@mantine/core";
import { IconChartRadar } from "@tabler/icons-react";
import { SUPPORT_STATUSES } from "@milo/shared";
import { NAME, IndicatorTitle } from "./common";
import type { SupportIndicatorWidget } from "./types";

// The breakdown of the requests of the company being viewed by status, as a radar:
// one branch per status, and its length says how many requests it holds.

const LABEL = "Statuts";

/** The radar's height: enough so the five labels do not overlap. */
const RADAR_HEIGHT = 220;

export const statusesIndicator: SupportIndicatorWidget = {
  type: "status",
  kind: "helpdesk",
  label: LABEL,
  icon: IconChartRadar,
  defaultConfig: { [NAME]: "" },

  Display: ({ config, requests }) => {
    const data = SUPPORT_STATUSES.map(({ value, label }) => ({
      status: label,
      tickets: requests.filter((d) => d.status === value).length,
    }));
    return (
      <Stack gap={4} style={{ flex: 1 }}>
        <IndicatorTitle config={config} defaultValue={LABEL} />
        <RadarChart
          h={RADAR_HEIGHT}
          data={data}
          dataKey="status"
          series={[{ name: "tickets", label: "Tickets", color: "teal.6", opacity: 0.2 }]}
          withPolarRadiusAxis={false}
          withTooltip
          withDots
        />
      </Stack>
    );
  },
};
