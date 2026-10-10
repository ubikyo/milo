import { Group, Input, NumberInput, Select, Stack } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import dayjs from "dayjs";
import { IconChevronDown } from "@tabler/icons-react";
import { useContext, useState } from "react";
import type { DragEvent } from "react";
import classes from "../../assets/styles/ColumnFields.module.css";
import { WidgetConfigContext, useIsEditing } from "../../lib/editing";
import { useLabelGroups } from "../../lib/label-groups";
import type { ColumnWidthEditing } from "./useResizableColumns";
import { withField } from "../../widgets/types";
import type { IndicatorConfigProps } from "../../widgets/support/types";
import type { Id, LabelsBase } from "@milo/shared";
import {
  ROUNDING,
  INPUT_BACKGROUND,
  Handle,
  ListFooter,
  RowCheckbox,
  RowCheckboxSpace,
  useRowSelection,
  NAME_INSET,
  INPUT_INSET,
  INPUT_STYLE,
  move,
  numberKeys,
  pickKeys,
  rowStyle,
} from "./DrawerRows";

// The columns of a list widget — projects, Support requests, Assets positions:
// which ones it shows, in what order, and at what default width.
//
// Each shown column is a row: its handle to drag it elsewhere, its name, its
// width. The name is a select: a click opens the list of columns, to replace it
// with another one. Its box, after the handle, selects it: the checked rows
// are removed together, from the button that takes the place of "Ajouter une
// colonne" meanwhile. That button adds an empty row at the end, where you pick
// which one. A column can appear as many times as you like; the list keeps at
// least one: the last one cannot be removed.
//
// The width is the one the grid uses as long as nobody has dragged their
// columns: everyone can still adjust them for themselves, and double-clicking a
// grid handle brings them back to it. When empty, the column takes the width of
// its content.
//
// A labels column also says which group it shows — or all of them —: a second
// select, after its name.

export interface ListColumn {
  key: string;
  label: string;
  /** The kind of labels it shows, when it shows labels: it then picks a group. */
  labelGroups?: LabelsBase;
  /**
   * Its narrowest width, when it shows less than a text — an icon: below the
   * common minimum (WIDTH_MIN).
   */
  minWidth?: number;
  /**
   * The ways it may show its value, the first by default: a path's
   * (PATH_FORMATS), a date's (DATE_FORMATS). Chosen beside its width.
   */
  formats?: readonly ColumnFormat[];
}

/** A way a column shows its value. */
export interface ColumnFormat {
  value: string;
  label: string;
}

/** A tree's place — a category, a location —: its whole path, or itself. */
export const PATH_FORMATS = [
  { value: "path", label: "Chemin complet" },
  { value: "leaf", label: "Élément final" },
] as const;

/** A moment: its date and time, its date, or its time. */
export const DATE_FORMATS = [
  { value: "datetime", label: "Date et heure" },
  { value: "date", label: "Date" },
  { value: "time", label: "Heure" },
] as const;

const DATE_PATTERNS: Record<string, string> = {
  datetime: "DD/MM/YYYY HH:mm",
  date: "DD/MM/YYYY",
  time: "HH:mm",
};

/** A moment as a date column shows it, in its format: "Date et heure" by default. */
export const formatMoment = (value: string, format?: string): string =>
  dayjs(value).format(DATE_PATTERNS[format ?? ""] ?? DATE_PATTERNS.datetime);

/** A place as a path column shows it: its whole path by default, or its own name. */
export const formatPath = (path: string, name: string, format?: string): string =>
  format === "leaf" ? name : path;

/**
 * A shown column: "id" tells it apart from its duplicates in the grid. "group",
 * for a labels column, is the group it shows; absent, all of them.
 */
export type ShownColumn<C extends ListColumn> = C & {
  id: string;
  width?: number;
  /** The unit of "width": pixels unless it says percent. */
  unit?: ColumnWidthUnit;
  group?: Id;
  /** One of its "formats"; absent, the first. */
  format?: string;
};

/** A column's set width: in pixels, or a percentage of the grid. */
export type ColumnWidthUnit = "px" | "percent";

export interface ColumnWidth {
  value: number;
  unit: ColumnWidthUnit;
}

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
  /** Stored only for a percentage: a width without it is in pixels. */
  unit?: "percent";
  /** A labels column's group; absent for all of them. */
  group?: Id;
  /** One of the column's formats; absent, its first. */
  format?: string;
}

/**
 * The column list shows only five options at a time, then scrolls: an option of
 * size "sm" measures 33.6875 px.
 */
export const VISIBLE_OPTIONS = 5;
export const OPTION_HEIGHT = 33.6875;

/** The group option of a labels column that shows them all. */
const ALL_GROUPS = "all";

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

