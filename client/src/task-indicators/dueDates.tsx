import { DonutChart } from "@mantine/charts";
import { Stack } from "@mantine/core";
import { IconCalendarDue } from "@tabler/icons-react";
import { dueState } from "../lib/due";
import { NAME, Nothing, IndicatorTitle, tasksOf } from "./common";
import type { TaskIndicatorWidget } from "./types";

// Où en sont les échéances des cartes du tableau ouvert, comme au Support :
// passées, proches, lointaines, ou absentes. La règle de « bientôt » est celle
// des cartes (lib/echeance).

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
          />
        )}
      </Stack>
    );
  },
};
