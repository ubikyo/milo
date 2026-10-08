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
import GridScroll from "../ui/GridScroll";
import { ReferenceTag } from "../ui/ReferenceTag";
import { CARD_BACKGROUND } from "./backgrounds";
import { useResizableColumns } from "../ui/useResizableColumns";
import type { ComponentType, CSSProperties, ReactNode } from "react";
import type { AssetEntry, AssetSection } from "@milo/shared";

// The inventory sections that a workstation's record shows as a table,
// rather than as records one after another: those with enough rows that one
// wants to compare them, sort them, search them for the right one.

/** A missing value reads the same everywhere: a discreet dash. */
export const EMPTY = "—";

// --- The sortable table -----------------------------------------------------

type Direction = "asc" | "desc";

interface Column {
  key: string;
  label: string;
  /**
   * What the column sorts on. Nothing — or an empty string — when the
   * row says nothing about it: it then goes to the bottom, in either
   * direction.
   */
  value: (entry: AssetEntry) => string | number | null;
  render: (entry: AssetEntry) => ReactNode;
  /** The direction of the first click: descending for what one wants at the top. */
  firstDirection?: Direction;
  onRight?: boolean;
  width?: CSSProperties["width"];
}

interface Sorting {
  key: string;
  direction: Direction;
}

/** A column header: a click sorts, a second reverses. */
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
    <Table.Th style={{ width: column.width }}>
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
   * The starting widths, in pixels, of the columns that have one; the
   * others share the rest. Without them, the natural layout.
   */
  widths?: Record<string, number>;
  /**
   * The grid height, in rows: beyond it, it scrolls in its own
   * area, the header staying at the top. It is also the number of rows shown
   * first, and added each time the bottom of the area is reached. Without
   * it, all at once, over their full height.
   */
  perPage?: number;
}) {
  const [sorting, setSort] = useState<Sorting>(initialSorting);
  // A slice ahead of the area's height: without it, the area would
  // only contain what it shows, would have nothing to scroll, and the
  // rest would never come.
  const firstItems = perPage ? 2 * perPage : Infinity;
  const [shown, setShown] = useState(firstItems);
  // The marker under the last row: when it appears, the rest comes.
  const marker = useRef<HTMLDivElement>(null);
  // The grid, to measure the height of its first "perPage" rows.
  const frame = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState<number | undefined>(undefined);
  // Each inventory table is recognized by its columns.
  const keys = columns.map((c) => c.key);
  const resize = useResizableColumns(`inventory.${keys.join("-")}`, keys, widths);

  const sortBy = (column: Column) => {
    // Another order starts again from the top of the grid.
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
      // "numeric" sorts "10.2" after "9.1", and "sensitivity" puts
      // "adobe" and "Adobe" together.
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
    // A genuinely visible part of the marker, not "isIntersecting": in
    // a collapsed section, of zero height, the browser reports it visible through
    // a zero-area intersection, and everything would load at once.
    const observer = new IntersectionObserver((seen) => {
      if (seen.some((v) => v.intersectionRatio > 0)) setShown((n) => n + perPage);
    });
    observer.observe(target);
    return () => observer.disconnect();
  }, [rest, perPage, shown]);

  // The area's height: the header and the first "perPage" rows. It
  // is measured again when the grid changes size — a collapsed
  // section has none, and expands later.
  useLayoutEffect(() => {
    const grid = frame.current;
    if (!grid || !perPage) return;
    const measure = () => {
      const rows = grid.querySelectorAll("tbody tr");
      const last = rows[perPage - 1];
      if (rows.length <= perPage || !last) return setHeight(undefined);
      // From the top of the frame to the bottom of the last row, plus the bottom margin.
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

  // Limited in height, the grid scrolls both ways in a single
  // area, where its header stays stuck at the top. The area covers the whole gray
  // frame of the section (its "md" margin taken back as negative, then given back
  // inside): the bar thus runs along the section over its full height,
  // like the drawer's runs along the window. Otherwise, widened by hand
  // beyond the section, it only scrolls sideways there.
  if (perPage) {
    return (
      // The record drawer's thin bar: 2 px, always visible.
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
 * The header of a height-limited grid: it stays at the top when it
 * scrolls, at the frame's margin, and the solid shadow above it hides the
 * rows passing through that margin.
 */
const STICKY_HEADER: CSSProperties = {
  position: "sticky",
  top: "var(--mantine-spacing-md)",
  zIndex: 2,
  backgroundColor: CARD_BACKGROUND,
  boxShadow: `0 calc(-1 * var(--mantine-spacing-md)) 0 ${CARD_BACKGROUND}`,
};

/** An ordinary text cell, or the dash when it is empty. */
const text = (value: string | undefined) => (
  <Text size="sm" style={{ wordBreak: "break-word" }}>
    {value || EMPTY}
  </Text>
);

/** A field as is: the simplest column, sorted on its value. */
const field = (key: string, label: string): Column => ({
  key,
  label,
  value: (entry) => entry[key] ?? null,
  render: (entry) => text(entry[key]),
});

// --- Volumes ----------------------------------------------------------------

/**
 * A size given in MB by the agent, made readable: "3,63 To", "476 Go",
 * "512 Mo". Beyond 1,000 GB, it switches to TB.
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

/** The agent's "Yes" and "No", in French; anything else as is. */
const yesNo = (value: string | undefined): string => {
  const v = (value ?? "").toLowerCase();
  if (v === "yes" || v === "1" || v === "true") return "Oui";
  if (v === "no" || v === "0" || v === "false") return "Non";
  return value ?? "";
};

/**
 * A GPT partition type GUID, which the agent sometimes gives in place of the
 * file system — mostly on macOS, where APFS volumes come out as
 * "41504653-0000-11AA-AA11-00306543ECAC" (41504653 is "APFS" in
 * ASCII).
 */
const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The file system, or nothing when the agent only gave a GUID. */
const fileSystem = (value: string | undefined): string =>
  value && !GUID.test(value.trim()) ? value : "";

/**
 * A volume's used share, from 0 to 100, or nothing: an empty optical drive
 * or an unreachable share gives no size.
 */
const usage = (entry: AssetEntry): number | null => {
  const total = Number(entry["TOTAL"]);
  const free = Number(entry["FREE"]);
  if (!(total > 0) || Number.isNaN(free)) return null;
  return Math.min(100, Math.max(0, ((total - free) / total) * 100));
};

/** A volume's gauge: the used part as a bar, the free and the total in plain text. */
function Usage({ entry }: { entry: AssetEntry }) {
  const used = usage(entry);
  if (used === null) {
    return (
      <Text size="sm" c="dimmed">
        {EMPTY}
      </Text>
    );
  }
  // The color says nothing while there is room left, and alerts when
  // there is none left.
  const color = used >= 90 ? "red" : used >= 75 ? "orange" : "blue";
  return (
    <Stack gap={2}>
      <Progress value={used} color={color} size="sm" />
      <Text size="xs" c="dimmed">
        {size(Number(entry["FREE"]))} / {size(Number(entry["TOTAL"]))}
      </Text>
    </Stack>
  );
}

/** The system volume: "C:" on Windows, "/" elsewhere. */
const isSystemDisk = (entry: AssetEntry): boolean =>
  (entry["LETTER"] ?? "").toUpperCase() === "C:" || entry["TYPE"] === "/";

/**
 * The workstation's volumes, presented like the network cards: one numbered
 * row each. The system volume first, then the fullest first;
 * those without a size at the end. The letter only comes from Windows; it is
 * only shown if the agent gives one.
 */
function Volumes({ section }: { section: AssetSection }) {
  const letters = section.entries.some((entry) => entry["LETTER"]);
  const entries = [...section.entries].sort(
    (a, b) =>
      Number(isSystemDisk(b)) - Number(isSystemDisk(a)) ||
      (usage(b) ?? -1) - (usage(a) ?? -1),
  );
  // The file system and encryption on the right, at fixed width.
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
          {/* 1st row: what the volume is. */}
          {letters && <Value label="Lettre" value={entry["LETTER"]} />}
          <Value label="Type" value={entry["TYPE"]} />
          <Value
            label="Système de fichiers"
            value={fileSystem(entry["FILESYSTEM"])}
            onRight
          />
          <Value label="Chiffré" value={yesNo(entry["ENCRYPT_STATUS"])} onRight />
          {/* 2nd row: the space, over the full width. */}
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
 * Yes or no, from what the agent writes — "yes", "1", "on"… —, or
 * nothing when it says nothing readable.
 */
const active = (value: string | undefined): boolean | null => {
  const v = (value ?? "").trim().toLowerCase();
  if (["yes", "1", "true", "on", "enabled"].includes(v)) return true;
  if (["no", "0", "false", "off", "disabled"].includes(v)) return false;
  return null;
};

/** The tag of a readable state, or nothing: the value then keeps its dash. */
const statusTag = (value: string | undefined) => {
  const state = active(value);
  return state === null ? value : <State active={state} />;
};

/** The width of a state tag's column, on the right. */
const STATE_WIDTH = 100;

/**
 * The workstation's protections — antivirus, EPP, EDR —, as Windows
 * declares them in the security center, presented like the volumes. There are
 * often two, Defender left in the background next to the one that was
 * installed: the active ones first.
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
      // The version and state on the right, at fixed width.
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

// --- Firewall ---------------------------------------------------------------

/** The Windows firewall profiles, under their French name. */
const FIREWALL_PROFILES: Record<string, string> = {
  DomainProfile: "Domaine",
  StandardProfile: "Privé",
  PublicProfile: "Public",
};

/**
 * The workstation's firewall, presented like the volumes: one entry per profile
 * on Windows, a single one elsewhere. The active profiles first.
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
      // The state on the right, at fixed width.
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

// --- Processes --------------------------------------------------------------

/**
 * The application a command line launches, without path or parameter:
 * "svchost.exe" for "C:\Windows\System32\svchost.exe -k netsvcs".
 *
 * A path may contain spaces without quotes — "C:\Program Files\…",
 * "/Applications/Google Chrome.app/…" —, hence the cases preceding the
 * simple "first word": on macOS we take the application name, on
 * Windows we cut after ".exe". Linux kernel threads, in brackets
 * ("[kworker/0:1]"), and Windows processes with no path or option
 * ("System Idle Process") stay as is.
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
    // No path or option: a name Windows gives to its own processes,
    // spaces included ("System Idle Process", "Memory Compression").
    return text;
  } else {
    program = text.split(/\s/)[0]!;
  }

  // "sshd: jquintard@pts/0": the name the process gave itself.
  return program.split(/[\\/]/).pop()!.replace(/:$/, "") || text;
};

/** The CPU share, as a number; nothing when the agent didn't read it. */
const cpu = (entry: AssetEntry): number | null => {
  const value = Number(entry["CPUUSAGE"]);
  return entry["CPUUSAGE"] && !Number.isNaN(value) ? value : null;
};

/**
 * The workstation's processes at the time of the inventory, the hungriest
 * first: they are what one comes looking for when a workstation lags.
 */
function Processes({ section }: { section: AssetSection }) {
  const columns: Column[] = [
    {
      key: "CMD",
      label: "Commande",
      value: (entry) => application(entry["CMD"] ?? ""),
      // The application alone, without path or options.
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

// --- Software ---------------------------------------------------------------

/**
 * An installation date, sortable: "15/03/2024", as the agent gives it
 * on Windows, becomes "2024-03-15". Other formats — macOS, Linux —
 * are already in order, or stay as is.
 */
const sortableDate = (value: string | undefined): string => {
  const text = (value ?? "").trim();
  const frenchDate = /^(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(text);
  if (!frenchDate) return text;
  const [, day, months, year] = frenchDate;
  return `${year}-${months!.padStart(2, "0")}-${day!.padStart(2, "0")}`;
};

/**
 * The workstation's software, in alphabetical order: there are hundreds,
 * in the order the agent found them, and one record per piece of software made
 * one scroll for a long time to find the right one. The date is displayed as the agent
 * gives it — its format changes from one system to another — and is only re-read
 * for sorting, the most recent first on the first click.
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

// --- Accounts and groups ----------------------------------------------------

/**
 * The workstation's local groups, by name, presented like the processes: 15
 * rows high, the rest as one scrolls.
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
 * The workstation's local accounts, by name, a green tag after the name of
 * administrators (the server marks them "ADMIN"). The home folder only
 * comes from Linux and macOS: the column only exists if the agent gives
 * one.
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

// --- Virtual machines -------------------------------------------------------

/**
 * A virtual machine's memory, in MB. The agent gives it sometimes alone,
 * sometimes as "size=2048" (Parallels); Docker containers declare
 * none.
 */
const memorySize = (entry: AssetEntry): number | null => {
  const digits = /\d+(?:[.,]\d+)?/.exec(entry["MEMORY"] ?? "");
  return digits ? Number(digits[0].replace(",", ".")) : null;
};

/**
 * A virtual machine's state: its rank (the started ones first), its
 * label and its tag color. What else the agent writes stays as is,
 * last.
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
 * The workstation's virtual machines and containers, one table per type
 * ("Docker", "Parallels"…), the started ones first, presented like the
 * processes: 15 rows high, the rest as one scrolls.
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
  // Memory only has its column if a machine of the type declares one:
  // Docker containers say nothing about it.
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
  // By name first: at equal state, sorting by status keeps them in that order.
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
  // Each type under its title, in the style of the widgets' sub-categories, and
  // in its own gray frame: the section doesn't provide one (WITHOUT_FRAME).
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

// --- Battery ----------------------------------------------------------------

/** A discreet label, and the value below it. */
function Value({
  label,
  value,
  onRight,
}: {
  label: string;
  value?: ReactNode;
  /** True for a number, which is right-aligned. */
  onRight?: boolean;
}) {
  return (
    <Stack gap={2} ta={onRight ? "right" : undefined}>
      <Text size="xs" c="dimmed">
        {label}
      </Text>
      {/* A block and not a paragraph: the value may carry a badge. */}
      <Text component="div" size="sm" style={{ wordBreak: "break-word" }}>
        {value || EMPTY}
      </Text>
    </Stack>
  );
}

/**
 * The workstation's batteries, numbered: name and serial number. The
 * rest of what the agent reports (capacity, chemistry, manufacturer) is not
 * shown.
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

/** A power supply's charge state, as the agent gives it, in French. */
const POWER_STATES: Record<string, string> = {
  charging: "En charge",
  charged: "Chargée",
  "fully charged": "Chargée",
  full: "Chargée",
  "not charging": "Pas en charge",
  discharging: "En décharge",
  ok: "OK",
};

/** The states saying a power supply isn't doing its job. */
const FAULTY_STATES = new Set(["not charging", "discharging", "error", "failed"]);

/**
 * The workstation's power supplies: name, manufacturer, maximum power and state,
 * as a tag; then the serial number and whether it is plugged in.
 */
function PowerSupply({ section }: { section: AssetSection }) {
  return (
    <NumberedLines
      entries={section.entries}
      texts={0}
      numbers={0}
      // The power and state on the right, at fixed width.
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
            {/* On two columns: the number and its button fit on one line. */}
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

// --- Processors, memory, controllers ---------------------------------------

/** The background of each row's number: a dark, neutral gray. */
const NUMBER_BACKGROUND = "var(--milo-badge-bg)";

/** The minimum width of the number's rectangle. */
const NUMBER_WIDTH = 32;

/** The width of the number columns, right-aligned. */
const COUNT_WIDTH = 80;

/** The width of the first column, a short word: manufacturer, type. */
const FIRST_WIDTH = 120;

/**
 * A section's entries, one per row: its number in a dark
 * rectangle — its rank, or what `phoneNumber` says —, then its values. The first
 * column has its fixed width, the other text columns share the
 * rest, numbers come on the right, in a narrow column each.
 * More values than columns wrap onto the next line.
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
  /** The width of the first column, in pixels. */
  first?: number;
  /** What comes to the right of the values, over the row's full height. */
  beside?: (entry: AssetEntry) => ReactNode;
  /** The grid columns, when the default order doesn't fit. */
  columns?: string;
  /** A fixed width for the number's rectangle, instead of that of its content. */
  numberWidth?: number;
}) {
  const columns = template ?? [
    `${first}px`,
    ...Array<string>(texts - 1).fill("1fr"),
    ...Array<string>(numbers).fill(`${COUNT_WIDTH}px`),
  ].join(" ");
  return (
    // Each entry on its gray block, 20 px of inner margin, separated from
    // the next by 2 px of the interface background. The stack covers the section's
    // gray frame (its "md" margin taken back as negative) and keeps
    // its rounding.
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
              // Taller than the text, what is next to it doesn't stretch its rows.
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

/** The workstation's processors: manufacturer, model, cores and threads. */
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

/** A card's rank by type: Wi-Fi first, then Ethernet. */
const typeRank = (type: string | undefined): number => {
  const t = (type ?? "").toLowerCase();
  return t === "wifi" ? 0 : t === "ethernet" ? 1 : 2;
};

/** A card type, capitalized: "wifi" becomes "Wifi". */
const cardType = (type: string | undefined): string =>
  type ? type.charAt(0).toUpperCase() + type.slice(1) : "";

/** A speed in Mb/s, as the agent gives it, expressed in Gb/s from one gigabit. */
const throughput = (value: string | undefined): string => {
  const mb = Number(value);
  if (!value || Number.isNaN(mb) || mb <= 0) return value ?? "";
  return mb >= 1000
    ? `${(mb / 1000).toLocaleString("fr-FR", { maximumFractionDigits: 1 })} Gb/s`
    : `${mb.toLocaleString("fr-FR")} Mb/s`;
};

/** A state as a tag: green "Activé", red "Désactivé". */
function State({ active }: { active: boolean }) {
  return (
    <Badge color={active ? "green" : "red"} variant="filled" size="sm" radius="sm">
      {active ? "Activé" : "Désactivé"}
    </Badge>
  );
}

/**
 * The workstation's network cards, the connected ones first; among them as
 * among the others, Wi-Fi first, then Ethernet, then the rest. VIRTUALDEV is not shown.
 */
function Networks({ section }: { section: AssetSection }) {
  // Connected cards first; within each group, the type breaks ties.
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
          {/* 1st row: what the card is and its state. */}
          <Value label="Type" value={cardType(entry["TYPE"])} />
          <Value label="Nom" value={entry["DESCRIPTION"]} />
          <Value label="MAC" value={entry["MACADDR"]} />
          <Value
            label="Statut"
            value={
              entry["STATUS"] && <State active={entry["STATUS"].toLowerCase() === "up"} />
            }
          />
          {/* 2nd row: the IPv4 addressing, the fourth column left empty.
              Without an IPv4 address, the row isn't shown. */}
          {entry["IPADDRESS"] && (
            <>
              <Value label="IPv4" value={entry["IPADDRESS"]} />
              <Value label="Masque" value={entry["IPMASK"]} />
              <Value label="Passerelle" value={entry["IPGATEWAY"]} />
              <Box />
            </>
          )}
          {/* 3rd row: the IPv6, often long, over the full width; hidden
              without an IPv6 address. */}
          {entry["IPADDRESS6"] && (
            <Box style={{ gridColumn: "1 / -1" }}>
              <Value label="IPv6" value={entry["IPADDRESS6"]} />
            </Box>
          )}
          {/* 4th row: the board's VLAN that carries the card, its name
              then its number in a green tag, as in the Summary; hidden without a VLAN.
              VLAN and VLAN_NAME come from the server, not the agent. */}
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
          {/* 5th row: MTU and speed. */}
          <Value label="MTU" value={entry["MTU"]} />
          <Value label="Vitesse" value={throughput(entry["SPEED"])} />
        </>
      )}
    />
  );
}

/** A capacity in MB, as the agent gives it, expressed in GB. */
const toGb = (value: string | undefined): string => {
  const mo = Number(value);
  return value && !Number.isNaN(mo)
    ? `${(mo / 1024).toLocaleString("fr-FR", { maximumFractionDigits: 1 })} Go`
    : "";
};

/**
 * The workstation's memory modules: capacity, type and description. The agent's
 * slot number is not shown: the row's own number stands in for it.
 */
function Memory({ section }: { section: AssetSection }) {
  return (
    <NumberedLines
      entries={section.entries}
      texts={2}
      numbers={1}
      // The capacity first, then the type and the description.
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
 * The controllers' rectangle carries their PCI location ("00:1f.3"): it
 * has its own fixed width, so that all of them line up.
 */
const SLOT_WIDTH = 80;

/**
 * The width of the controllers' labels: what it takes for their
 * values to start where the second column of the other numbered rows starts
 * — a battery's serial number —, the rectangle being
 * wider.
 */
const LABEL_WIDTH = NUMBER_WIDTH + FIRST_WIDTH - SLOT_WIDTH;

/** The fields copied with one click: the serial numbers. */
const COPYABLE_FIELDS = new Set(["SERIAL", "SERIALNUMBER", "ALTSERIAL", "SSN"]);

/**
 * A value followed by a button that copies it: a serial number gets copied
 * into a ticket, to the manufacturer, rarely by hand without error. Without a
 * value, nothing to copy: neither button nor content, the row shows its dash.
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
 * The template for identifier labels — VENDORID, PRODUCTID: four
 * hexadecimal digits most often, sometimes more. "D" is the widest
 * of them once capitalized: a template made only of it, as
 * long as the longest identifier, gives the same width to all
 * labels, whatever their digits.
 */
const idTemplate = (identifiers: (string | undefined)[]): string =>
  "D".repeat(Math.max(4, ...identifiers.map((id) => id?.length ?? 0)));

/** A discreet label on the left, the value on the right, on a single line. */
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
 * The workstation's controllers, identified by their PCI location: name, manufacturer
 * — with the manufacturer ID at the right edge, in the green tag
 * of references — and type, one under the other.
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
                // The tag at the row's right edge: from one controller to
                // the next, they line up in a column.
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

/** The drawn screen's color: the dark gray of the numbers. */
const SCREEN_EDGE = NUMBER_BACKGROUND;

/** "1920x1080", as the agent gives it, reads "1920 x 1080". */
const spaceResolution = (resolution: string): string =>
  resolution.replace(/\s*[x×]\s*/i, " x ");

/**
 * A drawn screen, the resolution in the middle of its panel. Stand included, it
 * fits within the height of the three text lines of a video card (under
 * 72 px): taller, it stretched the row and spread the text apart.
 */
function Screen({ resolution }: { resolution?: string }) {
  return (
    <Stack gap={0} align="center" style={{ flexShrink: 0 }}>
      <Center w={104} h={58} style={{ border: `3px solid ${SCREEN_EDGE}`, borderRadius: 5 }}>
        <Text size="xs" fw={600} style={{ whiteSpace: "nowrap" }}>
          {resolution ? spaceResolution(resolution) : EMPTY}
        </Text>
      </Center>
      {/* The stand: a stem, then the base. */}
      <Box w={8} h={6} style={{ backgroundColor: SCREEN_EDGE }} />
      <Box w={36} h={3} style={{ backgroundColor: SCREEN_EDGE, borderRadius: 2 }} />
    </Stack>
  );
}

/**
 * The workstation's video cards: chip, name and PCI location one under the other,
 * and next to them a screen carrying the resolution.
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
 * The workstation's audio devices: name, manufacturer and description one under
 * the other. The agent's caption (CAPTION) is not shown: it repeats
 * the name.
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

/** A section's fields, in the order they are displayed, under their French name. */
type Fields = [string, string][];

/**
 * An entry's rows: its known fields in French, then those that can't be
 * named, under the agent's name — except the excluded ones. A value already
 * said above isn't repeated: the agent often gives the same text as
 * name, caption and description, or the serial number twice. Numbers
 * and "Oui" / "Non" are repeated, though: two fields at 0 or at "Oui" don't
 * say the same thing.
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
    // A field carrying a label gets its row as soon as the label has a
    // value, even if it has none itself.
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
 * A section as numbered rows: for each entry, what the agent says about it,
 * one under the other, in French. `labels` maps a field to another
 * field — an identifier —, shown in the green tag of
 * references at the row's right edge rather than on a row of its own.
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
  // A single width for all of the section's labels.
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
              // The tag at the row's right edge: from one entry to
              // the next, they line up in a column.
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

/** The ring's free part: a light neutral gray, not Mantine's, which leans blue. */
const RING_BACKGROUND = "var(--milo-control-bg)";

/**
 * A disk's capacity in a ring: its share of the workstation's total
 * capacity, its size in the middle. A disk whose size the agent doesn't give
 * keeps an empty ring and the dash.
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
 * The workstation's storage media. The capacity isn't written inline:
 * the ring on the right carries it, with the share it makes of the workstation's total.
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

/** The workstation's keyboards, mice and other input devices. */
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
 * The workstation's monitors. BASE64 and UUENCODE carry the screen's raw EDID:
 * unreadable, so it isn't shown.
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
 * The printers installed on the workstation. The print processor, the
 * status and the resolution are not shown.
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
 * The USB devices plugged into the workstation. The manufacturer ID follows
 * its name, the product ID the device name, each as a tag at the
 * right edge.
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

/** The BIOS fields we can name; the others keep the agent's name. */
const BIOS_LABELS: Record<string, string> = {
  SMANUFACTURER: "Fabricant",
  SMODEL: "Modèle",
  SSN: "Numéro de série",
};

/**
 * The workstation's BIOS, one field per row. It has no number, but its values
 * start where those of the numbered rows start after the first
 * column — a processor's model, for example: the label takes up the
 * rectangle, the first column and the two gaps.
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
 * The sections that lay out their own gray frames, instead of being
 * placed in the section's one: their titles come outside the frames.
 */
export const WITHOUT_FRAME = new Set(["OPERATINGSYSTEM", "VIRTUALMACHINES"]);

/** The sections that have their table; the others stay as records. */
export const SECTION_TABLES: Record<string, ComponentType<{ section: AssetSection }>> = {
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
