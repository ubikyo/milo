import { Center, Group, Table, Text, UnstyledButton } from "@mantine/core";
import {
  IconBuildingWarehouse,
  IconChevronDown,
  IconChevronUp,
  IconSelector,
} from "@tabler/icons-react";
import {
  Fragment,
  useContext,
  useEffect,
  useMemo,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { WAREHOUSE_ROUTES, accessIncludes, listKey, warehouseAddress } from "@milo/shared";
import type { Id, Warehouse } from "@milo/shared";
import WarehouseDrawer from "./WarehouseDrawer";
import AddButton from "../ui/AddButton";
import { keptColumns, defaultWidths, useColumnWidthEditing } from "../ui/ColumnFields";
import type { ListColumn } from "../ui/ColumnFields";
import { CopyPasteContext } from "../ui/CopyPasteActions";
import { ALL_OPTION, ChoiceFilter, TextFilter } from "../ui/ColumnFilters";
import type { FilterOption } from "../ui/ColumnFilters";
import EmptyPanel from "../ui/EmptyPanel";
import GridScroll from "../ui/GridScroll";
import LabelChip from "../ui/LabelChip";
import { useLabelFilter } from "../ui/LabelFilter";
import { useResizableColumns } from "../ui/useResizableColumns";
import { useIsEditing } from "../../lib/editing";
import { labelRank, labelsColumnTitle, ofGroup, useLabelGroups } from "../../lib/label-groups";
import { inList } from "../../lib/lists";
import { useWidgetAccess } from "../../lib/rights";
import { clearRequest, useRequestedItem } from "../../lib/searchSources";
import { useWarehouses } from "../../lib/warehouses";
import { STRONG_TEXT } from "../../themes/colors";
import { NewShortcut } from "../../lib/newShortcut";

// The list of an Entrepôts widget (widgets/warehouse): the warehouses entered
// by hand. The same grid as the contacts' (ContactsList): its header, its
// sort, its columns chosen in the drawer — the name and the labels by
// default, the address, the town and the country on request. It reads the
// board's warehouses (lib/warehouses.ts), and only shows those of its widget
// (LIST_KEY).
//
// "Ajouter un entrepôt" at the bottom of the grid, or in its empty state,
// opens its drawer (WarehouseDrawer), as a click on a row does.

// Vertical row padding, as in the contacts' list: the height includes the
// padding (box-sizing).
const ROW_PADDING_Y = 5;
const ROW_HEIGHT = 28;

/** A value not given reads the same everywhere. */
const EMPTY = "—";

// A warehouse's labels, on a single line: beyond two, the count of the others
// replaces the list.
const LABELS_SHOWN = 2;
const LABEL_HEIGHT = 20;

export type ColumnKey = "labels" | "name" | "address" | "city" | "country";

/** The sort: a column, and for the labels, its group — two can coexist. */
interface Sort {
  key: ColumnKey;
  group?: Id;
  direction: "asc" | "desc";
}

const sameSort = (sort: Sort, key: ColumnKey, group: Id | undefined): boolean =>
  sort.key === key && (key !== "labels" || sort.group === group);

/** The value each column sorts on; "null" goes to the bottom. */
const VALUES: Record<ColumnKey, (w: Warehouse) => string | number | null> = {
  labels: (w) => labelRank(w.labels, null),
  name: (w) => w.name || null,
  address: (w) => warehouseAddress(w) || null,
  city: (w) => w.city || null,
  country: (w) => w.country || null,
};

// --- Filters -------------------------------------------------------------

type FilterKey = "name" | "city" | "country";

type Filters = Record<FilterKey, string>;

const NO_FILTER: Filters = { name: "", city: ALL_OPTION, country: ALL_OPTION };

/** The values a warehouse offers to a choice filter. */
const CHOICES: Record<Exclude<FilterKey, "name">, (w: Warehouse) => FilterOption[]> = {
  city: (w) => (w.city ? [{ value: w.city, label: w.city }] : []),
  country: (w) => (w.country ? [{ value: w.country, label: w.country }] : []),
};

/** Does the warehouse pass every filter? */
const chosen = (f: Filters, w: Warehouse): boolean => {
  if (f.name.trim() && !w.name.toLowerCase().includes(f.name.trim().toLowerCase())) return false;
  return (Object.keys(CHOICES) as (keyof typeof CHOICES)[]).every(
    (key) => f[key] === ALL_OPTION || CHOICES[key](w).some((o) => o.value === f[key]),
  );
};

/** The columns the list can show, in order. */
export const WAREHOUSE_COLUMNS: (ListColumn & { key: ColumnKey })[] = [
  { key: "name", label: "Nom" },
  // It picks the group it shows.
  { key: "labels", label: "Étiquettes", labelGroups: WAREHOUSE_ROUTES.labels },
  { key: "address", label: "Adresse" },
  { key: "city", label: "Ville" },
  { key: "country", label: "Pays" },
];

function SortableTh({
  label,
  column,
  group,
  sort,
  onSort,
  filter,
  style,
  handle,
}: {
  label: string;
  column: ColumnKey;
  group?: Id;
  sort: Sort;
  onSort: (key: ColumnKey, group?: Id) => void;
  filter?: ReactNode;
  style?: CSSProperties;
  handle: ReactNode;
}) {
  const active = sameSort(sort, column, group);
  const Icon = !active ? IconSelector : sort.direction === "asc" ? IconChevronUp : IconChevronDown;
  return (
    <Table.Th style={style}>
      <Group gap={4} wrap="nowrap">
        <UnstyledButton onClick={() => onSort(column, group)} style={{ flex: 1, minWidth: 0 }}>
          <Group gap={4} wrap="nowrap" justify="space-between">
            <Text size="sm" fw={600} c={STRONG_TEXT}>
              {label}
            </Text>
            <Center c={active ? undefined : "dimmed"}>
              <Icon size={14} />
            </Center>
          </Group>
        </UnstyledButton>
        {filter}
      </Group>
      {handle}
    </Table.Th>
  );
}

/** A text cell: the value, or a dimmed dash. */
function TextCell({ value }: { value: string }) {
  return (
    <Text size="sm" c={value ? undefined : "dimmed"} truncate>
      {value || EMPTY}
    </Text>
  );
}

/** The warehouse's labels, in their order — group after group. */
function LabelsCell({ labels }: { labels: Warehouse["labels"] }) {
  if (!labels.length) return <TextCell value="" />;
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

/** A warehouse's labels, for the labels filters (useLabelFilter). */
const labelsOf = (w: Warehouse) => w.labels;

export default function WarehousesList({ config, blockId }: { config: unknown; blockId: Id }) {
  const boardId = useContext(CopyPasteContext)?.board?.id;
  const { warehouses: all, reload } = useWarehouses(boardId);
  // Those of this widget only.
  const warehouses = useMemo(() => all?.filter(inList(config)) ?? null, [all, config]);
  const [sort, setSort] = useState<Sort>({ key: "name", direction: "asc" });
  const [filters, setFilters] = useState<Filters>(NO_FILTER);
  // The labels filters, one per labels column, limited to its group.
  const labelFilter = useLabelFilter(warehouses, labelsOf);
  const isFiltered =
    labelFilter.active ||
    (Object.keys(NO_FILTER) as FilterKey[]).some((key) => filters[key] !== NO_FILTER[key]);
  const labelGroups = useLabelGroups(WAREHOUSE_ROUTES.labels);
  const isEditing = useIsEditing();
  const access = useWidgetAccess()("logistics");
  // Adding is for display mode: in edit mode, clicks go to the widget.
  const canAdd = accessIncludes(access, "update") && !isEditing;
  /** The drawer: closed, adding (null), or showing a warehouse. */
  const [drawer, setDrawer] = useState<{ warehouse: Warehouse | null } | null>(null);

  // A warehouse chosen in the search opens here, once read.
  const requested = useRequestedItem(blockId);
  useEffect(() => {
    const found = requested && warehouses?.find((w) => String(w.id) === requested);
    if (!found) return;
    clearRequest();
    setDrawer({ warehouse: found });
  }, [requested, warehouses]);

  const shown = useMemo(() => {
    const value =
      sort.key === "labels" ? (w: Warehouse) => labelRank(w.labels, sort.group) : VALUES[sort.key];
    const factor = sort.direction === "asc" ? 1 : -1;
    return (warehouses ?? [])
      .filter((w) => chosen(filters, w))
      .filter(labelFilter.keep)
      .sort((a, b) => {
        const left = value(a);
        const rightHand = value(b);
        if (left == null && rightHand == null) return 0;
        if (left == null) return 1;
        if (rightHand == null) return -1;
        if (typeof left === "number" && typeof rightHand === "number")
          return (left - rightHand) * factor;
        return String(left).localeCompare(String(rightHand), "fr", { numeric: true }) * factor;
      });
  }, [warehouses, sort, filters, labelFilter.keep]);

  /** A choice filter's options: "Tous", then the values the warehouses carry. */
  const optionsOf = (key: keyof typeof CHOICES, everything: string): FilterOption[] => {
    const found = new Map<string, string>();
    for (const warehouse of warehouses ?? []) {
      for (const o of CHOICES[key](warehouse)) found.set(o.value, o.label);
    }
    return [
      { value: ALL_OPTION, label: everything },
      ...[...found]
        .map(([value, label]) => ({ value, label }))
        .sort((a, b) => a.label.localeCompare(b.label, "fr", { numeric: true })),
    ];
  };

  const choiceFilter = (key: keyof typeof CHOICES, label: string, everything: string) => (
    <ChoiceFilter
      label={label}
      options={optionsOf(key, everything)}
      value={filters[key]}
      onChange={(value) => setFilters((f) => ({ ...f, [key]: value }))}
    />
  );

  // A click on the label sorts, a second reverses the direction.
  const sortBy = (key: ColumnKey, group?: Id) =>
    setSort((current) =>
      sameSort(current, key, group)
        ? { key, group, direction: current.direction === "asc" ? "desc" : "asc" }
        : { key, group, direction: "asc" },
    );

  // The columns shown, in the order the configuration sets.
  const columns = keptColumns(WAREHOUSE_COLUMNS, config);
  // In edit mode, the widths set above the columns go to the widget.
  const widthEditing = useColumnWidthEditing(WAREHOUSE_COLUMNS, config, columns.map((c) => c.id));
  const resize = useResizableColumns(
    "warehouse",
    columns.map((c) => c.id),
    defaultWidths(WAREHOUSE_COLUMNS, config),
    undefined,
    widthEditing,
  );

  const th = (
    id: string,
    label: string,
    column: ColumnKey,
    filter?: ReactNode,
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
      filter={filter}
      style={style}
      handle={resize.handle(id)}
    />
  );

  /** The header of each column. */
  const headers: Record<ColumnKey, (id: string, group?: Id) => ReactNode> = {
    labels: (id, group) =>
      th(
        id,
        labelsColumnTitle(labelGroups, group),
        "labels",
        labelFilter.filter(group),
        { whiteSpace: "nowrap" },
        group,
      ),
    name: (id) =>
      th(
        id,
        "Nom",
        "name",
        <TextFilter
          label="nom"
          value={filters.name}
          onChange={(value) => setFilters((f) => ({ ...f, name: value }))}
        />,
      ),
    address: (id) => th(id, "Adresse", "address"),
    city: (id) => th(id, "Ville", "city", choiceFilter("city", "ville", "Toutes")),
    country: (id) => th(id, "Pays", "country", choiceFilter("country", "pays", "Tous")),
  };

  /** Each column's cell, for a warehouse. */
  const cells: Record<ColumnKey, (warehouse: Warehouse, group?: Id) => ReactNode> = {
    // Limited to a group, the column shows only its labels.
    labels: (warehouse, group) => (
      <Table.Td key="labels">
        <LabelsCell labels={ofGroup(warehouse.labels, group)} />
      </Table.Td>
    ),
    name: (warehouse) => (
      <Table.Td key="name">
        <TextCell value={warehouse.name} />
      </Table.Td>
    ),
    address: (warehouse) => (
      <Table.Td key="address">
        <TextCell value={warehouseAddress(warehouse)} />
      </Table.Td>
    ),
    city: (warehouse) => (
      <Table.Td key="city">
        <TextCell value={warehouse.city} />
      </Table.Td>
    ),
    country: (warehouse) => (
      <Table.Td key="country">
        <TextCell value={warehouse.country} />
      </Table.Td>
    ),
  };

  const cellStyle = {
    boxSizing: "content-box" as const,
    height: ROW_HEIGHT,
    paddingTop: ROW_PADDING_Y,
    paddingBottom: ROW_PADDING_Y,
  };

  const table = (
    <Table
      {...resize.tableProps}
      highlightOnHover
      verticalSpacing={0}
      styles={{ td: cellStyle, th: { ...cellStyle, verticalAlign: "middle" } }}
    >
      {resize.colgroup}
      <Table.Thead>
        {resize.widthRow}
        <Table.Tr>{columns.map((c) => headers[c.key](c.id, c.group))}</Table.Tr>
      </Table.Thead>
      <Table.Tbody>
        {shown.map((warehouse) => (
          <Table.Tr
            key={warehouse.id}
            onClick={() => setDrawer({ warehouse })}
            style={{ cursor: "pointer" }}
          >
            {columns.map((c) => (
              <Fragment key={c.id}>{cells[c.key](warehouse, c.group)}</Fragment>
            ))}
          </Table.Tr>
        ))}

        {/* Filtered down to nothing, the list says so, along with how to undo it. */}
        {shown.length === 0 && isFiltered && (
          <Table.Tr style={{ backgroundColor: "transparent" }}>
            <Table.Td colSpan={columns.length}>
              <Group gap="xs">
                <Text size="sm" c="dimmed">
                  Aucun entrepôt ne correspond aux filtres.
                </Text>
                <UnstyledButton
                  onClick={() => {
                    setFilters(NO_FILTER);
                    labelFilter.reset();
                  }}
                >
                  <Text size="sm" c="teal">
                    Retirer les filtres
                  </Text>
                </UnstyledButton>
              </Group>
            </Table.Td>
          </Table.Tr>
        )}

        {/* Last row: adding a warehouse happens where the list ends. Its
            background neutralizes the hover: it is not a warehouse. */}
        {canAdd && (
          <Table.Tr style={{ backgroundColor: "transparent" }}>
            <Table.Td colSpan={columns.length}>
              <AddButton label="Ajouter un entrepôt" onClick={() => setDrawer({ warehouse: null })} />
            </Table.Td>
          </Table.Tr>
        )}
      </Table.Tbody>
    </Table>
  );

  if (boardId === undefined || !warehouses) return null;

  return (
    // "N" adds one, as "Ajouter" does (lib/newShortcut).
    <NewShortcut action="Nouvel entrepôt" run={canAdd ? () => setDrawer({ warehouse: null }) : undefined}>
      {warehouses.length === 0 ? (
        // With nothing to show, only the empty state, which offers to add.
        <EmptyPanel
          icon={IconBuildingWarehouse}
          message="Aucun entrepôt"
          actionLabel={canAdd ? "Ajouter un entrepôt" : undefined}
          onAction={canAdd ? () => setDrawer({ warehouse: null }) : undefined}
        />
      ) : (
        // A section narrower than the list makes it scroll sideways.
        <GridScroll>{table}</GridScroll>
      )}

      <WarehouseDrawer
        opened={drawer !== null}
        onClose={() => setDrawer(null)}
        boardId={boardId}
        listKey={listKey(config)}
        warehouse={drawer?.warehouse ?? null}
        onSaved={() => void reload()}
        canSave={accessIncludes(access, "update")}
        canDelete={accessIncludes(access, "delete")}
      />
    </NewShortcut>
  );
}
