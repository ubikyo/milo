import { BarChart } from "@mantine/charts";
import { Select, Stack } from "@mantine/core";
import { IconChartHistogram } from "@tabler/icons-react";
import dayjs from "dayjs";
import { avec, nombre } from "../widgets/types";
import { ChampNom, NOM, TitreIndicateur } from "./commun";
import type { SupportIndicatorWidget } from "./types";

// Les demandes reçues jour après jour, sur la période choisie : de quoi voir
// venir un afflux, ou le calme d'une semaine de vacances.

const LIBELLE = "Évolution";
const PERIODE = "jours";
const PERIODES = [7, 14, 30];
const PERIODE_PAR_DEFAUT = 14;

/** La période rangée, ou celle par défaut : une valeur inconnue ne fait rien tomber. */
const periodeDe = (config: unknown) => {
  const jours = nombre(config, PERIODE, PERIODE_PAR_DEFAUT);
  return PERIODES.includes(jours) ? jours : PERIODE_PAR_DEFAUT;
};

export const evolutionIndicator: SupportIndicatorWidget = {
  type: "trend",
  label: LIBELLE,
  icon: IconChartHistogram,
  defaultConfig: { [NOM]: "", [PERIODE]: PERIODE_PAR_DEFAUT },

  Display: ({ config, requests }) => {
    const jours = periodeDe(config);
    const debut = dayjs().startOf("day").subtract(jours - 1, "day");
    const parJour = new Map<string, number>();
    for (const demande of requests) {
      const jour = dayjs(demande.created_at).startOf("day");
      if (jour.isBefore(debut)) continue;
      const cle = jour.format("YYYY-MM-DD");
      parJour.set(cle, (parJour.get(cle) ?? 0) + 1);
    }
    const data = Array.from({ length: jours }, (_, i) => {
      const jour = debut.add(i, "day");
      return { jour: jour.format("DD/MM"), tickets: parJour.get(jour.format("YYYY-MM-DD")) ?? 0 };
    });

    return (
      <Stack gap={4} style={{ flex: 1 }}>
        <TitreIndicateur config={config} defaut={`${LIBELLE} sur ${jours} jours`} />
        <BarChart
          h={160}
          data={data}
          dataKey="jour"
          series={[{ name: "tickets", label: "Tickets", color: "teal.6" }]}
          gridAxis="y"
          tickLine="none"
          yAxisProps={{ allowDecimals: false, width: 24 }}
          withTooltip
        />
      </Stack>
    );
  },

  Config: ({ config, onChange }) => (
    <Stack gap="md">
      <ChampNom config={config} onChange={onChange} defaut={LIBELLE} />
      <Select
        label="Période"
        data={PERIODES.map((j) => ({ value: String(j), label: `${j} derniers jours` }))}
        value={String(periodeDe(config))}
        onChange={(value) => value && onChange(avec(config, PERIODE, Number(value)))}
        allowDeselect={false}
      />
    </Stack>
  ),
};
