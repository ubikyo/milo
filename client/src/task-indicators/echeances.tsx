import { DonutChart } from "@mantine/charts";
import { Stack } from "@mantine/core";
import { IconCalendarDue } from "@tabler/icons-react";
import { etatEcheance } from "../lib/echeance";
import { NOM, Rien, TitreIndicateur, tachesDe } from "./commun";
import type { TaskIndicatorWidget } from "./types";

// Où en sont les échéances des cartes du tableau ouvert, comme au Support :
// passées, proches, lointaines, ou absentes. La règle de « bientôt » est celle
// des cartes (lib/echeance).

const LIBELLE = "Échéances";

export const echeancesTachesIndicator: TaskIndicatorWidget = {
  type: "due",
  label: LIBELLE,
  icon: IconCalendarDue,
  defaultConfig: { [NOM]: "" },

  Display: ({ config, lists }) => {
    const cartes = tachesDe(lists);
    const compte = (filtre: (due: string) => boolean) =>
      cartes.filter((c) => filtre(c.due_date)).length;
    const data = [
      { name: "En retard", value: compte((due) => etatEcheance(due) === "retard"), color: "red.6" },
      { name: "Bientôt", value: compte((due) => etatEcheance(due) === "bientot"), color: "orange.6" },
      {
        name: "À venir",
        value: compte((due) => Boolean(due) && etatEcheance(due) === "aucun"),
        color: "green.6",
      },
      { name: "Sans échéance", value: compte((due) => !due), color: "gray.5" },
    ].filter((part) => part.value > 0);

    return (
      <Stack gap={4} align="center" style={{ flex: 1 }}>
        <div style={{ alignSelf: "stretch" }}>
          <TitreIndicateur config={config} defaut={`${LIBELLE} des cartes`} />
        </div>
        {data.length === 0 ? (
          <div style={{ alignSelf: "stretch" }}>
            <Rien>Aucune carte</Rien>
          </div>
        ) : (
          <DonutChart
            data={data}
            size={150}
            thickness={22}
            chartLabel={cartes.length}
            withTooltip
            withLegend
            pieProps={{ isAnimationActive: false }}
          />
        )}
      </Stack>
    );
  },
};
