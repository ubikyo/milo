import { DonutChart } from "@mantine/charts";
import { Stack } from "@mantine/core";
import { IconCalendarDue } from "@tabler/icons-react";
import { dueState } from "../../lib/due";
import { ongoing, NAME, Nothing, IndicatorTitle } from "./common";
import type { SupportIndicatorWidget } from "./types";

// Where the due dates of open requests stand: those that are past,
// those approaching, those with time, and those without any.
// The "soon" rule is that of cards (lib/due).

const LABEL = "Échéances";

export const duesIndicator: SupportIndicatorWidget = {
  type: "due",
  kind: "helpdesk",
  label: LABEL,
  icon: IconCalendarDue,
  defaultConfig: { [NAME]: "" },

  Display: ({ config, requests }) => {
    const ongoingRequests = requests.filter(ongoing);
    const account = (filter: (due: string) => boolean) =>
      ongoingRequests.filter((d) => filter(d.due_date)).length;
    const data = [
      { name: "En retard", value: account((due) => dueState(due) === "late"), color: "red.6" },
      { name: "Bientôt", value: account((due) => dueState(due) === "soon"), color: "orange.6" },
      {
        name: "À venir",
        value: account((due) => Boolean(due) && dueState(due) === "none"),
        color: "green.6",
      },
      { name: "Sans échéance", value: account((due) => !due), color: "gray.5" },
    ].filter((part) => part.value > 0);

    return (
      <Stack gap={4} align="center" style={{ flex: 1 }}>
        <div style={{ alignSelf: "stretch" }}>
          <IndicatorTitle config={config} defaultValue={`${LABEL} des tickets en cours`} />
        </div>
        {data.length === 0 ? (
          <div style={{ alignSelf: "stretch" }}>
            <Nothing>Aucun ticket en cours</Nothing>
          </div>
        ) : (
          <DonutChart
            data={data}
            size={150}
            thickness={22}
            chartLabel={ongoingRequests.length}
            withTooltip
            withLegend
            pieProps={{ isAnimationActive: false }}
          />
        )}
      </Stack>
    );
  },
};
