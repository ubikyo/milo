import { DonutChart } from "@mantine/charts";
import { Stack } from "@mantine/core";
import { IconCalendarDue } from "@tabler/icons-react";
import { etatEcheance } from "../lib/echeance";
import { enCours, NOM, Rien, TitreIndicateur } from "./commun";
import type { SupportIndicatorWidget } from "./types";

// Où en sont les échéances des demandes en cours : celles qui sont passées,
// celles qui approchent, celles qui ont le temps, et celles qui n'en ont pas.
// La règle de « bientôt » est celle des cartes (lib/echeance).

const LIBELLE = "Échéances";

export const echeancesIndicator: SupportIndicatorWidget = {
  type: "due",
  label: LIBELLE,
  icon: IconCalendarDue,
  defaultConfig: { [NOM]: "" },

  Display: ({ config, requests }) => {
    const enCour = requests.filter(enCours);
    const compte = (filtre: (due: string) => boolean) =>
      enCour.filter((d) => filtre(d.due_date)).length;
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
          <TitreIndicateur config={config} defaut={`${LIBELLE} des tickets en cours`} />
        </div>
        {data.length === 0 ? (
          <div style={{ alignSelf: "stretch" }}>
            <Rien>Aucun ticket en cours</Rien>
          </div>
        ) : (
          <DonutChart
            data={data}
            size={150}
            thickness={22}
            chartLabel={enCour.length}
            withTooltip
            withLegend
            pieProps={{ isAnimationActive: false }}
          />
        )}
      </Stack>
    );
  },
};
