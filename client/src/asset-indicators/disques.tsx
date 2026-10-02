import { BarsList } from "@mantine/charts";
import { Stack } from "@mantine/core";
import { IconDatabase } from "@tabler/icons-react";
import { diskUsage } from "../lib/poste";
import { NOM, Rien, TitreIndicateur } from "./commun";
import type { AssetIndicatorWidget } from "./types";

// L'occupation des disques système, par tranche : vert, bleu, orange, puis
// rouge. Une barre rouge qui s'allonge, ce sont des postes qui vont manquer de
// place.

const LIBELLE = "Disques";

/**
 * Les tranches d'occupation, en pourcentage : la borne haute est exclue. Le
 * libellé de chaque barre dit la tranche qu'elle compte.
 */
const TRANCHES = [
  { name: "0 à 49 %", jusqua: 50, color: "green.6" },
  { name: "50 à 69 %", jusqua: 70, color: "blue.6" },
  { name: "70 à 84 %", jusqua: 85, color: "orange.6" },
  { name: "85 à 100 %", jusqua: Infinity, color: "red.6" },
];

/** La moitié de l'air que BarsList laisse à gauche du libellé. */
const PADDING =
  "0 var(--mantine-spacing-sm) 0 calc(var(--mantine-spacing-sm) / 2)";

export const disquesIndicator: AssetIndicatorWidget = {
  type: "disks",
  kind: "asset",
  label: LIBELLE,
  icon: IconDatabase,
  defaultConfig: { [NOM]: "" },

  Display: ({ config, assets }) => {
    const comptes = TRANCHES.map(() => 0);
    let mesures = 0;
    for (const poste of assets) {
      const occupe = diskUsage(poste.system_disk);
      if (occupe == null) continue;
      mesures += 1;
      const rang = TRANCHES.findIndex((t) => occupe < t.jusqua);
      comptes[rang] = (comptes[rang] ?? 0) + 1;
    }
    // Une tranche où ne tombe aucun poste n'a pas de barre à montrer.
    const data = TRANCHES.map(({ name, color }, i) => ({
      name,
      color,
      value: comptes[i] ?? 0,
    })).filter((tranche) => tranche.value > 0);

    return (
      <Stack gap="xs" style={{ flex: 1 }}>
        <TitreIndicateur config={config} defaut={`${LIBELLE} système`} />
        {mesures === 0 ? (
          <Rien>Aucun disque mesuré</Rien>
        ) : (
          <BarsList
            data={data}
            barHeight={24}
            // Des barres pleines, le libellé en blanc dessus : en « light »,
            // le fond à peine teinté laissait le texte illisible.
            variant="filled"
            barTextColor="white"
            getBarProps={() => ({
              style: { padding: PADDING, whiteSpace: "nowrap" },
            })}
          />
        )}
      </Stack>
    );
  },
};
