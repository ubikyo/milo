import { useEffect, useRef, useState } from "react";
import type { CSSProperties, MouseEvent, PointerEvent as ReactPointerEvent, ReactNode } from "react";
import classes from "../../assets/styles/Grid.module.css";
import type { ColumnWidth } from "./ColumnFields";
import { GAP_FIELD_HEIGHT } from "./GapField";
import WidthField from "./WidthField";

// Grid columns that can be widened or narrowed by dragging the right edge of
// their header.
//
// As long as nobody has touched it, the grid keeps its natural layout:
// each column takes the width of its content, across the whole width of the
// section. On the first drag, the displayed widths are read and
// frozen (table-layout: fixed): the dragged column follows the mouse, the others
// no longer move, and a single one takes what remains of the section. A double-click
// on a handle restores the grid's natural layout.
//
// Widths stay in the browser, per grid: it is a reading
// comfort, not a shared setting. The shared one is the widget's: its columns'
// starting widths, in pixels or percent, set in its drawer — or, in edit mode,
// above each column (WidthField), as a section's width is above it.

/** Below this, the column would show nothing but an ellipsis. */
const WIDTH_MIN = 40;
/** For a column shown later, whose width is not known yet. */
const DEFAULT_WIDTH = 150;

/** The class set on the body during a drag. */
const DRAGGING = classes.dragging ?? "";

type Widths = Record<string, number>;

/** A starting width: in pixels — a number —, or with its unit. */
type Initial = number | ColumnWidth;

const asWidth = (w: Initial): ColumnWidth => (typeof w === "number" ? { value: w, unit: "px" } : w);

/** A starting width as a "col" takes it. */
const cssWidth = (w: Initial): number | string => {
  const width = asWidth(w);
  return width.unit === "percent" ? `${width.value}%` : width.value;
};

/** The room a starting width needs, toward the grid's minimum: a percentage, the least. */
const pixelsOf = (w: Initial | undefined): number => {
  if (w === undefined) return WIDTH_MIN;
  const width = asWidth(w);
  return width.unit === "px" ? width.value : WIDTH_MIN;
};

/** The space taken by the row of width fields, above the headers. */
const WIDTH_ROW_HEIGHT = GAP_FIELD_HEIGHT + 6;

/**
 * In edit mode, what the grid's widths are saved through: "keys" are those the
 * widget's configuration sizes — not, say, the support checkbox.
 */
export interface ColumnWidthEditing {
  keys: string[];
  onWidth: (key: string, width: ColumnWidth | null) => void;
}

const storageKey = (name: string) => `milo.columns.${name}`;

/** Where this grid's widths were stored before the names were translated. */
const legacyKey = (name: string) =>
  `milo.colonnes.${name === "projects" ? "projets" : name.replace(/^inventory\./, "inventaire.")}`;

/** Renamed columns: the support checkbox used to be called "case". */
const LEGACY_COLUMNS: Record<string, string> = { case: "checkbox" };

function read(name: string): Widths | null {
  try {
    const raw = localStorage.getItem(storageKey(name));
    if (raw) return JSON.parse(raw) as Widths;
    // The old widths: carried over under their new name, once.
    const legacy = localStorage.getItem(legacyKey(name));
    if (!legacy) return null;
    const widths = Object.fromEntries(
      Object.entries(JSON.parse(legacy) as Widths).map(([id, w]) => [LEGACY_COLUMNS[id] ?? id, w]),
    );
    localStorage.setItem(storageKey(name), JSON.stringify(widths));
    localStorage.removeItem(legacyKey(name));
    return widths;
  } catch {
    return null;
  }
}

function write(name: string, widths: Widths | null) {
  try {
    if (widths) localStorage.setItem(storageKey(name), JSON.stringify(widths));
    else localStorage.removeItem(storageKey(name));
  } catch {
    // Storage refused (private browsing...): the widths hold for the page.
  }
}

