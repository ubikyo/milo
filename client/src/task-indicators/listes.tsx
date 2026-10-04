import { Stack } from "@mantine/core";
import { IconColumns } from "@tabler/icons-react";
import { BarresEtiquettes, NOM, Rien, TitreIndicateur } from "./commun";
import type { TaskIndicatorWidget } from "./types";
import { useListColors } from "../components/board/TaskBoard";

// Les listes du tableau ouvert, par nombre de cartes, dans l'ordre du tableau :
// où les tâches s'accumulent. Chaque barre prend le fond de sa liste sur le
// tableau, résolu pour le thème courant, et couvre au moins son nom : une
// liste vide se reconnaît encore à sa couleur.

const LIBELLE = "Cartes par liste";

export const listesIndicator: TaskIndicatorWidget = {
  type: "lists",
  kind: "task",
  label: LIBELLE,
  icon: IconColumns,
  defaultConfig: { [NOM]: "" },

  Display: ({ config, lists }) => {
    const couleurs = useListColors();
    const data = lists.map((liste) => ({
      name: liste.name,
      value: liste.cards.filter((c) => c.kind === "card").length,
      color: couleurs(liste.color).fond,
    }));
    return (
      <Stack gap="xs" style={{ flex: 1 }}>
        <TitreIndicateur config={config} defaut={LIBELLE} />
        {data.length === 0 ? <Rien>Aucune liste</Rien> : <BarresEtiquettes data={data} libelleDedans couleursPropres />}
      </Stack>
    );
  },
};
