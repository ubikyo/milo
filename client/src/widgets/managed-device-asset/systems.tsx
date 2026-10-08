import { DonutChart } from "@mantine/charts";
import { Stack } from "@mantine/core";
import { IconBrandWindows } from "@tabler/icons-react";
import { CHART_COLORS, colorOf, donutChartProps, donutChartRows, partRows } from "../chart-colors";
import { NAME, Nothing, IndicatorTitle } from "./common";
import type { AssetIndicatorWidget } from "./types";
import type { Asset } from "@milo/shared";

// The fleet's systems, as a ring, version by version: "Windows 11
// 25H2", "macOS 15.5". The edition doesn't count — "Professionnel" and
// "Famille" make up one share —, the version is what says what needs
// updating.

const LABEL = "Systèmes";

/** Beyond that, the smallest shares merge into "Autres". */
const PARTS = 5;

/**
 * The shares' colors, by rank — the most widespread system first —, then
 * the unknown systems' and the merged ones': each set in its own row.
 */
const COLORS = [CHART_COLORS.blue, CHART_COLORS.green, CHART_COLORS.grape, CHART_COLORS.yellow, CHART_COLORS.cyan];
const rankKey = (rank: number) => `color${rank + 1}`;
const UNKNOWN_COLOR = "colorUnknown";
const OTHERS_COLOR = "colorOthers";

const UNKNOWN = "Inconnu";

/** The system and its version: "Windows 11 25H2", "macOS 15.5", "Ubuntu 24.04". */
const versionOf = (os: Asset["os"]): string => {
  if (!os || !os.name.trim()) return UNKNOWN;
  // On macOS, the build number in parentheses — "(24F74)" — is not a
  // version: it is removed, as in the list.
  const version = (
    os.family === "macos" ? os.version.replace(/\s*\([^)]*\)/g, "") : os.version
  ).trim();
  let name: string;
  if (os.family === "windows") {
    // "Windows 11 Professionnel": the name without the edition.
    name = os.name.match(/Windows\s+(Server\s+)?\d+/i)?.[0] ?? os.name;
  } else if (os.family === "macos") {
    name = "macOS";
  } else {
    // Elsewhere, the name without the version it sometimes already carries.
    name = os.name.replace(/\s+[\d.]+.*$/, "").trim() || os.name;
  }
  // macOS gives "15.5.1": the patch doesn't make up a share on its own.
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
        color:
          name === UNKNOWN
            ? colorOf(config, UNKNOWN_COLOR, CHART_COLORS.gray5)
            : colorOf(config, rankKey(rank), COLORS[rank] ?? CHART_COLORS.gray6),
      })),
      ...(others > 0
        ? [{ name: "Autres", value: others, color: colorOf(config, OTHERS_COLOR, CHART_COLORS.gray6) }]
        : []),
    ];

    return (
      <Stack gap={4} align="center" style={{ flex: 1 }}>
        <div style={{ alignSelf: "stretch" }}>
          <IndicatorTitle config={config} defaultValue={LABEL} />
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
            {...donutChartProps(config)}
          />
        )}
      </Stack>
    );
  },

  chartAppearance: (config, onChange) => [
    ...partRows(config, onChange, [
      ...COLORS.map((color, rank) => ({
        key: rankKey(rank),
        name: `Rang ${rank + 1}`,
        what: `du système au rang ${rank + 1}`,
        defaultColor: color,
      })),
      { key: UNKNOWN_COLOR, name: UNKNOWN, what: "des systèmes inconnus", defaultColor: CHART_COLORS.gray5 },
      { key: OTHERS_COLOR, name: "Autres", what: "des autres systèmes", defaultColor: CHART_COLORS.gray6 },
    ]),
    ...donutChartRows(config, onChange, { withLabel: true }),
  ],
};
