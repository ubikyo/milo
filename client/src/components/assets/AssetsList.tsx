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
import { colonnesGardees, largeursParDefaut } from "../ui/ChampsColonnes";
import EmptyPanel from "../ui/EmptyPanel";
import GrilleScroll from "../ui/GrilleScroll";
import PointMenu, { positionDuMenu, type PointMenuPosition } from "../ui/PointMenu";
import { useColonnesRedimensionnables } from "../ui/useColonnesRedimensionnables";
import { useEnModification } from "../../lib/edition";
import { deLaListe } from "../../lib/listes";
import { DISQUE_PLEIN, diskUsage, libelleOs } from "../../lib/poste";
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
const VIDE = "—";

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
const RANG_PROTECTION: Record<Asset["protection"]["state"], number> = {
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
const VALEURS: Record<ColumnKey, (a: Asset) => string | number | null> = {
  name: (a) => a.name || null,
  // Le nom puis la version, lue comme un nombre : « 10 » vient après « 9 ».
  os: (a) => (a.os ? libelleOs(a.os) : null),
  user: (a) => a.user || null,
  // L'état d'abord, puis l'éditeur : les postes à surveiller se regroupent.
  protection: (a) =>
    a.protection.state === "unknown"
      ? null
      : `${RANG_PROTECTION[a.protection.state]} ${a.protection.name}`,
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
  poignee,
}: {
  label: string;
  column: ColumnKey;
  sort: Sort;
  onSort: (key: ColumnKey) => void;
  style?: CSSProperties;
  poignee: ReactNode;
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
      {poignee}
    </Table.Th>
  );
}

