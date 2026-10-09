import {
  Accordion,
  Badge,
  Box,
  Button,
  Drawer,
  Group,
  ScrollArea,
  Stack,
  Table,
  Tabs,
  Text,
} from "@mantine/core";
import { IconDeviceLaptop } from "@tabler/icons-react";
import { useEffect, useMemo, useState } from "react";
import { api } from "../../api";
import { errorMessage, notifyError } from "../../lib/errors";
import { tabStyle } from "../../themes/tabs";
import { WITHOUT_FRAME, SECTION_TABLES, EMPTY } from "./InventoryTables";
import ManagedDeviceAssetSummaryPanel, { CARD_BACKGROUND } from "./ManagedDeviceAssetSummaryPanel";
import OperatingSystem from "./OperatingSystem";
import RecordTitle, { SPACE_BELOW_TITLE } from "./RecordTitle";
import classes from "../../assets/styles/ManagedDeviceAssetDrawer.module.css";
import type { CSSProperties } from "react";
import type {
  ManagedDeviceAsset,
  ManagedDeviceAssetDetail,
  ManagedDeviceAssetEntry,
  ManagedDeviceAssetSection,
} from "@milo/shared";
import CloseButton from "../ui/CloseButton";
import Footer from "../ui/Footer";

const DRAWER_PADDING = 40;
const DRAWER_WIDTH = 1060;

/** Width of the tabs column: "Utilisateurs et groupes" fits in it. */
const TABS_WIDTH = 210;

/** The space between the header buttons and the rest of the record. */
const SPACE_BELOW_HEADER = 30;

/**
 * What we open to take control. The "teamviewer10:" scheme launches the
 * TeamViewer installed on the clicker's machine; the fallback address goes
 * through the TeamViewer website, which launches it in turn — useful since
 * TeamViewer 15, where the scheme sometimes opens the application without chaining the
 * connection.
 *
 * No password travels in either: it is asked for
 * on arrival, unless the workstation is among the TeamViewer account's devices.
 */
export const teamviewerLink = (id: string) => `teamviewer10://control?device=${id}`;
export const teamviewerFallbackLink = (id: string) =>
  `https://start.teamviewer.com/device/${id}/authorization/password/mode/control`;

/**
 * A workstation's record: what the inventory agent reported, arranged in
 * a few tabs. Nothing is edited there — a workstation describes itself,
 * nobody enters it —, so the footer only carries "Fermer".
 */
interface ManagedDeviceAssetDrawerProps {
  opened: boolean;
  onClose: () => void;
  /** The workstation from the list: the drawer fetches the rest itself. */
  asset: ManagedDeviceAsset | null;
}

/**
 * The fields we can name in French, by section. The others keep
 * the agent's name.
 */
const FIELD_LABELS: Record<string, Record<string, string>> = {
  BIOS: { SMANUFACTURER: "Fabricant", SMODEL: "Modèle", SSN: "Numéro de série" },
};

/** The fields of an entry, in two columns: the name, the value. */
function Entry({ section, entry }: { section: string; entry: ManagedDeviceAssetEntry }) {
  const labels = FIELD_LABELS[section] ?? {};
  return (
    <Table withRowBorders={false} verticalSpacing={2} horizontalSpacing={0}>
      <Table.Tbody>
        {Object.entries(entry).map(([field, value]) => (
          <Table.Tr key={field}>
            {/* The field name is the agent's, in capitals, when no better one
                is known for it: that is the one we'll find
                in the docs and in the XML the day it needs discussing. */}
            <Table.Td style={{ width: "30%", verticalAlign: "top" }}>
              {labels[field] ? (
                <Text size="sm" c="dimmed">
                  {labels[field]}
                </Text>
              ) : (
                <Text size="xs" c="dimmed" ff="monospace">
                  {field}
                </Text>
              )}
            </Table.Td>
            <Table.Td style={{ verticalAlign: "top" }}>
              <Text size="sm" style={{ wordBreak: "break-word" }}>
                {value || EMPTY}
              </Text>
            </Table.Td>
          </Table.Tr>
        ))}
      </Table.Tbody>
    </Table>
  );
}

