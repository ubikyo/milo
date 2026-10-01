import { Stack } from "@mantine/core";
import { IconUsers } from "@tabler/icons-react";
import { AnneauxActeurs } from "../indicators/acteurs";
import { NOM, TitreIndicateur, tachesDe } from "./commun";
import type { TaskIndicatorWidget } from "./types";

// La part de chaque membre dans les cartes du tableau ouvert, en barres
// radiales, comme les acteurs du Support.

const LIBELLE = "Membres";

export const membresIndicator: TaskIndicatorWidget = {
  type: "members",
  label: LIBELLE,
  icon: IconUsers,
  defaultConfig: { [NOM]: "" },

  Display: ({ config, lists }) => (
    <Stack gap={4} style={{ flex: 1 }}>
      <TitreIndicateur config={config} defaut={LIBELLE} />
      <AnneauxActeurs acteurs={tachesDe(lists).map((c) => c.members)} unite="cartes" />
    </Stack>
  ),
};
