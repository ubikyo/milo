import { Group, Select, Stack, Text, TextInput } from "@mantine/core";
import { IconClock } from "@tabler/icons-react";
import { useEffect, useState } from "react";
import { avec, texte } from "./types";
import type { AccessPlugin } from "./types";

// Une horloge : l'heure qu'il est ailleurs. Utile quand on appelle un site
// dans un autre fuseau — on voit d'un coup d'œil s'il est ouvert.

const LIBELLE = "libelle";
const FUSEAU = "fuseau";

// Les fuseaux proposés. La liste complète en compte des centaines : celle-ci
// couvre les lieux avec lesquels on travaille, et la saisie reste possible par
// ailleurs si le besoin vient.
const FUSEAUX = [
  { value: "Europe/Paris", label: "Paris" },
  { value: "Europe/London", label: "Londres" },
  { value: "Europe/Lisbon", label: "Lisbonne" },
  { value: "Africa/Casablanca", label: "Casablanca" },
  { value: "America/New_York", label: "New York" },
  { value: "America/Los_Angeles", label: "Los Angeles" },
  { value: "Asia/Dubai", label: "Dubaï" },
  { value: "Asia/Shanghai", label: "Shanghai" },
  { value: "Asia/Tokyo", label: "Tokyo" },
  { value: "Australia/Sydney", label: "Sydney" },
];

const FUSEAU_PAR_DEFAUT = "Europe/Paris";

/**
 * L'heure dans ce fuseau, sans les secondes. Un fuseau que le navigateur ne
 * connaît pas ferait lever « Intl » : on retombe alors sur l'heure locale
 * plutôt que de faire tomber la colonne entière.
 */
const heureDans = (fuseau: string, maintenant: Date): string => {
  try {
    return new Intl.DateTimeFormat("fr-FR", {
      hour: "2-digit",
      minute: "2-digit",
      timeZone: fuseau || FUSEAU_PAR_DEFAUT,
    }).format(maintenant);
  } catch {
    return new Intl.DateTimeFormat("fr-FR", { hour: "2-digit", minute: "2-digit" }).format(
      maintenant,
    );
  }
};

function Horloge({ config }: { config: unknown }) {
  const [maintenant, setMaintenant] = useState(() => new Date());

  // L'affichage s'arrête à la minute : la rafraîchir chaque seconde ne
  // changerait rien à l'écran, et ferait battre la page pour rien.
  useEffect(() => {
    const battement = setInterval(() => setMaintenant(new Date()), 30_000);
    return () => clearInterval(battement);
  }, []);

  const fuseau = texte(config, FUSEAU, FUSEAU_PAR_DEFAUT);
  const connu = FUSEAUX.find((f) => f.value === fuseau);

  return (
    <Group gap="xs" wrap="nowrap" justify="space-between">
      <Text size="sm" c="dimmed" truncate>
        {texte(config, LIBELLE) || connu?.label || fuseau}
      </Text>
      <Text size="sm" fw={600} style={{ whiteSpace: "nowrap" }}>
        {heureDans(fuseau, maintenant)}
      </Text>
    </Group>
  );
}

export const horlogePlugin: AccessPlugin = {
  type: "clock",
  label: "Horloge",
  icon: IconClock,
  defaultConfig: { [LIBELLE]: "", [FUSEAU]: FUSEAU_PAR_DEFAUT },

  Display: Horloge,

  Config: ({ config, onChange }) => (
    <Stack gap="md">
      <TextInput
        label="Libellé"
        placeholder="Le nom du fuseau à défaut"
        value={texte(config, LIBELLE)}
        onChange={(e) => onChange(avec(config, LIBELLE, e.currentTarget.value))}
        autoFocus
      />
      <Select
        label="Fuseau horaire"
        data={FUSEAUX}
        value={texte(config, FUSEAU, FUSEAU_PAR_DEFAUT)}
        onChange={(value) => value && onChange(avec(config, FUSEAU, value))}
        allowDeselect={false}
        searchable
      />
    </Stack>
  ),
};
