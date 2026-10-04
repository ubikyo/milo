import { Group, Input, Menu, NumberInput, Select, Stack } from "@mantine/core";
import { IconChevronDown, IconTrash } from "@tabler/icons-react";
import { useState } from "react";
import type { DragEvent } from "react";
import classes from "../../assets/styles/ColumnFields.module.css";
import { RED } from "../../themes/colors";
import { withField } from "../../widgets/types";
import type { IndicatorConfigProps } from "../../indicators/types";
import AddButton from "./AddButton";
import {
  ROUNDING,
  INPUT_BACKGROUND,
  Handle,
  NAME_INSET,
  INPUT_STYLE,
  move,
  rowStyle,
} from "./DrawerRows";
import PointMenu, { menuPosition, type PointMenuPosition } from "./PointMenu";

// The columns of a list widget — projects, Support requests, Assets positions:
// which ones it shows, in what order, and at what default width.
//
// Each shown column is a row: its handle to drag it elsewhere, its name, its
// width. The name is a select: a click opens the list of columns, to replace it
// with another one. A right click removes it ("Supprimer"). "Ajouter une
// colonne" adds an empty row at the end, where you pick which one. A column can
// appear as many times as you like; the list keeps at least one: the last one
// cannot be removed.
//
// The width is the one the grid uses as long as nobody has dragged their
// columns: everyone can still adjust them for themselves, and double-clicking a
// grid handle brings them back to it. When empty, the column takes the width of
// its content.

export interface ListColumn {
  key: string;
  label: string;
}

/** A shown column: "id" tells it apart from its duplicates in the grid. */
export type ShownColumn<C extends ListColumn> = C & { id: string; width?: number };

/** The shown columns, in order: one entry per row of the list. */
export const LIST_COLUMNS = "columns";

// The settings from before the list existed: one boolean per column, their
// order, their widths. Read back as long as the list has not been saved.
const COLUMNS = "column_visibility";
const COLUMNS_ORDER = "column_order";
const COLUMN_WIDTHS = "column_widths";

interface Entry {
  key: string;
  width?: number;
}

/**
 * The column list shows only five options at a time, then scrolls: an option of
 * size "sm" measures 33.6875 px.
 */
const VISIBLE_OPTIONS = 5;
const OPTION_HEIGHT = 33.6875;

/** Below this, the column would show only an ellipsis — as in the grid. */
const WIDTH_MIN = 40;

const field = (config: unknown, key: string): unknown =>
  (config as Record<string, unknown> | null)?.[key];

const subject = (config: unknown, key: string): Record<string, unknown> => {
  const value = field(config, key);
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
};

const readWidth = (value: unknown): number | undefined =>
  typeof value === "number" && value >= WIDTH_MIN ? value : undefined;

/** The entries from before the list existed: the non-hidden columns, in the configured order. */
const legacyEntries = (columns: ListColumn[], config: unknown): Entry[] => {
  const raw = field(config, COLUMNS_ORDER);
  const order = Array.isArray(raw) ? raw.filter((k): k is string => typeof k === "string") : [];
  const rank = (c: ListColumn) => {
    const i = order.indexOf(c.key);
    return i === -1 ? order.length + columns.indexOf(c) : i;
  };
  const hiddenItems = subject(config, COLUMNS);
  const widths = subject(config, COLUMN_WIDTHS);
  return [...columns]
    .sort((a, b) => rank(a) - rank(b))
    .filter((c) => hiddenItems[c.key] !== false)
    .map((c) => ({ key: c.key, width: readWidth(widths[c.key]) }));
};

/**
 * The configuration's entries, known ones only. Without a list — or without any
 * known column — all the columns.
 */
