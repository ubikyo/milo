import { Stack } from "@mantine/core";
import { IconDatabase } from "@tabler/icons-react";
import { diskUsage } from "../lib/poste";
import { LabelBars } from "../indicators/etiquettes";
import { NAME, Nothing, TitreIndicateur } from "./commun";
import type { AssetIndicatorWidget } from "./types";

// L'occupation des disques système, par tranche : vert, bleu, orange, puis
// rouge. Une barre rouge qui s'allonge, ce sont des postes qui vont manquer de
// place.

const LABEL = "Disques";

/**
 * Les tranches d'occupation, en pourcentage : la borne haute est exclue. Le
 * libellé de chaque barre dit la tranche qu'elle compte.
 */
const BANDS = [
  { name: "0 à 49 %", upTo: 50, color: "green.6" },
  { name: "50 à 69 %", upTo: 70, color: "blue.6" },
  { name: "70 à 84 %", upTo: 85, color: "orange.6" },
  { name: "85 à 100 %", upTo: Infinity, color: "red.6" },
];

export const disksIndicator: AssetIndicatorWidget = {
  type: "disks",
  kind: "asset",
  label: LABEL,
  icon: IconDatabase,
  defaultConfig: { [NAME]: "" },

  Display: ({ config, assets }) => {
    const accounts = BANDS.map(() => 0);
    let measures = 0;
    for (const workstation of assets) {
      const occupe = diskUsage(workstation.system_disk);
      if (occupe == null) continue;
      measures += 1;
      const rank = BANDS.findIndex((t) => occupe < t.upTo);
      accounts[rank] = (accounts[rank] ?? 0) + 1;
    }
    // Une tranche où ne tombe aucun poste n'a pas de barre à montrer.
    const data = BANDS.map(({ name, color }, i) => ({
      name,
      color,
      value: accounts[i] ?? 0,
    })).filter((band) => band.value > 0);

    return (
      <Stack gap="xs" style={{ flex: 1 }}>
        <TitreIndicateur config={config} defaultValue={`${LABEL} système`} />
        {measures === 0 ? (
          <Nothing>Aucun disque mesuré</Nothing>
        ) : (
          <LabelBars data={data} />
        )}
      </Stack>
    );
  },
};
