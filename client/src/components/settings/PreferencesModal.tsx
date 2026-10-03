import {
  Avatar,
  Button,
  Group,
  Modal,
  Select,
  Stack,
  Text,
  useMantineColorScheme,
} from "@mantine/core";
import { IconDeviceDesktop, IconMoon, IconSun } from "@tabler/icons-react";
import { useEffect, useState } from "react";
import { api } from "../../api";
import { modalHeaderStyles } from "../../themes/modals";
import { initialsOf } from "../ui/ActorAvatars";
import { messageErreur, notifierErreur } from "../../lib/errors";
import type { PublicUser, View } from "@milo/shared";
import type { ComponentType } from "react";
import BoutonFermer from "../ui/BoutonFermer";

type Scheme = "auto" | "light" | "dark";

interface SchemeOption {
  value: Scheme;
  label: string;
  icon: ComponentType<{ size?: number }>;
}

const SCHEME_OPTIONS: SchemeOption[] = [
  { value: "auto", label: "System", icon: IconDeviceDesktop },
  { value: "light", label: "Clair", icon: IconSun },
  { value: "dark", label: "Sombre", icon: IconMoon },
];

// Les options d'un Select ne portent que du texte : l'icône est retrouvée par
// la valeur, pour la liste déroulante comme pour le champ fermé.
/**
 * L'icône d'un thème. Déclarée au niveau du module : affectée à une variable
 * dans le corps d'un composant, React y verrait un nouveau type de composant à
 * chaque rendu et remonterait son sous-arbre à chaque fois.
 */
function SchemeIcon({ value, size = 16 }: { value: string; size?: number }) {
  const Icon =
    SCHEME_OPTIONS.find((o) => o.value === value)?.icon ?? IconDeviceDesktop;
  return <Icon size={size} />;
}

// Largeur du libellé : les champs s'alignent sur la même colonne.
const LABEL_WIDTH = 120;

// Largeur des champs : celle d'un nom de mode ou de thème, et de son icône.
const FIELD_WIDTH = 200;

// Le retrait de la fenêtre, tout autour.
const PADDING = 40;

// L'écart entre un libellé et son champ : l'espacement « md » de Mantine.
const GAP = 16;

/**
 * La fenêtre se règle sur ses champs : un libellé, l'écart, le champ, et ses
 * retraits. Plus large, elle laisserait un vide à droite des champs.
 */
const MODAL_WIDTH = LABEL_WIDTH + GAP + FIELD_WIDTH + 2 * PADDING;

interface PreferencesModalProps {
  opened: boolean;
  onClose: () => void;
  user: PublicUser | null;
  /** Les vues que le compte voit : celle d'ouverture se choisit parmi elles. */
  views: View[];
  onUpdated: (user: PublicUser) => void;
}

/**
 * Le profil. L'identité vient d'Entra et s'y modifie : elle se lit ici, et se
 * relit à chaque connexion. Le mot de passe est celui de Microsoft. Restent ce
 * que chacun règle pour lui-même — la vue d'ouverture, le thème —, qui ne
 * s'appliquent qu'à l'enregistrement : « Fermer » les laisse tels qu'ils
 * étaient.
 */
export default function PreferencesModal({
  opened,
  onClose,
  user,
  views,
  onUpdated,
}: PreferencesModalProps) {
  const { colorScheme, setColorScheme } = useMantineColorScheme();
  // La vue d'ouverture ; vide, la première.
  const [vue, setVue] = useState("");
  const [theme, setTheme] = useState<Scheme>("auto");
  const [busy, setBusy] = useState(false);

  // Chaque ouverture repart de ce qui est en place.
  useEffect(() => {
    if (!opened) return;
    setVue(user?.default_view ?? "");
    setTheme((colorScheme ?? "auto") as Scheme);
    // Le thème n'est relu qu'à l'ouverture : le relire pendant qu'on choisit
    // effacerait le choix en cours.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opened, user]);

  const enregistrer = async () => {
    setBusy(true);
    try {
      // La vue appartient au compte, et part au serveur ; le thème est celui
      // du navigateur, que Mantine mémorise.
      if (vue !== (user?.default_view ?? "")) onUpdated(await api.updateMe({ default_view: vue }));
      setColorScheme(theme);
      onClose();
    } catch (e) {
      notifierErreur(messageErreur(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title="Profil"
      size={MODAL_WIDTH}
      padding={PADDING}
      centered
      withCloseButton={false}
      styles={modalHeaderStyles(PADDING)}
    >
      <Stack gap="lg">
        <Group gap="md" wrap="nowrap" pb={30}>
          <Avatar
            size={48}
            radius="sm"
            color="teal"
            variant="filled"
            src={user?.gravatar_url || null}
          >
            {initialsOf(user?.name)}
          </Avatar>
          <div style={{ minWidth: 0 }}>
            <Text fw={500} truncate>
              {user?.name}
            </Text>
            <Text size="sm" c="dimmed" truncate>
              {user?.email}
            </Text>
          </div>
        </Group>


        {/* Le libellé est posé à gauche du champ, et non au-dessus comme les
            libellés de Mantine : les deux réglages s'alignent sur la même
            colonne. */}
        <Stack gap="md">
          <Group gap={GAP} wrap="nowrap" align="center">
            <Text size="sm" fw={500} w={LABEL_WIDTH}>
              Vue par défaut
            </Text>
            <Select
              aria-label="Vue par défaut"
              // « La première » : celle qui ouvre le sélecteur, dans l'ordre
              // que chacun a rangé. Une vue disparue y ramène aussi.
              data={[
                { value: "premiere", label: "La première" },
                ...views.map((v) => ({ value: String(v.id), label: v.name })),
              ]}
              value={views.some((v) => String(v.id) === vue) ? vue : "premiere"}
              onChange={(value) => value && setVue(value === "premiere" ? "" : value)}
              allowDeselect={false}
              w={FIELD_WIDTH}
            />
          </Group>

          <Group gap={GAP} wrap="nowrap" align="center">
            <Text size="sm" fw={500} w={LABEL_WIDTH}>
              Thème
            </Text>
            <Select
              aria-label="Thème"
              data={SCHEME_OPTIONS.map(({ value, label }) => ({
                value,
                label,
              }))}
              leftSection={<SchemeIcon value={theme} />}
              renderOption={({ option }) => (
                <Group gap={6} wrap="nowrap">
                  <SchemeIcon value={option.value} />
                  <span>{option.label}</span>
                </Group>
              )}
              // « System » suit le thème du système : c'est la valeur par
              // défaut, posée dans le thème (main.tsx) et mémorisée par
              // Mantine ensuite.
              value={theme}
              onChange={(value) => value && setTheme(value as Scheme)}
              allowDeselect={false}
              w={FIELD_WIDTH}
            />
          </Group>
        </Stack>

        <Group justify="flex-end" mt="md">
          <BoutonFermer onClick={onClose} />
          <Button color="teal" onClick={enregistrer} loading={busy}>
            Enregistrer
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
