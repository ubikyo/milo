import { Box, Center, Group, Menu, ScrollArea } from "@mantine/core";
import { useWidgetAccess } from "../../lib/rights";
import {
  IconClipboard,
  IconColumns,
  IconCopyPlus,
  IconGripHorizontal,
  IconTrash,
} from "@tabler/icons-react";
import { Fragment, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { CSSProperties, PointerEvent as ReactPointerEvent, ReactNode } from "react";
import { RED } from "../../themes/colors";
import { PAGE_GUTTER } from "../../themes/layout";
import { PLUS_SIZE } from "../../themes/plus";
import AddButton from "./AddButton";
import ColumnInsert, { COLUMN_INSERT_ZONE as INSERT_ZONE } from "./ColumnInsert";
import DeleteConfirmModal from "./DeleteConfirmModal";
import GapField, { GAP_FIELD_HEIGHT, GAP_FIELD_WIDTH } from "./GapField";
import EmptyPanel from "./EmptyPanel";
import WidthField from "./WidthField";
import PointMenu, { menuPosition, type PointMenuPosition } from "./PointMenu";
import SectionDropZone, { DOTTED } from "./SectionDropZone";
import WidgetDrawer, { type WidgetChoice } from "./WidgetDrawer";
import { InsertionLine, type WidgetDrag } from "./WidgetDrop";
import { canUse } from "@milo/shared";
import type { Id, SectionWidthUnit } from "@milo/shared";

// Sections as columns, and the widgets they hold. This is the row of Access
// mode — the sections of a category — and of Support and Assets modes, where
// the list is one widget among the indicators.
//
// A section has a width — left to the row, or fixed in percent or in
// pixels — and the gap that separates it from the next one, both entered at
// the foot of the column. It is dragged by its top handle to change rank,
// inserted between two others by the "+" that appears when hovering the
// gap — dragged, that gap resizes whichever of its two neighbors is in
// pixels, the left one first —, and its right click duplicates or
// deletes it. When empty, it shows an add zone.
//
// A widget is added from the left drawer (WidgetDrawer), opened by the
// zone of an empty column and by "Ajouter un widget", at the bottom right of
// the page: it is dragged to where it should land, like a widget already placed.
//
// What the section holds does not belong to this row: "renderWidgets"
// draws it, and receives the widgets' drag, which the row owns because
// a widget is picked up in one section and dropped in another.
// When locked, the row is read-only: no frame, no handle, no add.

/** What the row reads from a section. */
export interface BoardSection {
  id: Id;
  width_unit: SectionWidthUnit;
  width_value: number | null;
  /** The gap separating it from the next section, in pixels. */
  gap: number;
}

interface SectionsBoardProps<S extends BoardSection> {
  /** "null" until the sections are read; nothing is displayed meanwhile. */
  sections: S[] | null;
  locked: boolean;
  /**
   * Unlock the row. With it, an empty locked row still offers to add a
   * section: the gesture unlocks it first. Without it — frozen for lack of
   * permission —, it offers nothing.
   */
  onUnlock?: () => void | Promise<void>;
  /** The widgets of a section, in order: the drop is computed on them. */
  widgetIds: (section: S) => Id[];
  /** What the section holds. "drag" is inert for the copies that follow the pointer. */
  renderWidgets: (section: S, drag: WidgetDrag) => ReactNode;
  /** What the left drawer offers, in order. */
  widgets: WidgetChoice[];
  /** A drawer widget dropped in this section, at this position. */
  onCreateWidget: (section: S, type: string, index: number) => void | Promise<void>;
  /** What the section now holds, in order: the arrangement goes to the server. */
  onReorderWidgets: (sectionId: Id, ids: Id[]) => void | Promise<void>;
  /** Without a rank, the section goes to the end; the "+" between two columns gives one. */
  onAddSection: (index?: number) => void;
  /** The copy, with its widgets, lands to the right of the original. */
  onDuplicateSection: (section: S) => void | Promise<void>;
  /**
   * The copied widget (lib/clipboard.ts), to paste at the end of a section:
   * its name, and what is needed to place it. Without it, the menu does not
   * offer pasting.
   */
  paste?: { label: string; onPaste: (section: S) => void | Promise<void> };
  /**
   * A widget dropped on the trash, which appears to the left of "Ajouter un
   * widget" while dragging. Without it, no trash.
   */
  onDeleteWidget?: (id: Id) => void;
  /** Deleted from the right click: the row has already asked the question. */
  onDeleteSection: (section: S) => void | Promise<void>;
  /** The new order of the columns, set by their handle. */
  onReorderSections: (ids: Id[]) => void | Promise<void>;
  /** What is set at the foot of the column: its width, the gap that follows it. */
  onChangeSection: (section: S, change: EditSection) => void | Promise<void>;
}

/** What the foot of a column changes: its width, or the gap that follows it. */
export type EditSection = Partial<Pick<BoardSection, "width_unit" | "width_value" | "gap">>;

// Width below which an automatic column no longer shrinks. Lacking that
// room, it disappears rather than sending its neighbors to the next
// line.
const SECTION_MIN_WIDTH = 20;

// Tolerance of the width calculations: the browser places columns to the
// half pixel.
const ROUNDING = 0.5;

// "Ajouter un widget", placed to the left of the logo that shows the
// shortcuts (ShortcutsHelp): at its height — that of a "lg" ActionIcon — and
// the space separating them.
const HELP_SIZE = 34;
const HELP_OFFSET = 10;
// Between the button and the logo, 10 px more.
const HELP_GAP = HELP_OFFSET + 10;

// What the row holds when the widget comes from the drawer: it has no id
// yet, and no placed widget has this one.
const NEW_VALUE: Id = -1;

// Travel below which pressing the handle remains a click.
const DRAG_THRESHOLD = 5;

// The size of the handle icons.
const GRIP_SIZE = 16;

// The minimum gap between the frame line and what sits next to it: the
// gap's "+", a handle's icon.
const LINE_GAP = 2;

// The band the handle occupies at the top of each column, outside the frame —
// the icon, at its distance from the line —, and that of the foot, at the same
// height, where the width and gap are set. It is kept even
// when locked, so the content does not move when switching from editing to
// reading.
const GRIP_ZONE = GRIP_SIZE + 2 * LINE_GAP;

// The space between the frame line and the content, at top and bottom.
const FRAME_PADDING = 8;

// What tops the content of a column: the handle band and the space
// under the line. It takes no room above the widgets: the column
// carries it as overflow, and the scroll zone moves up by as much to
// show it — sections thus start just under the row's margin.
const TOP_BAND = GRIP_ZONE + FRAME_PADDING;

/**
 * The CSS variable that carries a column's visible height to its widgets: a
 * height in percent is a share of it (widgets/height.ts).
 */
export const COLUMN_HEIGHT = "--column-height";

/** How far a column's frame overflows into the gap, on each side. */
interface Overflows {
  left: number;
  rightHand: number;
}

/** A column's drag, as the render sees it. */
interface SectionDrag {
  id: Id;
  /** The top left corner of the copy following the pointer. */
  x: number;
  y: number;
  /** Its size on screen: the copy shows the whole column. */
  width: number;
  height: number;
  /** The rank where it will land, among the other columns. */
  target: number;
}

/** Resizing a column in pixels, by the gap that follows it. */
interface Resizing {
  id: Id;
  startX: number;
  /** Its width at the first press. */
  width: number;
  /**
   * 1 when the column is left of the gap, -1 when right: dragging left
   * then widens it.
   */
  direction: 1 | -1;
  started: boolean;
}

interface SectionDragInProgress extends SectionDrag {
  startX: number;
  startY: number;
  offsetX: number;
  offsetY: number;
  started: boolean;
  /**
   * The position of the other columns, read at the first press: the target
   * rank is read from them.
   */
  places: DOMRect[];
}

/** The drag of copies: they show without responding. */
const INERT: WidgetDrag = {
  dragged: null,
  onDragStart: () => {},
  onDragEnd: () => {},
  onDrop: () => {},
};

/**
 * The target rank: the first column whose middle has not been passed, line
 * by line — columns that no longer fit wrap to the next line.
 */
const rankFrom = (places: DOMRect[], x: number, y: number): number => {
  const rank = places.findIndex((r) => y < r.top || (y <= r.bottom && x < r.left + r.width / 2));
  return rank === -1 ? places.length : rank;
};

/**
 * The width the section states. "Automatique" lets the row split evenly
 * what the others leave: it counts for nothing in the
 * wrapping, and "hidden" removes it when that remainder does not give it
 * its minimum width. The other two fix it, and the column neither
 * shrinks nor stretches — those that no longer fit wrap to the next
 * line.
 *
 * A percentage is read on what remains of the row once the gaps are
 * removed, not on the whole row: otherwise, three sections at 25, 50
 * and 25% would claim 100% plus two gaps, and the last would wrap to
 * the next line. Hence "gaps", the sum of those separating the columns.
 */
const widthOf = (section: BoardSection, gaps: number): CSSProperties => {
  if (section.width_unit === "auto") {
    return { flex: "1 1 0px", minWidth: 0 };
  }
  if (section.width_unit === "percent") {
    const part = section.width_value ?? 0;
    return {
      flex: `0 0 calc((100% - ${gaps}px) * ${part} / 100)`,
      minWidth: 0,
    };
  }
  return { flex: `0 0 ${section.width_value ?? 0}px`, minWidth: 0 };
};

/**
 * The automatic columns that have no room to be shown. The row
 * is rebuilt line by line as the browser will do it: each column
 * counts for its width plus the gap that follows it — its right margin —,
 * fixed columns wrap when they no longer fit, automatic
 * ones stay on the line where they fall. On each line, they are
 * kept in order as long as the remainder gives each its minimum
 * width; the following ones disappear.
 */
const hiddenItems = (
  followUp: BoardSection[],
  width: number,
  gapAfter: (section: BoardSection) => number,
  gaps: number,
): Set<Id> => {
  const hidden = new Set<Id>();
  let fixed = 0;
  let autoSections: BoardSection[] = [];
  const sum = (list: BoardSection[]) => list.reduce((a, s) => a + gapAfter(s), 0);

  const finishRow = () => {
    let keptKeys: BoardSection[] = [];
    for (const section of autoSections) {
      const need =
        fixed + sum(keptKeys) + gapAfter(section) + SECTION_MIN_WIDTH * (keptKeys.length + 1);
      if (need <= width + ROUNDING) keptKeys = [...keptKeys, section];
      else hidden.add(section.id);
    }
    fixed = 0;
    autoSections = [];
  };

  for (const section of followUp) {
    if (section.width_unit === "auto") {
      autoSections.push(section);
      continue;
    }
    const part = section.width_value ?? 0;
    const w = section.width_unit === "percent" ? ((width - gaps) * part) / 100 : part;
    const used = fixed + sum(autoSections);
    const place = w + gapAfter(section);
    if ((fixed > 0 || autoSections.length > 0) && used + place > width + ROUNDING) finishRow();
    fixed += place;
  }
  finishRow();
  return hidden;
};

export default function SectionsBoard<S extends BoardSection>({
  sections,
  locked,
  onUnlock,
  widgetIds,
  renderWidgets,
  widgets,
  onCreateWidget,
  onReorderWidgets,
  onAddSection,
  onDuplicateSection,
  paste,
  onDeleteWidget,
  onDeleteSection,
  onReorderSections,
  onChangeSection,
}: SectionsBoardProps<S>) {
  // The account's permission on each widget type: the drawer is set from it.
  const access = useWidgetAccess();

  // The widget being held, or "null". It lives here and not in a
  // column: it is picked up in one and dropped in another.
  const [draggedWidget, setDraggedWidget] = useState<Id | null>(null);
  /** The widgets drawer, opened by a column. */
  const [drawerOpen, setDrawerOpened] = useState(false);
  // Leaving edit mode closes the drawer: nothing is placed there anymore.
  useEffect(() => {
    if (locked) setDrawerOpened(false);
  }, [locked]);
  /** The type of the widget taken from the drawer, during the drag. */
  const [newType, setNewType] = useState<string | null>(null);
  /**
   * The trash hovered by the held widget: it colors, and a widget
   * dropped over it is thrown away at the end of the drag, even if the
   * browser did not deliver the drop.
   */
  const [overTrash, setOverTrash] = useState(false);
  /** The column hovered during the drag: it is the one that receives. */
  const [hoveredColumn, setHoveredColumn] = useState<Id | null>(null);
  /** The column held by its handle: see "Columns: drag by the handle". */
  const [dragging, setDragged] = useState<SectionDrag | null>(null);
  const draggingRef = useRef<SectionDragInProgress | null>(null);
  /**
   * The order set, shown without waiting for the server: without it, the column
   * would return to its place during the round trip. Re-read sections
   * take over again.
   */
  const [localOrder, setLocalOrder] = useState<Id[] | null>(null);
  useEffect(() => setLocalOrder(null), [sections]);
  /** The right-click menu in the empty area of a column. */
  const [sectionMenu, setSectionMenu] = useState<{
    section: S;
    position: PointMenuPosition;
  } | null>(null);
  const [sectionToDelete, setSectionToDelete] = useState<S | null>(null);
  /**
   * The widths and gaps entered, shown without waiting for the server, like
   * the order set: without them, the column would revert to the old setting
   * during the round trip.
   */
  const [localEdits, setLocalEdits] = useState<ReadonlyMap<Id, EditSection>>(new Map());
  useEffect(() => setLocalEdits(new Map()), [sections]);

  const changeSection = async (section: S, change: EditSection) => {
    setLocalEdits((before) => new Map(before).set(section.id, { ...before.get(section.id), ...change }));
    await onChangeSection(section, change);
  };

  /**
   * Drop the held widget in this column, at this position. The list sent
   * is that of the host column as it will be: it states
   * the order, and the server admits a widget coming from elsewhere there.
   */
  const drop = async (sectionId: Id, index: number) => {
    const id = draggedWidget;
    setDraggedWidget(null);
    setHoveredColumn(null);
    const section = sections?.find((s) => s.id === sectionId);
    if (id === null || !section) return;

    const currentIds = widgetIds(section);
    if (id === NEW_VALUE) {
      setNewType(null);
      if (newType) await onCreateWidget(section, newType, Math.min(index, currentIds.length));
      return;
    }
    const arrival = currentIds.filter((other) => other !== id);
    const place = Math.min(index, arrival.length);
    const next = [...arrival.slice(0, place), id, ...arrival.slice(place)];
    // Dropping a widget where it already is changes nothing.
    if (currentIds.length === next.length && currentIds.every((v, i) => v === next[i])) return;

    await onReorderWidgets(sectionId, next);
  };

  /** The held widget, dropped on the trash: only once, by the drop or the end of the drag. */
  const moveToTrash = () => {
    const id = draggedWidget;
    setOverTrash(false);
    setDraggedWidget(null);
    setHoveredColumn(null);
    if (id !== null && id !== NEW_VALUE) onDeleteWidget?.(id);
  };

  const drag: WidgetDrag = {
    dragged: draggedWidget,
    onDragStart: setDraggedWidget,
    onDragEnd: () => {
      if (overTrash) moveToTrash();
      setDraggedWidget(null);
      setOverTrash(false);
    },
    onDrop: drop,
  };

  // --- Columns: drag by the handle ---------------------------------------
  // A copy follows the pointer; the column stays in place, half faded,
  // and a line in the gap shows where it will land. Pointer-based rather than native drag: the latter
  // only shows a frozen image.
  const bands = !sections
    ? null
    : localOrder
      ? localOrder
          .map((id) => sections.find((s) => s.id === id))
          .filter((s): s is S => s !== undefined)
      : sections;
  const ordered =
    bands?.map((s) => {
      const change = localEdits.get(s.id);
      return change ? { ...s, ...change } : s;
    }) ?? null;

  /** The column being widened by the gap that follows it, or "null". */
  const resizeRef = useRef<Resizing | null>(null);
  /**
   * True during the click that follows a resize: that click lands on the
   * gap's "+", and must not insert a column.
   */
  const justResized = useRef(false);

  // The listeners are set once: they read the current state through a ref.
  const state = useRef({ ordered, onReorderSections, changeSection });
  useLayoutEffect(() => {
    state.current = { ordered, onReorderSections, changeSection };
  });

  // --- Columns: resize by the gap ------------------------------------------
  // The width follows the pointer without waiting for the server; it goes at
  // release. Below the threshold, the press remains the click that inserts.
  useEffect(() => {
    const onMove = (event: PointerEvent) => {
      const r = resizeRef.current;
      if (!r) return;
      const dx = event.clientX - r.startX;
      if (!r.started) {
        if (Math.abs(dx) < DRAG_THRESHOLD) return;
        r.started = true;
        document.body.style.cursor = "col-resize";
      }
      const width = Math.max(1, Math.round(r.width + r.direction * dx));
      setLocalEdits((before) =>
        new Map(before).set(r.id, { ...before.get(r.id), width_value: width }),
      );
    };

    const onUp = async (event: PointerEvent) => {
      const r = resizeRef.current;
      resizeRef.current = null;
      if (!r?.started) return;
      document.body.style.cursor = "";
      justResized.current = true;
      setTimeout(() => (justResized.current = false));
      const { ordered: current, changeSection: change } = state.current;
      const section = current?.find((s) => s.id === r.id);
      if (!section) return;
      const width = Math.max(1, Math.round(r.width + r.direction * (event.clientX - r.startX)));
      await change(section, { width_unit: "px", width_value: width });
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, []);

  /** A press on the gap next to a pixel column. */
  const grabWidth = (event: ReactPointerEvent<HTMLElement>, section: S, direction: 1 | -1) => {
    if (event.button !== 0 || locked) return;
    // No selection of neighboring text while dragging.
    event.preventDefault();
    resizeRef.current = {
      id: section.id,
      startX: event.clientX,
      width: section.width_value ?? measure(section, "px"),
      direction,
      started: false,
    };
  };

  /** A gap "+": it does not insert on the click that ends a resize. */
  const insert = (rank: number) => () => {
    if (!justResized.current) onAddSection(rank);
  };

  useEffect(() => {
    const onMove = (event: PointerEvent) => {
      const d = draggingRef.current;
      if (!d) return;
      if (!d.started) {
        if (Math.hypot(event.clientX - d.startX, event.clientY - d.startY) < DRAG_THRESHOLD) return;
        d.started = true;
        document.body.style.cursor = "grabbing";
      }
      d.target = rankFrom(d.places, event.clientX, event.clientY);
      setDragged({
        id: d.id,
        x: event.clientX - d.offsetX,
        y: event.clientY - d.offsetY,
        width: d.width,
        height: d.height,
        target: d.target,
      });
    };

    const onUp = async () => {
      const d = draggingRef.current;
      draggingRef.current = null;
      document.body.style.cursor = "";
      setDragged(null);
      const { ordered: current, onReorderSections: store } = state.current;
      if (!d?.started || !current) return;

      const currentIds = current.map((s) => s.id);
      const others = currentIds.filter((id) => id !== d.id);
      const next = [...others.slice(0, d.target), d.id, ...others.slice(d.target)];
      if (next.every((v, i) => v === currentIds[i])) return;
      setLocalOrder(next);
      await store(next);
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, []);

  const grabColumn = (event: ReactPointerEvent<HTMLElement>, section: S) => {
    if (event.button !== 0 || locked) return;
    const column = event.currentTarget.closest<HTMLElement>("[data-section-id]");
    const band = column?.parentElement;
    if (!column || !band) return;
    const frame = column.getBoundingClientRect();
    draggingRef.current = {
      id: section.id,
      x: frame.left,
      y: frame.top,
      width: frame.width,
      height: frame.height,
      target: 0,
      startX: event.clientX,
      startY: event.clientY,
      offsetX: event.clientX - frame.left,
      offsetY: event.clientY - frame.top,
      started: false,
      places: [...band.querySelectorAll<HTMLElement>("[data-section-id]")]
        .filter((other) => other !== column)
        .map((other) => other.getBoundingClientRect()),
    };
  };

  const held = dragging && ordered ? ordered.find((s) => s.id === dragging.id) : undefined;

  /**
   * The column's handle: it is by it, and by it alone, that the
   * column moves — the rest belongs to its widgets, which have their
   * own drag.
   */
  const handle = (section: S) => (
    <Center
      onPointerDown={(e) => grabColumn(e, section)}
      aria-label="Déplacer la section"
      c="dimmed"
      style={{
        position: "absolute",
        top: -TOP_BAND,
        left: 0,
        right: 0,
        height: GRIP_ZONE,
        cursor: "grab",
        touchAction: "none",
      }}
    >
      <IconGripHorizontal size={GRIP_SIZE} />
    </Center>
  );

  /**
   * The width the column has on screen, in the chosen unit: switching from
   * "auto" to "px" or "%" keeps it as it is. Percentages are
   * read, as in "widthOf", on the row minus its gaps.
   */
  const measure = (section: S, unit: "px" | "percent"): number => {
    const column = bandEl?.querySelector<HTMLElement>(`[data-section-id="${section.id}"]`);
    const width = column?.getBoundingClientRect().width ?? 0;
    if (unit === "px") return width;
    const available = (bandWidth ?? 0) - gaps;
    return available > 0 ? (width / available) * 100 : 100;
  };

  /**
   * A column's frame and what it holds. "inert": the copy following
   * the pointer and the held column, left in place, which show without
   * responding.
   */
  const frame = (section: S, overflows: Overflows, inert = false) => {
    const count = widgetIds(section).length;
    return (
      <Box
        // The right click in the empty area of the column. On a widget, the
        // widget's menu opens: it has already taken the event.
        onContextMenu={(e) => {
          if (inert || locked || e.defaultPrevented) return;
          setSectionMenu({ section, position: menuPosition(e) });
        }}
        // Dropped in the empty area of the column, under its widgets, the held
        // widget goes to the end. On a widget, it is the one that received the drop.
        onDragOver={(e) => {
          if (inert || locked || draggedWidget === null) return;
          e.preventDefault();
        }}
        onDrop={(e) => {
          if (inert || locked || draggedWidget === null || e.defaultPrevented) return;
          e.preventDefault();
          void drop(section.id, count);
        }}
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          position: "relative",
          // The foot band, and the space above the line, kept locked or
          // not: the content does not move from one mode to the other. The
          // handle's overflows above (TOP_BAND).
          paddingBottom: GRIP_ZONE + FRAME_PADDING,
        }}
      >
        {/* The dotted frame, laid over and not around: it overflows
            into the gap between columns, at a distance from the "+", without
            pushing anything. The handle is outside it, in the top band, and the
            width in the foot one, centered under the column. */}
        {!locked && (
          <>
            <Box
              style={{
                position: "absolute",
                top: -FRAME_PADDING,
              bottom: GRIP_ZONE,
              left: -overflows.left,
              right: -overflows.rightHand,
                border: `1px dashed ${DOTTED}`,
                borderRadius: "var(--mantine-radius-md)",
                pointerEvents: "none",
              }}
            />
            {handle(section)}
            {!inert && (
              <WidthField
                value={section}
                onChange={(width) => changeSection(section, width)}
                measure={(unit) => measure(section, unit)}
                style={{
                  bottom: (GRIP_ZONE - GAP_FIELD_HEIGHT) / 2,
                  left: "50%",
                  transform: "translateX(-50%)",
                }}
              />
            )}
          </>
        )}

        {renderWidgets(section, inert ? INERT : drag)}

        {/* The prompt appears only for an empty column. When locked, the zone
            keeps its place without showing; otherwise it does not duplicate the
            column's frame. */}
        {count === 0 && (
          <SectionDropZone
            onClick={() => setDrawerOpened(true)}
            accepting={!inert && hoveredColumn === section.id}
            invisible={locked}
            withoutFrame
            onDragOver={(e) => {
              if (locked || draggedWidget === null) return;
              e.preventDefault();
              setHoveredColumn(section.id);
            }}
            onDragLeave={() => setHoveredColumn((s) => (s === section.id ? null : s))}
            onDrop={(e) => {
              if (locked || draggedWidget === null) return;
              e.preventDefault();
              void drop(section.id, 0);
            }}
          />
        )}

      </Box>
    );
  };

  // The row's width, read before display and at each
  // resize: it is on it that hidden automatic columns
  // are decided.
  const [bandEl, setBandEl] = useState<HTMLDivElement | null>(null);
  const [bandWidth, setBandWidth] = useState<number | null>(null);
  useLayoutEffect(() => {
    if (!bandEl) return;
    setBandWidth(bandEl.getBoundingClientRect().width);
    const observer = new ResizeObserver(([entry]) => {
      if (entry) setBandWidth(entry.contentRect.width);
    });
    observer.observe(bandEl);
    return () => observer.disconnect();
  }, [bandEl]);

  // The height a column's widgets have while the board does not scroll: the
  // visible height, less the handle band above and the foot one below. A
  // widget's height in percent is a share of it (widgets/height.ts) — a share
  // of the window, and not of what the column holds.
  const [viewportEl, setViewportEl] = useState<HTMLDivElement | null>(null);
  const [columnHeight, setColumnHeight] = useState<number | null>(null);
  useLayoutEffect(() => {
    if (!viewportEl) return;
    const measure = () =>
      setColumnHeight(viewportEl.clientHeight - TOP_BAND - GRIP_ZONE - FRAME_PADDING);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(viewportEl);
    return () => observer.disconnect();
  }, [viewportEl]);

  // The gap following each column, its right margin: the last has none.
  // Percentages are read on the row minus their sum.
  const last = ordered?.[ordered.length - 1];
  const gapAfter = (section: BoardSection) => (section.id === last?.id ? 0 : section.gap);
  const gaps = (ordered ?? []).reduce((a, s) => a + gapAfter(s), 0);

  const hidden =
    ordered && bandWidth !== null
      ? hiddenItems(ordered, bandWidth, gapAfter, gaps)
      : new Set<Id>();
  const shown = (ordered ?? []).filter((s) => !hidden.has(s.id));

  // The gaps on either side of each shown column: the one preceding it
  // is its left neighbor's gap, the one following it its own.
  // At the row's edges, there is no gap: the one from the other side is reused,
  // so the frame and the "+" sit there as in a gap.
  const gapsAround = (section: BoardSection): Overflows & { before: number; after: number } => {
    const rank = shown.findIndex((s) => s.id === section.id);
    const previous = shown[rank - 1];
    const afterActual = rank >= 0 && rank < shown.length - 1 ? section.gap : null;
    const before = previous ? previous.gap : (afterActual ?? section.gap);
    const after = afterActual ?? before;
    // How far the frame overflows on each side of the column, into the gap: it
    // moves away from what it holds without pushing it, or changing the gap.
    // At most, with two pixels of clearance between the lines of two neighbors.
    const overflow = (gap: number) => Math.max(0, Math.floor(gap / 2) - 1);
    return { before, after, left: overflow(before), rightHand: overflow(after) };
  };

  // The margin left outside the edge columns: the "+" centers there as
  // in a gap, and the scroll zone does not clip it.
  const edges = shown.length > 0
    ? Math.max(
        gapsAround(shown[0]!).before,
        gapsAround(shown[shown.length - 1]!).after,
      )
    : 0;
  const margin = Math.ceil((edges + PLUS_SIZE) / 2);
  // The space between two lines, when fixed columns wrap: the
  // widest of the row's gaps.
  const rowsGap = Math.max(0, ...shown.map((s) => s.gap));

  // Where the held column will land. Nothing moves during the drag: it
  // stays in place, half faded, and a line in the gap shows where it
  // will go — at the left edge of the target column among the others, or to the right of
  // the last. Put back in its place, it changes nothing: no line.
  const others = dragging && ordered ? ordered.filter((s) => s.id !== dragging.id) : [];
  const heldRank = dragging && ordered ? ordered.findIndex((s) => s.id === dragging.id) : -1;
  const targeted =
    dragging && dragging.target !== heldRank
      ? dragging.target < others.length
        ? { id: others[dragging.target]!.id, before: true }
        : { id: others[others.length - 1]?.id, before: false }
      : null;

  const band = sections && (
    <Group
      ref={setBandEl}
      align="stretch"
      gap={0}
      wrap="wrap"
      // The columns take the remaining height: it is what the dotted zone
      // fills, under what the section already holds.
      style={{ flexGrow: 1, rowGap: rowsGap }}
    >
      {(ordered ?? []).map((section, rank) => {
        const isHidden = hidden.has(section.id);
        // The end "+" lands on the last shown column.
        const last = section.id === shown[shown.length - 1]?.id;
        const isHeld = section.id === dragging?.id;
        const surrounding = gapsAround(section);
        // The gap between the column shown on the left and this one — that of its
        // left "+" — resizes whichever of the two is in pixels, the
        // left one first. At the row's edges, there is no gap to drag.
        const previous = shown[shown.findIndex((s) => s.id === section.id) - 1];
        const startResize = !previous
          ? undefined
          : previous.width_unit === "px"
            ? (e: ReactPointerEvent<HTMLElement>) => grabWidth(e, previous, 1)
            : section.width_unit === "px"
              ? (e: ReactPointerEvent<HTMLElement>) => grabWidth(e, section, -1)
              : undefined;
        const inEditing = !locked && !dragging && draggedWidget === null && !isHidden;
        return (
          <Fragment key={section.id}>
            {/* The column's place in the row, and the gap that follows it
                as right margin. When unlocked, it carries a dotted frame
                — that of the add zone —, its handle at the top, its width
                at the foot, the "+" that insert a column beside it, and the
                field of the gap that follows it. */}
            <Box
              data-section-id={section.id}
              style={{
                ...widthOf(section, gaps),
                marginRight: gapAfter(section),
                display: isHidden ? "none" : "flex",
                flexDirection: "column",
                position: "relative",
                ...(isHeld ? { opacity: 0.5, pointerEvents: "none" } : {}),
              }}
            >
              {targeted?.id === section.id && (
                <InsertionLine
                  before={targeted.before}
                  gap={targeted.before ? surrounding.before : surrounding.after}
                  standing
                />
              )}
              {inEditing && (
                <>
                  <ColumnInsert
                    label="Insérer une section ici"
                    // Centered in the gap preceding it; before the first,
                    // at the same distance, as in a gap. Between the handle
                    // band and the foot one, at the frame's height.
                    style={{
                      top: -FRAME_PADDING,
                      bottom: GRIP_ZONE,
                      left: -(surrounding.before + INSERT_ZONE) / 2,
                    }}
                    onClick={insert(rank)}
                    onResizeStart={startResize}
                  />
                  {last ? (
                    <ColumnInsert
                      label="Insérer une section ici"
                      style={{
                        top: -FRAME_PADDING,
                        bottom: GRIP_ZONE,
                        right: -(surrounding.after + INSERT_ZONE) / 2,
                      }}
                      onClick={insert(sections.length)}
                    />
                  ) : (
                    // The gap following the column is entered under it, centered
                    // in the foot band, next to the width.
                    <GapField
                      value={section.gap}
                      onChange={(gap) => changeSection(section, { gap })}
                      style={{
                        bottom: (GRIP_ZONE - GAP_FIELD_HEIGHT) / 2,
                        right: -(surrounding.after + GAP_FIELD_WIDTH) / 2,
                      }}
                    />
                  )}
                </>
              )}
              {frame(section, surrounding, isHeld)}
            </Box>
          </Fragment>
        );
      })}
    </Group>
  );

  // While the sections are not read, nothing is displayed: "no
  // section" would be a premature conclusion. When locked, the empty row
  // offers to add one if it can unlock: the gesture
  // unlocks it first, then places the section.
  const canAdd = !locked || Boolean(onUnlock);
  // When locked, a row where no section holds anything has nothing to
  // show: the empty screen returns, as without sections. The gesture then
  // unlocks it without adding one more — its own wait.
  const empty =
    sections !== null &&
    (sections.length === 0 || (locked && sections.every((s) => widgetIds(s).length === 0)));
  const content = !sections ? null : empty ? (
    // The columns' foot band, kept here too: the prompt centers where a
    // widget's own does, not lower by half the band.
    <Box
      style={{
        flex: 1,
        minHeight: 0,
        display: "flex",
        flexDirection: "column",
        paddingBottom: GRIP_ZONE + FRAME_PADDING,
      }}
    >
      <EmptyPanel
        icon={IconColumns}
        message="Aucune section"
        actionLabel={canAdd ? "Créer une section" : undefined}
        onAction={
          canAdd
            ? async () => {
                if (locked) await onUnlock?.();
                if (sections.length === 0) onAddSection();
              }
            : undefined
        }
      />
    </Box>
  ) : (
    <ScrollArea
      viewportRef={setViewportEl}
      style={{
        flex: 1,
        minHeight: 0,
        marginInline: -margin,
        marginTop: -TOP_BAND,
        ...(columnHeight !== null && ({ [COLUMN_HEIGHT]: `${columnHeight}px` } as CSSProperties)),
      }}
      type="always"
      scrollbarSize={2}
      styles={{
        // The bar drives the columns but sits against the right edge of the
        // window, over its whole height — as in Project and Support modes.
        root: { position: "static" },
        scrollbar: {
          position: "fixed",
          top: 0,
          bottom: 0,
          right: 0,
          left: "auto",
          height: "auto",
          width: "var(--scrollarea-scrollbar-size)",
        },
        // The content covers at least the visible height: the columns
        // stretch in it, and the dotted zone keeps room to fill.
        //
        // The edge "+" overflow the first and last
        // column, and the scroll zone clips what sticks out: it
        // widens by as much into the page margin, and the content withdraws from it,
        // so the columns stay in place.
        viewport: { paddingInline: margin, paddingTop: TOP_BAND },
        content: { display: "flex", flexDirection: "column", minHeight: "100%" },
      }}
    >
      {band}
    </ScrollArea>
  );

  return (
    <>
      {content}

      {/* The widgets drawer opens from here, for all columns: the
          position is chosen by dragging the widget into it. When locked, or without a
          section to put it in, the row does not offer it. */}
      {!locked && sections && sections.length > 0 && (
        <Box
          style={{
            position: "fixed",
            right: PAGE_GUTTER + HELP_SIZE + HELP_GAP,
            bottom: PAGE_GUTTER,
            zIndex: 200,
            display: "flex",
            alignItems: "center",
            gap: HELP_OFFSET,
          }}
        >
          {/* While a placed widget is held — not one dragged from the
              drawer —, a trash on the left: dropping the widget there
              deletes it, after the usual question. */}
          {onDeleteWidget && draggedWidget !== null && draggedWidget !== NEW_VALUE && (
            <Box
              aria-label="Supprimer le widget"
              onDragEnter={(e) => {
                e.preventDefault();
                setOverTrash(true);
              }}
              onDragOver={(e) => {
                e.preventDefault();
                e.dataTransfer.dropEffect = "move";
                setOverTrash(true);
              }}
              // Passing over the icon is not leaving: only what leads
              // out of the trash counts.
              onDragLeave={(e) => {
                if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
                  setOverTrash(false);
                }
              }}
              onDrop={(e) => {
                e.preventDefault();
                moveToTrash();
              }}
              style={{
                width: HELP_SIZE,
                height: HELP_SIZE,
                borderRadius: "50%",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                // The project's red, the icon in white; hovered by the
                // held widget, it darkens a notch.
                color: "var(--mantine-color-white)",
                backgroundColor: RED,
                filter: overTrash ? "brightness(0.85)" : undefined,
                transition: "filter 120ms ease",
              }}
            >
              <IconTrash size={18} style={{ pointerEvents: "none" }} />
            </Box>
          )}
          <AddButton
            label="Ajouter un widget"
            onClick={() => setDrawerOpened(true)}
            h={HELP_SIZE}
          />
        </Box>
      )}

      {/* The copy following the pointer: the whole column, at its size,
          without tilt. */}
      {dragging && held && (
        <Box
          style={{
            position: "fixed",
            left: dragging.x,
            top: dragging.y,
            width: dragging.width,
            height: dragging.height,
            zIndex: 400,
            pointerEvents: "none",
            display: "flex",
            flexDirection: "column",
            borderRadius: "var(--mantine-radius-md)",
            backgroundColor: "var(--mantine-color-body)",
            boxShadow: "var(--mantine-shadow-xl)",
          }}
        >
          {frame(held, gapsAround(held), true)}
        </Box>
      )}

      <WidgetDrawer
        opened={drawerOpen}
        onClose={() => setDrawerOpened(false)}
        // The drawer only offers the types the account can use.
        widgets={widgets.filter((w) => canUse(access(w.kind)))}
        onDragStart={(widget) => {
          setNewType(widget.type);
          setDraggedWidget(NEW_VALUE);
        }}
        onDragEnd={() => {
          setDraggedWidget(null);
          setHoveredColumn(null);
        }}
      />

      {sectionMenu && (
        <PointMenu position={sectionMenu.position} onClose={() => setSectionMenu(null)}>
          {paste && (
            <>
              <Menu.Item
                leftSection={<IconClipboard size={16} />}
                onClick={() => {
                  const { section } = sectionMenu;
                  setSectionMenu(null);
                  void paste.onPaste(section);
                }}
              >
                Coller « {paste.label} »
              </Menu.Item>
              <Menu.Divider />
            </>
          )}
          <Menu.Item
            leftSection={<IconCopyPlus size={16} />}
            onClick={() => void onDuplicateSection(sectionMenu.section)}
          >
            Dupliquer
          </Menu.Item>
          <Menu.Divider />
          <Menu.Item
            color={RED}
            leftSection={<IconTrash size={16} />}
            onClick={() => setSectionToDelete(sectionMenu.section)}
          >
            Supprimer
          </Menu.Item>
        </PointMenu>
      )}

      <DeleteConfirmModal
        opened={sectionToDelete !== null}
        onClose={() => setSectionToDelete(null)}
        onConfirm={async () => {
          const section = sectionToDelete;
          setSectionToDelete(null);
          if (section) await onDeleteSection(section);
        }}
        title="Supprimer la section"
        message={
          <>
            Voulez-vous vraiment supprimer cette section ?
            {sectionToDelete && widgetIds(sectionToDelete).length > 0 && (
              <>
                {" "}
                Ses widgets seront supprimés avec elle, et avec eux les projets, les tâches, les
                demandes ou les assets que leurs listes montrent.
              </>
            )}{" "}
            Cette action est irréversible.
          </>
        }
      />
    </>
  );
}
