import { Anchor, Stack, Text, TextInput } from "@mantine/core";
import { IconLink } from "@tabler/icons-react";
import { avec, texte } from "./types";
import type { AccessPlugin } from "./types";

// Un lien : l'adresse d'un service, et le mot qui la désigne. Sans libellé,
// c'est l'adresse qui se lit — un lien sans texte ne se cliquerait pas.

const LIBELLE = "libelle";
const URL = "url";

export const lienPlugin: AccessPlugin = {
  type: "link",
  label: "Lien",
  icon: IconLink,
  defaultConfig: { [LIBELLE]: "", [URL]: "" },

  Display: ({ config }) => {
    const url = texte(config, URL);
    const libelle = texte(config, LIBELLE) || url;
    if (!url) {
      return (
        <Text size="sm" c="dimmed">
          {libelle || "Lien"}
        </Text>
      );
    }
    return (
      // Une adresse extérieure s'ouvre à côté, et « noreferrer » évite de dire
      // d'où l'on vient.
      <Anchor href={url} target="_blank" rel="noopener noreferrer" size="sm" lineClamp={1}>
        {libelle}
      </Anchor>
    );
  },

  Config: ({ config, onChange }) => (
    <Stack gap="md">
      <TextInput
        label="Libellé"
        placeholder="Nom du lien"
        value={texte(config, LIBELLE)}
        onChange={(e) => onChange(avec(config, LIBELLE, e.currentTarget.value))}
        autoFocus
      />
      <TextInput
        label="Adresse"
        placeholder="https://"
        value={texte(config, URL)}
        onChange={(e) => onChange(avec(config, URL, e.currentTarget.value))}
      />
    </Stack>
  ),
};
