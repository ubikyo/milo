import { RadarChart } from "@mantine/charts";
import { Stack } from "@mantine/core";
import { IconChartRadar } from "@tabler/icons-react";
import { SUPPORT_STATUSES } from "@milo/shared";
import { NOM, TitreIndicateur } from "./commun";
import type { SupportIndicatorWidget } from "./types";

// La répartition des demandes de la société regardée par statut, en radar :
// une branche par statut, et sa longueur dit combien de demandes il porte.

const LIBELLE = "Statuts";

/** La hauteur du radar : assez pour que les cinq libellés ne se chevauchent pas. */
const HAUTEUR_RADAR = 220;

export const statutsIndicator: SupportIndicatorWidget = {
  type: "status",
  kind: "helpdesk",
  label: LIBELLE,
  icon: IconChartRadar,
  defaultConfig: { [NOM]: "" },

  Display: ({ config, requests }) => {
    const data = SUPPORT_STATUSES.map(({ value, label }) => ({
      statut: label,
      tickets: requests.filter((d) => d.status === value).length,
    }));
    return (
      <Stack gap={4} style={{ flex: 1 }}>
        <TitreIndicateur config={config} defaut={LIBELLE} />
        <RadarChart
          h={HAUTEUR_RADAR}
          data={data}
          dataKey="statut"
          series={[{ name: "tickets", label: "Tickets", color: "teal.6", opacity: 0.2 }]}
          withPolarRadiusAxis={false}
          withTooltip
          withDots
        />
      </Stack>
    );
  },
};
