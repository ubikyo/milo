import { Center, Group, Table, Text, UnstyledButton } from "@mantine/core";
import { IconChevronDown, IconChevronUp, IconList, IconSelector } from "@tabler/icons-react";
import { useContext, useMemo, useState } from "react";
import type { CSSProperties } from "react";
import { accessIncludes, listKey, valueListEmpty, valueTypeName, valueTypeTitle } from "@milo/shared";
import type { ValueItemInput } from "@milo/shared";
import { api } from "../../api";
import { useWidgetAccess } from "../../lib/rights";
import { useValueItems } from "../../lib/value-lists";
import { STRONG_TEXT } from "../../themes/colors";
import AddButton from "../ui/AddButton";
import { CopyPasteContext } from "../ui/CopyPasteActions";
import EmptyPanel from "../ui/EmptyPanel";
import GridWithAdd from "../ui/GridWithAdd";
import ValueItemDrawer from "./ValueItemDrawer";
import { readChoice, useGridState } from "../../lib/gridStates";

// The grid of a Liste widget (widgets/value): its items' names, in the order
// they were added, or sorted. "Ajouter {type}" under the grid, or
// in its empty state, under "Aucun {type}", opens the item's drawer
// (ValueItemDrawer) to add one at the end, as a click on a row does to change
// it.

// Vertical row padding, as in the taxes' grid: the height includes the
// padding (box-sizing).
const ROW_PADDING_Y = 5;
const ROW_HEIGHT = 28;

/** The sort by name; none, the widget's order. */
type Sort = "asc" | "desc" | null;

export default function ValuesList({ config }: { config: unknown }) {
  const boardId = useContext(CopyPasteContext)?.board?.id;
  const key = listKey(config);
  const ref = useMemo(
    () => (boardId !== undefined && key ? { board: boardId, list: key } : null),
    [boardId, key],
  );
  const { items, setItems } = useValueItems(ref);
  const [sort, setSort] = useGridState<Sort>("sort", null, readChoice<"asc" | "desc">(["asc", "desc"]));
  /** The drawer: closed, adding (null), or showing the item at this rank. */
  const [drawer, setDrawer] = useState<{ rank: number | null } | null>(null);
  const access = useWidgetAccess()("objects");
  const canAdd = accessIncludes(access, "update") && ref !== null;
  const type = valueTypeName(config);

  /** Each item with its rank in the widget's order: the drawer finds it by it. */
  const shown = useMemo(() => {
    const ranked = (items ?? []).map((item, rank) => ({ item, rank }));
    if (!sort) return ranked;
    const factor = sort === "asc" ? 1 : -1;
    return ranked.sort((a, b) => a.item.name.localeCompare(b.item.name, "fr", { numeric: true }) * factor);
  }, [items, sort]);

  // A click on the title sorts, a second reverses the direction, a third
  // returns to the widget's order.
  const sortNext = () => setSort((s) => (s === null ? "asc" : s === "asc" ? "desc" : null));

  /** The list goes whole to the server, which checks it; a refusal throws. */
  const write = async (next: ValueItemInput[]) => {
    if (!ref) return;
    setItems(await api.updateValueItems(ref, next));
  };

  if (!items) return null;

  const rank = drawer?.rank ?? null;
  const itemDrawer = (
    <ValueItemDrawer
      opened={drawer !== null}
      onClose={() => setDrawer(null)}
      type={type}
      title={valueTypeTitle(config)}
      item={rank === null ? null : (items[rank] ?? null)}
      // Added at the end, its id drawn by the server; changed in its place,
      // its id kept.
      onSave={(name) =>
        write(rank === null ? [...items, { name }] : items.map((it, i) => (i === rank ? { ...it, name } : it)))
      }
      onDelete={() => write(items.filter((_, i) => i !== rank))}
      canSave={canAdd}
      canDelete={accessIncludes(access, "delete") && ref !== null}
    />
  );

  // With nothing to show, only the empty state, which offers to add.
  if (items.length === 0) {
    return (
      <>
        <EmptyPanel
          icon={IconList}
          message={valueListEmpty(config)}
          actionLabel={canAdd ? `Ajouter ${type}` : undefined}
          onAction={canAdd ? () => setDrawer({ rank: null }) : undefined}
        />
        {itemDrawer}
      </>
    );
  }

  const cellStyle: CSSProperties = {
    boxSizing: "content-box",
    height: ROW_HEIGHT,
    paddingTop: ROW_PADDING_Y,
    paddingBottom: ROW_PADDING_Y,
  };
  const SortIcon = sort === null ? IconSelector : sort === "asc" ? IconChevronUp : IconChevronDown;

  return (
    <>
      {/* Under the grid, "Ajouter", at the bottom of the widget (GridWithAdd). */}
      <GridWithAdd
        config={config}
        add={canAdd && <AddButton label={`Ajouter ${type}`} onClick={() => setDrawer({ rank: null })} />}
      >
        <Table
          highlightOnHover
          verticalSpacing={0}
          styles={{ td: cellStyle, th: { ...cellStyle, verticalAlign: "middle" } }}
        >
          <Table.Thead>
            <Table.Tr>
              <Table.Th>
                <UnstyledButton onClick={sortNext} style={{ width: "100%" }}>
                  <Group gap={4} wrap="nowrap" justify="space-between">
                    {/* The column's title: what the list holds. */}
                    <Text size="sm" fw={600} c={STRONG_TEXT}>
                      {valueTypeTitle(config)}
                    </Text>
                    <Center c={sort ? undefined : "dimmed"}>
                      <SortIcon size={14} />
                    </Center>
                  </Group>
                </UnstyledButton>
              </Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {shown.map(({ item, rank }) => (
              <Table.Tr key={item.id} style={{ cursor: "pointer" }} onClick={() => setDrawer({ rank })}>
                <Table.Td>
                  <Text size="sm" truncate>
                    {item.name}
                  </Text>
                </Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      </GridWithAdd>
      {itemDrawer}
    </>
  );
}
