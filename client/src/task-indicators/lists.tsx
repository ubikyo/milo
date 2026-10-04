import { Stack } from "@mantine/core";
import { IconColumns } from "@tabler/icons-react";
import { LabelBars, NAME, Nothing, IndicatorTitle } from "./common";
import type { TaskIndicatorWidget } from "./types";
import { useListColors } from "../components/board/TaskBoard";

// Les listes du tableau ouvert, par nombre de cartes, dans l'ordre du tableau :
// où les tâches s'accumulent. Chaque barre prend le fond de sa liste sur le
// tableau, résolu pour le thème courant, et couvre au moins son nom : une
// liste vide se reconnaît encore à sa couleur.

const LABEL = "Cartes par liste";

export const listsIndicator: TaskIndicatorWidget = {
  type: "lists",
  kind: "task",
  label: LABEL,
  icon: IconColumns,
  defaultConfig: { [NAME]: "" },

  Display: ({ config, lists }) => {
    const colors = useListColors();
    const data = lists.map((list) => ({
      name: list.name,
      value: list.cards.filter((c) => c.kind === "card").length,
      color: colors(list.color).background,
    }));
    return (
      <Stack gap="xs" style={{ flex: 1 }}>
        <IndicatorTitle config={config} defaultValue={LABEL} />
        {data.length === 0 ? <Nothing>Aucune liste</Nothing> : <LabelBars data={data} insideLabel ownColors />}
      </Stack>
    );
  },
};
