import { Badge, Center, Group, Table, Text, UnstyledButton } from "@mantine/core";
import { IconChevronDown, IconChevronUp, IconSelector } from "@tabler/icons-react";
import {
  Fragment,
  useContext,
  useEffect,
  useMemo,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { accessIncludes, listKey } from "@milo/shared";
import { DECLARED_ASSET_ROUTES, DECLARED_ASSET_SUPPLIER, DECLARED_ASSET_WORDS } from "@milo/shared";
import type { DeclaredAsset, DeclaredAssetKind, DeclaredAssetNoun, Id } from "@milo/shared";
import DeclaredAssetDrawer from "./DeclaredAssetDrawer";
import { DECLARED_ASSET_LOOKS } from "./kinds";
import ActorAvatars from "../ui/ActorAvatars";
import AddButton from "../ui/AddButton";
import { keptColumns, defaultWidths } from "../ui/ColumnFields";
import type { ListColumn } from "../ui/ColumnFields";
import { CopyPasteContext } from "../ui/CopyPasteActions";
import { ALL_OPTION, ChoiceFilter, TextFilter } from "../support/SupportRequestsList";
import type { FilterOption } from "../support/SupportRequestsList";
import EmptyPanel from "../ui/EmptyPanel";
import GridScroll from "../ui/GridScroll";
import LabelChip from "../ui/LabelChip";
import { useResizableColumns } from "../ui/useResizableColumns";
import { useIsEditing } from "../../lib/editing";
import { labelRank, labelsColumnTitle, ofGroup, useLabelGroups } from "../../lib/label-groups";
import { inList } from "../../lib/lists";
import { useWidgetAccess } from "../../lib/rights";
import { clearRequest, useRequestedItem } from "../../lib/searchSources";
import { useDeclaredAssets } from "../../lib/declaredAssets";
import { STRONG_TEXT } from "../../themes/colors";

// The list of a declared asset kind — equipment, applications —: the assets
// entered by hand, which no agent inventories (widgets/declared-asset). The
// same grid as the managed device assets' (ManagedDeviceAssetsList): its
// header, its sort, its columns chosen in the drawer — its labels, its
// actors, and a value from each of the board's lists
// (DeclaredAssetTablesFields), in the kind's words. It reads its own assets
// (lib/declaredAssets.ts), and only shows those of its widget (LIST_KEY).
//
// Its columns sort and filter as the tickets' do (SupportRequestsList): the
// label sorts, the funnel filters — the name by what is typed, the others
// by a value found in the list.
//
// Unlike a workstation, an asset is entered here: "Ajouter un asset" at
// the bottom of the grid, or in its empty state, opens its drawer
// (DeclaredAssetDrawer), as a click on a row does.

// Vertical row padding, as in the supervised workstations' list: the height
// includes the padding (box-sizing).
const ROW_PADDING_Y = 5;
const ROW_HEIGHT = 28;

// Height of the asset tag, like that of a supervised workstation.
const TAG_HEIGHT = 20;

/** A value not given reads the same everywhere. */
const EMPTY = "—";

// An asset's labels, on a single line, as in the supervised list: beyond
// two, the count of the others replaces the list.
const LABELS_SHOWN = 2;
const LABEL_HEIGHT = 20;

export type ColumnKey =
  | "name"
  | "labels"
  | "actor"
  | "category"
  | "supplier"
  | "maker"
  | "product"
  | "quantity"
  | "price";

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
const VALUES: Record<ColumnKey, (a: DeclaredAsset) => string | number | null> = {
  name: (a) => a.name || null,
  // By the first label, in the labels' order: the one the cell shows first.
  // A column limited to a group reads its own (DeclaredAssetsList).
  labels: (a) => labelRank(a.labels, null),
  actor: (a) => a.actors[0]?.name || null,
  category: (a) => a.category || null,
  supplier: (a) => a.supplier || null,
  maker: (a) => a.maker || null,
  product: (a) => a.product || null,
  quantity: (a) => a.quantity,
  price: (a) => a.price,
};

// --- Filters -------------------------------------------------------------

/** The columns that filter: the name by text, the others by a value. */
type FilterKey = "name" | "labels" | "actor" | "category" | "supplier" | "maker" | "product";

type Filters = Record<FilterKey, string>;

const NO_FILTER: Filters = {
  name: "",
  labels: ALL_OPTION,
  actor: ALL_OPTION,
  category: ALL_OPTION,
  supplier: ALL_OPTION,
  maker: ALL_OPTION,
  product: ALL_OPTION,
};

/** The values an asset offers to a choice filter: a label's name, an actor's id… */
const CHOICES: Record<Exclude<FilterKey, "name">, (a: DeclaredAsset) => FilterOption[]> = {
  labels: (a) => a.labels.map((l) => ({ value: l.name, label: l.name })),
  actor: (a) => a.actors.map((u) => ({ value: String(u.id), label: u.name })),
  category: (a) => (a.category ? [{ value: a.category, label: a.category }] : []),
  supplier: (a) => (a.supplier ? [{ value: a.supplier, label: a.supplier }] : []),
  maker: (a) => (a.maker ? [{ value: a.maker, label: a.maker }] : []),
  product: (a) => (a.product ? [{ value: a.product, label: a.product }] : []),
};

/** Does the asset pass every filter? */
const chosen = (f: Filters, a: DeclaredAsset): boolean => {
  if (f.name.trim() && !a.name.toLowerCase().includes(f.name.trim().toLowerCase())) return false;
  return (Object.keys(CHOICES) as (keyof typeof CHOICES)[]).every(
    (key) => f[key] === ALL_OPTION || CHOICES[key](a).some((o) => o.value === f[key]),
  );
};

/** A price as it reads in France: "1 250,00 €". */
const PRICE_FORMAT = new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" });

/** The columns a kind's list can show, in order, in its words. */
export const declaredAssetColumns = (kind: DeclaredAssetKind): (ListColumn & { key: ColumnKey })[] => {
  const { category, maker, product } = DECLARED_ASSET_WORDS[kind];
  return [
    { key: "name", label: "Asset" },
    // It picks the group it shows.
    { key: "labels", label: "Étiquettes", labelGroups: DECLARED_ASSET_ROUTES[kind].labels },
    { key: "actor", label: "Acteurs" },
    // Each takes its value from the board's list of the same name
    // (DeclaredAssetTablesFields).
    { key: "category", label: category.title },
    { key: "supplier", label: DECLARED_ASSET_SUPPLIER.title },
    { key: "maker", label: maker.title },
    { key: "product", label: product.title },
    { key: "quantity", label: "Quantité" },
    { key: "price", label: "Prix" },
  ];
};

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
  /** For a labels column, the group it shows. */
  group?: Id;
  sort: Sort;
  onSort: (key: ColumnKey, group?: Id) => void;
  /** Its funnel, after the label: sorting and filtering are two controls. */
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

/** The asset's labels, in their order — group after group. */
function LabelsCell({ labels }: { labels: DeclaredAsset["labels"] }) {
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

export default function DeclaredAssetsList({
  kind,
  config,
  blockId,
}: {
  kind: DeclaredAssetKind;
  config: unknown;
  /** The widget's identifier: the search asks it to open an asset. */
  blockId: Id;
}) {
  const words = DECLARED_ASSET_WORDS[kind];
  const look = DECLARED_ASSET_LOOKS[kind];
  const boardId = useContext(CopyPasteContext)?.board?.id;
  const { assets: all, reload } = useDeclaredAssets(kind, boardId);
  // Those of this widget only.
  const assets = useMemo(() => all?.filter(inList(config)) ?? null, [all, config]);
  const [sort, setSort] = useState<Sort>({ key: "name", direction: "asc" });
  const [filters, setFilters] = useState<Filters>(NO_FILTER);
  const isFiltered = (Object.keys(NO_FILTER) as FilterKey[]).some(
    (key) => filters[key] !== NO_FILTER[key],
  );
  // A labels column limited to a group takes its name.
  const labelGroups = useLabelGroups(DECLARED_ASSET_ROUTES[kind].labels);
  const isEditing = useIsEditing();
  const access = useWidgetAccess()(kind);
  // Adding is for display mode: in edit mode, clicks go to the widget.
  const canAdd = accessIncludes(access, "update") && !isEditing;
  /** The drawer: closed, adding (null), or showing an asset. */
  const [drawer, setDrawer] = useState<{ asset: DeclaredAsset | null } | null>(null);

  // An asset chosen in the search opens here, once read.
  const requested = useRequestedItem(blockId);
  useEffect(() => {
    const found = requested && assets?.find((a) => String(a.id) === requested);
    if (!found) return;
    clearRequest();
    setDrawer({ asset: found });
  }, [requested, assets]);

  const shown = useMemo(() => {
    const value =
      sort.key === "labels"
        ? (a: DeclaredAsset) => labelRank(a.labels, sort.group)
        : VALUES[sort.key];
    const factor = sort.direction === "asc" ? 1 : -1;
    return (assets ?? []).filter((a) => chosen(filters, a)).sort((a, b) => {
      const left = value(a);
      const rightHand = value(b);
      if (left == null && rightHand == null) return 0;
      if (left == null) return 1;
      if (rightHand == null) return -1;
      if (typeof left === "number" && typeof rightHand === "number")
        return (left - rightHand) * factor;
      return String(left).localeCompare(String(rightHand), "fr", { numeric: true }) * factor;
    });
  }, [assets, sort, filters]);

  /** A choice filter's options: "Tous", then the values the assets carry. */
  const optionsOf = (key: keyof typeof CHOICES, all: string): FilterOption[] => {
    const found = new Map<string, string>();
    for (const asset of assets ?? []) {
      for (const o of CHOICES[key](asset)) found.set(o.value, o.label);
    }
    return [
      { value: ALL_OPTION, label: all },
      ...[...found]
        .map(([value, label]) => ({ value, label }))
        .sort((a, b) => a.label.localeCompare(b.label, "fr", { numeric: true })),
    ];
  };

  /** A list's funnel, named by its noun: "Filtrer par marque", "Toutes". */
  const nounFilter = (key: keyof typeof CHOICES, noun: DeclaredAssetNoun) =>
    choiceFilter(key, noun.title.toLowerCase(), noun.all);

  const choiceFilter = (key: keyof typeof CHOICES, label: string, all: string) => (
    <ChoiceFilter
      label={label}
      options={optionsOf(key, all)}
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
  // A column can come back: "id" distinguishes each occurrence.
  const allColumns = declaredAssetColumns(kind);
  const columns = keptColumns(allColumns, config);
  const resize = useResizableColumns(
    kind,
    columns.map((c) => c.id),
    defaultWidths(allColumns, config),
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
    name: (id) =>
      th(
        id,
        "Asset",
        "name",
        <TextFilter
          label="asset"
          value={filters.name}
          onChange={(value) => setFilters((f) => ({ ...f, name: value }))}
        />,
      ),
    labels: (id, group) =>
      th(
        id,
        labelsColumnTitle(labelGroups, group),
        "labels",
        choiceFilter("labels", "étiquette", "Toutes"),
        { whiteSpace: "nowrap" },
        group,
      ),
    actor: (id) => th(id, "Acteurs", "actor", choiceFilter("actor", "acteur", "Tous")),
    category: (id) =>
      th(id, words.category.title, "category", nounFilter("category", words.category)),
    supplier: (id) =>
      th(id, DECLARED_ASSET_SUPPLIER.title, "supplier", nounFilter("supplier", DECLARED_ASSET_SUPPLIER)),
    maker: (id) => th(id, words.maker.title, "maker", nounFilter("maker", words.maker)),
    product: (id) => th(id, words.product.title, "product", nounFilter("product", words.product)),
    quantity: (id) => th(id, "Quantité", "quantity", undefined, { whiteSpace: "nowrap" }),
    price: (id) => th(id, "Prix", "price", undefined, { whiteSpace: "nowrap" }),
  };

  /** Each column's cell, for an asset. */
  const cells: Record<ColumnKey, (asset: DeclaredAsset, group?: Id) => ReactNode> = {
    name: (asset) => (
      <Table.Td key="name" style={{ whiteSpace: "nowrap" }}>
        <Badge color="green" variant="filled" radius="sm" h={TAG_HEIGHT} tt="uppercase">
          {asset.name}
        </Badge>
      </Table.Td>
    ),
    // Limited to a group, the column shows only its labels.
    labels: (asset, group) => (
      <Table.Td key="labels">
        <LabelsCell labels={ofGroup(asset.labels, group)} />
      </Table.Td>
    ),
    actor: (asset) => (
      <Table.Td key="actor">
        <ActorAvatars actors={asset.actors} />
      </Table.Td>
    ),
    category: (asset) => (
      <Table.Td key="category">
        <TextCell value={asset.category} />
      </Table.Td>
    ),
    supplier: (asset) => (
      <Table.Td key="supplier">
        <TextCell value={asset.supplier} />
      </Table.Td>
    ),
    maker: (asset) => (
      <Table.Td key="maker">
        <TextCell value={asset.maker} />
      </Table.Td>
    ),
    product: (asset) => (
      <Table.Td key="product">
        <TextCell value={asset.product} />
      </Table.Td>
    ),
    quantity: (asset) => (
      <Table.Td key="quantity">
        <TextCell value={String(asset.quantity)} />
      </Table.Td>
    ),
    price: (asset) => (
      <Table.Td key="price" style={{ whiteSpace: "nowrap" }}>
        <TextCell value={asset.price === null ? "" : PRICE_FORMAT.format(asset.price)} />
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
        <Table.Tr>{columns.map((c) => headers[c.key](c.id, c.group))}</Table.Tr>
      </Table.Thead>
      <Table.Tbody>
        {shown.map((asset) => (
          <Table.Tr
            key={asset.id}
            onClick={() => setDrawer({ asset })}
            style={{ cursor: "pointer" }}
          >
            {columns.map((c) => (
              <Fragment key={c.id}>{cells[c.key](asset, c.group)}</Fragment>
            ))}
          </Table.Tr>
        ))}

        {/* Filtered down to nothing, the list says so, along with how to undo
            it — as the tickets' does. */}
        {shown.length === 0 && isFiltered && (
          <Table.Tr style={{ backgroundColor: "transparent" }}>
            <Table.Td colSpan={columns.length}>
              <Group gap="xs">
                <Text size="sm" c="dimmed">
                  Aucun asset ne correspond aux filtres.
                </Text>
                <UnstyledButton onClick={() => setFilters(NO_FILTER)}>
                  <Text size="sm" c="teal">
                    Retirer les filtres
                  </Text>
                </UnstyledButton>
              </Group>
            </Table.Td>
          </Table.Tr>
        )}

        {/* Last row: adding an asset happens where the list ends, as in
            the projects table. Its background neutralizes the hover: it is
            not an asset. */}
        {canAdd && (
          <Table.Tr style={{ backgroundColor: "transparent" }}>
            <Table.Td colSpan={columns.length}>
              <AddButton label="Ajouter un asset" onClick={() => setDrawer({ asset: null })} />
            </Table.Td>
          </Table.Tr>
        )}
      </Table.Tbody>
    </Table>
  );

  if (boardId === undefined || !assets) return null;

  return (
    <>
      {assets.length === 0 ? (
        // With nothing to show, only the empty state, which offers to add.
        <EmptyPanel
          icon={look.icon}
          message="Aucun asset"
          actionLabel={canAdd ? "Ajouter un asset" : undefined}
          onAction={canAdd ? () => setDrawer({ asset: null }) : undefined}
          size="md"
        />
      ) : (
        // A section narrower than the list makes it scroll sideways.
        <GridScroll>{table}</GridScroll>
      )}

      <DeclaredAssetDrawer
        kind={kind}
        opened={drawer !== null}
        onClose={() => setDrawer(null)}
        boardId={boardId}
        listKey={listKey(config)}
        asset={drawer?.asset ?? null}
        onSaved={() => void reload()}
        canSave={accessIncludes(access, "update")}
        canDelete={accessIncludes(access, "delete")}
      />
    </>
  );
}
