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
import { errorMessage, notifyError } from "../../lib/errors";
import type { PublicUser, View } from "@milo/shared";
import type { ComponentType } from "react";
import CloseButton from "../ui/CloseButton";

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

// The options of a Select only carry text: the icon is looked up by the
// value, for the dropdown as well as for the closed field.
/**
 * A theme's icon. Declared at module level: assigned to a variable inside a
 * component body, React would see a new component type on every render and
 * remount its subtree each time.
 */
function SchemeIcon({ value, size = 16 }: { value: string; size?: number }) {
  const Icon =
    SCHEME_OPTIONS.find((o) => o.value === value)?.icon ?? IconDeviceDesktop;
  return <Icon size={size} />;
}

// Label width: the fields align on the same column.
const LABEL_WIDTH = 120;

// Field width: that of a mode or theme name, and its icon.
const FIELD_WIDTH = 200;

// The modal's padding, all around.
const PADDING = 40;

// The gap between a label and its field: Mantine's "md" spacing.
const GAP = 16;

/**
 * The modal is sized to its fields: a label, the gap, the field, and its
 * padding. Any wider, it would leave a void to the right of the fields.
 */
const MODAL_WIDTH = LABEL_WIDTH + GAP + FIELD_WIDTH + 2 * PADDING;

interface PreferencesModalProps {
  opened: boolean;
  onClose: () => void;
  user: PublicUser | null;
  /** The views the account sees: the opening view is chosen among them. */
  views: View[];
  onUpdated: (user: PublicUser) => void;
}

/**
 * The profile. Identity comes from Entra and is edited there: it is read here,
 * and re-read at each sign-in. The password is the Microsoft one. What remains
 * is what each person sets for themselves — the opening view, the theme —,
 * which only apply on save: "Fermer" leaves them as they were.
 */
export default function PreferencesModal({
  opened,
  onClose,
  user,
  views,
  onUpdated,
}: PreferencesModalProps) {
  const { colorScheme, setColorScheme } = useMantineColorScheme();
  // The opening view; empty, the first one.
  const [view, setView] = useState("");
  const [theme, setTheme] = useState<Scheme>("auto");
  const [busy, setBusy] = useState(false);

  // Each opening starts again from what is in place.
  useEffect(() => {
    if (!opened) return;
    setView(user?.default_view ?? "");
    setTheme((colorScheme ?? "auto") as Scheme);
    // The theme is only re-read on opening: re-reading it while choosing
    // would wipe the choice in progress.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opened, user]);

  const save = async () => {
    setBusy(true);
    try {
      // The view belongs to the account, and goes to the server; the theme is
      // the browser's, which Mantine remembers.
      if (view !== (user?.default_view ?? "")) onUpdated(await api.updateMe({ default_view: view }));
      setColorScheme(theme);
      onClose();
    } catch (e) {
      notifyError(errorMessage(e));
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


        {/* The label sits to the left of the field, not above it like
            Mantine's labels: both settings align on the same
            column. */}
        <Stack gap="md">
          <Group gap={GAP} wrap="nowrap" align="center">
            <Text size="sm" fw={500} w={LABEL_WIDTH}>
              Vue par défaut
            </Text>
            <Select
              aria-label="Vue par défaut"
              // "La première": the one that opens the selector, in the order
              // each person arranged. A vanished view falls back to it too.
              data={[
                { value: "first", label: "La première" },
                ...views.map((v) => ({ value: String(v.id), label: v.name })),
              ]}
              value={views.some((v) => String(v.id) === view) ? view : "first"}
              onChange={(value) => value && setView(value === "first" ? "" : value)}
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
              // "System" follows the system theme: it is the default value,
              // set in the theme (main.tsx) and remembered by Mantine
              // afterwards.
              value={theme}
              onChange={(value) => value && setTheme(value as Scheme)}
              allowDeselect={false}
              w={FIELD_WIDTH}
            />
          </Group>
        </Stack>

        <Group justify="flex-end" mt="md">
          <CloseButton onClick={onClose} />
          <Button color="teal" onClick={save} loading={busy}>
            Enregistrer
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
