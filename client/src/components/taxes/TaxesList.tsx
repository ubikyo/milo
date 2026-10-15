import { Center, Group, Table, Text, UnstyledButton } from "@mantine/core";
import { IconChevronDown, IconChevronUp, IconPercentage, IconSelector } from "@tabler/icons-react";
import { Fragment, useContext, useMemo, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import { accessIncludes, listKey, taxLabel } from "@milo/shared";
import type { Tax } from "@milo/shared";
import { api } from "../../api";
import { useWidgetAccess } from "../../lib/rights";
import { useTaxList } from "../../lib/taxes";
import { STRONG_TEXT } from "../../themes/colors";
import { defaultWidths, keptColumns, useColumnWidthEditing } from "../ui/ColumnFields";
import type { ListColumn } from "../ui/ColumnFields";
import AddButton from "../ui/AddButton";
import { CopyPasteContext } from "../ui/CopyPasteActions";
import EmptyPanel from "../ui/EmptyPanel";
import GridWithAdd from "../ui/GridWithAdd";
import { useResizableColumns } from "../ui/useResizableColumns";
import { readSort, useGridState } from "../../lib/gridStates";
import TaxDrawer from "./TaxDrawer";

// The grid of a Taxes widget (widgets/tax): its taxes, in their order — the
// one its drawer sets, where they are entered (TaxTablesFields) —, or sorted
// by a column. Its columns chosen in the drawer: the name and the rate.
// "Ajouter une taxe" under the grid, or in its empty state, opens
// the tax's drawer (TaxDrawer) to add one at the end, as a click on a row does
// to change or delete it.

// Vertical row padding, as in the warehouses' grid: the height includes the
// padding (box-sizing).
const ROW_PADDING_Y = 5;
const ROW_HEIGHT = 28;

/** A value not given reads the same everywhere. */
const EMPTY = "—";

type ColumnKey = keyof Tax;

/** The columns the drawer offers ("Colonnes"). */
export const TAX_COLUMNS: (ListColumn & { key: ColumnKey })[] = [
  { key: "name", label: "Nom" },
  { key: "rate", label: "Taxe", defaultWidth: 100 },
];

/** A column's sort; none, the widget's order. */
interface Sort {
  key: ColumnKey;
  direction: "asc" | "desc";
}

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
  sort: Sort | null;
  onSort: (key: ColumnKey) => void;
  style?: CSSProperties;
  handle: ReactNode;
}) {
  const active = sort?.key === column;
  const Icon = !active ? IconSelector : sort.direction === "asc" ? IconChevronUp : IconChevronDown;
  return (
    <Table.Th style={style}>
      <UnstyledButton onClick={() => onSort(column)} style={{ width: "100%" }}>
        <Group gap={4} wrap="nowrap" justify={style?.textAlign === "right" ? "flex-end" : "space-between"}>
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

export default function TaxesList({ config }: { config: unknown }) {
  const boardId = useContext(CopyPasteContext)?.board?.id;
  const key = listKey(config);
  const ref = useMemo(
    () => (boardId !== undefined && key ? { board: boardId, list: key } : null),
    [boardId, key],
  );
  const { taxes, setTaxes } = useTaxList(ref);
  const [sort, setSort] = useGridState<Sort | null>("sort", null, readSort<Sort>(["name", "rate"]));

  /** The drawer: closed, adding (null), or showing the tax at this rank. */
  const [drawer, setDrawer] = useState<{ rank: number | null } | null>(null);
  const access = useWidgetAccess()("logistics");
  const canAdd = accessIncludes(access, "update") && ref !== null;

  /** Each tax with its rank in the widget's order: the drawer finds it by it. */
  const shown = useMemo(() => {
    const ranked = (taxes ?? []).map((tax, rank) => ({ tax, rank }));
    if (!sort) return ranked;
    const factor = sort.direction === "asc" ? 1 : -1;
    return ranked.sort((a, b) =>
      sort.key === "rate"
        ? (a.tax.rate - b.tax.rate) * factor
        : a.tax.name.localeCompare(b.tax.name, "fr", { numeric: true }) * factor,
    );
  }, [taxes, sort]);

  /** The list goes whole to the server, which checks it; a refusal throws. */
  const write = async (next: Tax[]) => {
    if (!ref) return;
    setTaxes(await api.updateTaxes(ref, next));
  };

  // A click on the label sorts, a second reverses the direction, a third
  // returns to the widget's order.
  const sortBy = (column: ColumnKey) =>
    setSort((current) =>
      current?.key !== column
        ? { key: column, direction: "asc" }
        : current.direction === "asc"
          ? { key: column, direction: "desc" }
          : null,
    );

  // The columns shown, in the order the configuration sets.
  const columns = keptColumns(TAX_COLUMNS, config);
  // In edit mode, the widths set above the columns go to the widget.
  const widthEditing = useColumnWidthEditing(TAX_COLUMNS, config, columns.map((c) => c.id));
  const resize = useResizableColumns(
    "tax",
    columns.map((c) => c.id),
    defaultWidths(TAX_COLUMNS, config),
    undefined,
    widthEditing,
  );

  /** Each column's title and cell; the rate on the right, as amounts. */
  const RIGHT: CSSProperties = { textAlign: "right", whiteSpace: "nowrap" };
  const header = (id: string, column: ColumnKey) => (
    <SortableTh
      key={id}
      label={column === "name" ? "Nom" : "Taxe"}
      column={column}
      sort={sort}
      onSort={sortBy}
      style={column === "rate" ? RIGHT : undefined}
      handle={resize.handle(id)}
    />
  );
  const cell = (tax: Tax, column: ColumnKey) =>
    column === "name" ? (
      <Table.Td>
        <Text size="sm" c={tax.name ? undefined : "dimmed"} truncate>
          {tax.name || EMPTY}
        </Text>
      </Table.Td>
    ) : (
      <Table.Td style={RIGHT}>
        <Text size="sm">{taxLabel(tax.rate)}</Text>
      </Table.Td>
    );

  if (!taxes) return null;

  const rank = drawer?.rank ?? null;
  const taxDrawer = (
    <TaxDrawer
      opened={drawer !== null}
      onClose={() => setDrawer(null)}
      tax={rank === null ? null : (taxes[rank] ?? null)}
      // Added at the end, changed in its place; the server refuses a rate twice.
      onSave={(tax) => write(rank === null ? [...taxes, tax] : taxes.map((t, i) => (i === rank ? tax : t)))}
      onDelete={() => write(taxes.filter((_, i) => i !== rank))}
      canSave={canAdd}
      canDelete={accessIncludes(access, "delete") && ref !== null}
    />
  );

  // With nothing to show, only the empty state, which offers to add.
  if (taxes.length === 0) {
    return (
      <>
        <EmptyPanel
          icon={IconPercentage}
          message="Aucune taxe"
          actionLabel={canAdd ? "Ajouter une taxe" : undefined}
          onAction={canAdd ? () => setDrawer({ rank: null }) : undefined}
        />
        {taxDrawer}
      </>
    );
  }

  const cellStyle = {
    boxSizing: "content-box" as const,
    height: ROW_HEIGHT,
    paddingTop: ROW_PADDING_Y,
    paddingBottom: ROW_PADDING_Y,
  };

  return (
    <>
      {/* Under the grid, "Ajouter", at the bottom of the widget (GridWithAdd). */}
      <GridWithAdd
        config={config}
        add={canAdd && <AddButton label="Ajouter une taxe" onClick={() => setDrawer({ rank: null })} />}
      >
        <Table
          {...resize.tableProps}
          highlightOnHover
          verticalSpacing={0}
          styles={{ td: cellStyle, th: { ...cellStyle, verticalAlign: "middle" } }}
        >
          {resize.colgroup}
          <Table.Thead>
            {resize.widthRow}
            <Table.Tr>{columns.map((c) => header(c.id, c.key))}</Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {shown.map(({ tax, rank }) => (
              <Table.Tr key={tax.rate} style={{ cursor: "pointer" }} onClick={() => setDrawer({ rank })}>
                {columns.map((c) => (
                  <Fragment key={c.id}>{cell(tax, c.key)}</Fragment>
                ))}
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      </GridWithAdd>
      {taxDrawer}
    </>
  );
}
