import { DonutChart } from "@mantine/charts";
import { Stack } from "@mantine/core";
import { IconBrandWindows } from "@tabler/icons-react";
import { NOM, Rien, TitreIndicateur } from "./commun";
import type { AssetIndicatorWidget } from "./types";
import type { Asset } from "@milo/shared";

// Les systèmes du parc, en anneau, version par version : « Windows 11
// 25H2 », « macOS 15.5 ». L'édition ne compte pas — « Professionnel » et
// « Famille » font une même part —, c'est la version qui dit ce qui est à
// mettre à jour.

const LIBELLE = "Systèmes";

/** Au-delà, les plus petites parts se fondent dans « Autres ». */
const PARTS = 5;

const COULEURS = ["blue.6", "teal.6", "grape.6", "yellow.6", "cyan.6"];

const INCONNU = "Inconnu";

/** Le système et sa version : « Windows 11 25H2 », « macOS 15.5 », « Ubuntu 24.04 ». */
const versionDe = (os: Asset["os"]): string => {
  if (!os || !os.name.trim()) return INCONNU;
  // Sous macOS, le numéro de build entre parenthèses — « (24F74) » — ne fait
  // pas une version : il est retiré, comme dans la liste.
  const version = (
    os.family === "macos" ? os.version.replace(/\s*\([^)]*\)/g, "") : os.version
  ).trim();
  let nom: string;
  if (os.family === "windows") {
    // « Windows 11 Professionnel » : le nom sans l'édition.
    nom = os.name.match(/Windows\s+(Server\s+)?\d+/i)?.[0] ?? os.name;
  } else if (os.family === "macos") {
    nom = "macOS";
  } else {
    // Ailleurs, le nom sans la version qu'il porte parfois déjà.
    nom = os.name.replace(/\s+[\d.]+.*$/, "").trim() || os.name;
  }
  // macOS donne « 15.5.1 » : le correctif ne fait pas une part à lui seul.
  const lue =
    os.family === "macos" ? version.split(".").slice(0, 2).join(".") : version;
  return lue ? `${nom} ${lue}` : nom;
};

export const systemesIndicator: AssetIndicatorWidget = {
  type: "systems",
  label: LIBELLE,
  icon: IconBrandWindows,
  defaultConfig: { [NOM]: "" },

  Display: ({ config, assets }) => {
    const parSysteme = new Map<string, number>();
    for (const poste of assets) {
      const nom = versionDe(poste.os);
      parSysteme.set(nom, (parSysteme.get(nom) ?? 0) + 1);
    }
    const tries = [...parSysteme.entries()].sort(
      (a, b) =>
        b[1] - a[1] || a[0].localeCompare(b[0], "fr", { numeric: true }),
    );
    const premiers = tries.slice(0, PARTS);
    const autres = tries.slice(PARTS).reduce((total, [, n]) => total + n, 0);
    const data = [
      ...premiers.map(([name, value], rang) => ({
        name,
        value,
        color: name === INCONNU ? "gray.5" : (COULEURS[rang] ?? "gray.6"),
      })),
      ...(autres > 0
        ? [{ name: "Autres", value: autres, color: "gray.6" }]
        : []),
    ];

    return (
      <Stack gap={4} align="center" style={{ flex: 1 }}>
        <div style={{ alignSelf: "stretch" }}>
          <TitreIndicateur config={config} defaut={LIBELLE} />
        </div>
        {data.length === 0 ? (
          <div style={{ alignSelf: "stretch" }}>
            <Rien>Aucun poste</Rien>
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
