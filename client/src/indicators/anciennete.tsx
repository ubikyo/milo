import { BarChart } from "@mantine/charts";
import { Stack } from "@mantine/core";
import { IconHourglass } from "@tabler/icons-react";
import dayjs from "dayjs";
import { enCours, NOM, TitreIndicateur } from "./commun";
import type { SupportIndicatorWidget } from "./types";

// Depuis combien de temps les demandes en cours attendent : le reste à faire,
// rangé par âge. Une barre qui grossit à droite, ce sont des demandes oubliées.

const LIBELLE = "Ancienneté";

/** Les tranches d'âge, en jours depuis la réception : la borne haute est exclue. */
const TRANCHES = [
  { label: "< 1 j", jusqua: 1, color: "green.6" },
  { label: "1–3 j", jusqua: 3, color: "teal.6" },
  { label: "3–7 j", jusqua: 7, color: "yellow.6" },
  { label: "7–30 j", jusqua: 30, color: "orange.6" },
  { label: "> 30 j", jusqua: Infinity, color: "red.6" },
];

export const ancienneteIndicator: SupportIndicatorWidget = {
  type: "age",
  label: LIBELLE,
  icon: IconHourglass,
  defaultConfig: { [NOM]: "" },

  Display: ({ config, requests }) => {
    const maintenant = dayjs();
    const comptes = TRANCHES.map(() => 0);
    for (const demande of requests.filter(enCours)) {
      const age = maintenant.diff(dayjs(demande.created_at), "day", true);
      const rang = TRANCHES.findIndex((t) => age < t.jusqua);
      comptes[rang] = (comptes[rang] ?? 0) + 1;
    }
    const data = TRANCHES.map((t, i) => ({ age: t.label, tickets: comptes[i] ?? 0, color: t.color }));

    return (
      <Stack gap={4} style={{ flex: 1 }}>
        <TitreIndicateur config={config} defaut={`${LIBELLE} des tickets en cours`} />
        <BarChart
          h={160}
          data={data}
          dataKey="age"
          series={[{ name: "tickets", label: "Tickets" }]}
          getBarColor={(_, serie) => serie.color ?? "teal.6"}
          barProps={{ isAnimationActive: false }}
          gridAxis="y"
          tickLine="none"
          yAxisProps={{ allowDecimals: false, width: 24 }}
          withTooltip
        />
      </Stack>
    );
  },
};
