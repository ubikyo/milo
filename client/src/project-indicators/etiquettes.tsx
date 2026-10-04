import { Checkbox, Stack } from "@mantine/core";
import { IconTags } from "@tabler/icons-react";
import { avec } from "../widgets/types";
import { BarresEtiquettes, ChampNom, NOM, Rien, TitreIndicateur, termine } from "./commun";
import type { Barre } from "./commun";
import type { ProjectIndicatorWidget } from "./types";
import type { Id } from "@milo/shared";

// Les étiquettes les plus portées par les projets du tableau ouvert, chacune
// dans sa couleur. Les projets terminés n'y comptent que si on le demande.

const LIBELLE = "Étiquettes";
const TOUS = "tous";

const tousLesProjets = (config: unknown) =>
  Boolean((config as Record<string, unknown> | null)?.[TOUS]);

export const etiquettesProjetsIndicator: ProjectIndicatorWidget = {
  type: "labels",
  kind: "project",
  label: LIBELLE,
  icon: IconTags,
  defaultConfig: { [NOM]: "", [TOUS]: false },

  Display: ({ config, projects }) => {
    const comptes = tousLesProjets(config) ? projects : projects.filter((p) => !termine(p));
    const parEtiquette = new Map<Id, Barre>();
    for (const projet of comptes) {
      for (const etiquette of projet.labels) {
        const deja = parEtiquette.get(etiquette.id);
        if (deja) deja.value += 1;
        else
          parEtiquette.set(etiquette.id, {
            name: etiquette.name,
            value: 1,
            color: etiquette.color,
          });
      }
    }
    const data = [...parEtiquette.values()].sort(
      (a, b) => b.value - a.value || a.name.localeCompare(b.name),
    );

    return (
      <Stack gap="xs" style={{ flex: 1 }}>
        <TitreIndicateur config={config} defaut={LIBELLE} />
        {data.length === 0 ? <Rien>Aucune étiquette</Rien> : <BarresEtiquettes data={data} couleursPropres />}
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