const readWidth = (value: unknown, min = WIDTH_MIN, unit: ColumnWidthUnit = "px"): number | undefined =>
  typeof value === "number" && value >= (unit === "percent" ? 1 : min) && (unit === "px" || value <= 100)
    ? value
    : undefined;

/** A stored format, if its column offers it. */
const formatOf = (columns: ListColumn[], key: string, format: unknown): string | undefined =>
  columns.find((c) => c.key === key)?.formats?.some((f) => f.value === format)
    ? (format as string)
    : undefined;

/** A column's narrowest width: its own, or the common one. */
const minOf = (columns: ListColumn[], key: string): number =>
  columns.find((c) => c.key === key)?.minWidth ?? WIDTH_MIN;

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
    .map((c) => ({ key: c.key, width: readWidth(widths[c.key], c.minWidth) }));
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
        .map((e) => {
          const unit = e.unit === "percent" ? ("percent" as const) : undefined;
          const width = readWidth(e.width, minOf(columns, e.key), unit ?? "px");
          return {
            key: e.key,
            width,
            ...(unit && width !== undefined ? { unit } : {}),
            ...(typeof e.group === "number" ? { group: e.group } : {}),
            ...(formatOf(columns, e.key, e.format) ? { format: e.format } : {}),
          };
        })
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
    unit: e.unit ?? "px",
    group: e.group,
    format: e.format,
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
): Record<string, ColumnWidth> | undefined => {
  const widths = Object.fromEntries(
    keptColumns(columns, config)
      .filter((c) => c.width !== undefined)
      .map((c) => [c.id, { value: c.width!, unit: c.unit ?? "px" }]),
  );
  return Object.keys(widths).length > 0 ? widths : undefined;
};

/**
 * The configuration with one shown column's width changed — "null": auto —,
 * by its identifier in the grid. Set from the grid's header in edit mode.
 */
export const withColumnWidth = (
  columns: ListColumn[],
  config: unknown,
  id: string,
  width: ColumnWidth | null,
): Record<string, unknown> => {
  const list = entries(columns, config);
  const ids = identifiers(list);
  const next = list.map((e, i) => {
    if (ids[i] !== id) return e;
    const { width: _width, unit: _unit, ...rest } = e;
    if (!width) return rest;
    return { ...rest, width: width.value, ...(width.unit === "percent" ? { unit: "percent" as const } : {}) };
  });
  return withField(config, LIST_COLUMNS, next);
};

/**
 * In edit mode, with its sections unlocked, how a grid saves the widths set
 * above its columns — "ids", its shown columns' identifiers —: into its
 * widget's configuration, as its drawer would. Undefined otherwise.
 */
