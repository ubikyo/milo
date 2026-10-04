import { DonutChart } from "@mantine/charts";
import { Stack } from "@mantine/core";
import { IconBrandWindows } from "@tabler/icons-react";
import { NAME, Nothing, TitreIndicateur } from "./common";
import type { AssetIndicatorWidget } from "./types";
import type { Asset } from "@milo/shared";

// Les systèmes du parc, en anneau, version par version : « Windows 11
// 25H2 », « macOS 15.5 ». L'édition ne compte pas — « Professionnel » et
// « Famille » font une même part —, c'est la version qui dit ce qui est à
// mettre à jour.

const LABEL = "Systèmes";

/** Au-delà, les plus petites parts se fondent dans « Autres ». */
const PARTS = 5;

const COLORS = ["blue.6", "teal.6", "grape.6", "yellow.6", "cyan.6"];

const UNKNOWN = "Inconnu";

/** Le système et sa version : « Windows 11 25H2 », « macOS 15.5 », « Ubuntu 24.04 ». */
const versionOf = (os: Asset["os"]): string => {
  if (!os || !os.name.trim()) return UNKNOWN;
  // Sous macOS, le numéro de build entre parenthèses — « (24F74) » — ne fait
  // pas une version : il est retiré, comme dans la liste.
  const version = (
    os.family === "macos" ? os.version.replace(/\s*\([^)]*\)/g, "") : os.version
  ).trim();
  let name: string;
  if (os.family === "windows") {
    // « Windows 11 Professionnel » : le nom sans l'édition.
    name = os.name.match(/Windows\s+(Server\s+)?\d+/i)?.[0] ?? os.name;
  } else if (os.family === "macos") {
    name = "macOS";
  } else {
    // Ailleurs, le nom sans la version qu'il porte parfois déjà.
    name = os.name.replace(/\s+[\d.]+.*$/, "").trim() || os.name;
  }
  // macOS donne « 15.5.1 » : le correctif ne fait pas une part à lui seul.
  const release =
    os.family === "macos" ? version.split(".").slice(0, 2).join(".") : version;
  return release ? `${name} ${release}` : name;
};

export const systemsIndicator: AssetIndicatorWidget = {
  type: "systems",
  kind: "asset",
  label: LABEL,
  icon: IconBrandWindows,
  defaultConfig: { [NAME]: "" },

  Display: ({ config, assets }) => {
    const bySystem = new Map<string, number>();
    for (const workstation of assets) {
      const name = versionOf(workstation.os);
      bySystem.set(name, (bySystem.get(name) ?? 0) + 1);
    }
    const sorted = [...bySystem.entries()].sort(
      (a, b) =>
        b[1] - a[1] || a[0].localeCompare(b[0], "fr", { numeric: true }),
    );
    const topItems = sorted.slice(0, PARTS);
    const others = sorted.slice(PARTS).reduce((total, [, n]) => total + n, 0);
    const data = [
      ...topItems.map(([name, value], rank) => ({
        name,
        value,
        color: name === UNKNOWN ? "gray.5" : (COLORS[rank] ?? "gray.6"),
      })),
      ...(others > 0
        ? [{ name: "Autres", value: others, color: "gray.6" }]
        : []),
    ];

    return (
      <Stack gap={4} align="center" style={{ flex: 1 }}>
        <div style={{ alignSelf: "stretch" }}>
          <TitreIndicateur config={config} defaultValue={LABEL} />
        </div>
        {data.length === 0 ? (
          <div style={{ alignSelf: "stretch" }}>
            <Nothing>Aucun poste</Nothing>
          </div>
        ) : (
          <DonutChart
            data={data}
            size={150}
            thickness={22}
            chartLabel={assets.length}
            withTooltip
            withLegend
            pieProps={{ isAnimationActive: false }}
          />
        )}
      </Stack>
    );
  },
};
