import {
  Badge,
  Box,
  Button,
  Center,
  CopyButton,
  Group,
  Progress,
  RingProgress,
  ScrollArea,
  Stack,
  Table,
  Text,
  Title,
  UnstyledButton,
} from "@mantine/core";
import {
  IconCheck,
  IconChevronDown,
  IconChevronUp,
  IconCopy,
  IconSelector,
} from "@tabler/icons-react";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { NEUTRAL_HOVER, STRONG_TEXT } from "../../themes/colors";
import GridScroll from "../ui/GrilleScroll";
import { ReferenceTag } from "../ui/ReferenceTag";
import { CARD_BACKGROUND } from "./fonds";
import { useResizableColumns } from "../ui/useColonnesRedimensionnables";
import type { ComponentType, CSSProperties, ReactNode } from "react";
import type { AssetEntry, AssetSection } from "@milo/shared";

// Les sections de l'inventaire que la fiche d'un poste montre en tableau,
// plutôt qu'en fiches à la suite : celles qui ont assez de lignes pour qu'on
// veuille les comparer, les trier, y chercher la bonne.

/** Une valeur absente se lit pareil partout : un tiret discret. */
export const EMPTY = "—";

// --- Le tableau triable -----------------------------------------------------

type Direction = "asc" | "desc";

interface Column {
  key: string;
  label: string;
  /**
   * Ce sur quoi la colonne se trie. Rien — ou une chaîne vide — quand la
   * ligne n'en dit rien : elle passe alors en bas, dans un sens comme dans
   * l'autre.
   */
  value: (entry: AssetEntry) => string | number | null;
  render: (entry: AssetEntry) => ReactNode;
  /** Le sens du premier clic : décroissant pour ce qu'on cherche en haut. */
  firstDirection?: Direction;
  onRight?: boolean;
  largeur?: CSSProperties["width"];
}

interface Sorting {
  key: string;
  direction: Direction;
}

