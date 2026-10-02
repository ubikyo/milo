import { Checkbox, Stack } from "@mantine/core";
import { IconCategory } from "@tabler/icons-react";
import { avec } from "../widgets/types";
import { BarresEtiquettes, ChampNom, NOM, Rien, TitreIndicateur, termine } from "./commun";
import type { Barre } from "./commun";
import type { ProjectIndicatorWidget } from "./types";

// Les catégories du tableau ouvert, par nombre de projets : où se porte le
// travail. Les projets terminés n'y comptent que si on le demande.

const LIBELLE = "Catégories";
const TOUS = "tous";

const tousLesProjets = (config: unknown) =>
  Boolean((config as Record<string, unknown> | null)?.[TOUS]);

export const categoriesIndicator: ProjectIndicatorWidget = {
  type: "categories",
  kind: "project",
  label: LIBELLE,
  icon: IconCategory,
  defaultConfig: { [NOM]: "", [TOUS]: false },

  Display: ({ config, projects }) => {
    const comptes = tousLesProjets(config) ? projects : projects.filter((p) => !termine(p));
    const parCategorie = new Map<string, Barre>();
    for (const projet of comptes) {
      const deja = parCategorie.get(projet.category_name);
      if (deja) deja.value += 1;
      else parCategorie.set(projet.category_name, { name: projet.category_name, value: 1, color: "teal.6" });
    }
    const data = [...parCategorie.values()].sort(
      (a, b) => b.value - a.value || a.name.localeCompare(b.name),
    );

    return (
      <Stack gap="xs" style={{ flex: 1 }}>
        <TitreIndicateur config={config} defaut={LIBELLE} />
        {data.length === 0 ? <Rien>Aucun projet</Rien> : <BarresEtiquettes data={data} />}
      </Stack>
    );
  },

  Config: ({ config, onChange }) => (
    <Stack gap="xl">
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