const stop = (e: MouseEvent) => e.stopPropagation();

/**
 * "name" tells the grid apart in storage; "keys" lists its shown
 * columns, in the order of their headers — including those without a handle,
 * like the support checkbox.
 *
 * "initials" gives the grid, as long as nobody has touched it, starting
 * widths instead of its natural layout: the columns it names take them,
 * those it leaves out share the rest of the
 * section. Double-clicking brings it back to them.
 *
 * "mins" lowers, column by column, the narrowest width a drag reaches: a
 * column that shows only an icon.
 *
 * "editing", in edit mode, adds above the headers the row of width fields
 * ("widthRow"): a width set there goes to the widget's configuration, and the
 * grid drops the widths dragged in this browser to show it.
 */
export function useResizableColumns(
  name: string,
  keys: string[],
  initials?: Record<string, Initial>,
  mins?: Widths,
  editing?: ColumnWidthEditing,
) {
  const tableRef = useRef<HTMLTableElement>(null);
  const [widths, setWidths] = useState<Widths | null>(() => read(name));
  /** In edit mode, the column being dragged: its field above follows it. */
  const [dragged, setDragged] = useState<string | null>(null);

  // In edit mode, a width saved to the widget — by its field, or by a drag —
  // comes back in "initials": the grid then shows them, rather than the
  // widths frozen by the drag.
  const initialsKey = JSON.stringify(initials ?? null);
  const editingNow = editing !== undefined;
  useEffect(() => {
    if (editingNow) setWidths(null);
  }, [initialsKey, editingNow]);

  const widthOf = (key: string) => widths?.[key] ?? DEFAULT_WIDTH;

  /** The headers' cells: the last row of the head, under the width fields. */
  const headerCells = () => {
    const rows = tableRef.current?.tHead?.rows;
    return rows?.[rows.length - 1]?.cells;
  };

  /** A column's width on screen, in pixels or as a share of the grid. */
  const measureColumn = (key: string, unit: ColumnWidth["unit"]): number => {
    const cell = headerCells()?.[keys.indexOf(key)];
    const table = tableRef.current;
    if (!cell || !table) return unit === "percent" ? 10 : DEFAULT_WIDTH;
    const width = cell.getBoundingClientRect().width;
    return unit === "percent" ? (width / table.getBoundingClientRect().width) * 100 : width;
  };

  // The widths as displayed. Those of hidden columns are
  // kept, for the day they return.
  const measure = (): Widths => {
    const measures: Widths = { ...widths };
    const cells = headerCells();
    keys.forEach((key, i) => {
      const cell = cells?.[i];
      if (cell) measures[key] = Math.round(cell.getBoundingClientRect().width);
    });
    return measures;
  };

  const start = (key: string) => (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();

    const handle = e.currentTarget;
    const startX = e.clientX;
    let currentWidths = measure();
    const start = currentWidths[key] ?? DEFAULT_WIDTH;
    setWidths(currentWidths);
    if (editing) setDragged(key);

    handle.setPointerCapture(e.pointerId);
    handle.dataset.active = "";
    document.body.classList.add(DRAGGING);

    const move = (ev: PointerEvent) => {
      currentWidths = {
        ...currentWidths,
        [key]: Math.max(mins?.[key] ?? WIDTH_MIN, Math.round(start + ev.clientX - startX)),
      };
      setWidths(currentWidths);
    };
    const finish = () => {
      handle.removeEventListener("pointermove", move);
      handle.removeEventListener("pointerup", finish);
      handle.removeEventListener("pointercancel", finish);
      delete handle.dataset.active;
      document.body.classList.remove(DRAGGING);
      // In edit mode, the width goes to the widget, in pixels — whatever its
      // unit was —, rather than staying in this browser.
      if (editing && editing.keys.includes(key)) {
        const value = currentWidths[key] ?? DEFAULT_WIDTH;
        const before = initials?.[key];
        setDragged(null);
        // Released where it was saved: nothing comes back, the grid lets go now.
        if (before !== undefined && asWidth(before).unit === "px" && asWidth(before).value === value) {
          setWidths(null);
          return;
        }
        editing.onWidth(key, { value, unit: "px" });
        return;
      }
      write(name, currentWidths);
    };
    handle.addEventListener("pointermove", move);
    handle.addEventListener("pointerup", finish);
    handle.addEventListener("pointercancel", finish);
  };

  const reset = (e: MouseEvent) => {
    e.stopPropagation();
    setWidths(null);
    write(name, null);
  };

  // The grid spans the full width of its section, and at least the sum of the
  // columns: beyond that, the section scrolls it sideways. The remaining space
  // goes to a single column, the only one not stating its width: shrinking
  // another does not re-inflate its neighbors. It is the last one, or, when the
  // grid has starting widths, the last without one: a column in the middle,
  // left without a starting width, can still be resized by its handle.
  const flexible =
    [...keys].reverse().find((key) => initials && !initials[key]) ?? keys[keys.length - 1];
  const style: CSSProperties | undefined = widths
    ? {
        tableLayout: "fixed",
        width: "100%",
        minWidth: keys.reduce((sum, key) => sum + widthOf(key), 0),
      }
    : initials
      ? {
          tableLayout: "fixed",
          width: "100%",
          minWidth: keys.reduce((sum, key) => sum + pixelsOf(initials[key]), 0),
        }
      : undefined;

  return {
    /** To spread on the "Table". */
    tableProps: { ref: tableRef, className: classes.grid, style },
    /** To put at the head of the "Table", before "Table.Thead". */
    colgroup: widths ? (
      <colgroup>
        {keys.map((key) => (
          <col key={key} style={key !== flexible ? { width: widthOf(key) } : undefined} />
        ))}
      </colgroup>
    ) : initials ? (
      <colgroup>
        {keys.map((key) => (
          <col key={key} style={initials[key] ? { width: cssWidth(initials[key]) } : undefined} />
        ))}
      </colgroup>
    ) : null,
    /**
     * In edit mode, the row of width fields: to put first in "Table.Thead",
     * before the headers' row. Null otherwise.
     */
    widthRow: editing ? (
      <tr>
        {keys.map((key) => {
          const initial = initials?.[key];
          // Dragged, the column shows its width in pixels as it goes.
          const width =
            dragged === key && widths?.[key] !== undefined
              ? { value: widths[key], unit: "px" as const }
              : initial === undefined
                ? null
                : asWidth(initial);
          return (
            <th
              key={key}
              style={{ height: WIDTH_ROW_HEIGHT, padding: 0, overflow: "visible", border: "none" }}
            >
              {editing.keys.includes(key) && (
                <WidthField
                  subject="de la colonne"
                  value={{
                    width_unit: width?.unit ?? "auto",
                    width_value: width?.value ?? null,
                  }}
                  measure={(unit) => measureColumn(key, unit)}
                  onChange={({ width_unit, width_value }) => {
                    // The configured width shows at once: the one dragged in
                    // this browser no longer hides it.
                    setWidths(null);
                    write(name, null);
                    editing.onWidth(
                      key,
                      width_unit === "auto" || width_value === null
                        ? null
                        : { value: width_value, unit: width_unit },
                    );
                  }}
                  style={{ top: 2, left: "50%", transform: "translateX(-50%)" }}
                />
              )}
            </th>
          );
        })}
      </tr>
    ) : null,
    /** A column's handle, to put in its header. */
    handle: (key: string): ReactNode => (
      <div
        className={classes.handle}
        role="separator"
        aria-orientation="vertical"
        aria-label="Redimensionner la colonne"
        onPointerDown={start(key)}
        onClick={stop}
        onDoubleClick={reset}
      />
    ),
  };
}
