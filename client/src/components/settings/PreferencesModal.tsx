import {
  Avatar,
  Button,
  Group,
  Modal,
  Select,
  SimpleGrid,
  Slider,
  Stack,
  Switch,
  Tabs,
  Text,
  useMantineColorScheme,
} from "@mantine/core";
import { IconBell, IconDeviceDesktop, IconMoon, IconSearch, IconSun, IconUser } from "@tabler/icons-react";
import { useEffect, useRef, useState } from "react";
import { api } from "../../api";
import { modalHeaderStyles } from "../../themes/modals";
import { tabStyle } from "../../themes/tabs";
import { initialsOf } from "../ui/ActorAvatars";
import { useDisplaySettings } from "../../lib/displaySettings";
import { errorMessage, notifyError } from "../../lib/errors";
import { setThemeChoice, themeChoice, useThemes, type ThemeChoice } from "../../lib/themeColors";
import { DEFAULT_SEARCH_THRESHOLD } from "@milo/shared";
import type {
  Id,
  NotificationSettings,
  OpeningView,
  PublicUser,
  ReplyEditorView,
  SearchKind,
  Theme,
} from "@milo/shared";
import type { ComponentType } from "react";
import CloseButton from "../ui/CloseButton";
import Footer from "../ui/Footer";
import NotificationPreferences from "./NotificationPreferences";
import { KINDS } from "../../lib/searchKinds";
import { themeWindow } from "../../lib/themeWindow";

/** The profile's theme as the Select holds it: "system", or a theme's id. */
const SYSTEM = "system";

// The options of a Select only carry text: the icon is looked up by the
// value, for the dropdown as well as for the closed field.
/**
 * A theme's icon: the system's, or its scheme's. Declared at module level:
 * assigned to a variable inside a component body, React would see a new
 * component type on every render and remount its subtree each time.
 */
function SchemeIcon({ value, themes, size = 16 }: { value: string; themes: Theme[]; size?: number }) {
  const scheme = themes.find((t) => String(t.id) === value)?.scheme;
  const Icon: ComponentType<{ size?: number }> =
    scheme === "dark" ? IconMoon : scheme === "light" ? IconSun : IconDeviceDesktop;
  return <Icon size={size} />;
}

/** The windows' body padding, on a side ("Fenêtre" > "Padding"). */
const pad = (side: "top" | "right" | "left") => `var(--milo-settings-window-padding-${side})`;

// Label width: the fields align on the same column.
const LABEL_WIDTH = 160;

// Field width: that of a mode or theme name, and its icon.
const FIELD_WIDTH = 200;

// The modal's padding, all around.
const PADDING = 40;

// The gap between a label and its field: Mantine's "md" spacing.
const GAP = 16;

/**
 * The modal is sized to its widest tab, Recherche: the switch and the
 * tolerance's slider beside it, and the padding.
 */
const MODAL_WIDTH = 570 + 2 * PADDING;

/**
 * The search's tolerance, from exact to anything: the marks name the steps
 * that change what is found (SearchBox, Fuse.js).
 */
const SEARCH_MARKS = [
  { value: 0, label: "Exact" },
  { value: 0.25, label: "Strict" },
  { value: 0.45, label: "Défaut" },
  { value: 0.7, label: "Large" },
  { value: 1, label: "Tout" },
];


interface PreferencesModalProps {
  opened: boolean;
  onClose: () => void;
  user: PublicUser | null;
  onUpdated: (user: PublicUser) => void;
}

