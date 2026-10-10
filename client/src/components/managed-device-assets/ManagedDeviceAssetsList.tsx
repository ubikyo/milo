import {
  Badge,
  Center,
  Group,
  Menu,
  Progress,
  Table,
  Text,
  UnstyledButton,
} from "@mantine/core";
import {
  IconChevronDown,
  IconChevronUp,
  IconDeviceDesktop,
  IconHeadset,
  IconLock,
  IconLockOpen,
  IconSelector,
  IconSquarePlus,
} from "@tabler/icons-react";
import dayjs from "dayjs";
import {
  Fragment,
  createContext,
  useContext,
  useMemo,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { OsLogo, ProtectionLogo } from "./ManagedDeviceAssetLogos";
import { keptColumns, defaultWidths, useColumnWidthEditing, DATE_FORMATS, formatMoment } from "../ui/ColumnFields";
import type { ListColumn } from "../ui/ColumnFields";
import EmptyPanel from "../ui/EmptyPanel";
import GridScroll from "../ui/GridScroll";
import LabelChip from "../ui/LabelChip";
import PointMenu, { menuPosition, type PointMenuPosition } from "../ui/PointMenu";
import { useResizableColumns } from "../ui/useResizableColumns";
import { useIsEditing } from "../../lib/editing";
import { labelRank, labelsColumnTitle, ofGroup, useLabelGroups } from "../../lib/label-groups";
import { inList } from "../../lib/lists";
import { DISK_FULL, diskUsage, osLabel } from "../../lib/workstation";
import { RED, STRONG_TEXT } from "../../themes/colors";
import type { ManagedDeviceAsset, Id } from "@milo/shared";

// The Assets mode workstation list: a section widget, like the
// indicators (widgets/asset/list.tsx). It holds its sort and its right-click
// menu; the workstations, and what is opened from them, come from the page
// (ManagedDeviceAssetsListContext). Its configuration only names the columns it
// shows.
//
// There is no add row: a workstation isn't entered, it declares itself —
// its agent registers it.

// Vertical row padding, as in the project and support tables: the height
// includes the padding (box-sizing).
const ROW_PADDING_Y = 5;
const ROW_HEIGHT = 28;

// Height of the asset tag, like that of the ticket number in support.
const TAG_HEIGHT = 20;

/** A value the agent couldn't provide reads the same everywhere. */
const EMPTY = "—";

// The "Disque" column is sized like a project's progress: the
// bar, the percentage, and the space between them.
const DISK_BAR_WIDTH = 85;
const DISK_PERCENT_WIDTH = 40;
const DISK_GAP = 10;

// A workstation's labels, on a single line, as in Support: beyond two, the
// count of the others replaces the list.
const LABELS_SHOWN = 2;
const LABEL_HEIGHT = 20;

// --- Sort ------------------------------------------------------------------
// As in the Project and Support modes: a click on the label sorts, a second
// reverses the direction.

export type ColumnKey =
  | "name"
  | "labels"
  | "os"
  | "user"
  | "protection"
  | "encrypted"
  | "disk"
  | "inventory";

/** A protection's sort rank: workstations without protection first. */
const PROTECTION_RANK: Record<ManagedDeviceAsset["protection"]["state"], number> = {
  none: 0,
  inactive: 1,
  active: 2,
  unknown: 3,
};

/** The sort: a column, and for the labels, its group — two can coexist. */
interface Sort {
  key: ColumnKey;
  group?: Id;
  direction: "asc" | "desc";
}

/** True when the sort is that of this column — and of this group, for the labels. */
const sameSort = (sort: Sort, key: ColumnKey, group: Id | undefined): boolean =>
  sort.key === key && (key !== "labels" || sort.group === group);

/** The value each column sorts on; "null" goes to the bottom. */
const VALUES: Record<ColumnKey, (a: ManagedDeviceAsset) => string | number | null> = {
  name: (a) => a.name || null,
  // By the first label, in the labels' order: the one the cell shows first.
  // A column limited to a group reads its own (ManagedDeviceAssetsList).
  labels: (a) => labelRank(a.labels, null),
  // The name then the version, read as a number: "10" comes after "9".
  os: (a) => (a.os ? osLabel(a.os) : null),
  user: (a) => a.user || null,
  // The state first, then the vendor: workstations to watch group together.
  protection: (a) =>
    a.protection.state === "unknown"
      ? null
      : `${PROTECTION_RANK[a.protection.state]} ${a.protection.name}`,
  encrypted: (a) => (a.system_disk_encrypted == null ? null : a.system_disk_encrypted ? 1 : 0),
  disk: (a) => diskUsage(a.system_disk),
  inventory: (a) => dayjs(a.last_inventory).valueOf(),
};

function SortableTh({
  label,
  column,
  group,
  sort,
  onSort,
  style,
  handle,
}: {
  label: string;
  column: ColumnKey;
  /** For a labels column, the group it shows. */
  group?: Id;
  sort: Sort;
  onSort: (key: ColumnKey, group?: Id) => void;
  style?: CSSProperties;
  handle: ReactNode;
}) {
  const active = sameSort(sort, column, group);
  const Icon = !active ? IconSelector : sort.direction === "asc" ? IconChevronUp : IconChevronDown;
  return (
    <Table.Th style={style}>
      <UnstyledButton onClick={() => onSort(column, group)} w="100%">
        <Group gap={4} wrap="nowrap" justify="space-between">
          <Text size="sm" fw={600} c={STRONG_TEXT}>
            {label}
          </Text>
          <Center c={active ? undefined : "dimmed"}>
            <Icon size={14} />
          </Center>
        </Group>
      </UnstyledButton>
      {handle}
    </Table.Th>
  );
}

/** The workstation's labels, in their order — group after group. */
function LabelsCell({ labels }: { labels: ManagedDeviceAsset["labels"] }) {
  if (!labels.length) {
    return (
      <Text size="sm" c="dimmed">
        {EMPTY}
      </Text>
    );
  }
  const shown = ofGroup(labels, null).slice(0, LABELS_SHOWN);
  const remaining = labels.length - shown.length;
  return (
    <Group gap={4} wrap="nowrap">
      {shown.map((label) => (
        <LabelChip key={label.id} label={label} size="xs" height={LABEL_HEIGHT} />
      ))}
      {remaining > 0 && (
        <Text size="xs" c="dimmed">
          +{remaining}
        </Text>
      )}
    </Group>
  );
}

/** The system: its logo, its name and its version. */
function OsCell({ os }: { os: ManagedDeviceAsset["os"] }) {
  if (!os) {
    return (
      <Text size="sm" c="dimmed">
        {EMPTY}
      </Text>
    );
  }
  return (
    <Group gap={6} wrap="nowrap">
      <OsLogo os={os} />
      <Text size="sm" truncate>
        {osLabel(os) || EMPTY}
      </Text>
    </Group>
  );
}

/**
 * The workstation's protection: the vendor logo and its name. A disabled
 * protection says so in orange, a Windows workstation without protection in red;
 * outside Windows, the agent knows nothing about it, and the cell stays empty.
 */
function ProtectionCell({ protection }: { protection: ManagedDeviceAsset["protection"] }) {
  if (protection.state === "unknown") {
    return (
      <Text size="sm" c="dimmed">
        {EMPTY}
      </Text>
    );
  }
  if (protection.state === "none") {
    return (
      <Text size="sm" c={RED}>
        Aucun
      </Text>
    );
  }
  return (
    <Group gap={6} wrap="nowrap">
      <ProtectionLogo protection={protection} />
      <Text size="sm" truncate>
        {protection.name || protection.company || "Protection"}
      </Text>
      {protection.state === "inactive" && (
        <Text size="sm" c="orange" style={{ flexShrink: 0 }}>
          (inactif)
        </Text>
      )}
    </Group>
  );
}

/** The system volume encryption: a closed padlock, or an open one in red. */
function EncryptionCell({ encrypted }: { encrypted: boolean | null }) {
  if (encrypted == null) {
    return (
      <Text size="sm" c="dimmed">
        {EMPTY}
      </Text>
    );
  }
  return (
    <Group gap={6} wrap="nowrap" c={encrypted ? "teal" : RED}>
      {encrypted ? <IconLock size={16} /> : <IconLockOpen size={16} />}
      <Text size="sm" c="inherit">
        {encrypted ? "Oui" : "Non"}
      </Text>
    </Group>
  );
}

/**
 * The usage color: green while there is room left, orange from
 * 70 to 85%, red beyond.
 */
export const diskColor = (used: number): string => {
  if (used > DISK_FULL) return RED;
  if (used >= 70) return "orange";
  return "teal";
};

/** The used share of the system disk, like a project's progress. */
function DiskCell({ disk }: { disk: ManagedDeviceAsset["system_disk"] }) {
  const used = diskUsage(disk);
  if (used == null) {
    return (
      <Text size="sm" c="dimmed">
        {EMPTY}
      </Text>
    );
  }
  return (
    <Group gap={DISK_GAP} wrap="nowrap">
      <Progress value={used} color={diskColor(used)} size="lg" radius="xl" w={DISK_BAR_WIDTH} />
      <Text size="sm" w={DISK_PERCENT_WIDTH} ta="right">
        {used}%
      </Text>
    </Group>
  );
}

/** The columns the list can show, in order. */
export const MANAGED_DEVICE_ASSET_COLUMNS: (ListColumn & { key: ColumnKey })[] = [
  { key: "name", label: "Asset" },
  // It picks the group it shows.
  { key: "labels", label: "Étiquettes", labelGroups: "/managed-device-asset-labels" },
  { key: "os", label: "Système" },
  { key: "user", label: "Dernier utilisateur connecté" },
  { key: "protection", label: "Antivirus" },
  { key: "encrypted", label: "Chiffré" },
  { key: "disk", label: "Disque" },
  { key: "inventory", label: "Dernière actualisation", formats: DATE_FORMATS },
];

/** What the page gives the list. */
export interface ManagedDeviceAssetsListHandle {
  /** "null" while the workstations aren't read yet. */
  managedDeviceAssets: ManagedDeviceAsset[] | null;
  loading: boolean;
  onOpenManagedDeviceAsset: (asset: ManagedDeviceAsset) => void;
  /** "Créer une tâche", on right click on a workstation. */
  onCreateTask?: (asset: ManagedDeviceAsset) => void;
  /** "Créer un ticket", on right click on a workstation. */
  onCreateSupportRequest?: (asset: ManagedDeviceAsset) => void;
}

export const ManagedDeviceAssetsListContext = createContext<ManagedDeviceAssetsListHandle | null>(null);

export default function ManagedDeviceAssetsList({ config }: { config: unknown }) {
  const list = useContext(ManagedDeviceAssetsListContext);
  // The board's workstations, of the chosen context, that the page read — those of
  // this widget only: those whose tag its board's labels name (lib/lists.ts).
  const all = list?.managedDeviceAssets ?? null;
  const assets = useMemo(() => all?.filter(inList(config)) ?? null, [all, config]);
  const [sort, setSort] = useState<Sort>({ key: "name", direction: "asc" });
  // A labels column limited to a group takes its name.
  const labelGroups = useLabelGroups("/managed-device-asset-labels");
  const isEditing = useIsEditing();
  const withMenu = Boolean(list?.onCreateTask || list?.onCreateSupportRequest);
  /** The workstation whose right-click menu is open, and where it opens. */
  const [context, setContext] = useState<{ workstation: ManagedDeviceAsset; position: PointMenuPosition } | null>(
    null,
  );

  const shown = useMemo(() => {
    const value =
      sort.key === "labels"
        ? (a: ManagedDeviceAsset) => labelRank(a.labels, sort.group)
        : VALUES[sort.key];
    const factor = sort.direction === "asc" ? 1 : -1;
    return [...(assets ?? [])].sort((a, b) => {
      const left = value(a);
      const rightHand = value(b);
      if (left == null && rightHand == null) return 0;
      if (left == null) return 1;
      if (rightHand == null) return -1;
      if (typeof left === "number" && typeof rightHand === "number")
        return (left - rightHand) * factor;
      return String(left).localeCompare(String(rightHand), "fr", { numeric: true }) * factor;
    });
  }, [assets, sort]);

  // Texts go up first; the disk and the date start with the fullest and
  // the most recent.
  const sortBy = (key: ColumnKey, group?: Id) =>
    setSort((current) =>
      sameSort(current, key, group)
        ? { key, group, direction: current.direction === "asc" ? "desc" : "asc" }
        : {
            key,
            group,
            // Protection and encryption go up too: what is missing
            // comes first.
            direction:
              key === "name" ||
              key === "labels" ||
              key === "os" ||
              key === "user" ||
              key === "protection" ||
              key === "encrypted"
                ? "asc"
                : "desc",
          },
    );

  // The columns shown, in the order the configuration sets.
  // A column can come back: "id" distinguishes each occurrence.
  const columns = keptColumns(MANAGED_DEVICE_ASSET_COLUMNS, config);
  // In edit mode, the widths set above the columns go to the widget.
  const widthEditing = useColumnWidthEditing(MANAGED_DEVICE_ASSET_COLUMNS, config, columns.map((c) => c.id));
  const resize = useResizableColumns(
    "managed-device-assets",
    columns.map((c) => c.id),
    defaultWidths(MANAGED_DEVICE_ASSET_COLUMNS, config),
    undefined,
    widthEditing,
  );

  const th = (
    id: string,
    label: string,
    column: ColumnKey,
    style?: CSSProperties,
    group?: Id,
  ) => (
    <SortableTh
      key={id}
      label={label}
      column={column}
      group={group}
      sort={sort}
      onSort={sortBy}
      style={style}
      handle={resize.handle(id)}
    />
  );

  /** The header of each column. */
  const headers: Record<ColumnKey, (id: string, group?: Id) => ReactNode> = {
    name: (id) => th(id, "Asset", "name"),
    labels: (id, group) =>
      th(id, labelsColumnTitle(labelGroups, group), "labels", { whiteSpace: "nowrap" }, group),
    os: (id) => th(id, "Système", "os"),
    user: (id) => th(id, "Dernier utilisateur connecté", "user"),
    protection: (id) => th(id, "Antivirus", "protection"),
    encrypted: (id) => th(id, "Chiffré", "encrypted"),
    disk: (id) => th(id, "Disque", "disk", { width: DISK_BAR_WIDTH + DISK_PERCENT_WIDTH + DISK_GAP }),
    // What dates what was just read: a workstation off for three
    // weeks is spotted there.
    inventory: (id) => th(id, "Dernière actualisation", "inventory"),
  };

  /** Each column's cell, for a workstation. */
  const cells: Record<
    ColumnKey,
    (workstation: ManagedDeviceAsset, group?: Id, format?: string) => ReactNode
  > = {
    name: (workstation) => (
      <Table.Td key="name" style={{ whiteSpace: "nowrap" }}>
        <Badge color="green" variant="filled" radius="sm" h={TAG_HEIGHT} tt="uppercase">
          {workstation.name}
        </Badge>
      </Table.Td>
    ),
    // Limited to a group, the column shows only its labels.
    labels: (workstation, group) => (
      <Table.Td key="labels">
        <LabelsCell labels={ofGroup(workstation.labels, group)} />
      </Table.Td>
    ),
    os: (workstation) => (
      <Table.Td key="os">
        <OsCell os={workstation.os} />
      </Table.Td>
    ),
    user: (workstation) => (
      <Table.Td key="user">
        <Text size="sm" c={workstation.user ? undefined : "dimmed"}>
          {workstation.user || EMPTY}
        </Text>
      </Table.Td>
    ),
    protection: (workstation) => (
      <Table.Td key="protection">
        <ProtectionCell protection={workstation.protection} />
      </Table.Td>
    ),
    encrypted: (workstation) => (
      <Table.Td key="encrypted">
        <EncryptionCell encrypted={workstation.system_disk_encrypted} />
      </Table.Td>
    ),
    disk: (workstation) => (
      <Table.Td key="disk">
        <DiskCell disk={workstation.system_disk} />
      </Table.Td>
    ),
    inventory: (workstation, _group, format) => (
      <Table.Td key="inventory">
        <Text size="sm">{formatMoment(workstation.last_inventory, format)}</Text>
      </Table.Td>
    ),
  };

  const table = (
    <Table
      {...resize.tableProps}
      highlightOnHover
      verticalSpacing={0}
      styles={{
        td: {
          boxSizing: "content-box",
          height: ROW_HEIGHT,
          paddingTop: ROW_PADDING_Y,
          paddingBottom: ROW_PADDING_Y,
        },
        th: {
          boxSizing: "content-box",
          height: ROW_HEIGHT,
          paddingTop: ROW_PADDING_Y,
          paddingBottom: ROW_PADDING_Y,
          verticalAlign: "middle",
        },
      }}
    >
      {resize.colgroup}
      <Table.Thead>
        {resize.widthRow}
        <Table.Tr>{columns.map((c) => headers[c.key](c.id, c.group))}</Table.Tr>
      </Table.Thead>
      <Table.Tbody>
        {shown.map((workstation) => (
          <Table.Tr
            key={workstation.id}
            onClick={() => list?.onOpenManagedDeviceAsset(workstation)}
            // In edit mode, right click goes back to the widget's menu.
            onContextMenu={(e) => {
              if (isEditing || !withMenu) return;
              setContext({ workstation, position: menuPosition(e) });
            }}
            style={{
              cursor: "pointer",
              // The row whose menu is open keeps the hover background.
              backgroundColor:
                context?.workstation.id === workstation.id ? "var(--table-hover-color)" : undefined,
            }}
          >
            {columns.map((c) => (
              <Fragment key={c.id}>{cells[c.key](workstation, c.group, c.format)}</Fragment>
            ))}
          </Table.Tr>
        ))}
      </Table.Tbody>
    </Table>
  );

  if (!list || !assets) return null;
  // With no workstation to show, the list says so, without offering anything: nothing
  // is added from here, everything comes from the agents.
  if (assets.length === 0) {
    return list.loading ? null : (
      <EmptyPanel icon={IconDeviceDesktop} message="Aucun poste" size="md" />
    );
  }

  return (
    <>
      {/* A section narrower than the list makes it scroll sideways. */}
      <GridScroll>{table}</GridScroll>

      {context && (
        <PointMenu position={context.position} onClose={() => setContext(null)}>
          {list.onCreateTask && (
            <Menu.Item
              leftSection={<IconSquarePlus size={16} />}
              onClick={() => list.onCreateTask?.(context.workstation)}
            >
              Créer une tâche
            </Menu.Item>
          )}
          {list.onCreateSupportRequest && (
            <Menu.Item
              leftSection={<IconHeadset size={16} />}
              onClick={() => list.onCreateSupportRequest?.(context.workstation)}
            >
              Créer un ticket
            </Menu.Item>
          )}
        </PointMenu>
      )}
    </>
  );
}