const entries = (columns: ListColumn[], config: unknown): Entry[] => {
  const raw = field(config, LIST_COLUMNS);
  const readItems: Entry[] = Array.isArray(raw)
    ? raw
        .filter(
          (e): e is Entry =>
            Boolean(e) && typeof e === "object" && columns.some((c) => c.key === e.key),
        )
        .map((e) => ({ key: e.key, width: readWidth(e.width) }))
    : legacyEntries(columns, config);
  return readItems.length > 0 ? readItems : columns.map((c) => ({ key: c.key }));
};

/** The identifier of each entry: its key, followed by its rank for a duplicate. */
const identifiers = (list: Entry[]): string[] => {
  const views = new Map<string, number>();
  return list.map(({ key }) => {
    const n = (views.get(key) ?? 0) + 1;
    views.set(key, n);
    return n === 1 ? key : `${key}~${n}`;
  });
};

/** The columns the configuration shows, in its order; with no setting, all of them. */
export const keptColumns = <C extends ListColumn>(
  columns: C[],
  config: unknown,
): ShownColumn<C>[] => {
  const list = entries(columns, config);
  const ids = identifiers(list);
  return list.map((e, i) => ({
    ...columns.find((c) => c.key === e.key)!,
    id: ids[i]!,
    width: e.width,
  }));
};

/**
 * The default widths the configuration gives, by identifier, for the grid
 * (useResizableColumns); "undefined" when it gives none — the grid then keeps
 * its natural layout.
 */
export const defaultWidths = (
  columns: ListColumn[],
  config: unknown,
): Record<string, number> | undefined => {
  const widths = Object.fromEntries(
    keptColumns(columns, config)
      .filter((c) => c.width !== undefined)
      .map((c) => [c.id, c.width!]),
  );
  return Object.keys(widths).length > 0 ? widths : undefined;
};

