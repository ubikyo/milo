import { Group, Stack, Text, TextInput } from "@mantine/core";
import { IconHash } from "@tabler/icons-react";
import { avec, texte } from "./types";
import type { AccessPlugin } from "./types";

// Un numéro : une référence que l'on vient lire — une ligne téléphonique, un
// contrat, un poste. Le libellé dit lequel, la valeur se détache.

const LIBELLE = "libelle";
const VALEUR = "valeur";

export const numeroPlugin: AccessPlugin = {
  type: "number",
  label: "Numéro",
  icon: IconHash,
  defaultConfig: { [LIBELLE]: "", [VALEUR]: "" },

  Display: ({ config }) => (
    <Group gap="xs" wrap="nowrap" justify="space-between">
      <Text size="sm" c="dimmed" truncate>
        {texte(config, LIBELLE) || "Numéro"}
      </Text>
      <Text size="sm" fw={600} style={{ whiteSpace: "nowrap" }}>
        {texte(config, VALEUR) || "—"}
      </Text>
    </Group>
  ),

  Config: ({ config, onChange }) => (
    <Stack gap="md">
      <TextInput
        label="Libellé"
        placeholder="Ce que ce numéro désigne"
        value={texte(config, LIBELLE)}
        onChange={(e) => onChange(avec(config, LIBELLE, e.currentTarget.value))}
        autoFocus
      />
      {/* Du texte et non un nombre : un numéro se copie tel qu'il s'écrit,
          avec ses espaces, ses points et son éventuel indicatif. */}
      <TextInput
        label="Numéro"
        placeholder="01 23 45 67 89"
        value={texte(config, VALEUR)}
        onChange={(e) => onChange(avec(config, VALEUR, e.currentTarget.value))}
      />
    </Stack>
  ),
};
