import { Text, TextInput } from "@mantine/core";
import { IconFolderOpen } from "@tabler/icons-react";
import { avec, texte } from "./types";
import type { AccessPlugin } from "./types";

// Une sous-catégorie : le même rôle qu'une catégorie, un cran plus bas. Elle
// se lit donc plus discrètement, sans capitales.

const TITRE = "titre";

export const sousCategoriePlugin: AccessPlugin = {
  type: "subcategory",
  label: "Sous-catégorie",
  icon: IconFolderOpen,
  defaultConfig: { [TITRE]: "" },

  Display: ({ config }) => (
    <Text fw={600} size="sm" c={texte(config, TITRE) ? undefined : "dimmed"}>
      {texte(config, TITRE) || "Sous-catégorie"}
    </Text>
  ),

  Config: ({ config, onChange }) => (
    <TextInput
      label="Titre"
      placeholder="Titre de la sous-catégorie"
      value={texte(config, TITRE)}
      onChange={(e) => onChange(avec(config, TITRE, e.currentTarget.value))}
      autoFocus
    />
  ),
};