/** L'en-tête d'une colonne : un clic trie, un second inverse. */
function Header({
  column,
  sorting,
  onSort,
  handle,
}: {
  column: Column;
  sorting: Sorting;
  onSort: () => void;
  handle: ReactNode;
}) {
  const active = sorting.key === column.key;
  const Icon = !active ? IconSelector : sorting.direction === "asc" ? IconChevronUp : IconChevronDown;
  return (
    <Table.Th style={{ width: column.largeur }}>
      <UnstyledButton onClick={onSort} style={{ width: "100%" }}>
        <Group
          gap={4}
          wrap="nowrap"
          justify={column.onRight ? "flex-end" : "space-between"}
        >
          <Text size="sm" fw={600} c={STRONG_TEXT}>
            {column.label}
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

function SortableTable({
  columns,
  entries,
  initialSorting,
  spacing = 4,
  widths,
  perPage,
}: {
  columns: Column[];
  entries: AssetEntry[];
  initialSorting: Sorting;
  spacing?: number;
  /**
   * Les largeurs de départ, en pixels, des colonnes qui en ont une ; les
   * autres se partagent le reste. Sans elles, la mise en page naturelle.
   */
  widths?: Record<string, number>;
  /**
   * La hauteur de la grille, en lignes : au-delà, elle défile dans sa propre
   * zone, l'entête restant en haut. C'est aussi le nombre de lignes montrées
   * d'abord, et ajoutées chaque fois qu'on arrive au bas de la zone. Sans
   * lui, toutes d'un coup, sur toute leur hauteur.
   */
  perPage?: number;
}) {
  const [sorting, setSort] = useState<Sorting>(initialSorting);
  // Une tranche d'avance sur la hauteur de la zone : sans elle, la zone ne
  // contiendrait que ce qu'elle montre, n'aurait rien à faire défiler, et la
  // suite ne viendrait jamais.
  const firstItems = perPage ? 2 * perPage : Infinity;
  const [shown, setShown] = useState(firstItems);
  // Le repère sous la dernière ligne : quand il paraît, la suite vient.
  const marker = useRef<HTMLDivElement>(null);
  // La grille, pour mesurer la hauteur de ses « parPage » premières lignes.
  const frame = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState<number | undefined>(undefined);
  // Chaque tableau de l'inventaire se reconnaît à ses colonnes.
  const keys = columns.map((c) => c.key);
  const resize = useResizableColumns(`inventaire.${keys.join("-")}`, keys, widths);

  const sortBy = (column: Column) => {
    // Un autre ordre repart du haut de la grille.
    setShown(firstItems);
    setSort((current) =>
      current.key === column.key
        ? { key: column.key, direction: current.direction === "asc" ? "desc" : "asc" }
        : { key: column.key, direction: column.firstDirection ?? "asc" },
    );
  };

  const sorted = useMemo(() => {
    const column = columns.find((c) => c.key === sorting.key);
    if (!column) return entries;
    const factor = sorting.direction === "asc" ? 1 : -1;
    return [...entries].sort((a, b) => {
      const left = column.value(a);
      const rightHand = column.value(b);
      const missingLeft = left === null || left === "";
      const missingRight = rightHand === null || rightHand === "";
      if (missingLeft || missingRight) return missingLeft === missingRight ? 0 : missingLeft ? 1 : -1;
      if (typeof left === "number" && typeof rightHand === "number") {
        return (left - rightHand) * factor;
      }
      // « numeric » range « 10.2 » après « 9.1 », et « sensitivity » met
      // « adobe » et « Adobe » ensemble.
      return (
        String(left).localeCompare(String(rightHand), "fr", {
          numeric: true,
          sensitivity: "base",
        }) * factor
      );
    });
  }, [columns, entries, sorting]);

  const rest = sorted.length > shown;
  useEffect(() => {
    const target = marker.current;
    if (!target || !rest || !perPage) return;
    // Une part réellement visible du repère, et non « isIntersecting » : dans
    // une section repliée, de hauteur nulle, le navigateur le dit visible par
    // une intersection d'aire nulle, et tout se chargerait d'un coup.
    const observer = new IntersectionObserver((seen) => {
      if (seen.some((v) => v.intersectionRatio > 0)) setShown((n) => n + perPage);
    });
    observer.observe(target);
    return () => observer.disconnect();
  }, [rest, perPage, shown]);

  // La hauteur de la zone : l'entête et les « parPage » premières lignes. Elle
  // se mesure de nouveau quand la grille change de taille — une section
  // repliée n'en a pas, et se déplie plus tard.
  useLayoutEffect(() => {
    const grid = frame.current;
    if (!grid || !perPage) return;
    const measure = () => {
      const rows = grid.querySelectorAll("tbody tr");
      const last = rows[perPage - 1];
      if (rows.length <= perPage || !last) return setHeight(undefined);
      // Du haut du cadre au bas de la dernière ligne, plus la marge du bas.
      const margin = parseFloat(getComputedStyle(grid).paddingBottom) || 0;
      const h =
        last.getBoundingClientRect().bottom - grid.getBoundingClientRect().top + margin;
      if (h > 0) setHeight(Math.ceil(h));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(grid);
    return () => observer.disconnect();
  }, [perPage, sorted.length]);

  const grid = (
    <Table {...resize.tableProps} verticalSpacing={spacing} horizontalSpacing="xs">
      {resize.colgroup}
      <Table.Thead style={perPage ? STICKY_HEADER : undefined}>
        <Table.Tr>
          {columns.map((column) => (
            <Header
              key={column.key}
              column={column}
              sorting={sorting}
              onSort={() => sortBy(column)}
              handle={resize.handle(column.key)}
            />
          ))}
        </Table.Tr>
      </Table.Thead>
      <Table.Tbody>
        {sorted.slice(0, shown).map((entry, rank) => (
          <Table.Tr key={rank}>
            {columns.map((column) => (
              <Table.Td
                key={column.key}
                style={column.onRight ? { textAlign: "right", whiteSpace: "nowrap" } : undefined}
              >
                {column.render(entry)}
              </Table.Td>
            ))}
          </Table.Tr>
        ))}
      </Table.Tbody>
    </Table>
  );

  // Limitée en hauteur, la grille défile dans les deux sens dans une même
  // zone, où son entête reste collé en haut. La zone recouvre tout le cadre
  // gris de la section (sa marge « md » reprise en négatif, puis rendue à
  // l'intérieur) : la barre longe ainsi la section sur toute sa hauteur,
  // comme celle du tiroir longe la fenêtre. Sinon, élargie à la main
  // au-delà de la section, elle n'y défile que de côté.
  if (perPage) {
    return (
      // La barre fine du tiroir de la fiche : 2 px, toujours visible.
      <ScrollArea.Autosize
        mah={height}
        type="always"
        scrollbarSize={2}
        m="calc(-1 * var(--mantine-spacing-md))"
        style={{ borderRadius: 10 }}
        styles={{ content: { display: "block" } }}
      >
        <Box ref={frame} p="md">
          {grid}
          {rest && <div ref={marker} style={{ height: 1 }} />}
        </Box>
      </ScrollArea.Autosize>
    );
  }
  return <GridScroll>{grid}</GridScroll>;
}

/**
 * L'entête d'une grille limitée en hauteur : il reste en haut quand elle
 * défile, à la marge du cadre, et l'ombre pleine au-dessus de lui cache les
 * lignes qui passent dans cette marge.
 */
const STICKY_HEADER: CSSProperties = {
  position: "sticky",
  top: "var(--mantine-spacing-md)",
  zIndex: 2,
  backgroundColor: CARD_BACKGROUND,
  boxShadow: `0 calc(-1 * var(--mantine-spacing-md)) 0 ${CARD_BACKGROUND}`,
};

/** Une cellule de texte ordinaire, ou le tiret quand elle est vide. */
const text = (value: string | undefined) => (
  <Text size="sm" style={{ wordBreak: "break-word" }}>
    {value || EMPTY}
  </Text>
);

/** Un champ tel quel : la colonne la plus simple, triée sur sa valeur. */
const field = (key: string, label: string): Column => ({
  key,
  label,
  value: (entry) => entry[key] ?? null,
  render: (entry) => text(entry[key]),
});

// --- Volumes ----------------------------------------------------------------

/**
 * Une taille donnée en Mo par l'agent, lisible : « 3,63 To », « 476 Go »,
 * « 512 Mo ». Au-delà de 1 000 Go, elle passe en To.
 */
export const size = (mo: number): string => {
  const go = mo / 1024;
  if (go > 1000) {
    return `${(go / 1024).toLocaleString("fr-FR", { maximumFractionDigits: 2 })} To`;
  }
  return mo >= 1024
    ? `${go.toLocaleString("fr-FR", { maximumFractionDigits: mo >= 10 * 1024 ? 0 : 1 })} Go`
    : `${Math.round(mo).toLocaleString("fr-FR")} Mo`;
};

/** « Yes » et « No » de l'agent, en français ; le reste tel quel. */
const yesNo = (value: string | undefined): string => {
  const v = (value ?? "").toLowerCase();
  if (v === "yes" || v === "1" || v === "true") return "Oui";
  if (v === "no" || v === "0" || v === "false") return "Non";
  return value ?? "";
};

/**
 * Un GUID de type de partition GPT, que l'agent donne parfois à la place du
 * système de fichiers — sous macOS surtout, où les volumes APFS sortent en
 * « 41504653-0000-11AA-AA11-00306543ECAC » (41504653, c'est « APFS » en
 * ASCII).
 */
const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Le système de fichiers, ou rien quand l'agent n'a donné qu'un GUID. */
const fileSystem = (value: string | undefined): string =>
  value && !GUID.test(value.trim()) ? value : "";

/**
 * La part occupée d'un volume, de 0 à 100, ou rien : un lecteur optique vide
 * ou un partage injoignable ne donne pas de taille.
 */
const usage = (entry: AssetEntry): number | null => {
  const total = Number(entry["TOTAL"]);
  const free = Number(entry["FREE"]);
  if (!(total > 0) || Number.isNaN(free)) return null;
  return Math.min(100, Math.max(0, ((total - free) / total) * 100));
};

/** La jauge d'un volume : l'occupé en barre, le libre et le total en clair. */
function Usage({ entry }: { entry: AssetEntry }) {
  const occupe = usage(entry);
  if (occupe === null) {
    return (
      <Text size="sm" c="dimmed">
        {EMPTY}
      </Text>
    );
  }
  // La couleur ne dit rien tant qu'il reste de la place, et alerte quand il
  // n'en reste plus.
  const color = occupe >= 90 ? "red" : occupe >= 75 ? "orange" : "blue";
  return (
    <Stack gap={2}>
      <Progress value={occupe} color={color} size="sm" />
      <Text size="xs" c="dimmed">
        {size(Number(entry["FREE"]))} / {size(Number(entry["TOTAL"]))}
      </Text>
    </Stack>
  );
}

/** Le volume système : « C: » sous Windows, « / » ailleurs. */
const isSystemDisk = (entry: AssetEntry): boolean =>
  (entry["LETTER"] ?? "").toUpperCase() === "C:" || entry["TYPE"] === "/";

/**
 * Les volumes du poste, présentés comme les cartes réseau : une ligne
 * numérotée chacun. Le volume système en tête, puis les plus pleins d'abord ;
 * ceux sans taille à la fin. La lettre ne vient que de Windows ; elle n'est
 * montrée que si l'agent en donne une.
 */
function Volumes({ section }: { section: AssetSection }) {
  const letters = section.entries.some((entry) => entry["LETTER"]);
  const entries = [...section.entries].sort(
    (a, b) =>
      Number(isSystemDisk(b)) - Number(isSystemDisk(a)) ||
      (usage(b) ?? -1) - (usage(a) ?? -1),
  );
  // Le système de fichiers et le chiffrement à droite, à largeur fixe.
  const columns = [
    ...(letters ? [`${FIRST_WIDTH}px`] : []),
    "1fr",
    "200px",
    `${COUNT_WIDTH}px`,
  ].join(" ");
  return (
    <NumberedLines
      entries={entries}
      texts={0}
      numbers={0}
      columns={columns}
      values={(entry) => (
        <>
          {/* 1re ligne : ce qu'est le volume. */}
          {letters && <Value label="Lettre" value={entry["LETTER"]} />}
          <Value label="Type" value={entry["TYPE"]} />
          <Value
            label="Système de fichiers"
            value={fileSystem(entry["FILESYSTEM"])}
            onRight
          />
          <Value label="Chiffré" value={yesNo(entry["ENCRYPT_STATUS"])} onRight />
          {/* 2e ligne : l'espace, sur toute la largeur. */}
          <Box style={{ gridColumn: "1 / -1" }}>
            <Value label="Espace" value={<Usage entry={entry} />} />
          </Box>
        </>
      )}
    />
  );
}

// --- EPP / EDR --------------------------------------------------------------

/**
 * Oui ou non, d'après ce que l'agent écrit — « yes », « 1 », « on »… —, ou
 * rien quand il ne dit rien de lisible.
 */
const active = (value: string | undefined): boolean | null => {
  const v = (value ?? "").trim().toLowerCase();
  if (["yes", "1", "true", "on", "enabled"].includes(v)) return true;
  if (["no", "0", "false", "off", "disabled"].includes(v)) return false;
  return null;
};

/** Le tag d'un état lisible, ou rien : la valeur garde alors son tiret. */
const statusTag = (value: string | undefined) => {
  const state = active(value);
  return state === null ? value : <State active={state} />;
};

/** La largeur de la colonne d'un tag d'état, à droite. */
const STATE_WIDTH = 100;

/**
 * Les protections du poste — antivirus, EPP, EDR —, telles que Windows les
 * déclare au centre de sécurité, présentées comme les volumes. Il y en a
 * souvent deux, Defender resté en retrait à côté de celle qu'on a
 * installée : les actives d'abord.
 */
function Protections({ section }: { section: AssetSection }) {
  const entries = [...section.entries].sort(
    (a, b) => Number(active(b["ENABLED"]) ?? -1) - Number(active(a["ENABLED"]) ?? -1),
  );
  return (
    <NumberedLines
      entries={entries}
      texts={0}
      numbers={0}
      // La version et l'état à droite, à largeur fixe.
      columns={`1fr 1fr ${COUNT_WIDTH}px ${COUNT_WIDTH}px`}
      values={(entry) => (
        <>
          <Value label="Nom" value={entry["NAME"]} />
          <Value label="Éditeur" value={entry["COMPANY"]} />
          <Value label="Version" value={entry["VERSION"]} onRight />
          <Value label="Statut" value={statusTag(entry["ENABLED"])} onRight />
        </>
      )}
    />
  );
}

// --- Pare-feu ---------------------------------------------------------------

/** Les profils du pare-feu de Windows, sous leur nom français. */
const FIREWALL_PROFILES: Record<string, string> = {
  DomainProfile: "Domaine",
  StandardProfile: "Privé",
  PublicProfile: "Public",
};

/**
 * Le pare-feu du poste, présenté comme les volumes : une entrée par profil
 * sous Windows, une seule ailleurs. Les profils actifs d'abord.
 */
function Firewall({ section }: { section: AssetSection }) {
  const entries = [...section.entries].sort(
    (a, b) => Number(active(b["STATUS"]) ?? -1) - Number(active(a["STATUS"]) ?? -1),
  );
  return (
    <NumberedLines
      entries={entries}
      texts={0}
      numbers={0}
      // L'état à droite, à largeur fixe.
      columns={`1fr ${STATE_WIDTH}px`}
      values={(entry) => (
        <>
          <Value
            label="Profil"
            value={FIREWALL_PROFILES[entry["PROFILE"] ?? ""] ?? entry["PROFILE"]}
          />
          <Value label="Statut" value={statusTag(entry["STATUS"])} onRight />
        </>
      )}
    />
  );
}

// --- Processus --------------------------------------------------------------

/**
 * L'application qu'une ligne de commande lance, sans chemin ni paramètre :
 * « svchost.exe » pour « C:\Windows\System32\svchost.exe -k netsvcs ».
 *
 * Un chemin peut porter des espaces sans guillemets — « C:\Program Files\… »,
 * « /Applications/Google Chrome.app/… » —, d'où les cas qui précèdent le
 * simple « premier mot » : sous macOS on prend le nom de l'application, sous
 * Windows on coupe après « .exe ». Les fils du noyau Linux, entre crochets
 * (« [kworker/0:1] »), et les processus de Windows sans chemin ni option
 * (« System Idle Process ») restent tels quels.
 */
const application = (command: string): string => {
  const text = command.trim();
  if (!text || text.startsWith("[")) return text;

  let program: string;
  const bundle = /([^/]+)\.app\//.exec(text);
  const exe = /^.*?\.exe\b/i.exec(text);
  if (text.startsWith('"')) {
    const end = text.indexOf('"', 1);
    program = end > 0 ? text.slice(1, end) : text.slice(1);
  } else if (bundle) {
    return bundle[1]!;
  } else if (exe) {
    program = exe[0];
  } else if (!/[\\/]/.test(text) && !/\s-/.test(text)) {
    // Ni chemin ni option : un nom que Windows donne à ses processus à lui,
    // espaces compris (« System Idle Process », « Memory Compression »).
    return text;
  } else {
    program = text.split(/\s/)[0]!;
  }

  // « sshd: jquintard@pts/0 » : le nom que le processus s'est donné.
  return program.split(/[\\/]/).pop()!.replace(/:$/, "") || text;
};

/** La part de processeur, en nombre ; rien quand l'agent ne l'a pas lue. */
const cpu = (entry: AssetEntry): number | null => {
  const value = Number(entry["CPUUSAGE"]);
  return entry["CPUUSAGE"] && !Number.isNaN(value) ? value : null;
};

/**
 * Les processus du poste au moment de l'inventaire, les plus gourmands en
 * tête : c'est eux qu'on vient chercher quand un poste rame.
 */
function Processes({ section }: { section: AssetSection }) {
  const columns: Column[] = [
    {
      key: "CMD",
      label: "Commande",
      value: (entry) => application(entry["CMD"] ?? ""),
      // L'application seule, sans chemin ni options.
      render: (entry) => (
        <Text size="sm" style={{ wordBreak: "break-word" }}>
          {application(entry["CMD"] ?? "") || EMPTY}
        </Text>
      ),
    },
    field("USER", "Utilisateur"),
    {
      key: "CPUUSAGE",
      label: "CPU",
      value: cpu,
      render: (entry) => text(entry["CPUUSAGE"] ? `${entry["CPUUSAGE"]} %` : ""),
      firstDirection: "desc",
      onRight: true,
    },
  ];
  return (
    <SortableTable
      columns={columns}
      entries={section.entries}
      initialSorting={{ key: "CPUUSAGE", direction: "desc" }}
      widths={{ USER: 250, CPUUSAGE: 80 }}
      perPage={15}
    />
  );
}

// --- Logiciels --------------------------------------------------------------

/**
 * Une date d'installation, rangeable : « 15/03/2024 », comme la donne l'agent
 * sous Windows, devient « 2024-03-15 ». Les autres formats — macOS, Linux —
 * sont déjà dans l'ordre, ou restent tels quels.
 */
const sortableDate = (value: string | undefined): string => {
  const text = (value ?? "").trim();
  const frenchDate = /^(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(text);
  if (!frenchDate) return text;
  const [, day, months, an] = frenchDate;
  return `${an}-${months!.padStart(2, "0")}-${day!.padStart(2, "0")}`;
};

/**
 * Les logiciels du poste, par ordre alphabétique : il y en a des centaines,
 * dans l'ordre où l'agent les a trouvés, et une fiche par logiciel faisait
 * défiler longtemps pour trouver le bon. La date s'affiche telle que l'agent
 * la donne — son format change d'un système à l'autre — et ne se relit que
 * pour le tri, le plus récent en tête au premier clic.
 */
function Software({ section }: { section: AssetSection }) {
  const columns: Column[] = [
    field("NAME", "Nom"),
    field("VERSION", "Version"),
    field("PUBLISHER", "Éditeur"),
    {
      key: "INSTALLDATE",
      label: "Installé le",
      value: (entry) => sortableDate(entry["INSTALLDATE"]),
      render: (entry) => text(entry["INSTALLDATE"]),
      firstDirection: "desc",
    },
  ];
  return (
    <SortableTable
      columns={columns}
      entries={section.entries}
      initialSorting={{ key: "NAME", direction: "asc" }}
      widths={{ VERSION: 160, PUBLISHER: 180, INSTALLDATE: 110 }}
      perPage={15}
    />
  );
}

// --- Comptes et groupes -----------------------------------------------------

/**
 * Les groupes locaux du poste, par nom, présentés comme les processus : 15
 * lignes de haut, la suite au fil du défilement.
 */
function Groups({ section }: { section: AssetSection }) {
  return (
    <SortableTable
      columns={[field("NAME", "Nom")]}
      entries={section.entries}
      initialSorting={{ key: "NAME", direction: "asc" }}
      perPage={15}
    />
  );
}

/**
 * Les comptes locaux du poste, par nom, un tag vert après le nom des
 * administrateurs (le serveur les marque d'« ADMIN »). Le dossier personnel ne
 * vient que de Linux et de macOS : la colonne n'existe que si l'agent en
 * donne un.
 */
function Accounts({ section }: { section: AssetSection }) {
  const folders = section.entries.some((entry) => entry["HOME"]);
  const name: Column = {
    ...field("NAME", "Nom"),
    render: (entry) =>
      entry["ADMIN"] ? (
        <Group gap={8} wrap="nowrap">
          {text(entry["NAME"])}
          <Badge color="green" variant="filled" size="sm" radius="sm" style={{ flexShrink: 0 }}>
            Admin
          </Badge>
        </Group>
      ) : (
        text(entry["NAME"])
      ),
  };
  return (
    <SortableTable
      columns={[name, ...(folders ? [field("HOME", "Dossier")] : [])]}
      entries={section.entries}
      initialSorting={{ key: "NAME", direction: "asc" }}
    />
  );
}

// --- Machines virtuelles ----------------------------------------------------

/**
 * La mémoire d'une machine virtuelle, en Mo. L'agent la donne tantôt seule,
 * tantôt sous la forme « size=2048 » (Parallels) ; les conteneurs Docker n'en
 * déclarent pas.
 */
const memorySize = (entry: AssetEntry): number | null => {
  const digits = /\d+(?:[.,]\d+)?/.exec(entry["MEMORY"] ?? "");
  return digits ? Number(digits[0].replace(",", ".")) : null;
};

/**
 * L'état d'une machine virtuelle : son rang (les démarrées d'abord), son
 * libellé et la couleur de son tag. Ce que l'agent écrit d'autre reste tel
 * quel, en dernier.
 */
const vmState = (
  status: string | undefined,
): { rank: number; label: string; color?: string } => {
  const s = (status ?? "").trim().toLowerCase();
  if (["running", "started", "up"].includes(s)) {
    return { rank: 0, label: "Démarrée", color: "green" };
  }
  if (["paused", "suspended", "saved"].includes(s)) {
    return { rank: 1, label: "En pause", color: "orange" };
  }
  if (["off", "stopped", "exited", "shutdown", "poweroff", "powered off"].includes(s)) {
    return { rank: 2, label: "Éteinte", color: "red" };
  }
  return { rank: 3, label: status ?? "" };
};

/**
 * Les machines virtuelles et les conteneurs du poste, un tableau par type
 * (« Docker », « Parallels »…), les démarrées d'abord, présenté comme les
 * processus : 15 lignes de haut, la suite au fil du défilement.
 */
function VirtualMachines({ section }: { section: AssetSection }) {
  const memoryColumn: Column = {
    key: "MEMORY",
    label: "Mémoire",
    value: memorySize,
    render: (entry) => {
      const mo = memorySize(entry);
      return text(mo === null ? "" : size(mo));
    },
    firstDirection: "desc",
    onRight: true,
  };
  // La mémoire n'a sa colonne que si une machine du type en déclare une : les
  // conteneurs Docker n'en disent rien.
  const columnsOf = (entries: AssetEntry[]): Column[] => [
    field("NAME", "Nom"),
    ...(entries.some((entry) => memorySize(entry) !== null) ? [memoryColumn] : []),
    {
      key: "STATUS",
      label: "Statut",
      value: (entry) => (entry["STATUS"] ? vmState(entry["STATUS"]).rank : null),
      render: (entry) => {
        const state = vmState(entry["STATUS"]);
        return state.color ? (
          <Badge color={state.color} variant="filled" size="sm" radius="sm">
            {state.label}
          </Badge>
        ) : (
          text(state.label)
        );
      },
    },
  ];
  const byType = new Map<string, AssetEntry[]>();
  // Par nom d'abord : à état égal, le tri par statut les garde dans cet ordre.
  const byName = [...section.entries].sort((a, b) =>
    (a["NAME"] ?? "").localeCompare(b["NAME"] ?? "", "fr", { numeric: true, sensitivity: "base" }),
  );
  for (const entry of byName) {
    const type = entry["VMTYPE"]?.trim() || "Autre";
    byType.set(type, [...(byType.get(type) ?? []), entry]);
  }
  const types = [...byType.keys()].sort((a, b) =>
    a.localeCompare(b, "fr", { sensitivity: "base" }),
  );
  // Chaque type sous son titre, au style des sous-catégories des widgets, et
  // dans son propre cadre gris : la section n'en pose pas (SANS_CADRE).
  return (
    <>
      {types.map((type, rank) => (
        <Box key={type} mt={rank === 0 ? 0 : 30}>
          <Title order={2} size={16} fw={400} c="var(--mantine-color-white)" mb={15}>
            {cardType(type)}
          </Title>
          <Box p="md" style={{ backgroundColor: CARD_BACKGROUND, borderRadius: 10 }}>
            <SortableTable
              columns={columnsOf(byType.get(type)!)}
              entries={byType.get(type)!}
              initialSorting={{ key: "STATUS", direction: "asc" }}
              widths={{ MEMORY: 100, STATUS: 120 }}
              perPage={15}
            />
          </Box>
        </Box>
      ))}
    </>
  );
}

// --- Batterie ---------------------------------------------------------------

/** Un libellé discret, et la valeur en dessous. */
function Value({
  label,
  value,
  onRight,
}: {
  label: string;
  value?: ReactNode;
  /** Vrai pour un nombre, qu'on aligne à droite. */
  onRight?: boolean;
}) {
  return (
    <Stack gap={2} ta={onRight ? "right" : undefined}>
      <Text size="xs" c="dimmed">
        {label}
      </Text>
      {/* Un bloc et non un paragraphe : la valeur peut porter un badge. */}
      <Text component="div" size="sm" style={{ wordBreak: "break-word" }}>
        {value || EMPTY}
      </Text>
    </Stack>
  );
}

/**
 * Les batteries du poste, numérotées : nom et numéro de série. Le
 * reste de ce que l'agent remonte (capacité, chimie, fabricant) n'est pas
 * montré.
 */
function Battery({ section }: { section: AssetSection }) {
  return (
    <NumberedLines
      entries={section.entries}
      texts={2}
      numbers={0}
      values={(entry) => (
        <>
          <Value label="Nom" value={entry["NAME"]} />
          <Value
            label="Numéro de série"
            value={<WithCopy value={entry["SERIAL"]} />}
          />
        </>
      )}
    />
  );
}

/** L'état de charge d'une alimentation, tel que l'agent le donne, en français. */
const POWER_STATES: Record<string, string> = {
  charging: "En charge",
  charged: "Chargée",
  "fully charged": "Chargée",
  full: "Chargée",
  "not charging": "Pas en charge",
  discharging: "En décharge",
  ok: "OK",
};

/** Les états qui disent qu'une alimentation ne fait pas son travail. */
const FAULTY_STATES = new Set(["not charging", "discharging", "error", "failed"]);

/**
 * Les alimentations du poste : nom, fabricant, puissance maximale et état,
 * en tag ; puis le numéro de série et si elle est branchée.
 */
function PowerSupply({ section }: { section: AssetSection }) {
  return (
    <NumberedLines
      entries={section.entries}
      texts={0}
      numbers={0}
      // La puissance et l'état à droite, à largeur fixe.
      columns={`1fr 1fr ${COUNT_WIDTH + 20}px ${STATE_WIDTH}px`}
      values={(entry) => {
        const status = (entry["STATUS"] ?? "").trim();
        const key = status.toLowerCase();
        return (
          <>
            <Value label="Nom" value={entry["NAME"]} />
            <Value label="Fabricant" value={entry["MANUFACTURER"]} />
            <Value
              label="Puissance max"
              value={entry["POWER_MAX"] && `${entry["POWER_MAX"]} W`}
              onRight
            />
            <Value
              label="Statut"
              value={
                status && (
                  <Badge
                    color={FAULTY_STATES.has(key) ? "red" : "green"}
                    variant="filled"
                    size="sm"
                    radius="sm"
                  >
                    {POWER_STATES[key] ?? status}
                  </Badge>
                )
              }
              onRight
            />
            {/* Sur deux colonnes : le numéro et son bouton tiennent sur une ligne. */}
            <Box style={{ gridColumn: "1 / 3" }}>
              <Value
                label="Numéro de série"
                value={<WithCopy value={entry["SERIALNUMBER"]} />}
              />
            </Box>
            <Value label="Branchée" value={yesNo(entry["PLUGGED"])} onRight />
          </>
        );
      }}
    />
  );
}

// --- Processeurs, mémoire, contrôleurs -------------------------------------

/** Le fond du numéro de chaque ligne : un gris neutre, foncé. */
const NUMBER_BACKGROUND = "#4a4a4a";

/** La largeur minimale du rectangle du numéro. */
const NUMBER_WIDTH = 32;

/** La largeur des colonnes de nombres, alignés à droite. */
const COUNT_WIDTH = 80;

/** La largeur de la première colonne, un mot court : fabricant, type. */
const FIRST_WIDTH = 120;

/**
 * Les entrées d'une section, une par ligne : son numéro dans un rectangle
 * foncé — son rang, ou ce que dit `numero` —, puis ses valeurs. La première
 * colonne a sa largeur fixe, les autres colonnes de texte se partagent le
 * reste, les nombres viennent à droite, dans une colonne étroite chacun.
 * Plus de valeurs que de colonnes passent à la ligne.
 */
function NumberedLines({
  entries,
  texts,
  numbers,
  values,
  phoneNumber,
  first = FIRST_WIDTH,
  beside,
  columns: template,
  numberWidth,
}: {
  entries: AssetEntry[];
  texts: number;
  numbers: number;
  values: (entry: AssetEntry) => ReactNode;
  phoneNumber?: (entry: AssetEntry) => string | undefined;
  /** La largeur de la première colonne, en pixels. */
  first?: number;
  /** Ce qui vient à droite des valeurs, sur toute la hauteur de la ligne. */
  beside?: (entry: AssetEntry) => ReactNode;
  /** Les colonnes de la grille, quand l'ordre par défaut ne convient pas. */
  columns?: string;
  /** Une largeur fixe pour le rectangle du numéro, au lieu de celle de son contenu. */
  numberWidth?: number;
}) {
  const columns = template ?? [
    `${first}px`,
    ...Array<string>(texts - 1).fill("1fr"),
    ...Array<string>(numbers).fill(`${COUNT_WIDTH}px`),
  ].join(" ");
  return (
    // Chaque entrée sur son bloc gris, 20 px de marge intérieure, séparée de
    // la suivante par 2 px du fond de l'interface. La pile recouvre le cadre
    // gris de la section (sa marge « md » reprise en négatif) et en garde
    // l'arrondi.
    <Stack
      gap={2}
      m="calc(-1 * var(--mantine-spacing-md))"
      style={{
        backgroundColor: "var(--mantine-color-body)",
        borderRadius: 10,
        overflow: "hidden",
      }}
    >
      {entries.map((entry, rank) => (
        <Group
          key={rank}
          gap="lg"
          align="stretch"
          wrap="nowrap"
          p={20}
          style={{ backgroundColor: CARD_BACKGROUND }}
        >
          <Center
            miw={NUMBER_WIDTH}
            w={numberWidth}
            px="xs"
            style={{ backgroundColor: NUMBER_BACKGROUND, borderRadius: 6 }}
          >
            <Text size="sm" fw={600} c="white" style={{ whiteSpace: "nowrap" }}>
              {phoneNumber ? phoneNumber(entry) || EMPTY : rank + 1}
            </Text>
          </Center>
          <Box
            style={{
              flex: 1,
              display: "grid",
              gridTemplateColumns: columns,
              columnGap: "var(--mantine-spacing-lg)",
              rowGap: 4,
              // Plus haut que le texte, ce qui est à côté n'étire pas ses lignes.
              alignContent: "start",
            }}
          >
            {values(entry)}
          </Box>
          {beside?.(entry)}
        </Group>
      ))}
    </Stack>
  );
}

/** Les processeurs du poste : fabricant, modèle, cœurs et threads. */
function Processors({ section }: { section: AssetSection }) {
  return (
    <NumberedLines
      entries={section.entries}
      texts={2}
      numbers={2}
      values={(entry) => (
        <>
          <Value label="Fabricant" value={entry["MANUFACTURER"]} />
          <Value label="Modèle" value={entry["NAME"]?.trim()} />
          <Value label="Cœurs" value={entry["CORE"]} onRight />
          <Value label="Threads" value={entry["THREAD"]} onRight />
        </>
      )}
    />
  );
}

/** Le rang d'une carte selon son type : le Wi-Fi d'abord, puis l'Ethernet. */
const typeRank = (type: string | undefined): number => {
  const t = (type ?? "").toLowerCase();
  return t === "wifi" ? 0 : t === "ethernet" ? 1 : 2;
};

/** Un type de carte, une majuscule en tête : « wifi » devient « Wifi ». */
const cardType = (type: string | undefined): string =>
  type ? type.charAt(0).toUpperCase() + type.slice(1) : "";

/** Un débit en Mb/s, comme l'agent le donne, dit en Gb/s dès le gigabit. */
const throughput = (value: string | undefined): string => {
  const mb = Number(value);
  if (!value || Number.isNaN(mb) || mb <= 0) return value ?? "";
  return mb >= 1000
    ? `${(mb / 1000).toLocaleString("fr-FR", { maximumFractionDigits: 1 })} Gb/s`
    : `${mb.toLocaleString("fr-FR")} Mb/s`;
};

/** Un état en tag : vert « Activé », rouge « Désactivé ». */
function State({ active }: { active: boolean }) {
  return (
    <Badge color={active ? "green" : "red"} variant="filled" size="sm" radius="sm">
      {active ? "Activé" : "Désactivé"}
    </Badge>
  );
}

/**
 * Les cartes réseau du poste, les connectées en tête ; parmi elles comme
 * parmi les autres, le Wi-Fi d'abord, puis l'Ethernet, puis le reste. VIRTUALDEV n'est pas montré.
 */
function Networks({ section }: { section: AssetSection }) {
  // Les cartes connectées d'abord ; dans chaque groupe, le type départage.
  const disconnected = (entry: AssetEntry) =>
    (entry["STATUS"] ?? "").toLowerCase() === "up" ? 0 : 1;
  const entries = [...section.entries].sort(
    (a, b) => disconnected(a) - disconnected(b) || typeRank(a["TYPE"]) - typeRank(b["TYPE"]),
  );
  return (
    <NumberedLines
      entries={entries}
      texts={4}
      numbers={0}
      values={(entry) => (
        <>
          {/* 1re ligne : ce qu'est la carte et son état. */}
          <Value label="Type" value={cardType(entry["TYPE"])} />
          <Value label="Nom" value={entry["DESCRIPTION"]} />
          <Value label="MAC" value={entry["MACADDR"]} />
          <Value
            label="Statut"
            value={
              entry["STATUS"] && <State active={entry["STATUS"].toLowerCase() === "up"} />
            }
          />
          {/* 2e ligne : l'adressage IPv4, la quatrième colonne laissée vide.
              Sans adresse IPv4, la ligne n'est pas montrée. */}
          {entry["IPADDRESS"] && (
            <>
              <Value label="IPv4" value={entry["IPADDRESS"]} />
              <Value label="Masque" value={entry["IPMASK"]} />
              <Value label="Passerelle" value={entry["IPGATEWAY"]} />
              <Box />
            </>
          )}
          {/* 3e ligne : l'IPv6, souvent longue, sur toute la largeur ; cachée
              sans adresse IPv6. */}
          {entry["IPADDRESS6"] && (
            <Box style={{ gridColumn: "1 / -1" }}>
              <Value label="IPv6" value={entry["IPADDRESS6"]} />
            </Box>
          )}
          {/* 4e ligne : le VLAN du Paramétrage qui porte la carte, son nom
              puis son numéro en tag vert, comme au Résumé ; cachée sans VLAN.
              VLAN et VLAN_NAME viennent du serveur, pas de l'agent. */}
          {entry["VLAN"] && (
            <Box style={{ gridColumn: "1 / -1" }}>
              <Value
                label="VLAN"
                value={
                  <Group gap={6} wrap="nowrap">
                    {entry["VLAN_NAME"] && <span>{entry["VLAN_NAME"]}</span>}
                    <Badge color="green" variant="filled" size="sm" radius="sm">
                      VLAN {entry["VLAN"]}
                    </Badge>
                  </Group>
                }
              />
            </Box>
          )}
          {/* 5e ligne : MTU et vitesse. */}
          <Value label="MTU" value={entry["MTU"]} />
          <Value label="Vitesse" value={throughput(entry["SPEED"])} />
        </>
      )}
    />
  );
}

/** Une capacité en Mo, comme l'agent la donne, dite en Go. */
const toGb = (value: string | undefined): string => {
  const mo = Number(value);
  return value && !Number.isNaN(mo)
    ? `${(mo / 1024).toLocaleString("fr-FR", { maximumFractionDigits: 1 })} Go`
    : "";
};

/**
 * Les barrettes du poste : capacité, type et description. Le numéro de slot
 * de l'agent n'est pas montré : celui de la ligne en tient lieu.
 */
function Memory({ section }: { section: AssetSection }) {
  return (
    <NumberedLines
      entries={section.entries}
      texts={2}
      numbers={1}
      // La capacité d'abord, puis le type et la description.
      columns={`${FIRST_WIDTH}px ${FIRST_WIDTH}px 1fr`}
      values={(entry) => (
        <>
          <Value label="Capacité" value={toGb(entry["CAPACITY"])} />
          <Value label="Type" value={entry["TYPE"]} />
          <Value label="Description" value={entry["DESCRIPTION"]} />
        </>
      )}
    />
  );
}

/**
 * Le rectangle des contrôleurs porte leur emplacement PCI (« 00:1f.3 ») : il
 * a sa largeur à lui, fixe, pour que tous s'alignent.
 */
const SLOT_WIDTH = 80;

/**
 * La largeur des libellés des contrôleurs : ce qu'il faut pour que leurs
 * valeurs commencent là où commence la seconde colonne des autres lignes
 * numérotées — le numéro de série d'une batterie —, le rectangle étant plus
 * large.
 */
const LABEL_WIDTH = NUMBER_WIDTH + FIRST_WIDTH - SLOT_WIDTH;

/** Les champs qu'on copie d'un clic : les numéros de série. */
const COPYABLE_FIELDS = new Set(["SERIAL", "SERIALNUMBER", "ALTSERIAL", "SSN"]);

/**
 * Une valeur suivie d'un bouton qui la copie : un numéro de série se recopie
 * dans un ticket, chez le fabricant, rarement à la main sans erreur. Sans
 * valeur, rien à copier : ni bouton ni contenu, la ligne affiche son tiret.
 */
function WithCopy({ value, children }: { value?: string; children?: ReactNode }) {
  if (!value) return children ?? EMPTY;
  return (
    <Group gap={4} wrap="nowrap">
      {children ?? <span>{value}</span>}
      <CopyButton value={value}>
        {({ copied, copy }) => (
          <Button
            variant="subtle"
            color="gray"
            size="compact-xs"
            onClick={copy}
            aria-label="Copier le numéro de série"
            style={{ "--button-hover": NEUTRAL_HOVER, flexShrink: 0 } as CSSProperties}
          >
            {copied ? <IconCheck size={14} /> : <IconCopy size={14} />}
          </Button>
        )}
      </CopyButton>
    </Group>
  );
}

/**
 * Le gabarit des étiquettes d'identifiants — VENDORID, PRODUCTID : quatre
 * chiffres hexadécimaux le plus souvent, davantage parfois. « D » est le plus
 * large d'entre eux une fois en capitales : un gabarit qui n'en a que, aussi
 * long que le plus long identifiant, donne la même largeur à toutes les
 * étiquettes, quels que soient leurs chiffres.
 */
const idTemplate = (identifiers: (string | undefined)[]): string =>
  "D".repeat(Math.max(4, ...identifiers.map((id) => id?.length ?? 0)));

/** Un libellé discret à gauche, la valeur à droite, sur une même ligne. */
function Row({ label, value }: { label: string; value?: ReactNode }) {
  return (
    <>
      <Text size="sm" c="dimmed">
        {label}
      </Text>
      <Text component="div" size="sm" style={{ wordBreak: "break-word" }}>
        {value || EMPTY}
      </Text>
    </>
  );
}

/**
 * Les contrôleurs du poste, repérés par leur emplacement PCI : nom, fabricant
 * — avec l'identifiant du fabricant au bord droit, dans l'étiquette verte
 * des références — et type, l'un sous l'autre.
 */
function Controllers({ section }: { section: AssetSection }) {
  const template = idTemplate(section.entries.map((entry) => entry["VENDORID"]));
  return (
    <NumberedLines
      entries={section.entries}
      texts={2}
      numbers={0}
      first={LABEL_WIDTH}
      numberWidth={SLOT_WIDTH}
      phoneNumber={(entry) => entry["PCISLOT"]}
      values={(entry) => (
        <>
          <Row label="Nom" value={entry["NAME"]} />
          <Row
            label="Fabricant"
            value={
              (entry["VENDORID"] || entry["MANUFACTURER"]) && (
                // L'étiquette au bord droit de la ligne : d'un contrôleur à
                // l'autre, elles s'alignent en colonne.
                <Group gap={8} wrap="nowrap" justify="space-between">
                  <span>{entry["MANUFACTURER"] || EMPTY}</span>
                  {entry["VENDORID"] && (
                    <ReferenceTag reference={entry["VENDORID"]} template={template} copyable />
                  )}
                </Group>
              )
            }
          />
          <Row label="Type" value={entry["TYPE"]} />
        </>
      )}
    />
  );
}

/** La couleur de l'écran dessiné : le gris foncé des numéros. */
const SCREEN_EDGE = NUMBER_BACKGROUND;

/** « 1920x1080 », comme l'agent la donne, se lit « 1920 x 1080 ». */
const spaceResolution = (resolution: string): string =>
  resolution.replace(/\s*[x×]\s*/i, " x ");

/**
 * Un écran dessiné, la résolution au milieu de sa dalle. Pied compris, il
 * tient dans la hauteur des trois lignes de texte d'une carte vidéo (moins de
 * 72 px) : plus haut, il étirait la ligne et écartait le texte.
 */
function Screen({ resolution }: { resolution?: string }) {
  return (
    <Stack gap={0} align="center" style={{ flexShrink: 0 }}>
      <Center w={104} h={58} style={{ border: `3px solid ${SCREEN_EDGE}`, borderRadius: 5 }}>
        <Text size="xs" fw={600} style={{ whiteSpace: "nowrap" }}>
          {resolution ? spaceResolution(resolution) : EMPTY}
        </Text>
      </Center>
      {/* Le pied : une tige, puis la base. */}
      <Box w={8} h={6} style={{ backgroundColor: SCREEN_EDGE }} />
      <Box w={36} h={3} style={{ backgroundColor: SCREEN_EDGE, borderRadius: 2 }} />
    </Stack>
  );
}

/**
 * Les cartes vidéo du poste : puce, nom et emplacement PCI l'un sous l'autre,
 * et à côté un écran qui porte la résolution.
 */
function Video({ section }: { section: AssetSection }) {
  return (
    <NumberedLines
      entries={section.entries}
      texts={2}
      numbers={0}
      values={(entry) => (
        <>
          <Row label="Puce" value={entry["CHIPSET"]} />
          <Row label="Nom" value={entry["NAME"]} />
          <Row label="Slot PCI" value={entry["PCISLOT"]} />
        </>
      )}
      beside={(entry) => <Screen resolution={entry["RESOLUTION"]} />}
    />
  );
}

/**
 * Les périphériques audio du poste : nom, fabricant et description l'un sous
 * l'autre. La légende de l'agent (CAPTION) n'est pas montrée : elle répète
 * le nom.
 */
function Audio({ section }: { section: AssetSection }) {
  return (
    <NumberedLines
      entries={section.entries}
      texts={2}
      numbers={0}
      values={(entry) => (
        <>
          <Row label="Nom" value={entry["NAME"]} />
          <Row label="Fabricant" value={entry["MANUFACTURER"]} />
          <Row label="Description" value={entry["DESCRIPTION"]} />
        </>
      )}
    />
  );
}

/** Les champs d'une section, dans l'ordre où ils s'affichent, sous leur nom français. */
type Fields = [string, string][];

/**
 * Les lignes d'une entrée : ses champs connus en français, puis ceux qu'on ne
 * sait pas nommer, sous le nom de l'agent — sauf les écartés. Une valeur déjà
 * dite plus haut ne se répète pas : l'agent donne souvent le même texte comme
 * nom, légende et description, ou le numéro de série deux fois. Les nombres
 * et les « Oui » / « Non » se répètent, eux : deux champs à 0 ou à « Oui » ne
 * disent pas la même chose.
 */
const rowsOf = (
  entry: AssetEntry,
  fields: Fields,
  { excluded = [], formats = {}, labels = {} }: {
    excluded?: string[];
    formats?: Record<string, (raw: string) => string>;
    labels?: Record<string, string>;
  } = {},
): [string, string, string][] => {
  const known = new Set([
    ...fields.map(([field]) => field),
    ...excluded,
    ...Object.values(labels),
  ]);
  const displayed: Fields = [
    // Un champ qui porte une étiquette a sa ligne dès que l'étiquette a une
    // valeur, même s'il n'en a pas lui-même.
    ...fields.filter(([field]) => field in entry || (labels[field] && entry[labels[field]])),
    ...Object.keys(entry)
      .filter((field) => !known.has(field))
      .map((field): [string, string] => [field, field]),
  ];
  const said = new Set<string>();
  return displayed.flatMap(([field, label]): [string, string, string][] => {
    const raw = entry[field] ?? "";
    const value = formats[field]?.(raw) ?? raw;
    const key = value.trim().toLowerCase();
    const text = /\p{L}/u.test(key) && key !== "oui" && key !== "non";
    if (text && said.has(key)) return [];
    if (text) said.add(key);
    return [[field, label, value]];
  });
};

/**
 * Une section en lignes numérotées : pour chaque entrée, ce que l'agent en
 * dit, l'un sous l'autre, en français. `etiquettes` associe à un champ un
 * autre champ — un identifiant —, montré dans l'étiquette verte des
 * références au bord droit de la ligne plutôt que sur une ligne à lui.
 */
function NumberedRecords({
  section,
  fields,
  excluded,
  formats,
  labels = {},
  beside,
}: {
  section: AssetSection;
  fields: Fields;
  excluded?: string[];
  formats?: Record<string, (raw: string) => string>;
  labels?: Record<string, string>;
  beside?: (entry: AssetEntry) => ReactNode;
}) {
  // Une seule largeur pour toutes les étiquettes de la section.
  const template = idTemplate(
    section.entries.flatMap((entry) => Object.values(labels).map((e) => entry[e])),
  );
  return (
    <NumberedLines
      entries={section.entries}
      texts={2}
      numbers={0}
      values={(entry) =>
        rowsOf(entry, fields, { excluded, formats, labels }).map(
          ([field, label, value]) => {
            const labelField = labels[field];
            const id = labelField ? entry[labelField] : undefined;
            const content = id ? (
              // L'étiquette au bord droit de la ligne : d'une entrée à
              // l'autre, elles s'alignent en colonne.
              <Group gap={8} wrap="nowrap" justify="space-between">
                <span>{value || EMPTY}</span>
                <ReferenceTag reference={id} template={template} copyable />
              </Group>
            ) : (
              value
            );
            return (
              <Row
                key={field}
                label={label}
                value={
                  COPYABLE_FIELDS.has(field) ? <WithCopy value={value} /> : content
                }
              />
            );
          },
        )
      }
      beside={beside}
    />
  );
}

const STORAGE_FIELDS: Fields = [
  ["NAME", "Nom"],
  ["TYPE", "Type"],
  ["MANUFACTURER", "Fabricant"],
  ["MODEL", "Modèle"],
  ["DESCRIPTION", "Description"],
  ["INTERFACE", "Interface"],
  ["SERIAL", "Numéro de série"],
  ["SERIALNUMBER", "Numéro de série"],
  ["FIRMWARE", "Micrologiciel"],
  ["SCSI_COID", "Contrôleur SCSI"],
  ["SCSI_CHID", "Canal SCSI"],
  ["SCSI_UNID", "Unité SCSI"],
  ["SCSI_LUN", "LUN SCSI"],
];

/** La part libre de l'anneau : un gris neutre et clair, pas celui de Mantine qui tire sur le bleu. */
const RING_BACKGROUND = "light-dark(#e0e0e0, var(--mantine-color-dark-4))";

/**
 * La capacité d'un disque dans un anneau : sa part de la capacité totale du
 * poste, sa taille au milieu. Un disque dont l'agent ne donne pas la taille
 * garde un anneau vide et le tiret.
 */
function DiskShare({ capacity, total }: { capacity: number; total: number }) {
  const known = capacity > 0;
  return (
    <RingProgress
      size={88}
      thickness={9}
      rootColor={RING_BACKGROUND}
      roundCaps
      style={{ flexShrink: 0, alignSelf: "flex-start" }}
      sections={known && total > 0 ? [{ value: (capacity / total) * 100, color: "blue" }] : []}
      label={
        <Text size="xs" fw={700} ta="center" style={{ whiteSpace: "nowrap" }}>
          {known ? size(capacity) : EMPTY}
        </Text>
      }
    />
  );
}

/**
 * Les supports de stockage du poste. La capacité ne s'écrit pas en ligne :
 * l'anneau à droite la porte, avec la part qu'elle fait du total du poste.
 */
function Storage({ section }: { section: AssetSection }) {
  const capacity = (entry: AssetEntry) => Number(entry["DISKSIZE"]) || 0;
  const total = section.entries.reduce((sum, entry) => sum + capacity(entry), 0);
  return (
    <NumberedRecords
      section={section}
      fields={STORAGE_FIELDS}
      excluded={["DISKSIZE"]}
      beside={(entry) => <DiskShare capacity={capacity(entry)} total={total} />}
    />
  );
}

const INPUT_FIELDS: Fields = [
  ["NAME", "Nom"],
  ["CAPTION", "Légende"],
  ["TYPE", "Type"],
  ["MANUFACTURER", "Fabricant"],
  ["DESCRIPTION", "Description"],
  ["INTERFACE", "Interface"],
  ["POINTINGTYPE", "Pointage"],
  ["LAYOUT", "Disposition"],
];

/** Les claviers, souris et autres périphériques d'entrée du poste. */
function Inputs({ section }: { section: AssetSection }) {
  return <NumberedRecords section={section} fields={INPUT_FIELDS} />;
}

const MONITOR_FIELDS: Fields = [
  ["NAME", "Nom"],
  ["CAPTION", "Légende"],
  ["MANUFACTURER", "Fabricant"],
  ["DESCRIPTION", "Description"],
  ["TYPE", "Type"],
  ["PORT", "Port"],
  ["SERIAL", "Numéro de série"],
  ["ALTSERIAL", "Autre numéro de série"],
];

/**
 * Les moniteurs du poste. BASE64 et UUENCODE portent l'EDID brut de l'écran :
 * illisible, on ne le montre pas.
 */
function Monitors({ section }: { section: AssetSection }) {
  return (
    <NumberedRecords section={section} fields={MONITOR_FIELDS} excluded={["BASE64", "UUENCODE"]} />
  );
}

const PRINTER_FIELDS: Fields = [
  ["NAME", "Nom"],
  ["DRIVER", "Pilote"],
  ["PORT", "Port"],
  ["DESCRIPTION", "Description"],
  ["COMMENT", "Commentaire"],
  ["NETWORK", "Réseau"],
  ["LOCAL", "Locale"],
  ["SHARED", "Partagée"],
  ["SHARENAME", "Nom de partage"],
  ["SERVERNAME", "Serveur"],
  ["SERIAL", "Numéro de série"],
];

/**
 * Les imprimantes installées sur le poste. Le processeur d'impression, le
 * statut et la résolution ne sont pas montrés.
 */
function Printers({ section }: { section: AssetSection }) {
  return (
    <NumberedRecords
      section={section}
      fields={PRINTER_FIELDS}
      excluded={["PRINTPROCESSOR", "STATUS", "RESOLUTION"]}
      formats={{ NETWORK: yesNo, LOCAL: yesNo, SHARED: yesNo }}
    />
  );
}

const USB_FIELDS: Fields = [
  ["NAME", "Nom"],
  ["CAPTION", "Légende"],
  ["MANUFACTURER", "Fabricant"],
  ["SERIAL", "Numéro de série"],
  ["CLASS", "Classe"],
  ["SUBCLASS", "Sous-classe"],
];

/**
 * Les périphériques USB branchés au poste. L'identifiant du fabricant suit
 * son nom, celui du produit le nom du périphérique, chacun en étiquette au
 * bord droit.
 */
function Usb({ section }: { section: AssetSection }) {
  return (
    <NumberedRecords
      section={section}
      fields={USB_FIELDS}
      labels={{ NAME: "PRODUCTID", MANUFACTURER: "VENDORID" }}
    />
  );
}

/** Les champs du BIOS qu'on sait nommer ; les autres gardent le nom de l'agent. */
const BIOS_LABELS: Record<string, string> = {
  SMANUFACTURER: "Fabricant",
  SMODEL: "Modèle",
  SSN: "Numéro de série",
};

/**
 * Le BIOS du poste, un champ par ligne. Il n'a pas de numéro, mais ses valeurs
 * commencent là où commencent celles des lignes numérotées après la première
 * colonne — le modèle d'un processeur, par exemple : le libellé occupe le
 * rectangle, la première colonne et les deux écarts.
 */
function Bios({ section }: { section: AssetSection }) {
  return (
    <Stack gap={20}>
      {section.entries.map((entry, rank) => (
        <Box
          key={rank}
          style={{
            display: "grid",
            gridTemplateColumns:
              `calc(${NUMBER_WIDTH + FIRST_WIDTH}px + 2 * var(--mantine-spacing-lg)) 1fr`,
            rowGap: 4,
          }}
        >
          {Object.keys(entry).map((field) => (
            <Row
              key={field}
              label={BIOS_LABELS[field] ?? field}
              value={
                COPYABLE_FIELDS.has(field) ? <WithCopy value={entry[field]} /> : entry[field]
              }
            />
          ))}
        </Box>
      ))}
    </Stack>
  );
}

/**
 * Les sections qui posent elles-mêmes leurs cadres gris, au lieu d'être
 * rangées dans celui de la section : leurs titres viennent hors des cadres.
 */
export const WITHOUT_FRAME = new Set(["OPERATINGSYSTEM", "VIRTUALMACHINES"]);

/** Les sections qui ont leur tableau ; les autres restent en fiches. */
export const TABLEAUX: Record<string, ComponentType<{ section: AssetSection }>> = {
  ANTIVIRUS: Protections,
  BATTERIES: Battery,
  BIOS: Bios,
  CONTROLLERS: Controllers,
  CPUS: Processors,
  DRIVES: Volumes,
  FIREWALL: Firewall,
  INPUTS: Inputs,
  LOCAL_GROUPS: Groups,
  LOCAL_USERS: Accounts,
  MEMORIES: Memory,
  MONITORS: Monitors,
  NETWORKS: Networks,
  POWERSUPPLIES: PowerSupply,
  PRINTERS: Printers,
  PROCESSES: Processes,
  SOFTWARES: Software,
  SOUNDS: Audio,
  STORAGES: Storage,
  USBDEVICES: Usb,
  VIDEOS: Video,
  VIRTUALMACHINES: VirtualMachines,
};
