import { Stack } from "@mantine/core";
import { IconColumns } from "@tabler/icons-react";
import { BarresEtiquettes, NOM, Rien, TitreIndicateur } from "./commun";
import type { TaskIndicatorWidget } from "./types";
import type { TaskList } from "@milo/shared";

// Les listes du tableau ouvert, par nombre de cartes, dans l'ordre du tableau :
// où les tâches s'accumulent. Chaque barre prend la couleur de sa liste.

const LIBELLE = "Cartes par liste";

/** La couleur d'une barre : celle de la liste, ou le vert de l'application. */
const couleurDe = (liste: TaskList): string => {
  if (!liste.color) return "teal.6";
  if (liste.color === "white") return "gray.4";
  return `${liste.color}.6`;
};

export const listesIndicator: TaskIndicatorWidget = {
  type: "lists",
  label: LIBELLE,
  icon: IconColumns,
  defaultConfig: { [NOM]: "" },

  Display: ({ config, lists }) => {
    const data = lists.map((liste) => ({
      name: liste.name,
      value: liste.cards.filter((c) => c.kind === "card").length,
      color: couleurDe(liste),
    }));
    return (
      <Stack gap="xs" style={{ flex: 1 }}>
        <TitreIndicateur config={config} defaut={LIBELLE} />
        {data.length === 0 ? <Rien>Aucune liste</Rien> : <BarresEtiquettes data={data} />}
      </Stack>
    );
  },
};
