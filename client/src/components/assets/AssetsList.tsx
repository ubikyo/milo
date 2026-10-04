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
import { OsLogo, ProtectionLogo } from "./AssetLogos";
import { keptColumns, defaultWidths } from "../ui/ColumnFields";
import EmptyPanel from "../ui/EmptyPanel";
import GridScroll from "../ui/GridScroll";
import PointMenu, { menuPosition, type PointMenuPosition } from "../ui/PointMenu";
import { useResizableColumns } from "../ui/useResizableColumns";
import { useIsEditing } from "../../lib/editing";
import { inList } from "../../lib/lists";
import { DISK_FULL, diskUsage, osLabel } from "../../lib/workstation";
import { RED, STRONG_TEXT } from "../../themes/colors";
import type { Asset } from "@milo/shared";

// La liste des postes du mode Assets : un widget des sections, comme les
// indicateurs (asset-indicators/liste.tsx). Elle tient son tri et le menu de
// son clic droit ; les postes, et ce qu'on en ouvre, viennent de la page
// (AssetsListeContext). Sa configuration ne dit que les colonnes qu'elle
// montre.
//
// Il n'y a pas de ligne d'ajout : un poste n'est pas saisi, il se déclare —
// c'est son agent qui l'inscrit.

// Padding vertical des lignes, comme dans les tableaux des projets et du
// support : la hauteur inclut le padding (box-sizing).
const ROW_PADDING_Y = 5;
const ROW_HEIGHT = 28;

// Hauteur du tag de l'asset, comme celui du numéro de ticket au support.
const TAG_HEIGHT = 20;

/** Une valeur que l'agent n'a pas su donner se lit pareil partout. */
const EMPTY = "—";

// La colonne « Disque » est taillée comme la progression d'un projet : la
// barre, le pourcentage, et l'espace qui les sépare.
const DISK_BAR_WIDTH = 85;
const DISK_PERCENT_WIDTH = 40;
const DISK_GAP = 10;

// --- Tri -------------------------------------------------------------------
// Comme aux modes Projet et Support : un clic sur le libellé trie, un second
// inverse le sens.

export type ColumnKey = "name" | "os" | "user" | "protection" | "encrypted" | "disk" | "inventory";

/** Le rang d'une protection au tri : les postes sans protection d'abord. */
const PROTECTION_RANK: Record<Asset["protection"]["state"], number> = {
  none: 0,
  inactive: 1,
  active: 2,
  unknown: 3,
};

interface Sort {
  key: ColumnKey;
  direction: "asc" | "desc";
}

