import { Center, Group, Select, Table, Text, UnstyledButton } from "@mantine/core";
import {
  IconChevronDown,
  IconChevronUp,
  IconMapPin,
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
import { LOCATION_ROUTES, accessIncludes, listKey, locationPlaceTypeLabel } from "@milo/shared";
import type { Id, Location, LocationPlace } from "@milo/shared";
import LocationDrawer from "./LocationDrawer";
import AddButton from "../ui/AddButton";
import { keptColumns, defaultWidths, useColumnWidthEditing } from "../ui/ColumnFields";
import type { ListColumn } from "../ui/ColumnFields";
import { CopyPasteContext } from "../ui/CopyPasteActions";
import { ALL_OPTION, ChoiceFilter, TextFilter } from "../ui/ColumnFilters";
import type { FilterOption } from "../ui/ColumnFilters";
import EmptyPanel from "../ui/EmptyPanel";
import GridWithAdd from "../ui/GridWithAdd";
import LabelChip from "../ui/LabelChip";
import { useLabelFilter } from "../ui/LabelFilter";
import { ReferenceTag } from "../ui/ReferenceTag";
import { useResizableColumns } from "../ui/useResizableColumns";
import { useIsEditing } from "../../lib/editing";
import { labelRank, labelsColumnTitle, ofGroup, useLabelGroups } from "../../lib/label-groups";
import { inList } from "../../lib/lists";
import { useWidgetAccess } from "../../lib/rights";
import { clearRequest, useRequestedItem } from "../../lib/searchSources";
import { useLocations } from "../../lib/locations";
import { STRONG_TEXT } from "../../themes/colors";
import { NewShortcut } from "../../lib/newShortcut";
import { fieldWidth } from "../../lib/fieldWidth";
import fields from "../../assets/styles/GapField.module.css";
import { readFilters, readSort, useGridState } from "../../lib/gridStates";

// The list of an Emplacements widget (widgets/location): the location records
// entered by hand. The same grid as the warehouses' (WarehousesList): its
// header, its sort, its columns chosen in the drawer — the warehouse, the
// labels and the count of places by default: a record has no name of its own. It reads the board's
// locations (lib/locations.ts), and only shows those of its widget
// (LIST_KEY).
//
// "Ajouter un emplacement" at the bottom of the grid, or in its empty state, opens
// its drawer (LocationDrawer), as a click on a row does.
//
// Outside edit mode, a choice at the right of that last row shows the grid
// "Par entrepôt" — a row per record — or "Par emplacement": a row per last
// level of the records' trees, its code the codes of its path joined by dots
// (A1.G.R1.N1).

// Vertical row padding, as in the contacts' list: the height includes the
// padding (box-sizing).
const ROW_PADDING_Y = 5;
const ROW_HEIGHT = 28;

/** A value not given reads the same everywhere. */
const EMPTY = "—";

// A record's labels, on a single line: beyond two, the count of the others
// replaces the list.
const LABELS_SHOWN = 2;
const LABEL_HEIGHT = 20;

export type ColumnKey = "labels" | "warehouse" | "places";

/** The sort: a column, and for the labels, its group — two can coexist. */
interface Sort {
  key: ColumnKey;
  group?: Id;
  direction: "asc" | "desc";
}

const sameSort = (sort: Sort, key: ColumnKey, group: Id | undefined): boolean =>
  sort.key === key && (key !== "labels" || sort.group === group);

/** The value each column sorts on; "null" goes to the bottom. */
const VALUES: Record<ColumnKey, (l: Location) => string | number | null> = {
  labels: (l) => labelRank(l.labels, null),
  warehouse: (l) => l.warehouse_name || null,
  places: (l) => l.places.length,
};

// --- By place --------------------------------------------------------------

type Display = "records" | "places";

const DISPLAYS: { value: Display; label: string }[] = [
  { value: "records", label: "Par entrepôt" },
  { value: "places", label: "Par emplacement" },
];

/** The by-place grid's columns: code, name, type, warehouse. */
const PLACE_COLUMNS = 4;

/** The display chosen, kept by the browser for each widget. */
const displayKey = (blockId: Id) => `milo.locations.display.${blockId}`;

const readDisplay = (blockId: Id): Display => {
  try {
    return localStorage.getItem(displayKey(blockId)) === "places" ? "places" : "records";
  } catch {
    return "records";
  }
};

/** A last level of a record's tree, its code the codes of its path. */
interface PlaceRow {
  key: string;
  location: Location;
  place: LocationPlace;
  code: string;
}

/** A record's last levels — the places with nothing under them —, in the tree's order. */
const lastLevels = (location: Location): PlaceRow[] => {
  const byId = new Map(location.places.map((p) => [p.id, p]));
  const parents = new Set(location.places.map((p) => p.parent));
  return location.places
    .filter((p) => !parents.has(p.id))
    .map((place) => {
      const codes: string[] = [];
      for (let p: LocationPlace | undefined = place; p; p = p.parent ? byId.get(p.parent) : undefined) {
        codes.unshift(p.code);
      }
      return { key: `${location.id}:${place.id}`, location, place, code: codes.join(".") };
    });
};

// --- Filters -------------------------------------------------------------

type FilterKey = "place" | "warehouse";

type Filters = Record<FilterKey, string>;

const NO_FILTER: Filters = { place: "", warehouse: ALL_OPTION };

/** The values a record offers to a choice filter. */
const CHOICES: Record<Exclude<FilterKey, "place">, (l: Location) => FilterOption[]> = {
  warehouse: (l) => (l.warehouse_name ? [{ value: l.warehouse_name, label: l.warehouse_name }] : []),
};

/** Does the record pass every filter? The text searched is one of its places' name or code. */
const chosen = (f: Filters, l: Location): boolean => {
  const searched = f.place.trim().toLowerCase();
  if (
    searched &&
    !l.places.some((p) => p.name.toLowerCase().includes(searched) || p.code.toLowerCase().includes(searched))
  ) {
    return false;
  }
  return (Object.keys(CHOICES) as (keyof typeof CHOICES)[]).every(
    (key) => f[key] === ALL_OPTION || CHOICES[key](l).some((o) => o.value === f[key]),
  );
};

/** The columns the list can show, in order. */
export const LOCATION_COLUMNS: (ListColumn & { key: ColumnKey })[] = [
  { key: "warehouse", label: "Entrepôt" },
  // It picks the group it shows.
  { key: "labels", label: "Étiquettes", labelGroups: LOCATION_ROUTES.labels },
  { key: "places", label: "Emplacements" },
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

/** The record's labels, in their order — group after group. */
function LabelsCell({ labels }: { labels: Location["labels"] }) {
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

/** A record's labels, for the labels filters (useLabelFilter). */
const labelsOf = (l: Location) => l.labels;

export default function LocationsList({ config, blockId }: { config: unknown; blockId: Id }) {
  const boardId = useContext(CopyPasteContext)?.board?.id;
  const { locations: all, reload } = useLocations(boardId);
  // Those of this widget only.
  const locations = useMemo(() => all?.filter(inList(config)) ?? null, [all, config]);
  const [sort, setSort] = useGridState<Sort>("sort", { key: "warehouse", direction: "asc" }, readSort<Sort>(Object.keys(VALUES)));
  const [filters, setFilters] = useGridState<Filters>("filters", NO_FILTER, readFilters(NO_FILTER));
  // The labels filters, one per labels column, limited to its group.
  const labelFilter = useLabelFilter(locations, labelsOf);
  const isFiltered =
    labelFilter.active ||
    (Object.keys(NO_FILTER) as FilterKey[]).some((key) => filters[key] !== NO_FILTER[key]);
  const labelGroups = useLabelGroups(LOCATION_ROUTES.labels);
  const isEditing = useIsEditing();
  const access = useWidgetAccess()("logistics");
  const canAdd = accessIncludes(access, "update");
  const [display, setDisplay] = useState<Display>(() => readDisplay(blockId));
  const chooseDisplay = (value: Display) => {
    setDisplay(value);
    try {
      localStorage.setItem(displayKey(blockId), value);
    } catch {
      // Not kept: the choice holds until the page is left.
    }
  };
  // In edit mode, the grid is the widget's: by record.
  const byPlace = display === "places" && !isEditing;
  /** The drawer: closed, adding (null), or showing a record. */
  const [drawer, setDrawer] = useState<{ location: Location | null } | null>(null);

  // A record chosen in the search opens here, once read.
  const requested = useRequestedItem(blockId);
  useEffect(() => {
    const found = requested && locations?.find((l) => String(l.id) === requested);
    if (!found) return;
    clearRequest();
    setDrawer({ location: found });
  }, [requested, locations]);

  const shown = useMemo(() => {
    const value =
      sort.key === "labels" ? (l: Location) => labelRank(l.labels, sort.group) : VALUES[sort.key];
    const factor = sort.direction === "asc" ? 1 : -1;
    return (locations ?? [])
      .filter((l) => chosen(filters, l))
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
  }, [locations, sort, filters, labelFilter.keep]);

  /** A choice filter's options: "Tous", then the values the records carry. */
  const optionsOf = (key: keyof typeof CHOICES, everything: string): FilterOption[] => {
    const found = new Map<string, string>();
    for (const location of locations ?? []) {
      for (const o of CHOICES[key](location)) found.set(o.value, o.label);
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
  const columns = keptColumns(LOCATION_COLUMNS, config);
  // In edit mode, the widths set above the columns go to the widget.
  const widthEditing = useColumnWidthEditing(LOCATION_COLUMNS, config, columns.map((c) => c.id));
  const resize = useResizableColumns(
    "location",
    columns.map((c) => c.id),
    defaultWidths(LOCATION_COLUMNS, config),
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
    warehouse: (id) => th(id, "Entrepôt", "warehouse", choiceFilter("warehouse", "entrepôt", "Tous")),
    // Its filter searches the places, by name or by code.
    places: (id) =>
      th(
        id,
        "Emplacements",
        "places",
        <TextFilter
          label="emplacement"
          value={filters.place}
          onChange={(value) => setFilters((f) => ({ ...f, place: value }))}
        />,
        { whiteSpace: "nowrap" },
      ),
  };

  /** Each column's cell, for a record. */
  const cells: Record<ColumnKey, (location: Location, group?: Id) => ReactNode> = {
    // Limited to a group, the column shows only its labels.
    labels: (location, group) => (
      <Table.Td key="labels">
        <LabelsCell labels={ofGroup(location.labels, group)} />
      </Table.Td>
    ),
    warehouse: (location) => (
      <Table.Td key="warehouse">
        <TextCell value={location.warehouse_name} />
      </Table.Td>
    ),
    places: (location) => (
      <Table.Td key="places">
        <TextCell value={location.places.length ? String(location.places.length) : ""} />
      </Table.Td>
    ),
  };

  const cellStyle = {
    boxSizing: "content-box" as const,
    height: ROW_HEIGHT,
    paddingTop: ROW_PADDING_Y,
    paddingBottom: ROW_PADDING_Y,
  };

  /**
   * Under the grid, at the bottom of the widget (GridWithAdd): adding a
   * record; at its right, outside edit mode, the display.
   */
  const bottomBar = (canAdd || !isEditing) && (
    <Group justify="space-between" wrap="nowrap">
      {canAdd ? (
        <AddButton label="Ajouter un emplacement" onClick={() => setDrawer({ location: null })} />
      ) : (
        <span />
      )}
      {!isEditing && (
        <Select
          size="xs"
          aria-label="Affichage"
          data={DISPLAYS}
          value={display}
          onChange={(v) => v && chooseDisplay(v as Display)}
          allowDeselect={false}
          // At the size of the chosen label, chevron included.
          w={fieldWidth(DISPLAYS.find((d) => d.value === display)?.label ?? "") + 14}
          withCheckIcon={false}
          rightSection={<IconChevronDown size={10} />}
          rightSectionWidth={14}
          comboboxProps={{ width: 170, position: "bottom-end" }}
          styles={{ input: { textAlign: "right" } }}
          className={`${fields.field} ${fields.unit}`}
        />
      )}
    </Group>
  );

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
        {shown.map((location) => (
          <Table.Tr
            key={location.id}
            onClick={() => setDrawer({ location })}
            style={{ cursor: "pointer" }}
          >
            {columns.map((c) => (
              <Fragment key={c.id}>{cells[c.key](location, c.group)}</Fragment>
            ))}
          </Table.Tr>
        ))}

        {/* Filtered down to nothing, the list says so, along with how to undo it. */}
        {shown.length === 0 && isFiltered && (
          <Table.Tr style={{ backgroundColor: "transparent" }}>
            <Table.Td colSpan={columns.length}>
              <Group gap="xs">
                <Text size="sm" c="dimmed">
                  Aucune fiche ne correspond aux filtres.
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
      </Table.Tbody>
    </Table>
  );

  // By place: the last levels of the records the filters keep, by code.
  const placeRows = useMemo(() => {
    const searched = filters.place.trim().toLowerCase();
    return (locations ?? [])
      .filter((l) => chosen({ ...filters, place: "" }, l))
      .filter(labelFilter.keep)
      .flatMap(lastLevels)
      .filter(
        (r) =>
          !searched || r.code.toLowerCase().includes(searched) || r.place.name.toLowerCase().includes(searched),
      )
      .sort((a, b) => a.code.localeCompare(b.code, "fr", { numeric: true }));
  }, [locations, filters, labelFilter.keep]);

  const plainTh = (label: string, filter?: ReactNode) => (
    <Table.Th>
      <Group gap={4} wrap="nowrap" justify="space-between">
        <Text size="sm" fw={600} c={STRONG_TEXT}>
          {label}
        </Text>
        {filter}
      </Group>
    </Table.Th>
  );

  const placeTable = (
    <Table
      highlightOnHover
      verticalSpacing={0}
      styles={{ td: cellStyle, th: { ...cellStyle, verticalAlign: "middle" } }}
    >
      <Table.Thead>
        <Table.Tr>
          {plainTh(
            "Code",
            <TextFilter
              label="emplacement"
              value={filters.place}
              onChange={(value) => setFilters((f) => ({ ...f, place: value }))}
            />,
          )}
          {plainTh("Nom")}
          {plainTh("Type")}
          {plainTh("Entrepôt", choiceFilter("warehouse", "entrepôt", "Tous"))}
        </Table.Tr>
      </Table.Thead>
      <Table.Tbody>
        {placeRows.map((row) => (
          <Table.Tr key={row.key} onClick={() => setDrawer({ location: row.location })} style={{ cursor: "pointer" }}>
            <Table.Td>
              <ReferenceTag reference={row.code} template={row.code} />
            </Table.Td>
            <Table.Td>
              <TextCell value={row.place.name} />
            </Table.Td>
            <Table.Td>
              <TextCell value={locationPlaceTypeLabel(row.place.type)} />
            </Table.Td>
            <Table.Td>
              <TextCell value={row.location.warehouse_name} />
            </Table.Td>
          </Table.Tr>
        ))}
        {placeRows.length === 0 && (
          <Table.Tr style={{ backgroundColor: "transparent" }}>
            <Table.Td colSpan={PLACE_COLUMNS}>
              <Text size="sm" c="dimmed">
                {isFiltered ? "Aucun emplacement ne correspond aux filtres." : "Aucun emplacement"}
              </Text>
            </Table.Td>
          </Table.Tr>
        )}
      </Table.Tbody>
    </Table>
  );

  if (boardId === undefined || !locations) return null;

  return (
    // "N" adds one, as "Ajouter" does (lib/newShortcut).
    <NewShortcut action="Nouvel emplacement" run={canAdd ? () => setDrawer({ location: null }) : undefined}>
      {locations.length === 0 ? (
        // With nothing to show, only the empty state, which offers to add.
        <EmptyPanel
          icon={IconMapPin}
          message="Aucun emplacement"
          actionLabel={canAdd ? "Ajouter un emplacement" : undefined}
          onAction={canAdd ? () => setDrawer({ location: null }) : undefined}
        />
      ) : (
        // Under the grid, "Ajouter", at the bottom of the widget (GridWithAdd).
        <GridWithAdd config={config} add={bottomBar}>
          {byPlace ? placeTable : table}
        </GridWithAdd>
      )}

      <LocationDrawer
        opened={drawer !== null}
        onClose={() => setDrawer(null)}
        boardId={boardId}
        listKey={listKey(config)}
        config={config}
        location={drawer?.location ?? null}
        onSaved={() => void reload()}
        canSave={accessIncludes(access, "update")}
        canDelete={accessIncludes(access, "delete")}
      />
    </NewShortcut>
  );
}
