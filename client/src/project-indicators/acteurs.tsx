import { Checkbox, Stack } from "@mantine/core";
import { IconUsers } from "@tabler/icons-react";
import { AnneauxActeurs } from "../indicators/acteurs";
import { avec } from "../widgets/types";
import { ChampNom, NOM, TitreIndicateur, termine } from "./commun";
import type { ProjectIndicatorWidget } from "./types";

// La part de chaque acteur dans les projets du tableau ouvert, en barres
// radiales, comme au Support. Les projets terminés n'y comptent que si on le
// demande.

const LIBELLE = "Acteurs";
const TOUS = "tous";

const tousLesProjets = (config: unknown) =>
  Boolean((config as Record<string, unknown> | null)?.[TOUS]);

export const acteursProjetsIndicator: ProjectIndicatorWidget = {
  type: "actors",
  label: LIBELLE,
  icon: IconUsers,
  defaultConfig: { [NOM]: "", [TOUS]: false },

  Display: ({ config, projects }) => {
    const comptes = tousLesProjets(config) ? projects : projects.filter((p) => !termine(p));
    return (
      <Stack gap={4} style={{ flex: 1 }}>
        <TitreIndicateur config={config} defaut={LIBELLE} />
        <AnneauxActeurs acteurs={comptes.map((p) => p.actors)} unite="projets" />
      </Stack>
    );
  },

  Config: ({ config, onChange }) => (
    <Stack gap="md">
      <ChampNom config={config} onChange={onChange} defaut={LIBELLE} />
      <Checkbox
        label="Compter aussi les projets terminés"
        checked={tousLesProjets(config)}
        onChange={(e) => onChange(avec(config, TOUS, e.currentTarget.checked))}
        color="teal"
      />
    </Stack>
  ),
};
