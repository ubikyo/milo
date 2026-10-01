import { BarsList } from "@mantine/charts";
import { Select, Stack } from "@mantine/core";
import { IconMailForward } from "@tabler/icons-react";
import { avec, nombre } from "../widgets/types";
import { ChampNom, NOM, Rien, TitreIndicateur } from "./commun";
import type { SupportIndicatorWidget } from "./types";

// Qui écrit le plus au support : les expéditeurs des demandes reçues par
// e-mail, du plus fréquent au moins fréquent. Une demande saisie à la main n'a
// pas d'expéditeur, elle ne compte pas.

const LIBELLE = "Top demandeurs";
const QUANTITE = "quantite";
const QUANTITES = [3, 5, 10];
const QUANTITE_PAR_DEFAUT = 5;

const quantiteDe = (config: unknown) => {
  const n = nombre(config, QUANTITE, QUANTITE_PAR_DEFAUT);
  return QUANTITES.includes(n) ? n : QUANTITE_PAR_DEFAUT;
};

export const demandeursIndicator: SupportIndicatorWidget = {
  type: "senders",
  label: LIBELLE,
  icon: IconMailForward,
  defaultConfig: { [NOM]: "", [QUANTITE]: QUANTITE_PAR_DEFAUT },

  Display: ({ config, requests }) => {
    // Un expéditeur se reconnaît à son adresse : son nom peut changer d'un
    // e-mail à l'autre, on garde le premier lu.
    const parAdresse = new Map<string, { name: string; value: number }>();
    for (const demande of requests) {
      const adresse = demande.sender_email.trim().toLowerCase();
      if (!adresse) continue;
      const deja = parAdresse.get(adresse);
      if (deja) deja.value += 1;
      else parAdresse.set(adresse, { name: demande.sender_name.trim() || adresse, value: 1 });
    }
    const data = [...parAdresse.values()]
      .sort((a, b) => b.value - a.value || a.name.localeCompare(b.name))
      .slice(0, quantiteDe(config));

    return (
      <Stack gap="xs" style={{ flex: 1 }}>
        <TitreIndicateur config={config} defaut={LIBELLE} />
        {data.length === 0 ? (
          <Rien>Aucun demandeur</Rien>
        ) : (
          <BarsList
            data={data}
            barHeight={24}
            barColor="teal.6"
            variant="filled"
            barTextColor="white"
          />
        )}
      </Stack>
    );
  },

  Config: ({ config, onChange }) => (
    <Stack gap="xl">
      <ChampNom config={config} onChange={onChange} defaut={LIBELLE} />
      <Select
        label="Nombre de demandeurs"
        data={QUANTITES.map((n) => ({ value: String(n), label: String(n) }))}
        value={String(quantiteDe(config))}
        onChange={(value) => value && onChange(avec(config, QUANTITE, Number(value)))}
        allowDeselect={false}
      />
    </Stack>
  ),
};
