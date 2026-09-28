import { Text, TextInput } from "@mantine/core";
import { IconFolder } from "@tabler/icons-react";
import { avec, texte } from "./types";
import type { AccessPlugin } from "./types";

// Une catégorie : le titre qui ouvre un groupe dans la colonne. Elle ne porte
// rien d'autre — ce qui la suit dans la section lui appartient à la lecture.

const TITRE = "titre";

export const categoriePlugin: AccessPlugin = {
  type: "category",
  label: "Catégorie",
  icon: IconFolder,
  defaultConfig: { [TITRE]: "" },

  Display: ({ config }) => (
    <Text fw={700} size="sm" tt="uppercase" c={texte(config, TITRE) ? undefined : "dimmed"}>
      {texte(config, TITRE) || "Catégorie"}
    </Text>
  ),

  Config: ({ config, onChange }) => (
    <TextInput
      label="Titre"
      placeholder="Titre de la catégorie"
      value={texte(config, TITRE)}
      onChange={(e) => onChange(avec(config, TITRE, e.currentTarget.value))}
      autoFocus
    />
  ),
};