/** A tab group: an inventory section, under its label. */
interface LocalGroup {
  section: string;
  label: string;
}

/** A record tab: several inventory sections, one after another. */
interface Tab {
  value: string;
  label: string;
  groups: LocalGroup[];
}

/**
 * The record tabs and, in each, the inventory sections
 * it gathers, in the order they are displayed. The labels say what
 * is in there better than the agent's names: DRIVES lists volumes —
 * partitions, network drives —, not disks; ANTIVIRUS lists
 * EDRs as well as old-style antivirus.
 */
const TABS: Tab[] = [
  {
    value: "users",
    label: "Utilisateurs et groupes",
    groups: [
      { section: "LOCAL_USERS", label: "Utilisateurs locaux" },
      { section: "LOCAL_GROUPS", label: "Groupes locaux" },
    ],
  },
  {
    value: "hardware",
    label: "Matériel",
    groups: [
      { section: "BIOS", label: "BIOS" },
      { section: "CPUS", label: "Processeurs" },
      { section: "MEMORIES", label: "Mémoire" },
      { section: "BATTERIES", label: "Batterie" },
      { section: "POWERSUPPLIES", label: "Alimentation" },
      { section: "CONTROLLERS", label: "Contrôleurs" },
      { section: "VIDEOS", label: "Vidéo" },
      { section: "SOUNDS", label: "Audio" },
      { section: "STORAGES", label: "Stockage" },
    ],
  },
  {
    value: "peripherals",
    label: "Périphériques",
    groups: [
      { section: "INPUTS", label: "Périphériques d'entrée" },
      { section: "MONITORS", label: "Moniteurs" },
      { section: "PRINTERS", label: "Imprimantes" },
      { section: "USBDEVICES", label: "USB" },
    ],
  },
  {
    value: "system",
    label: "Système d'exploitation",
    groups: [
      { section: "OPERATINGSYSTEM", label: "Description" },
      { section: "NETWORKS", label: "Réseaux" },
      { section: "DRIVES", label: "Volumes" },
      { section: "ANTIVIRUS", label: "EPP / EDR" },
      { section: "FIREWALL", label: "Pare-feu" },
      { section: "SOFTWARES", label: "Applications" },
      { section: "PROCESSES", label: "Process" },
      { section: "VIRTUALMACHINES", label: "Machines virtuelles" },
    ],
  },
];

/**
 * What is set aside for now: HARDWARE repeats what the
 * other sections say, USERS what the local accounts say.
 */
const EXCLUDED_SECTIONS = new Set(["HARDWARE", "USERS"]);

/** The "Résumé" tab, always first: it isn't read from a section. */
const SUMMARY = "summary";

/** The sections already placed in a tab. */
const PLACED_SECTIONS = new Set(TABS.flatMap((o) => o.groups.map((g) => g.section)));

/** A group as displayed: its label, and the inventory section. */
interface DisplayedGroup {
  label: string;
  section: ManagedDeviceAssetSection;
}

/**
 * The tabs that have something to show, and their non-empty groups.
 * What no tab places — a section the agent might add, or that
 * only some workstations declare — goes in "Autres", under its agent
 * name, rather than vanishing unnoticed.
 */
const tabsOf = (sections: ManagedDeviceAssetSection[]) => {
  const byName = new Map(sections.map((s) => [s.name, s]));
  const tabs = TABS.map(({ value, label, groups }) => ({
    value,
    label,
    groups: groups.flatMap(({ section, label: title }): DisplayedGroup[] => {
      const foundItem = byName.get(section);
      return foundItem ? [{ label: title, section: foundItem }] : [];
    }),
  }));
  const others = sections
    .filter((s) => !PLACED_SECTIONS.has(s.name) && !EXCLUDED_SECTIONS.has(s.name))
    .map((section) => ({ label: section.name, section }));
  tabs.push({ value: "others", label: "Autres", groups: others });
  return tabs.filter((o) => o.groups.length > 0);
};

