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
import { useDisplaySettings } from "../../lib/displaySettings";
import { errorMessage, notifyError } from "../../lib/errors";
import type { Id, OpeningView, PublicUser } from "@milo/shared";
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
const LABEL_WIDTH = 160;

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
  onUpdated: (user: PublicUser) => void;
}

/**
 * The profile. Identity comes from Entra and is edited there: it is read here,
 * and re-read at each sign-in. The password is the Microsoft one. What remains
 * is what each person sets for themselves — the opening workspace, view and
 * board, the theme —,
 * which only apply on save: "Fermer" leaves them as they were.
 */
export default function PreferencesModal({
  opened,
  onClose,
  user,
  onUpdated,
}: PreferencesModalProps) {
  const { colorScheme, setColorScheme } = useMantineColorScheme();
  const { settings: display } = useDisplaySettings();
  // The opening workspace, and in it the opening view and board; empty,
  // or one that is gone, the first one.
  const [workspace, setWorkspace] = useState<Id | null>(null);
  const [view, setView] = useState("");
  const [board, setBoard] = useState("");
  // The views of the chosen workspace, each with its boards; null until read.
  const [views, setViews] = useState<OpeningView[] | null>(null);
  const [theme, setTheme] = useState<Scheme>("auto");
  const [busy, setBusy] = useState(false);

  // Each opening starts again from what is in place.
  useEffect(() => {
    if (!opened) return;
    // None chosen yet: the first of the list, like the view and the board.
    setWorkspace(user?.default_workspace ?? user?.workspaces[0]?.id ?? user?.workspace ?? null);
    setView(user?.default_view ?? "");
    setBoard(user?.default_board ?? "");
    setTheme((colorScheme ?? "auto") as Scheme);
    // The theme is only re-read on opening: re-reading it while choosing
    // would wipe the choice in progress.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opened, user]);

  // The views and boards on offer follow the chosen workspace.
  useEffect(() => {
    if (!opened || workspace === null) return;
    let current = true;
    setViews(null);
    api
      .getOpeningViews(workspace)
      .then((read) => current && setViews(read))
      .catch((e) => current && notifyError(errorMessage(e)));
    return () => {
      current = false;
    };
  }, [opened, workspace]);

  // No view chosen, or one that is gone: the first is selected, and so is
  // the board. They are saved as chosen.
  const openingView = views?.find((v) => String(v.id) === view) ?? views?.[0];
  const shownView = openingView ? String(openingView.id) : "";
  const boards = openingView?.boards ?? [];
  const openingBoard = boards.find((b) => String(b.id) === board) ?? boards[0];
  const shownBoard = openingBoard ? String(openingBoard.id) : "";
  const several = (user?.workspaces.length ?? 0) > 1;

  const save = async () => {
    setBusy(true);
    try {
      // The opening belongs to the account, and goes to the server; the theme
      // is the browser's, which Mantine remembers. With a single workspace,
      // none is chosen: it is the one they work in.
      const opening = {
        default_workspace: several ? workspace : null,
        default_view: shownView,
        default_board: shownBoard,
      };
      if (
        views &&
        (opening.default_workspace !== (user?.default_workspace ?? null) ||
          opening.default_view !== (user?.default_view ?? "") ||
          opening.default_board !== (user?.default_board ?? ""))
      )
        onUpdated(await api.updateMe(opening));
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
            src={(display.showGravatars && user?.gravatar_url) || null}
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
          {/* Only for those who have several: the others' is the only one. */}
          {several && (
            <Group gap={GAP} wrap="nowrap" align="center">
              <Text size="sm" fw={500} w={LABEL_WIDTH}>
                Workspace par défaut
              </Text>
              <Select
                aria-label="Workspace par défaut"
                data={(user?.workspaces ?? []).map((w) => ({
                  value: String(w.id),
                  label: w.name,
                }))}
                value={workspace === null ? null : String(workspace)}
                onChange={(value) => {
                  if (!value) return;
                  // Another workspace's views and boards are not these.
                  setWorkspace(Number(value));
                  setView("");
                  setBoard("");
                }}
                allowDeselect={false}
                w={FIELD_WIDTH}
              />
            </Group>
          )}

          <Group gap={GAP} wrap="nowrap" align="center">
            <Text size="sm" fw={500} w={LABEL_WIDTH}>
              Vue par défaut
            </Text>
            <Select
              aria-label="Vue par défaut"
              data={(views ?? []).map((v) => ({ value: String(v.id), label: v.name }))}
              value={shownView || null}
              onChange={(value) => {
                if (!value) return;
                // Another view's boards are not these: its first is selected.
                setView(value);
                setBoard("");
              }}
              allowDeselect={false}
              disabled={!views}
              w={FIELD_WIDTH}
            />
          </Group>

          <Group gap={GAP} wrap="nowrap" align="center">
            <Text size="sm" fw={500} w={LABEL_WIDTH}>
              Tableau par défaut
            </Text>
            <Select
              aria-label="Tableau par défaut"
              data={boards.map((b) => ({ value: String(b.id), label: b.name }))}
              value={shownBoard || null}
              onChange={(value) => value && setBoard(value)}
              allowDeselect={false}
              disabled={!views}
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
