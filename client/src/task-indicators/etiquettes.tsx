import { Stack } from "@mantine/core";
import { IconTags } from "@tabler/icons-react";
import { BarresEtiquettes, NOM, Rien, TitreIndicateur, tachesDe } from "./commun";
import type { Barre } from "./commun";
import type { TaskIndicatorWidget } from "./types";
import type { Id } from "@milo/shared";

// Les étiquettes les plus portées par les cartes du tableau ouvert, chacune
// dans sa couleur.

const LIBELLE = "Étiquettes";

export const etiquettesTachesIndicator: TaskIndicatorWidget = {
  type: "labels",
  kind: "task",
  label: LIBELLE,
  icon: IconTags,
  defaultConfig: { [NOM]: "" },

  Display: ({ config, lists }) => {
    const parEtiquette = new Map<Id, Barre>();
    for (const carte of tachesDe(lists)) {
      for (const etiquette of carte.labels) {
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
        {data.length === 0 ? <Rien>Aucune étiquette</Rien> : <BarresEtiquettes data={data} />}
      </Stack>
    );
  },
};