/** The space under an expanded section, before the next one's header. */
const SPACE_BELOW_SECTION = 30;

/**
 * A tab's sections one after another, each in an accordion, all
 * collapsed on opening: you expand what you came to read. Collapsed, a section
 * has its title like the rest of the text, in gray; expanded, that of a
 * category.
 * The count says whether it describes one thing or six hundred. The tab is only mounted
 * when open: coming back to it collapses everything again.
 */
function SectionsTab({
  groups,
  os,
}: {
  groups: DisplayedGroup[];
  /** The workstation's system, whose Description takes the logo. */
  os: ManagedDeviceAssetDetail["os"];
}) {
  const [openSessions, setOpenedItems] = useState<string[]>([]);
  return (
    <Accordion
      multiple
      value={openSessions}
      onChange={setOpenedItems}
      chevronPosition="right"
      // The first section's title falls at the height of "Résumé":
      // the header has no margin of its own, the gap between two headers comes
      // from the stylesheet (ManagedDeviceAssetDrawer.module.css). Under the title, the
      // grid spaces out like the Summary cards.
      classNames={{ item: classes.section, control: classes.control }}
      styles={{
        item: { border: "none" },
        control: { paddingInline: 0 },
        label: { paddingBlock: 0 },
        content: { paddingInline: 0, paddingTop: SPACE_BELOW_TITLE, paddingBottom: 0 },
      }}
    >
      {groups.map(({ label, section }) => (
        <Accordion.Item
          key={section.name}
          value={section.name}
          // Expanded, the section is spaced from the next.
          mb={openSessions.includes(section.name) ? SPACE_BELOW_SECTION : 0}
        >
          <Accordion.Control>
            <Group gap="xs">
              <RecordTitle collapsed={!openSessions.includes(section.name)}>{label}</RecordTitle>
              {section.entries.length > 1 && (
                <Badge size="xs" variant="light" color="gray">
                  {section.entries.length}
                </Badge>
              )}
            </Group>
          </Accordion.Control>
          <Accordion.Panel>
            {/* The grid on the gray of the Summary cards, with their rounding. */}
            {WITHOUT_FRAME.has(section.name) ? (
              <SectionContent section={section} os={os} />
            ) : (
              <Box p="md" style={{ backgroundColor: CARD_BACKGROUND, borderRadius: 10 }}>
                <SectionContent section={section} os={os} />
              </Box>
            )}
          </Accordion.Panel>
        </Accordion.Item>
      ))}
    </Accordion>
  );
}

/** A section's content: its table when it has one, its records otherwise. */
function SectionContent({ section, os }: { section: ManagedDeviceAssetSection; os: ManagedDeviceAssetDetail["os"] }) {
  // The system description, in cards like the Summary.
  if (section.name === "OPERATINGSYSTEM") return <OperatingSystem section={section} os={os} />;
  const SectionTable = SECTION_TABLES[section.name];
  if (SectionTable) return <SectionTable section={section} />;
  return (
    <Stack gap="md">
      {section.entries.map((entry, rank) => (
        <Entry key={rank} section={section.name} entry={entry} />
      ))}
    </Stack>
  );
}