/**
 * The preferences. Identity comes from Entra and is edited there: it is read
 * here, and re-read at each sign-in. The password is the Microsoft one. What
 * remains is what each person sets for themselves — in the Préférences tab, the
 * opening workspace, view and board, the e-mail editor's view, the theme; in
 * the Recherche tab, the search's tolerance; in the Notifications tab, how
 * they are notified —, which only apply on save: "Fermer" leaves them as they
 * were. The theme shows as soon as it is chosen, and "Fermer" puts back the
 * one in place at opening.
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
  const { themes } = useThemes();
  const [theme, setTheme] = useState<string>(SYSTEM);
  const [notifying, setNotifying] = useState<NotificationSettings | null>(null);
  const [replyEditor, setReplyEditor] = useState<ReplyEditorView>("layout");
  const [fuzzySearch, setFuzzySearch] = useState(true);
  const [searchThreshold, setSearchThreshold] = useState(DEFAULT_SEARCH_THRESHOLD);
  const [searchExcluded, setSearchExcluded] = useState<SearchKind[]>([]);
  const [tab, setTab] = useState<string | null>("profile");
  const [busy, setBusy] = useState(false);
  // The theme and Mantine's scheme in place at opening, put back unless saved.
  const original = useRef<{ choice: ThemeChoice; scheme: typeof colorScheme } | null>(null);

  // Each opening starts again from what is in place.
  useEffect(() => {
    if (!opened) return;
    // None chosen yet: the first of the list, like the view and the board.
    setWorkspace(user?.default_workspace ?? user?.workspaces[0]?.id ?? user?.workspace ?? null);
    setView(user?.default_view ?? "");
    setBoard(user?.default_board ?? "");
    // A theme deleted since: the system's again.
    const chosen = themeChoice();
    original.current = { choice: chosen, scheme: colorScheme };
    setTheme(themes.some((t) => t.id === chosen) ? String(chosen) : SYSTEM);
    setNotifying(user?.notification_settings ?? null);
    setReplyEditor(user?.reply_editor ?? "layout");
    setFuzzySearch(user?.fuzzy_search ?? true);
    setSearchThreshold(user?.search_threshold ?? DEFAULT_SEARCH_THRESHOLD);
    setSearchExcluded(user?.search_excluded ?? []);
    setTab("profile");
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
  // The Notifications tab, only for whoever receives some in their
  // workspace, on screen or by e-mail (Accès).
  const notified = Boolean(user?.notifications.screen || user?.notifications.email);

  // The theme, and Mantine's scheme under it: the system's follows the
  // system, a theme its own.
  const applyTheme = (value: string) => {
    const chosen = themes.find((t) => String(t.id) === value);
    setThemeChoice(chosen ? chosen.id : "system");
    setColorScheme(chosen ? chosen.scheme : "auto");
  };

  // Closed without saving: the theme in place at opening again.
  const close = () => {
    if (original.current) {
      setThemeChoice(original.current.choice);
      setColorScheme(original.current.scheme);
      original.current = null;
    }
    onClose();
  };

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
      const openingChanged =
        views &&
        (opening.default_workspace !== (user?.default_workspace ?? null) ||
          opening.default_view !== (user?.default_view ?? "") ||
          opening.default_board !== (user?.default_board ?? ""));
      const notifyingChanged =
        notifying &&
        JSON.stringify(notifying) !== JSON.stringify(user?.notification_settings);
      const replyEditorChanged = user && replyEditor !== user.reply_editor;
      const searchChanged =
        user && (fuzzySearch !== user.fuzzy_search || searchThreshold !== user.search_threshold);
      const excludedChanged =
        user &&
        JSON.stringify([...searchExcluded].sort()) !== JSON.stringify([...user.search_excluded].sort());
      if (openingChanged || notifyingChanged || replyEditorChanged || searchChanged || excludedChanged)
        onUpdated(
          await api.updateMe({
            ...(openingChanged ? opening : {}),
            ...(notifyingChanged ? { notification_settings: notifying } : {}),
            ...(replyEditorChanged ? { reply_editor: replyEditor } : {}),
            ...(searchChanged
              ? { fuzzy_search: fuzzySearch, search_threshold: searchThreshold }
              : {}),
            ...(excludedChanged ? { search_excluded: searchExcluded } : {}),
          }),
        );
      applyTheme(theme);
      original.current = null;
      onClose();
    } catch (e) {
      notifyError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      attributes={themeWindow("profile")}
      opened={opened}
      onClose={close}
      title="Profil"
      size={MODAL_WIDTH}
      padding={PADDING}
      centered
      withCloseButton={false}
      styles={modalHeaderStyles(PADDING)}
    >
      {/* Who they are, above the tabs: it is the same in both. Its look is
          the themes' ("Thèmes spécifiques" > "Profil"). */}
      <Group
        gap={0}
        wrap="nowrap"
        // Its background reaches the window's sides and its header: the
        // body's padding on the sides and above is taken in, and given back
        // inside; its spaces above and below ("Marge haut", "Marge bas")
        // are inside it too, its background under them.
        style={{
          backgroundColor: "var(--milo-settings-profile-bg)",
          margin: `calc(-1 * ${pad("top")}) calc(-1 * ${pad("right")}) 0 calc(-1 * ${pad("left")})`,
          padding:
            `calc(${pad("top")} + var(--milo-settings-profile-margin-top)) ${pad("right")} ` +
            `var(--milo-settings-profile-margin-bottom) ${pad("left")}`,
        }}
      >
        <Avatar
          size={48}
          radius="sm"
          color="teal"
          variant="filled"
          src={(display.showGravatars && user?.gravatar_url) || null}
          mr="var(--milo-settings-profile-photo-margin-right)"
          style={{
            flexShrink: 0,
            border:
              "var(--milo-settings-profile-photo-border-width) solid var(--milo-settings-profile-photo-border)",
          }}
        >
          {initialsOf(user?.name)}
        </Avatar>
        <div style={{ minWidth: 0 }}>
          <Text
            c="var(--milo-settings-profile-name-color)"
            fz="var(--milo-settings-profile-name-size)"
            fw="var(--milo-settings-profile-name-weight)"
            truncate
          >
            {user?.name}
          </Text>
          <Text
            size="sm"
            c="var(--milo-settings-profile-email-color)"
            fz="var(--milo-settings-profile-email-size)"
            fw="var(--milo-settings-profile-email-weight)"
            truncate
          >
            {user?.email}
          </Text>
        </div>
      </Group>

      <Tabs value={tab} onChange={setTab} color="teal">
        <Tabs.List>
          <Tabs.Tab value="profile" leftSection={<IconUser size={16} />} style={tabStyle(tab === "profile")}>
            Préférences
          </Tabs.Tab>
          {notified && (
            <Tabs.Tab
              value="notifications"
              leftSection={<IconBell size={16} />}
              style={tabStyle(tab === "notifications")}
            >
              Notifications
            </Tabs.Tab>
          )}
          <Tabs.Tab value="search" leftSection={<IconSearch size={16} />} style={tabStyle(tab === "search")}>
            Recherche
          </Tabs.Tab>
        </Tabs.List>

        {/* Its height is its content's: the window's is the themes'
            ("Fenêtre" > "Hauteur"). */}
        <Tabs.Panel value="profile" pt={40}>
          {/* The label sits to the left of the field, not above it like
              Mantine's labels: both settings align on the same
              column. */}
          {/* Its gap is the themes' ("Sections" > "Stack"). */}
          <Stack gap="md" data-controls>
            {/* Only for those who have several: the others' is the only one. */}
            {several && (
              <Group gap={GAP} wrap="nowrap" align="center">
                <Text size="sm" fw={500} w={LABEL_WIDTH} data-field-label>
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
              <Text size="sm" fw={500} w={LABEL_WIDTH} data-field-label>
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
              <Text size="sm" fw={500} w={LABEL_WIDTH} data-field-label>
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

            {/* How an e-mail being written first shows: its text alone,
                or in its template (SupportReply). */}
            <Group gap={GAP} wrap="nowrap" align="center">
              <Text size="sm" fw={500} w={LABEL_WIDTH} data-field-label>
                Éditeur par défaut
              </Text>
              <Select
                aria-label="Éditeur par défaut"
                data={[
                  { value: "content", label: "Contenu" },
                  { value: "layout", label: "Mise en page" },
                ]}
                value={replyEditor}
                onChange={(value) => value && setReplyEditor(value as ReplyEditorView)}
                allowDeselect={false}
                w={FIELD_WIDTH}
              />
            </Group>

            <Group gap={GAP} wrap="nowrap" align="center">
              <Text size="sm" fw={500} w={LABEL_WIDTH} data-field-label>
                Thème
              </Text>
              <Select
                aria-label="Thème"
                // "Lié au système" first — the system's dark or light theme,
                // as the system prefers —, then the themes, under a rule.
                data={[
                  { value: SYSTEM, label: "Lié au système" },
                  {
                    group: "Thèmes",
                    items: themes.map((t) => ({ value: String(t.id), label: t.name })),
                  },
                ]}
                leftSection={<SchemeIcon value={theme} themes={themes} />}
                renderOption={({ option }) => (
                  <Group gap={6} wrap="nowrap">
                    <SchemeIcon value={option.value} themes={themes} />
                    <span>{option.label}</span>
                  </Group>
                )}
                value={theme}
                onChange={(value) => {
                  if (!value) return;
                  setTheme(value);
                  applyTheme(value);
                }}
                allowDeselect={false}
                // Wider than the other fields: a theme's name is free.
                w={FIELD_WIDTH + 50}
              />
            </Group>
          </Stack>
        </Tabs.Panel>

        {/* As it was in Paramétrage > Affichage: the tolerance only matters
            once typing mistakes are forgiven: it sits beside the switch,
            and only shows with it. */}
        <Tabs.Panel value="search" pt={40}>
          <Stack gap="sm" data-controls>
            <Group gap="xl" align="flex-start" wrap="nowrap" pb="lg">
              <Switch
                label="Recherche approximative"
                checked={fuzzySearch}
                onChange={(e) => setFuzzySearch(e.currentTarget.checked)}
                color="teal"
              />
              {/* The marks' labels are centered on their step: the inset
                  leaves room for half of "Exact" and "Tout" at both ends. */}
              {fuzzySearch && (
                <Slider
                  flex={1}
                  mx="md"
                  maw={420}
                  min={0}
                  max={1}
                  step={0.05}
                  marks={SEARCH_MARKS}
                  value={searchThreshold}
                  onChange={setSearchThreshold}
                  label={(value) => value.toFixed(2)}
                  color="teal"
                />
              )}
            </Group>

            {/* The kinds of content searched, in the order the results
                show them: a kind switched off is left out. */}
            <Text size="sm" fw={500} data-field-label>
              Contenus inclus
            </Text>
            <SimpleGrid cols={2} spacing="md" verticalSpacing="sm">
              {KINDS.map(({ kind, label, icon: Icon }) => (
                <Switch
                  key={kind}
                  label={
                    <Group gap={6} wrap="nowrap">
                      <Icon size={16} />
                      <span>{label}</span>
                    </Group>
                  }
                  checked={!searchExcluded.includes(kind)}
                  onChange={(e) => {
                    const included = e.currentTarget.checked;
                    setSearchExcluded((current) =>
                      included ? current.filter((k) => k !== kind) : [...current, kind],
                    );
                  }}
                  color="teal"
                />
              ))}
            </SimpleGrid>
          </Stack>
        </Tabs.Panel>

        {notified && notifying && (
          <Tabs.Panel value="notifications" pt={40}>
            <NotificationPreferences
              value={notifying}
              onChange={(change) => setNotifying({ ...notifying, ...change })}
              rights={user!.notifications}
            />
          </Tabs.Panel>
        )}
      </Tabs>

      <Footer>
        <CloseButton onClick={close} />
        <Button color="teal" onClick={save} loading={busy}>
          Enregistrer
        </Button>
      </Footer>
    </Modal>
  );
}
