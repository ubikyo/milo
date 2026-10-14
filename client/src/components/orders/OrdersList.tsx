import { Badge, Center, Group, Menu, Table, Text, UnstyledButton } from "@mantine/core";
import {
  IconCheck,
  IconChevronDown,
  IconChevronUp,
  IconEye,
  IconReceipt,
  IconSelector,
} from "@tabler/icons-react";
import { Fragment, useContext, useEffect, useMemo, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import dayjs from "dayjs";
import {
  ORDER_ROUTES,
  ORDER_STATUSES,
  accessIncludes,
  formatAmount,
  listKey,
  orderStatusColor,
  orderNumber,
  orderStatusLabel,
  orderTotal,
} from "@milo/shared";
import type { Id, Order } from "@milo/shared";
import OrderDrawer from "./OrderDrawer";
import ActorAvatars from "../ui/ActorAvatars";
import AddButton from "../ui/AddButton";
import {
  DATE_FORMATS,
  ACTOR_FORMATS,
  defaultWidths,
  formatMoment,
  keptColumns,
  useColumnWidthEditing,
} from "../ui/ColumnFields";
import type { ListColumn } from "../ui/ColumnFields";
import { CopyPasteContext } from "../ui/CopyPasteActions";
import { ALL_OPTION, ChoiceFilter, TextFilter } from "../ui/ColumnFilters";
import type { FilterOption } from "../ui/ColumnFilters";
import EmptyPanel from "../ui/EmptyPanel";
import GridScroll from "../ui/GridScroll";
import LabelChip from "../ui/LabelChip";
import { useLabelFilter } from "../ui/LabelFilter";
import { useColumnFilters, type ColumnFilterSpec } from "../ui/useColumnFilters";
import { useResizableColumns } from "../ui/useResizableColumns";
import { useIsEditing } from "../../lib/editing";
import { labelRank, labelsColumnTitle, ofGroup, useLabelGroups } from "../../lib/label-groups";
import { inList } from "../../lib/lists";
import { useWidgetAccess } from "../../lib/rights";
import { clearRequest, useRequestedItem } from "../../lib/searchSources";
import { useFollows } from "../../lib/follows-context";
import { useOrders } from "../../lib/orders";
import { STRONG_TEXT } from "../../themes/colors";
import { NewShortcut } from "../../lib/newShortcut";

// The list of a Commandes widget (widgets/order): the orders, quotes and
// cancelled ones. The same grid as the products' (ProductsList): its header,
// its sort, its filters, its columns chosen in the drawer — the labels, the
// number, the status, the supplier, the due date, the total, the actors, the
// creation date. It reads the board's orders (lib/orders.ts), and only shows
// those of its widget (LIST_KEY).
//
// "Ajouter une demande de devis" at the bottom of the grid, or in its empty state,
// opens its drawer (OrderDrawer), as a click on a row does.

const ROW_PADDING_Y = 5;
const ROW_HEIGHT = 28;

/** A value not given reads the same everywhere. */
const EMPTY = "—";

const LABELS_SHOWN = 2;
const LABEL_HEIGHT = 20;
const ACTOR_SIZE = 22;

export type ColumnKey =
  | "labels"
  | "number"
  | "status"
  | "supplier"
  | "due_date"
  | "total"
  | "actors"
  | "created_at";

interface Sort {
  key: ColumnKey;
  group?: Id;
  direction: "asc" | "desc";
}

const sameSort = (sort: Sort, key: ColumnKey, group: Id | undefined): boolean =>
  sort.key === key && (key !== "labels" || sort.group === group);

const STATUS_RANK = Object.fromEntries(ORDER_STATUSES.map((s, i) => [s.value, i]));

/** The value each column sorts on; "null" goes to the bottom. */
const VALUES: Record<ColumnKey, (o: Order) => string | number | null> = {
  labels: (o) => labelRank(o.labels, null),
  number: (o) => orderNumber(o) || null,
  status: (o) => STATUS_RANK[o.status] ?? 0,
  supplier: (o) => o.supplier_name || null,
  due_date: (o) => o.due_date || null,
  total: (o) => orderTotal(o.lines),
  actors: (o) => o.actors.map((a) => a.name).join(", ") || null,
  created_at: (o) => o.created_at,
};

// --- Filters -------------------------------------------------------------

type FilterKey = "number" | "status" | "supplier";

type Filters = Record<FilterKey, string>;

const NO_FILTER: Filters = {
  number: "",
  status: ALL_OPTION,
  supplier: ALL_OPTION,
};

const CHOICES: Record<Exclude<FilterKey, "number">, (o: Order) => FilterOption[]> = {
  status: (o) => [{ value: o.status, label: orderStatusLabel(o.status) }],
  supplier: (o) => (o.supplier_name ? [{ value: o.supplier_name, label: o.supplier_name }] : []),
};

const chosen = (f: Filters, o: Order): boolean => {
  // A number searched finds the order by its quote's number as by its order's.
  const searched = f.number.trim().toLowerCase();
  if (searched && ![o.quote_number, o.order_number].some((n) => n.toLowerCase().includes(searched))) {
    return false;
  }
  return (Object.keys(CHOICES) as (keyof typeof CHOICES)[]).every(
    (key) => f[key] === ALL_OPTION || CHOICES[key](o).some((c) => c.value === f[key]),
  );
};

/** The other columns' filters (useColumnFilters). */
const COLUMN_FILTERS: Record<
  "due_date" | "total" | "actors" | "created_at",
  ColumnFilterSpec<Order>
> = {
  due_date: { kind: "date", label: "échéance", ahead: true, value: (o) => o.due_date },
  total: { kind: "number", label: "total", value: (o) => orderTotal(o.lines) },
  actors: {
    kind: "choice",
    label: "acteur",
    all: "Tous",
    options: (o) => o.actors.map((a) => ({ value: String(a.id), label: a.name })),
  },
  created_at: { kind: "date", label: "date de création", value: (o) => o.created_at },
};

/** The columns the list can show, in order. */
export const ORDER_COLUMNS: (ListColumn & { key: ColumnKey })[] = [
  { key: "labels", label: "Étiquettes", labelGroups: ORDER_ROUTES.labels },
  { key: "number", label: "Numéro" },
  { key: "status", label: "Statut" },
  { key: "supplier", label: "Fournisseur" },
  { key: "due_date", label: "Échéance" },
  { key: "total", label: "Total" },
  { key: "actors", label: "Acteurs", formats: ACTOR_FORMATS },
  { key: "created_at", label: "Création", formats: DATE_FORMATS },
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

function TextCell({ value }: { value: string }) {
  return (
    <Text size="sm" c={value ? undefined : "dimmed"} truncate>
      {value || EMPTY}
    </Text>
  );
}

function LabelsCell({ labels }: { labels: Order["labels"] }) {
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

/** An order's status, as a colored badge. */
/** An order's status: filled — white on its color —, as the list and the drawer show it; light, if asked. */
export function StatusBadge({
  status,
  filled = false,
  size,
  number,
}: {
  status: Order["status"];
  filled?: boolean;
  /** "lg" with the number, in the drawer. */
  size?: "lg";
  /** Its number, in the same badge, past a white line of dots. */
  number?: string | null;
}) {
  return (
    <Badge variant={filled ? "filled" : "light"} color={orderStatusColor(status)} radius="sm" tt="none" size={size}>
      {orderStatusLabel(status)}
      {number && (
        // The line over the badge's whole height: the height of its text line.
        <span
          style={{
            display: "inline-block",
            height: "var(--badge-lh)",
            verticalAlign: "top",
            // On each side of the line, the badge's own padding.
            marginLeft: "var(--badge-padding-x)",
            paddingLeft: "var(--badge-padding-x)",
            borderLeft: "2px dotted rgba(255, 255, 255, 0.5)",
          }}
        >
          {number}
        </span>
      )}
    </Badge>
  );
}

/** An order's labels, for the labels filters (useLabelFilter). */
const labelsOf = (o: Order) => o.labels;

export default function OrdersList({
  config,
  blockId,
  userId,
}: {
  config: unknown;
  blockId: Id;
  /** The signed-in account: a new order's actor. */
  userId?: Id;
}) {
  const board = useContext(CopyPasteContext)?.board;
  const boardId = board?.id;
  const { orders: all, reload } = useOrders(boardId);
  const orders = useMemo(() => all?.filter(inList(config)) ?? null, [all, config]);
  const [sort, setSort] = useState<Sort>({ key: "created_at", direction: "desc" });
  const [filters, setFilters] = useState<Filters>(NO_FILTER);
  // The labels filters, one per labels column, limited to its group.
  const labelFilter = useLabelFilter(orders, labelsOf);
  const columnFilter = useColumnFilters(orders, COLUMN_FILTERS);
  const isFiltered =
    labelFilter.active ||
    columnFilter.active ||
    (Object.keys(NO_FILTER) as FilterKey[]).some((k) => filters[k] !== NO_FILTER[k]);
  const labelGroups = useLabelGroups(ORDER_ROUTES.labels);
  const isEditing = useIsEditing();
  const access = useWidgetAccess()("logistics");
  const canAdd = accessIncludes(access, "update");
  /** The drawer: closed, adding (null), or showing an order. */
  const [drawer, setDrawer] = useState<{ order: Order | null } | null>(null);
  // The row whose menu is open, where the pointer was.
  const [menu, setMenu] = useState<{ order: Order; x: number; y: number } | null>(null);
  const follows = useFollows();

  // An order chosen in the search opens here, once read.
  const requested = useRequestedItem(blockId);
  useEffect(() => {
    const found = requested && orders?.find((o) => String(o.id) === requested);
    if (!found) return;
    clearRequest();
    setDrawer({ order: found });
  }, [requested, orders]);

  // The order shown follows its saves: a status changed from the drawer.
  const shownOrder = drawer?.order ? (all?.find((o) => o.id === drawer.order!.id) ?? drawer.order) : null;

  const shown = useMemo(() => {
    const value = sort.key === "labels" ? (o: Order) => labelRank(o.labels, sort.group) : VALUES[sort.key];
    const factor = sort.direction === "asc" ? 1 : -1;
    return (orders ?? [])
      .filter((o) => chosen(filters, o))
      .filter(labelFilter.keep)
      .filter(columnFilter.keep)
      .sort((a, b) => {
        const left = value(a);
        const right = value(b);
        if (left == null && right == null) return 0;
        if (left == null) return 1;
        if (right == null) return -1;
        if (typeof left === "number" && typeof right === "number") return (left - right) * factor;
        return String(left).localeCompare(String(right), "fr", { numeric: true }) * factor;
      });
  }, [orders, sort, filters, labelFilter.keep, columnFilter.keep]);

  const optionsOf = (key: keyof typeof CHOICES, everything: string): FilterOption[] => {
    const found = new Map<string, string>();
    for (const order of orders ?? []) {
      for (const o of CHOICES[key](order)) found.set(o.value, o.label);
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

  const sortBy = (key: ColumnKey, group?: Id) =>
    setSort((current) =>
      sameSort(current, key, group)
        ? { key, group, direction: current.direction === "asc" ? "desc" : "asc" }
        : { key, group, direction: "asc" },
    );

  const columns = keptColumns(ORDER_COLUMNS, config);
  const widthEditing = useColumnWidthEditing(
    ORDER_COLUMNS,
    config,
    columns.map((c) => c.id),
  );
  const resize = useResizableColumns(
    "order",
    columns.map((c) => c.id),
    defaultWidths(ORDER_COLUMNS, config),
    Object.fromEntries(columns.filter((c) => c.minWidth).map((c) => [c.id, c.minWidth!])),
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
    number: (id) =>
      th(
        id,
        "Numéro",
        "number",
        <TextFilter
          label="numéro"
          value={filters.number}
          onChange={(value) => setFilters((f) => ({ ...f, number: value }))}
        />,
      ),
    status: (id) => th(id, "Statut", "status", choiceFilter("status", "statut", "Tous")),
    supplier: (id) => th(id, "Fournisseur", "supplier", choiceFilter("supplier", "fournisseur", "Tous")),
    due_date: (id) => th(id, "Échéance", "due_date", columnFilter.filter("due_date")),
    total: (id) => th(id, "Total", "total", columnFilter.filter("total")),
    actors: (id) => th(id, "Acteurs", "actors", columnFilter.filter("actors")),
    created_at: (id) => th(id, "Création", "created_at", columnFilter.filter("created_at")),
  };

  const cells: Record<ColumnKey, (order: Order, group?: Id, format?: string) => ReactNode> = {
    labels: (order, group) => (
      <Table.Td key="labels">
        <LabelsCell labels={ofGroup(order.labels, group)} />
      </Table.Td>
    ),
    number: (order) => (
      <Table.Td key="number">
        <TextCell value={orderNumber(order)} />
      </Table.Td>
    ),
    status: (order) => (
      <Table.Td key="status">
        {/* White on its color, as in the drawer. */}
        <StatusBadge status={order.status} filled />
      </Table.Td>
    ),
    supplier: (order) => (
      <Table.Td key="supplier">
        <TextCell value={order.supplier_name} />
      </Table.Td>
    ),
    due_date: (order) => (
      <Table.Td key="due_date">
        <TextCell value={order.due_date ? dayjs(order.due_date).format("DD/MM/YYYY") : ""} />
      </Table.Td>
    ),
    total: (order) => (
      <Table.Td key="total" style={{ whiteSpace: "nowrap" }}>
        <TextCell value={formatAmount(orderTotal(order.lines), order.currency)} />
      </Table.Td>
    ),
    actors: (order, _group, format) => (
      <Table.Td key="actors">
        <ActorAvatars actors={order.actors} size={ACTOR_SIZE} format={format} />
      </Table.Td>
    ),
    created_at: (order, _group, format) => (
      <Table.Td key="created_at">
        <TextCell value={formatMoment(order.created_at, format)} />
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
        {shown.map((order) => (
          <Table.Tr
            key={order.id}
            onClick={() => setDrawer({ order })}
            // As a project's row: a right click opens its menu — "Suivre".
            onContextMenu={(e) => {
              if (!follows || isEditing) return;
              e.preventDefault();
              setMenu({ order, x: e.clientX, y: e.clientY });
            }}
            style={{ cursor: "pointer" }}
          >
            {columns.map((c) => (
              <Fragment key={c.id}>{cells[c.key](order, c.group, c.format)}</Fragment>
            ))}
          </Table.Tr>
        ))}

        {shown.length === 0 && isFiltered && (
          <Table.Tr style={{ backgroundColor: "transparent" }}>
            <Table.Td colSpan={columns.length}>
              <Group gap="xs">
                <Text size="sm" c="dimmed">
                  Aucune commande ne correspond aux filtres.
                </Text>
                <UnstyledButton
                  onClick={() => {
                    setFilters(NO_FILTER);
                    labelFilter.reset();
                    columnFilter.reset();
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

        {canAdd && (
          <Table.Tr style={{ backgroundColor: "transparent" }}>
            <Table.Td colSpan={columns.length}>
              <AddButton label="Ajouter une demande de devis" onClick={() => setDrawer({ order: null })} />
            </Table.Td>
          </Table.Tr>
        )}
      </Table.Tbody>
    </Table>
  );

  if (boardId === undefined || !orders || !all) return null;

  return (
    // "N" adds one, as "Ajouter" does (lib/newShortcut).
    <NewShortcut action={"Nouvelle demande de devis"} run={canAdd ? () => setDrawer({ order: null }) : undefined}>
      {orders.length === 0 ? (
        <EmptyPanel
          icon={IconReceipt}
          message="Aucune commande"
          actionLabel={canAdd ? "Ajouter une demande de devis" : undefined}
          onAction={canAdd ? () => setDrawer({ order: null }) : undefined}
        />
      ) : (
        <GridScroll>{table}</GridScroll>
      )}

      <OrderDrawer
        opened={drawer !== null}
        onClose={() => setDrawer(null)}
        boardId={boardId}
        listKey={listKey(config)}
        config={config}
        order={shownOrder}
        userId={userId}
        onSaved={() => void reload()}
        // Created and kept open — its quote request sent —: the drawer shows it.
        onCreated={(created) => setDrawer({ order: created })}
        canSave={accessIncludes(access, "update")}
        canDelete={accessIncludes(access, "delete")}
      />

      {/* A row's menu, as a project's: "Suivre" — it stays open, the
          checkmark seen changing. */}
      {menu && follows && (
        <Menu opened onChange={(open) => !open && setMenu(null)} position="bottom-start" withinPortal shadow="md">
          <Menu.Target>
            <div style={{ position: "fixed", left: menu.x, top: menu.y, width: 1, height: 1 }} />
          </Menu.Target>
          <Menu.Dropdown>
            <Menu.Item
              leftSection={<IconEye size={16} />}
              rightSection={follows.follows.order.includes(menu.order.id) ? <IconCheck size={14} /> : null}
              onClick={() => follows.toggle("order", menu.order.id)}
              closeMenuOnClick={false}
            >
              Suivre
            </Menu.Item>
          </Menu.Dropdown>
        </Menu>
      )}
    </NewShortcut>
  );
}