/** La valeur sur laquelle chaque colonne se trie ; « null » passe en bas. */
const VALUES: Record<ColumnKey, (a: Asset) => string | number | null> = {
  name: (a) => a.name || null,
  // Le nom puis la version, lue comme un nombre : « 10 » vient après « 9 ».
  os: (a) => (a.os ? osLabel(a.os) : null),
  user: (a) => a.user || null,
  // L'état d'abord, puis l'éditeur : les postes à surveiller se regroupent.
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
  sort,
  onSort,
  style,
  handle,
}: {
  label: string;
  column: ColumnKey;
  sort: Sort;
  onSort: (key: ColumnKey) => void;
  style?: CSSProperties;
  handle: ReactNode;
}) {
  const active = sort.key === column;
  const Icon = !active ? IconSelector : sort.direction === "asc" ? IconChevronUp : IconChevronDown;
  return (
    <Table.Th style={style}>
      <UnstyledButton onClick={() => onSort(column)} w="100%">
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

/** Le système : son logo, son nom et sa version. */
function OsCell({ os }: { os: Asset["os"] }) {
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
 * La protection du poste : le logo de l'éditeur et son nom. Une protection
 * désactivée le dit en orange, un poste Windows sans protection en rouge ;
 * hors de Windows, l'agent n'en sait rien, et la case reste vide.
 */
function ProtectionCell({ protection }: { protection: Asset["protection"] }) {
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

/** Le chiffrement du volume système : un cadenas fermé, ou ouvert en rouge. */
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
 * La couleur de l'occupation : vert tant qu'il reste de la place, orange de
 * 70 à 85 %, rouge au-delà.
 */
export const diskColor = (used: number): string => {
  if (used > DISK_FULL) return RED;
  if (used >= 70) return "orange";
  return "teal";
};

/** La part occupée du disque système, comme la progression d'un projet. */
function DiskCell({ disk }: { disk: Asset["system_disk"] }) {
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

/** Les colonnes que la liste sait montrer, dans l'ordre. */
export const ASSET_COLUMNS: { key: ColumnKey; label: string }[] = [
  { key: "name", label: "Asset" },
  { key: "os", label: "Système" },
  { key: "user", label: "Dernier utilisateur connecté" },
  { key: "protection", label: "Antivirus" },
  { key: "encrypted", label: "Chiffré" },
  { key: "disk", label: "Disque" },
  { key: "inventory", label: "Dernière actualisation" },
];

/** Ce que la page donne à la liste. */
export interface AssetsListHandle {
  /** « null » tant que les postes ne sont pas lus. */
  assets: Asset[] | null;
  loading: boolean;
  onOpenAsset: (asset: Asset) => void;
  /** « Créer une tâche », au clic droit sur un poste. */
  onCreateTask?: (asset: Asset) => void;
  /** « Créer un ticket », au clic droit sur un poste. */
  onCreateSupportRequest?: (asset: Asset) => void;
}

export const AssetsListContext = createContext<AssetsListHandle | null>(null);

/** La clé des tags GLPI reçus, dans la configuration de la liste : chacun vers un contexte. */
export const TAGS = "tags";

export default function AssetsList({ config }: { config: unknown }) {
  const list = useContext(AssetsListContext);
  // Les postes du tableau, du contexte choisi, que la page a lus — ceux de
  // ce widget seulement : ceux dont il reçoit le tag (lib/listes.ts).
  const all = list?.assets ?? null;
  const assets = useMemo(() => all?.filter(inList(config)) ?? null, [all, config]);
  const [sort, setSort] = useState<Sort>({ key: "name", direction: "asc" });
  const isEditing = useIsEditing();
  const withMenu = Boolean(list?.onCreateTask || list?.onCreateSupportRequest);
  /** Le poste dont le menu du clic droit est ouvert, et où il s'ouvre. */
  const [context, setContext] = useState<{ workstation: Asset; position: PointMenuPosition } | null>(
    null,
  );

  const shown = useMemo(() => {
    const value = VALUES[sort.key];
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

  // Les textes montent d'abord ; le disque et la date commencent par le plus
  // plein et le plus récent.
  const sortBy = (key: ColumnKey) =>
    setSort((current) =>
      current.key === key
        ? { key, direction: current.direction === "asc" ? "desc" : "asc" }
        : {
            key,
            // La protection et le chiffrement montent aussi : ce qui manque
            // vient en tête.
            direction:
              key === "name" ||
              key === "os" ||
              key === "user" ||
              key === "protection" ||
              key === "encrypted"
                ? "asc"
                : "desc",
          },
    );

  // Les colonnes montrées, dans l'ordre que la configuration règle.
  // Une colonne peut revenir : « id » distingue chaque occurrence.
  const columns = keptColumns(ASSET_COLUMNS, config);
  const resize = useResizableColumns(
    "assets",
    columns.map((c) => c.id),
    defaultWidths(ASSET_COLUMNS, config),
  );

  const th = (id: string, label: string, column: ColumnKey, style?: CSSProperties) => (
    <SortableTh
      key={id}
      label={label}
      column={column}
      sort={sort}
      onSort={sortBy}
      style={style}
      handle={resize.handle(id)}
    />
  );

  /** L'en-tête de chaque colonne. */
  const headers: Record<ColumnKey, (id: string) => ReactNode> = {
    name: (id) => th(id, "Asset", "name"),
    os: (id) => th(id, "Système", "os"),
    user: (id) => th(id, "Dernier utilisateur connecté", "user"),
    protection: (id) => th(id, "Antivirus", "protection"),
    encrypted: (id) => th(id, "Chiffré", "encrypted"),
    disk: (id) => th(id, "Disque", "disk", { width: DISK_BAR_WIDTH + DISK_PERCENT_WIDTH + DISK_GAP }),
    // Ce qui date ce qu'on vient de lire : un poste éteint depuis trois
    // semaines se repère là.
    inventory: (id) => th(id, "Dernière actualisation", "inventory"),
  };

  /** La case de chaque colonne, pour un poste. */
  const cells: Record<ColumnKey, (workstation: Asset) => ReactNode> = {
    name: (workstation) => (
      <Table.Td key="name" style={{ whiteSpace: "nowrap" }}>
        <Badge color="green" variant="filled" radius="sm" h={TAG_HEIGHT} tt="uppercase">
          {workstation.name}
        </Badge>
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
    inventory: (workstation) => (
      <Table.Td key="inventory">
        <Text size="sm">{dayjs(workstation.last_inventory).format("DD/MM/YYYY HH:mm")}</Text>
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
        <Table.Tr>{columns.map((c) => headers[c.key](c.id))}</Table.Tr>
      </Table.Thead>
      <Table.Tbody>
        {shown.map((workstation) => (
          <Table.Tr
            key={workstation.id}
            onClick={() => list?.onOpenAsset(workstation)}
            // En modification, le clic droit revient au menu du widget.
            onContextMenu={(e) => {
              if (isEditing || !withMenu) return;
              setContext({ workstation, position: menuPosition(e) });
            }}
            style={{
              cursor: "pointer",
              // La ligne dont le menu est ouvert garde le fond du survol.
              backgroundColor:
                context?.workstation.id === workstation.id ? "var(--table-hover-color)" : undefined,
            }}
          >
            {columns.map((c) => (
              <Fragment key={c.id}>{cells[c.key](workstation)}</Fragment>
            ))}
          </Table.Tr>
        ))}
      </Table.Tbody>
    </Table>
  );

  if (!list || !assets) return null;
  // Sans poste à montrer, la liste le dit, sans rien proposer : rien ne
  // s'ajoute d'ici, tout vient des agents.
  if (assets.length === 0) {
    return list.loading ? null : (
      <EmptyPanel icon={IconDeviceDesktop} message="Aucun poste" size="md" />
    );
  }

  return (
    <>
      {/* Une section plus étroite que la liste la fait défiler de côté. */}
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