export default function ColumnFields({
  columns,
  config,
  onChange,
}: IndicatorConfigProps & { columns: ListColumn[] }) {
  const list = entries(columns, config);
  const ids = identifiers(list);
  /** The rank of the row being dragged. */
  const [held, setHeld] = useState<number | null>(null);
  /** True while an added row waits for its column, at the end of the list. */
  const [adding, setAdding] = useState(false);
  /** The rank of the row whose column list is open. */
  const [isOpen, setOpened] = useState<number | null>(null);
  /** The rank of the row whose width has focus: its field takes the drawer background. */
  const [input, setInput] = useState<number | null>(null);
  /** The right-click menu, and the rank of the row it targets. */
  const [menu, setMenu] = useState<{ rank: number; position: PointMenuPosition } | null>(null);

  /** The displayed rows: the list, and at the end the one being added. */
  const rows = adding ? [...list, { key: "" }] : list;
  const columnOf = (key: string) => columns.find((c) => c.key === key);
  const store = (next: Entry[]) => onChange(withField(config, LIST_COLUMNS, next));

  // The last remaining column cannot be removed: the list shows at least one.
  const last = list.length === 1;

  const remove = (rank: number) => store(list.filter((_, i) => i !== rank));

  // The new row is placed at the end, empty: this is where you say which column
  // you wanted. It enters the configuration only once a column is chosen; left
  // without a choice, it disappears.
  const add = () => setAdding(true);

  // Another column in the same place: its width starts over from zero. On the
  // added row, the chosen column joins the list.
  const replaceExisting = (rank: number, key: string | null) => {
    setAdding(false);
    if (!key) return;
    if (rank === list.length) return store([...list, { key }]);
    if (key === list[rank]?.key) return;
    store(list.map((e, i) => (i === rank ? { key } : e)));
  };

  const changeWidth = (rank: number, value: string | number) =>
    store(list.map((e, i) => (i === rank ? { key: e.key, width: readWidth(value) } : e)));

  // The held row takes the place of the one it hovers: the list reorders under
  // the pointer, and the configuration follows.
  const dragHover = (e: DragEvent<HTMLElement>, rank: number) => {
    if (held === null) return;
    e.preventDefault();
    const next = move(list, held, rank);
    if (!next) return;
    setHeld(rank);
    store(next);
  };

  const options = columns.map((c) => ({ value: c.key, label: c.label }));

  return (
    <Input.Wrapper label="Colonnes">
      {/* The same gap under the label as the other fields have. */}
      <Stack gap={1}>
        {rows.map((entry, rank) => {
          // The added row has no column yet.
          const column = columnOf(entry.key) ?? { key: "", label: "" };
          const newRow = rank === list.length;
          return (
            <Group
              key={newRow ? "new" : ids[rank]}
              gap="sm"
              wrap="nowrap"
              onDragOver={(e) => dragHover(e, rank)}
              onDrop={(e) => e.preventDefault()}
              onContextMenu={(e) => {
                if (newRow || last) return;
                setMenu({ rank, position: menuPosition(e) });
              }}
              style={rowStyle(rank, rows.length, held === rank)}
            >
              <Handle
                label={`Déplacer la colonne ${column.label}`}
                // The added row neither moves nor can be adjusted until it has
                // a column.
                active={!newRow}
                onDragStart={() => setHeld(rank)}
                onDragEnd={() => setHeld(null)}
              />
              <Select
                // The text has the size of the names.
                size="sm"
                radius={ROUNDING}
                // The field keeps the same inset as the width field, top and
                // bottom, and extends over its left inset: the name stays
                // aligned with the handle.
                style={{ flex: 1, marginLeft: -NAME_INSET }}
                data={options}
                value={entry.key || null}
                placeholder="Choisir une colonne"
                onChange={(value) => replaceExisting(rank, value)}
                // The added row, left without a column, disappears.
                onBlur={() => newRow && setAdding(false)}
                onDropdownOpen={() => setOpened(rank)}
                onDropdownClose={() => setOpened(null)}
                allowDeselect={false}
                autoFocus={newRow}
                // A classic select: the chevron always there, the list opened
                // on click.
                rightSection={<IconChevronDown size={14} />}
                rightSectionPointerEvents="none"
                // The list looks like the label color palette: a floating
                // Mantine panel, with a border and a shadow.
                comboboxProps={{ shadow: "md" }}
                maxDropdownHeight={VISIBLE_OPTIONS * OPTION_HEIGHT}
                styles={{
                  // The field looks like the width one: its background, and the
                  // drawer's while the list is open.
                  input: {
                    height: "var(--input-height-xs)",
                    minHeight: "var(--input-height-xs)",
                    // Without a border, the text aligns with the other names.
                    borderWidth: 0,
                    paddingLeft: NAME_INSET,
                    cursor: "pointer",
                    ...(isOpen === rank ? { backgroundColor: INPUT_BACKGROUND } : {}),
                  },
                }}
                classNames={{ option: classes.option }}
                aria-label={newRow ? "Colonne à ajouter" : `Colonne ${column.label}`}
              />
              <NumberInput
                size="xs"
                radius={ROUNDING}
                disabled={newRow}
                w={100}
                placeholder="Auto"
                suffix=" px"
                min={WIDTH_MIN}
                max={1200}
                allowDecimal={false}
                allowNegative={false}
                aria-label={`Largeur de la colonne ${column.label}`}
                value={entry.width ?? ""}
                onChange={(value) => changeWidth(rank, value)}
                onFocus={() => setInput(rank)}
                onBlur={() => setInput(null)}
                styles={input === rank ? { input: INPUT_STYLE } : undefined}
              />
            </Group>
          );
        })}
      </Stack>

      {/* As close as possible to the list it extends. */}
      <AddButton label="Ajouter une colonne" onClick={add} mt={4} />

      {menu && (
        <PointMenu position={menu.position} onClose={() => setMenu(null)}>
          <Menu.Item
            color={RED}
            leftSection={<IconTrash size={16} />}
            onClick={() => remove(menu.rank)}
          >
            Supprimer
          </Menu.Item>
        </PointMenu>
      )}
    </Input.Wrapper>
  );
}