/** Le système : son logo, son nom et sa version. */
function OsCell({ os }: { os: Asset["os"] }) {
  if (!os) {
    return (
      <Text size="sm" c="dimmed">
        {VIDE}
      </Text>
    );
  }
  return (
    <Group gap={6} wrap="nowrap">
      <OsLogo os={os} />
      <Text size="sm" truncate>
        {libelleOs(os) || VIDE}
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
        {VIDE}
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
        {VIDE}
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
export const diskColor = (occupe: number): string => {
  if (occupe > DISQUE_PLEIN) return RED;
  if (occupe >= 70) return "orange";
  return "teal";
};

/** La part occupée du disque système, comme la progression d'un projet. */
function DiskCell({ disk }: { disk: Asset["system_disk"] }) {
  const occupe = diskUsage(disk);
  if (occupe == null) {
    return (
      <Text size="sm" c="dimmed">
        {VIDE}
      </Text>
    );
  }
  return (
    <Group gap={DISK_GAP} wrap="nowrap">
      <Progress value={occupe} color={diskColor(occupe)} size="lg" radius="xl" w={DISK_BAR_WIDTH} />
      <Text size="sm" w={DISK_PERCENT_WIDTH} ta="right">
        {occupe}%
      </Text>
    </Group>
  );
}

/** Les colonnes que la liste sait montrer, dans l'ordre. */
export const COLONNES_ASSETS: { key: ColumnKey; label: string }[] = [
  { key: "name", label: "Asset" },
  { key: "os", label: "Système" },
  { key: "user", label: "Dernier utilisateur connecté" },
  { key: "protection", label: "Antivirus" },
  { key: "encrypted", label: "Chiffré" },
  { key: "disk", label: "Disque" },
  { key: "inventory", label: "Dernière actualisation" },
];

/** Ce que la page donne à la liste. */
export interface AssetsListe {
  /** « null » tant que les postes ne sont pas lus. */
  assets: Asset[] | null;
  loading: boolean;
  onOpenAsset: (asset: Asset) => void;
  /** « Créer une tâche », au clic droit sur un poste. */
  onCreateTask?: (asset: Asset) => void;
  /** « Créer une demande de support », au clic droit sur un poste. */
  onCreateSupportRequest?: (asset: Asset) => void;
}

export const AssetsListeContext = createContext<AssetsListe | null>(null);

/** La clé des tags GLPI reçus, dans la configuration de la liste : chacun vers un contexte. */
export const TAGS = "tags";

export default function AssetsList({ config }: { config: unknown }) {
  const liste = useContext(AssetsListeContext);
  // Les postes du tableau, du contexte choisi, que la page a lus — ceux de
  // ce widget seulement : ceux dont il reçoit le tag (lib/listes.ts).
  const tous = liste?.assets ?? null;
  const assets = useMemo(() => tous?.filter(deLaListe(config)) ?? null, [tous, config]);
  const [sort, setSort] = useState<Sort>({ key: "name", direction: "asc" });
  const enModification = useEnModification();
  const avecMenu = Boolean(liste?.onCreateTask || liste?.onCreateSupportRequest);
  /** Le poste dont le menu du clic droit est ouvert, et où il s'ouvre. */
  const [contexte, setContexte] = useState<{ poste: Asset; position: PointMenuPosition } | null>(
    null,
  );

  const montres = useMemo(() => {
    const valeur = VALEURS[sort.key];
    const facteur = sort.direction === "asc" ? 1 : -1;
    return [...(assets ?? [])].sort((a, b) => {
      const gauche = valeur(a);
      const droite = valeur(b);
      if (gauche == null && droite == null) return 0;
      if (gauche == null) return 1;
      if (droite == null) return -1;
      if (typeof gauche === "number" && typeof droite === "number")
        return (gauche - droite) * facteur;
      return String(gauche).localeCompare(String(droite), "fr", { numeric: true }) * facteur;
    });
  }, [assets, sort]);

  // Les textes montent d'abord ; le disque et la date commencent par le plus
  // plein et le plus récent.
  const trier = (key: ColumnKey) =>
    setSort((courant) =>
      courant.key === key
        ? { key, direction: courant.direction === "asc" ? "desc" : "asc" }
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
  const colonnes = colonnesGardees(COLONNES_ASSETS, config);
  const redim = useColonnesRedimensionnables(
    "assets",
    colonnes.map((c) => c.id),
    largeursParDefaut(COLONNES_ASSETS, config),
  );

  const th = (id: string, label: string, column: ColumnKey, style?: CSSProperties) => (
    <SortableTh
      key={id}
      label={label}
      column={column}
      sort={sort}
      onSort={trier}
      style={style}
      poignee={redim.poignee(id)}
    />
  );

  /** L'en-tête de chaque colonne. */
  const entetes: Record<ColumnKey, (id: string) => ReactNode> = {
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
  const cases: Record<ColumnKey, (poste: Asset) => ReactNode> = {
    name: (poste) => (
      <Table.Td key="name" style={{ whiteSpace: "nowrap" }}>
        <Badge color="green" variant="filled" radius="sm" h={TAG_HEIGHT} tt="uppercase">
          {poste.name}
        </Badge>
      </Table.Td>
    ),
    os: (poste) => (
      <Table.Td key="os">
        <OsCell os={poste.os} />
      </Table.Td>
    ),
    user: (poste) => (
      <Table.Td key="user">
        <Text size="sm" c={poste.user ? undefined : "dimmed"}>
          {poste.user || VIDE}
        </Text>
      </Table.Td>
    ),
    protection: (poste) => (
      <Table.Td key="protection">
        <ProtectionCell protection={poste.protection} />
      </Table.Td>
    ),
    encrypted: (poste) => (
      <Table.Td key="encrypted">
        <EncryptionCell encrypted={poste.system_disk_encrypted} />
      </Table.Td>
    ),
    disk: (poste) => (
      <Table.Td key="disk">
        <DiskCell disk={poste.system_disk} />
      </Table.Td>
    ),
    inventory: (poste) => (
      <Table.Td key="inventory">
        <Text size="sm">{dayjs(poste.last_inventory).format("DD/MM/YYYY HH:mm")}</Text>
      </Table.Td>
    ),
  };

  const table = (
    <Table
      {...redim.tableProps}
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
      {redim.colgroup}
      <Table.Thead>
        <Table.Tr>{colonnes.map((c) => entetes[c.key](c.id))}</Table.Tr>
      </Table.Thead>
      <Table.Tbody>
        {montres.map((poste) => (
          <Table.Tr
            key={poste.id}
            onClick={() => liste?.onOpenAsset(poste)}
            // En modification, le clic droit revient au menu du widget.
            onContextMenu={(e) => {
              if (enModification || !avecMenu) return;
              setContexte({ poste, position: positionDuMenu(e) });
            }}
            style={{
              cursor: "pointer",
              // La ligne dont le menu est ouvert garde le fond du survol.
              backgroundColor:
                contexte?.poste.id === poste.id ? "var(--table-hover-color)" : undefined,
            }}
          >
            {colonnes.map((c) => (
              <Fragment key={c.id}>{cases[c.key](poste)}</Fragment>
            ))}
          </Table.Tr>
        ))}
      </Table.Tbody>
    </Table>
  );

  if (!liste || !assets) return null;
  // Sans poste à montrer, la liste le dit, sans rien proposer : rien ne
  // s'ajoute d'ici, tout vient des agents.
  if (assets.length === 0) {
    return liste.loading ? null : (
      <EmptyPanel icon={IconDeviceDesktop} message="Aucun poste" size="md" />
    );
  }

  return (
    <>
      {/* Une section plus étroite que la liste la fait défiler de côté. */}
      <GrilleScroll>{table}</GrilleScroll>

      {contexte && (
        <PointMenu position={contexte.position} onClose={() => setContexte(null)}>
          {liste.onCreateTask && (
            <Menu.Item
              leftSection={<IconSquarePlus size={16} />}
              onClick={() => liste.onCreateTask?.(contexte.poste)}
            >
              Créer une tâche
            </Menu.Item>
          )}
          {liste.onCreateSupportRequest && (
            <Menu.Item
              leftSection={<IconHeadset size={16} />}
              onClick={() => liste.onCreateSupportRequest?.(contexte.poste)}
            >
              Créer une demande de support
            </Menu.Item>
          )}
        </PointMenu>
      )}
    </>
  );
}
