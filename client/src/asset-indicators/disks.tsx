import { Stack } from "@mantine/core";
import { IconDatabase } from "@tabler/icons-react";
import { diskUsage } from "../lib/workstation";
import { LabelBars } from "../indicators/labels";
import { NAME, Nothing, IndicatorTitle } from "./common";
import type { AssetIndicatorWidget } from "./types";

// System disk usage, by bracket: green, blue, orange, then red. A red bar
// that keeps growing means workstations about to run out of
// space.

const LABEL = "Disques";

/**
 * The usage brackets, in percent: the upper bound is excluded. Each bar's
 * label says which bracket it counts.
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
      const used = diskUsage(workstation.system_disk);
      if (used == null) continue;
      measures += 1;
      const rank = BANDS.findIndex((t) => used < t.upTo);
      accounts[rank] = (accounts[rank] ?? 0) + 1;
    }
    // A bracket where no workstation falls has no bar to show.
    const data = BANDS.map(({ name, color }, i) => ({
      name,
      color,
      value: accounts[i] ?? 0,
    })).filter((band) => band.value > 0);

    return (
      <Stack gap="xs" style={{ flex: 1 }}>
        <IndicatorTitle config={config} defaultValue={`${LABEL} système`} />
        {measures === 0 ? (
          <Nothing>Aucun disque mesuré</Nothing>
        ) : (
          <LabelBars data={data} />
        )}
      </Stack>
    );
  },
};
