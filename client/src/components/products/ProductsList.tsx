import { Badge, Center, Group, Table, Text, UnstyledButton } from "@mantine/core";
import {
  IconChevronDown,
  IconChevronUp,
  IconPackage,
  IconSelector,
  IconStar,
  IconStarFilled,
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
import {
  PRODUCT_ROUTES,
  accessIncludes,
  listKey,
  locationPaths,
  productTrackingLabel,
} from "@milo/shared";
import type { Id, Product, ProductCategory } from "@milo/shared";
import ProductDrawer from "./ProductDrawer";
import AddButton from "../ui/AddButton";
import { keptColumns,
  defaultWidths,
  useColumnWidthEditing, PATH_FORMATS, formatPath } from "../ui/ColumnFields";
import type { ListColumn } from "../ui/ColumnFields";
import { CopyPasteContext } from "../ui/CopyPasteActions";
import {
  ALL_OPTION,
  ChoiceFilter,
  TextFilter,
} from "../ui/ColumnFilters";
import type { FilterOption } from "../ui/ColumnFilters";
import EmptyPanel from "../ui/EmptyPanel";
import GridScroll from "../ui/GridScroll";
import LabelChip from "../ui/LabelChip";
import { useLabelFilter } from "../ui/LabelFilter";
import { useResizableColumns } from "../ui/useResizableColumns";
import { useIsEditing } from "../../lib/editing";
import {
  labelRank,
  labelsColumnTitle,
  ofGroup,
  useLabelGroups,
} from "../../lib/label-groups";
import { inList } from "../../lib/lists";
import { useWidgetAccess } from "../../lib/rights";
import { clearRequest, useRequestedItem } from "../../lib/searchSources";
import { useProducts } from "../../lib/products";
import { useListRef } from "../../lib/list-ref";
import { api } from "../../api";
import { errorMessage, notifyError } from "../../lib/errors";
import { STRONG_TEXT } from "../../themes/colors";
import { NewShortcut } from "../../lib/newShortcut";

// The list of a Produits widget (widgets/product): the products entered by
// hand. The same grid as the contacts' (ContactsList): its header, its sort,
// its columns chosen in the drawer — the labels, the favorite star, the name,
// its category — its path in the board's tree — and the inventory tracking. It reads the board's products
// (lib/products.ts), and only shows those of its widget (LIST_KEY).
//
// "Ajouter un produit" at the bottom of the grid, or in its empty state,
// opens its drawer (ProductDrawer), as a click on a row does.

// Vertical row padding, as in the contacts' list: the height includes the
// padding (box-sizing).
const ROW_PADDING_Y = 5;
const ROW_HEIGHT = 28;

/** A value not given reads the same everywhere. */
const EMPTY = "—";

// A product's labels, on a single line: beyond two, the count of the others
// replaces the list.
const LABELS_SHOWN = 2;
const LABEL_HEIGHT = 20;

export type ColumnKey =
  "labels" | "favorite" | "sku" | "name" | "category" | "tracking";

/** A product as the grid reads it: its category's path beside its id. */
type Row = Product & { category_path: string; category_name: string };

/** The sort: a column, and for the labels, its group — two can coexist. */
interface Sort {
  key: ColumnKey;
  group?: Id;
  direction: "asc" | "desc";
}

const sameSort = (sort: Sort, key: ColumnKey, group: Id | undefined): boolean =>
  sort.key === key && (key !== "labels" || sort.group === group);

/** The favorites column: only a star, as narrow as it. */
const STAR_COLUMN_MIN = 15;
const STAR_CELL: CSSProperties = {
  paddingLeft: 0,
  paddingRight: 0,
  textAlign: "center",
};

/** The value each column sorts on; "null" goes to the bottom. */
const VALUES: Record<ColumnKey, (p: Row) => string | number | null> = {
  labels: (p) => labelRank(p.labels, null),
  // The favorites first.
  favorite: (p) => (p.favorite ? 0 : 1),
  sku: (p) => p.sku || null,
  name: (p) => p.name || null,
  category: (p) => p.category_path || null,
  tracking: (p) => productTrackingLabel(p.tracking),
};

// --- Filters -------------------------------------------------------------

type FilterKey = "name" | "category" | "tracking";

type Filters = Record<FilterKey, string>;

const NO_FILTER: Filters = {
  name: "",
  category: ALL_OPTION,
  tracking: ALL_OPTION,
};

/** The values a product offers to a choice filter. */
const CHOICES: Record<
  Exclude<FilterKey, "name">,
  (p: Row) => FilterOption[]
> = {
  category: (p) =>
    p.category_path ? [{ value: p.category_path, label: p.category_path }] : [],
  tracking: (p) => [
    { value: p.tracking, label: productTrackingLabel(p.tracking) },
  ],
};

/** Does the product pass every filter? */
const chosen = (f: Filters, p: Row): boolean => {
  // The name's filter finds a product by its SKU too.
  const searched = f.name.trim().toLowerCase();
  if (searched && ![p.name, p.sku].some((v) => v.toLowerCase().includes(searched))) return false;
  return (Object.keys(CHOICES) as (keyof typeof CHOICES)[]).every(
    (key) =>
      f[key] === ALL_OPTION || CHOICES[key](p).some((o) => o.value === f[key]),
  );
};

/** The columns the list can show, in order. */
export const PRODUCT_COLUMNS: (ListColumn & { key: ColumnKey })[] = [
  // It picks the group it shows.
  { key: "labels", label: "Étiquettes", labelGroups: PRODUCT_ROUTES.labels },
  { key: "favorite", label: "Favoris", minWidth: STAR_COLUMN_MIN },
  { key: "sku", label: "SKU" },
  { key: "name", label: "Nom" },
  // Its whole path, or the category alone.
  { key: "category", label: "Catégorie", formats: PATH_FORMATS },
  { key: "tracking", label: "Suivi inventaire" },
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
  const Icon = !active
    ? IconSelector
    : sort.direction === "asc"
      ? IconChevronUp
      : IconChevronDown;
  return (
    <Table.Th style={style}>
      <Group gap={4} wrap="nowrap">
        <UnstyledButton
          onClick={() => onSort(column, group)}
          style={{ flex: 1, minWidth: 0 }}
        >
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

/** The product's labels, in their order — group after group. */
function LabelsCell({ labels }: { labels: Product["labels"] }) {
  if (!labels.length) return <TextCell value="" />;
  const shown = ofGroup(labels, null).slice(0, LABELS_SHOWN);
  const remaining = labels.length - shown.length;
  return (
    <Group gap={4} wrap="nowrap">
      {shown.map((label) => (
        <LabelChip
          key={label.id}
          label={label}
          size="xs"
          height={LABEL_HEIGHT}
        />
      ))}
      {remaining > 0 && (
        <Text size="xs" c="dimmed">
          +{remaining}
        </Text>
      )}
    </Group>
  );
}

/** A product's labels, for the labels filters (useLabelFilter). */
const labelsOf = (p: Row) => p.labels;

export default function ProductsList({
  config,
  blockId,
}: {
  config: unknown;
  blockId: Id;
}) {
  const board = useContext(CopyPasteContext)?.board;
  const boardId = board?.id;
  const { products: all, reload } = useProducts(boardId);
  // The widget's categories tree: each product reads with its category's path.
  // Re-read when the products are — a change of the tree announces them too.
  const [categories, setCategories] = useState<ProductCategory[]>([]);
  const list = useListRef();
  useEffect(() => {
    if (!list) return;
    api
      .getProductSettings(list)
      .then((s) => setCategories(s.categories))
      .catch((e) => notifyError(errorMessage(e)));
  }, [list, all]);
  // Those of this widget only.
  const products = useMemo(() => {
    const paths = locationPaths(categories);
    const names = new Map(categories.map((c) => [c.id, c.name]));
    return (
      all
        ?.filter(inList(config))
        .map((p): Row => ({
          ...p,
          category_path: paths.get(p.category) ?? "",
          category_name: names.get(p.category) ?? "",
        })) ?? null
    );
  }, [all, config, categories]);
  const [sort, setSort] = useState<Sort>({ key: "name", direction: "asc" });
  const [filters, setFilters] = useState<Filters>(NO_FILTER);
  // The labels filters, one per labels column, limited to its group.
  const labelFilter = useLabelFilter(products, labelsOf);
  const isFiltered =
    labelFilter.active ||
    (Object.keys(NO_FILTER) as FilterKey[]).some((key) => filters[key] !== NO_FILTER[key]);
  const labelGroups = useLabelGroups(PRODUCT_ROUTES.labels);
  const isEditing = useIsEditing();
  const access = useWidgetAccess()("logistics");
  // Adding is for display mode: in edit mode, clicks go to the widget.
  const canAdd = accessIncludes(access, "update") && !isEditing;
  /** The drawer: closed, adding (null), or showing a product. */
  const [drawer, setDrawer] = useState<{ product: Product | null } | null>(
    null,
  );

  // A product chosen in the search opens here, once read.
  const requested = useRequestedItem(blockId);
  useEffect(() => {
    const found =
      requested && products?.find((p) => String(p.id) === requested);
    if (!found) return;
    clearRequest();
    setDrawer({ product: found });
  }, [requested, products]);

  const shown = useMemo(() => {
    const value =
      sort.key === "labels"
        ? (p: Row) => labelRank(p.labels, sort.group)
        : VALUES[sort.key];
    const factor = sort.direction === "asc" ? 1 : -1;
    return (products ?? [])
      .filter((p) => chosen(filters, p))
      .filter(labelFilter.keep)
      .sort((a, b) => {
        const left = value(a);
        const rightHand = value(b);
        if (left == null && rightHand == null) return 0;
        if (left == null) return 1;
        if (rightHand == null) return -1;
        if (typeof left === "number" && typeof rightHand === "number")
          return (left - rightHand) * factor;
        return (
          String(left).localeCompare(String(rightHand), "fr", {
            numeric: true,
          }) * factor
        );
      });
  }, [products, sort, filters, labelFilter.keep]);

  /** A choice filter's options: "Tous", then the values the products carry. */
  const optionsOf = (
    key: keyof typeof CHOICES,
    everything: string,
  ): FilterOption[] => {
    const found = new Map<string, string>();
    for (const product of products ?? []) {
      for (const o of CHOICES[key](product)) found.set(o.value, o.label);
    }
    return [
      { value: ALL_OPTION, label: everything },
      ...[...found]
        .map(([value, label]) => ({ value, label }))
        .sort((a, b) =>
          a.label.localeCompare(b.label, "fr", { numeric: true }),
        ),
    ];
  };

  const choiceFilter = (
    key: keyof typeof CHOICES,
    label: string,
    everything: string,
  ) => (
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
        ? {
            key,
            group,
            direction: current.direction === "asc" ? "desc" : "asc",
          }
        : { key, group, direction: "asc" },
    );

  // The columns shown, in the order the configuration sets.
  const columns = keptColumns(PRODUCT_COLUMNS, config);
  // In edit mode, the widths set above the columns go to the widget.
  const widthEditing = useColumnWidthEditing(
    PRODUCT_COLUMNS,
    config,
    columns.map((c) => c.id),
  );
  const resize = useResizableColumns(
    "product",
    columns.map((c) => c.id),
    defaultWidths(PRODUCT_COLUMNS, config),
    Object.fromEntries(
      columns.filter((c) => c.minWidth).map((c) => [c.id, c.minWidth!]),
    ),
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
    // Only the star, which sorts: the column is as narrow as it.
    favorite: (id) => (
      <Table.Th key={id} style={STAR_CELL}>
        <UnstyledButton
          onClick={() => sortBy("favorite")}
          aria-label="Trier par favoris"
          style={{ display: "inline-flex", verticalAlign: "middle" }}
        >
          <IconStar
            size={14}
            color={
              sort.key === "favorite"
                ? undefined
                : "var(--mantine-color-dimmed)"
            }
          />
        </UnstyledButton>
        {resize.handle(id)}
      </Table.Th>
    ),
    sku: (id) => th(id, "SKU", "sku", undefined, { whiteSpace: "nowrap" }),
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
    category: (id) =>
      th(
        id,
        "Catégorie",
        "category",
        choiceFilter("category", "catégorie", "Toutes"),
      ),
    tracking: (id) =>
      th(
        id,
        "Suivi inventaire",
        "tracking",
        choiceFilter("tracking", "suivi", "Tous"),
        {
          whiteSpace: "nowrap",
        },
      ),
  };

  /** Each column's cell, for a product. */
  const cells: Record<ColumnKey, (product: Row, group?: Id, format?: string) => ReactNode> = {
    // Limited to a group, the column shows only its labels.
    labels: (product, group) => (
      <Table.Td key="labels">
        <LabelsCell labels={ofGroup(product.labels, group)} />
      </Table.Td>
    ),
    favorite: (product) => (
      <Table.Td key="favorite" style={STAR_CELL}>
        {product.favorite ? (
          <IconStarFilled
            size={14}
            color="var(--mantine-color-yellow-5)"
            aria-label="Favoris"
            style={{ verticalAlign: "middle" }}
          />
        ) : null}
      </Table.Td>
    ),
    sku: (product) => (
      <Table.Td key="sku">
        <TextCell value={product.sku} />
      </Table.Td>
    ),
    name: (product) => (
      <Table.Td key="name">
        {product.archived ? (
          <Group gap={6} wrap="nowrap">
            <TextCell value={product.name} />
            <Badge size="sm" color="gray" variant="filled" radius="sm" tt="none" style={{ flexShrink: 0 }}>
              Archivé
            </Badge>
          </Group>
        ) : (
          <TextCell value={product.name} />
        )}
      </Table.Td>
    ),
    category: (product, _group, format) => (
      <Table.Td key="category">
        <TextCell value={formatPath(product.category_path, product.category_name, format)} />
      </Table.Td>
    ),
    tracking: (product) => (
      <Table.Td key="tracking">
        <TextCell value={productTrackingLabel(product.tracking)} />
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
        {shown.map((product) => (
          <Table.Tr
            key={product.id}
            onClick={() => setDrawer({ product })}
            // Archived: faded, still opened — to be brought back.
            style={{ cursor: "pointer", opacity: product.archived ? 0.55 : undefined }}
          >
            {columns.map((c) => (
              <Fragment key={c.id}>{cells[c.key](product, c.group, c.format)}</Fragment>
            ))}
          </Table.Tr>
        ))}

        {/* Filtered down to nothing, the list says so, along with how to undo it. */}
        {shown.length === 0 && isFiltered && (
          <Table.Tr style={{ backgroundColor: "transparent" }}>
            <Table.Td colSpan={columns.length}>
              <Group gap="xs">
                <Text size="sm" c="dimmed">
                  Aucun produit ne correspond aux filtres.
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

        {/* Last row: adding a product happens where the list ends. Its
            background neutralizes the hover: it is not a product. */}
        {canAdd && (
          <Table.Tr style={{ backgroundColor: "transparent" }}>
            <Table.Td colSpan={columns.length}>
              <AddButton
                label="Ajouter un produit"
                onClick={() => setDrawer({ product: null })}
              />
            </Table.Td>
          </Table.Tr>
        )}
      </Table.Tbody>
    </Table>
  );

  if (boardId === undefined || !products || !all) return null;

  return (
    // "N" adds one, as "Ajouter" does (lib/newShortcut).
    <NewShortcut action={"Nouveau produit"} run={canAdd ? () => setDrawer({ product: null }) : undefined}>
      {products.length === 0 ? (
        // With nothing to show, only the empty state, which offers to add.
        <EmptyPanel
          icon={IconPackage}
          message="Aucun produit"
          actionLabel={canAdd ? "Ajouter un produit" : undefined}
          onAction={canAdd ? () => setDrawer({ product: null }) : undefined}
        />
      ) : (
        // A section narrower than the list makes it scroll sideways.
        <GridScroll>{table}</GridScroll>
      )}

      <ProductDrawer
        opened={drawer !== null}
        onClose={() => setDrawer(null)}
        boardId={boardId}
        listKey={listKey(config)}
        product={drawer?.product ?? null}
        onSaved={() => void reload()}
        onDuplicated={(copy) => {
          void reload();
          setDrawer({ product: copy });
        }}
        canSave={accessIncludes(access, "update")}
        canDelete={accessIncludes(access, "delete")}
      />
    </NewShortcut>
  );
}
