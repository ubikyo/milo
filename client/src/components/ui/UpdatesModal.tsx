import {
  Accordion,
  Box,
  CloseButton,
  Group,
  List,
  Modal,
  ScrollArea,
  Stack,
  Text,
  Title,
} from "@mantine/core";
import { useEffect, useState } from "react";
import source from "../../../../updates.md?raw";
import { SETTINGS_SCROLLBAR_STYLES } from "../../themes/modals";
import windowClasses from "../../assets/styles/SettingsModal.module.css";
import classes from "../../assets/styles/UpdatesModal.module.css";
import { themeWindow } from "../../lib/themeWindow";
import Logo from "./Logo";

// The "Mise à jour" window: what updates.md, at the root of the repository,
// announces. "# " opens an update with its date, "## " gives its title,
// "### " a group (Nouveautés, Corrections…) and "- " an entry of the group
// above it. Several updates follow each other, the latest first: it shows
// in full, the earlier ones folded in an accordion.
// Shown once per update: the browser keeps a fingerprint of the latest one
// read — its date and its title —, and the window shows again only when a
// new one heads the file.

const STORAGE_KEY = "milo.updates.seen";

// The window is 600 px high at most: the logo's row, then the updates, which
// scroll beyond it. The header is drawn here rather than by Mantine, so that
// its height is known and the scroll area can take exactly what remains.
const MAX_HEIGHT = 600;
// The window's inset, on all four sides.
const PADDING = 20;
const LOGO_HEIGHT = 32;
const HEADER_BOTTOM = 8;
const SCROLL_HEIGHT = `min(${MAX_HEIGHT - PADDING - LOGO_HEIGHT - HEADER_BOTTOM}px, calc(100dvh - 160px))`;

interface Group {
  name: string;
  items: string[];
}

interface Update {
  date: string;
  title: string;
  groups: Group[];
}

const parse = (text: string): Update[] => {
  const updates: Update[] = [];
  // What comes before any date goes in an update without one.
  const current = () => {
    if (updates.length === 0) updates.push({ date: "", title: "", groups: [] });
    return updates[updates.length - 1]!;
  };
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (line.startsWith("### ")) current().groups.push({ name: line.slice(4), items: [] });
    else if (line.startsWith("## ")) current().title = line.slice(3);
    else if (line.startsWith("# ")) updates.push({ date: line.slice(2), title: "", groups: [] });
    else if (/^[-*] /.test(line)) {
      const update = current();
      // An entry before any group goes in a nameless one.
      if (update.groups.length === 0) update.groups.push({ name: "", items: [] });
      update.groups.at(-1)?.items.push(line.slice(2));
    }
  }
  return updates;
};

/** A short fingerprint of a text. */
const fingerprint = (text: string) => {
  let hash = 0;
  for (let i = 0; i < text.length; i++) hash = (hash * 31 + text.charCodeAt(i)) | 0;
  return hash.toString(36);
};

const [latest, ...earlier] = parse(source);
// The latest update's: an entry added or reworded in it doesn't show it again.
const FINGERPRINT = fingerprint(`${latest?.date ?? ""}\n${latest?.title ?? ""}`);

const seen = () => {
  try {
    return localStorage.getItem(STORAGE_KEY) === FINGERPRINT;
  } catch {
    return false;
  }
};

/** Whether updates.md announces anything: without it, nothing to open. */
export const HAS_UPDATES = source.trim() !== "";

// Elsewhere — the logo's menu (ShortcutsHelp) — opens the window again,
// through an event on the window.
const OPEN_EVENT = "milo:open-updates";
export const openUpdates = () => window.dispatchEvent(new Event(OPEN_EVENT));

export default function UpdatesModal() {
  const [opened, setOpened] = useState(() => HAS_UPDATES && !seen());
  useEffect(() => {
    const open = () => setOpened(true);
    window.addEventListener(OPEN_EVENT, open);
    return () => window.removeEventListener(OPEN_EVENT, open);
  }, []);
  const close = () => {
    try {
      localStorage.setItem(STORAGE_KEY, FINGERPRINT);
    } catch {
      // Without storage, the window will simply show again.
    }
    setOpened(false);
  };
  return (
    <Modal
      attributes={themeWindow("updates")}
      opened={opened}
      onClose={close}
      centered
      size={800}
      withCloseButton={false}
      padding={0}
      // Anchor for the scrollbar, moved to the window's right edge.
      styles={{ content: { position: "relative" } }}
    >
      <Group justify="space-between" px={PADDING} pt={PADDING} pb={HEADER_BOTTOM}>
        <Logo variant={2} h={LOGO_HEIGHT} />
        <CloseButton aria-label="Fermer" onClick={close} />
      </Group>
      {/* The windows' scrollbar (SettingsModal, WidgetDrawer): on the right
        edge, its width and color from the themes. */}
      <ScrollArea.Autosize
        mah={SCROLL_HEIGHT}
        type="auto"
        scrollbars="y"
        scrollbarSize="var(--milo-settings-scrollbar-width)"
        styles={SETTINGS_SCROLLBAR_STYLES}
        classNames={{ scrollbar: windowClasses.scrollbar }}
      >
        <Box px={PADDING} pt={HEADER_BOTTOM} pb={PADDING}>
          {/* The latest update in full, the earlier ones folded beneath it. */}
          {latest && <UpdateContent update={latest} />}
          {earlier.length > 0 && (
            <Accordion
              mt={50}
              variant="contained"
              chevronPosition="right"
              // Unfolded, the item keeps the window's background.
              styles={{ item: { backgroundColor: "transparent" }, content: { padding: 30 } }}
              classNames={{ control: classes.control }}
            >
              {earlier.map((update, u) => (
                <Accordion.Item key={u} value={String(u)}>
                  <Accordion.Control>
                    <Text fw={600}>{update.date || "Mise à jour"}</Text>
                  </Accordion.Control>
                  <Accordion.Panel>
                    <Stack gap="lg">
                      {update.title && (
                        <Title order={3} fw={400}>
                          {update.title}
                        </Title>
                      )}
                      <UpdateGroups groups={update.groups} />
                    </Stack>
                  </Accordion.Panel>
                </Accordion.Item>
              ))}
            </Accordion>
          )}
        </Box>
      </ScrollArea.Autosize>
    </Modal>
  );
}

/** An update in full: its date, its title, its groups. */
function UpdateContent({ update }: { update: Update }) {
  return (
    <Stack gap="lg">
      <Stack gap={4}>
        {update.date && <Title order={1}>{update.date}</Title>}
        {update.title && (
          <Title order={3} fw={400}>
            {update.title}
          </Title>
        )}
      </Stack>
      <UpdateGroups groups={update.groups} />
    </Stack>
  );
}

/** The groups of an update — Nouveautés, Corrections… — and their entries. */
function UpdateGroups({ groups }: { groups: Group[] }) {
  return (
    <Stack gap="lg">
      {groups.map((group, g) => (
        <Stack key={g} gap={6}>
          {group.name && (
            <Text size="sm" fw={700} tt="uppercase" c="dimmed">
              {group.name}
            </Text>
          )}
          <List spacing={4} size="sm">
            {group.items.map((item, i) => (
              <List.Item key={i}>{item}</List.Item>
            ))}
          </List>
        </Stack>
      ))}
    </Stack>
  );
}