export const useColumnWidthEditing = (
  columns: ListColumn[],
  config: unknown,
  ids: string[],
): ColumnWidthEditing | undefined => {
  const editing = useIsEditing();
  const widget = useContext(WidgetConfigContext);
  if (!editing || !widget || widget.locked) return undefined;
  return {
    keys: ids,
    onWidth: (id, width) => void widget.onChange(withColumnWidth(columns, config, id, width)),
  };
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
  const selection = useRowSelection(ids);

  /** The displayed rows: the list, and at the end the one being added. */
  const rows = adding ? [...list, { key: "" }] : list;
  const columnOf = (key: string) => columns.find((c) => c.key === key);
  const store = (next: Entry[]) => onChange(withField(config, LIST_COLUMNS, next));

  // The last remaining column cannot be removed: the list shows at least one.
  const last = list.length === 1;

  /**
   * Removes the checked rows. When all of them are checked, the first one
   * stays: the list keeps at least one column. It is not left checked — as the
   * last column, it no longer has a box.
   */
  const removeChecked = () => {
    const checked = new Set(selection.checked);
    const all = checked.size === list.length;
    const kept = all ? list.findIndex((_, i) => checked.has(ids[i]!)) : -1;
    const next = list.filter((_, i) => i === kept || !checked.has(ids[i]!));
    if (all) {
      notifications.show({
        color: "orange",
        title: "Suppression impossible",
        message: "La liste garde au moins une colonne.",
      });
    }
    store(next);
    selection.reset();
  };

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

  // The width keeps its unit: typed in pixels, or in percent once set so.
  const changeWidth = (rank: number, value: string | number) =>
    store(
      list.map((e, i) => {
        if (i !== rank) return e;
        const width = readWidth(value, minOf(columns, e.key), e.unit ?? "px");
        const { unit: _unit, ...rest } = e;
        return { ...rest, width, ...(width !== undefined && e.unit ? { unit: e.unit } : {}) };
      }),
    );

  // A labels column's group: "all" stores none.
  const groups = useLabelGroups(columns.find((c) => c.labelGroups)?.labelGroups);
  const changeGroup = (rank: number, value: string | null) =>
    store(
      list.map((e, i) =>
        i === rank
          ? {
              key: e.key,
              width: e.width,
              ...(e.unit ? { unit: e.unit } : {}),
              ...(value && value !== ALL_GROUPS ? { group: Number(value) } : {}),
              ...(e.format ? { format: e.format } : {}),
            }
          : e,
      ),
    );

  // A column's format: its first is stored as none.
  const changeFormat = (rank: number, value: string | null) =>
    store(
      list.map((e, i) => {
        if (i !== rank) return e;
        const { format: _format, ...rest } = e;
        const first = columnOf(e.key)?.formats?.[0]?.value;
        return value && value !== first ? { ...rest, format: value } : rest;
      }),
    );

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
              {newRow || last ? (
                // Neither the added row nor the last column can be removed: an
                // empty space keeps the names aligned.
                <RowCheckboxSpace afterHandle />
              ) : (
                <RowCheckbox
                  label={`Sélectionner ${column.label}`}
                  checked={selection.isChecked(ids[rank]!)}
                  onChange={(on) => selection.toggle(ids[rank]!, on)}
                  afterHandle
                />
              )}
              <Select
                // The text has the size of the names.
                size="sm"
                radius={ROUNDING}
                // The field keeps the same inset as the width field, top and
                // bottom, and extends over its left inset: the name stays
                // aligned with the checkbox.
                style={{ flex: 1, marginLeft: -NAME_INSET }}
                data={options}
                value={entry.key || null}
                placeholder="Choisir une colonne"
                onChange={(value) => replaceExisting(rank, value)}
                // The added row, left without a column, disappears.
                onBlur={() => newRow && setAdding(false)}
                {...pickKeys}
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
                    paddingLeft: INPUT_INSET,
                    cursor: "pointer",
                    ...(isOpen === rank ? { backgroundColor: INPUT_BACKGROUND } : {}),
                  },
                }}
                classNames={{ option: classes.option }}
                aria-label={newRow ? "Colonne à ajouter" : `Colonne ${column.label}`}
              />
              {/* A labels column: which group it shows. */}
              {"labelGroups" in column && column.labelGroups && (
                <Select
                  size="xs"
                  radius={ROUNDING}
                  w={150}
                  ml={-6}
                  data={[
                    { value: ALL_GROUPS, label: "Tous les groupes" },
                    ...groups.map((g) => ({ value: String(g.id), label: g.name })),
                  ]}
                  value={entry.group === undefined ? ALL_GROUPS : String(entry.group)}
                  // A group deleted since then matches no option.
                  placeholder="Groupe supprimé"
                  onChange={(value) => changeGroup(rank, value)}
                  allowDeselect={false}
                  comboboxProps={{ shadow: "md" }}
                  aria-label={`Groupe de la colonne ${column.label}`}
                />
              )}
              {/* A path's or a date's column: how it shows its value. */}
              {"formats" in column && column.formats && (
                <Select
                  size="xs"
                  radius={ROUNDING}
                  w={150}
                  ml={-6}
                  data={column.formats.map((f) => ({ value: f.value, label: f.label }))}
                  value={entry.format ?? column.formats[0]?.value ?? null}
                  onChange={(value) => changeFormat(rank, value)}
                  allowDeselect={false}
                  comboboxProps={{ shadow: "md" }}
                  aria-label={`Affichage de la colonne ${column.label}`}
                />
              )}
              <NumberInput
                size="xs"
                radius={ROUNDING}
                disabled={newRow}
                w={100}
                // Closer to the column it sizes than the row's usual gap.
                ml={-6}
                placeholder="Auto"
                suffix={entry.unit === "percent" ? " %" : " px"}
                min={entry.unit === "percent" ? 1 : (column.minWidth ?? WIDTH_MIN)}
                max={entry.unit === "percent" ? 100 : 1200}
                allowDecimal={false}
                allowNegative={false}
                aria-label={`Largeur de la colonne ${column.label}`}
                value={entry.width ?? ""}
                onChange={(value) => changeWidth(rank, value)}
                {...numberKeys((value) => changeWidth(rank, value))}
                onFocus={() => setInput(rank)}
                onBlur={() => setInput(null)}
                styles={input === rank ? { input: INPUT_STYLE } : undefined}
              />
            </Group>
          );
        })}
      </Stack>

      {/* As close as possible to the list it extends. */}
      <ListFooter
        addLabel="Ajouter une colonne"
        onAdd={add}
        checkedCount={selection.checked.length}
        onDeleteChecked={removeChecked}
      />
    </Input.Wrapper>
  );
}