export default function ManagedDeviceAssetDrawer({ opened, onClose, asset }: ManagedDeviceAssetDrawerProps) {
  const [detail, setDetail] = useState<ManagedDeviceAssetDetail | null>(null);
  /** The displayed tab; the first opens with the record. */
  const [domain, setDomain] = useState<string | null>(null);

  // The identifier, not the workstation: the list is re-read on every write the
  // server announces, and the workstation is then a new object for the same
  // data. Relying on it would reload the drawer before the reader's eyes, and
  // collapse the sections they just opened.
  const assetId = asset?.id ?? null;

  useEffect(() => {
    if (!opened || assetId === null) return;
    // The workstation changes, or the drawer reopens: start again from the collapsed list
    // and re-read. The inventory is bulky, it only travels there.
    setDomain(null);
    setDetail(null);

    let abandoned = false;
    api
      .getManagedDeviceAsset(assetId)
      .then((received) => {
        if (abandoned) return;
        setDetail(received);
        // The summary opens: it's what we come looking for.
        setDomain(SUMMARY);
      })
      .catch((e) => {
        if (!abandoned) notifyError(errorMessage(e));
      });
    return () => {
      abandoned = true;
    };
  }, [opened, assetId]);

  const tabs = useMemo(() => (detail ? tabsOf(detail.sections) : []), [detail]);

  return (
    <Drawer
      opened={opened}
      onClose={onClose}
      position="right"
      size={DRAWER_WIDTH}
      padding={DRAWER_PADDING}
      withCloseButton={false}
      styles={{
        content: {
          display: "flex",
          flexDirection: "column",
          "--milo-drawer-padding": `${DRAWER_PADDING}px`,
        } as CSSProperties,
        body: { flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" },
      }}
    >
      <Stack gap="xs" style={{ flex: 1, minHeight: 0 }}>
        {/* The asset tag is in the Identité card of the Summary. Take
            control: the button only exists if the agent found a TeamViewer
            ID on the workstation — without it, there is nobody to call, and
            the header row goes away with its space. */}
        {detail?.teamviewer_id && (
          <Group justify="flex-end" wrap="nowrap" align="center" pb={SPACE_BELOW_HEADER}>
            <Button
              component="a"
              href={teamviewerLink(detail.teamviewer_id)}
              variant="light"
              color="teal"
              leftSection={<IconDeviceLaptop size={16} />}
            >
              TeamViewer
            </Button>
          </Group>
        )}

        {/* The tabs in a column along the left edge, each gathering
            several inventory sections. */}
        {detail && (
          <Tabs
            orientation="vertical"
            value={domain}
            onChange={setDomain}
            // Only the open tab is mounted: an inventory sometimes carries
            // six hundred pieces of software, and keeping them all in place would weigh down the
            // record for nothing.
            keepMounted={false}
            style={{ flex: 1, minHeight: 0, display: "flex" }}
            styles={{ panel: { paddingLeft: 20 } }}
          >
            {/* The tabs column goes down to the bottom of the record: its
                rule borders the panel over its full height. Five tabs
                fit without scrolling. */}
            <Tabs.List style={{ flex: `0 0 ${TABS_WIDTH}px` }}>
              <Tabs.Tab value={SUMMARY} style={tabStyle(domain === SUMMARY)}>
                Résumé
              </Tabs.Tab>
              {tabs.map((tab) => (
                <Tabs.Tab
                  key={tab.value}
                  value={tab.value}
                  style={tabStyle(domain === tab.value)}
                >
                  {tab.label}
                </Tabs.Tab>
              ))}
            </Tabs.List>

            {/* The open area scrolls, and its bar leaves the content to
                lie at the very right edge of the drawer, over its full
                height — like that of the Project and Support mode tables
                along the window. It no longer eats the panel's
                width, hence dropping "offsetScrollbars". */}
            <ScrollArea
              type="always"
              scrollbarSize={2}
              style={{ flex: 1, minHeight: 0 }}
              styles={{
                root: { position: "static" },
                scrollbar: {
                  position: "fixed",
                  top: 0,
                  bottom: 0,
                  right: 0,
                  left: "auto",
                  height: "auto",
                  width: "var(--scrollarea-scrollbar-size)",
                },
              }}
            >
              <Tabs.Panel value={SUMMARY} pl={40}>
                <ManagedDeviceAssetSummaryPanel detail={detail} />
              </Tabs.Panel>
              {tabs.map((tab) => (
                <Tabs.Panel key={tab.value} value={tab.value} pl={40}>
                  <SectionsTab groups={tab.groups} os={detail.os} />
                </Tabs.Panel>
              ))}
            </ScrollArea>
          </Tabs>
        )}

        <Footer pinned>
          <CloseButton onClick={onClose} />
        </Footer>
      </Stack>
    </Drawer>
  );
}
