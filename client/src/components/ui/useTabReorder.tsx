import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { CSSProperties, PointerEvent as ReactPointerEvent } from "react";

// Drag-and-drop of a row's tabs: the boards of Project,
// Task and Access modes (BoardTabs), the statuses of Support mode, the families of
// Assets mode. The row itself remains that of ModeBar.

// What, in the row, gets dragged: the insertion line and the row's end
// are placed between tabs, and must not be counted with them.
const TAB_ATTRIBUTE = "data-milo-tab";

// Travel below which the press remains a click: without this threshold, the slightest
// hand tremor on a tab would move it.
const DRAG_THRESHOLD = 5;

/**
 * The gesture in progress: the held tab and the rank where it will land. Nothing moves
 * until the hand is released — only the insertion line moves,
 * so measurements taken during the gesture stay accurate.
 */
interface Drag<K> {
  id: K;
  target: number;
}

interface DragInProgress<K> extends Drag<K> {
  index: number;
  startX: number;
  started: boolean;
}

// The insertion line, placed between two tabs. It takes no width
// in the row: tabs do not spread apart as it passes.
export function InsertLine() {
  return (
    <div style={{ position: "relative", width: 0, alignSelf: "stretch" }}>
      <div
        style={{
          position: "absolute",
          top: 4,
          bottom: 4,
          left: -1,
          borderLeft: "2px solid var(--mantine-color-teal-5)",
        }}
      />
    </div>
  );
}

/**
 * The tabs in the shown order, and what is needed to drag them. "items" is
 * the authoritative order; "onReorder" receives the new one once the tab is
 * dropped — without it, tabs cannot be dragged. "zoneOf" finds the
 * row from the touched element, when it is not its direct parent
 * (the mode selector, ModeSwitch).
 */
export function useTabReorder<T, K extends string | number>(
  items: T[],
  keyOf: (item: T) => K,
  onReorder?: (keys: K[]) => void | Promise<void>,
  zoneOf: (element: HTMLElement) => HTMLElement | null = (element) => element.parentElement,
) {
  const [drag, setDrag] = useState<Drag<K> | null>(null);
  const dragRef = useRef<DragInProgress<K> | null>(null);
  // The row, retained at the first press: it belongs to ModeBar, and it is
  // the touched tab that designates it — it is a direct child.
  const zoneRef = useRef<HTMLElement | null>(null);
  /**
   * The new order is shown at once, without waiting for the server's response.
   * It clears as soon as the list comes back read: it is the authority.
   */
  const [localOrder, setLocalOrder] = useState<K[] | null>(null);
  // True between a drop and the click it triggers: dragging a tab is not
  // the same as opening it. Reset to false at the start of each gesture, so that a
  // drop outside the row — followed by no click — does not swallow the
  // next click.
  const justDragged = useRef(false);

  useEffect(() => {
    setLocalOrder(null);
  }, [items]);

  const ordered = localOrder
    ? localOrder
        .map((key) => items.find((item) => keyOf(item) === key))
        .filter((item): item is T => item !== undefined)
    : items;

  // The gesture's listeners are set once and for all; they read the current
  // state through a ref rather than resubscribing on each render.
  const state = useRef({ ordered, keyOf, onReorder });
  useLayoutEffect(() => {
    state.current = { ordered, keyOf, onReorder };
  });

  useEffect(() => {
    // The target rank: the first tab whose middle has not been passed, or
    // the end of the row.
    const targetRank = (clientX: number): number | null => {
      const zone = zoneRef.current;
      if (!zone) return null;
      const band = [...zone.querySelectorAll(`[${TAB_ATTRIBUTE}]`)];
      for (const [i, tab] of band.entries()) {
        const rect = tab.getBoundingClientRect();
        if (clientX < rect.left + rect.width / 2) return i;
      }
      return band.length;
    };

    const onMove = (event: PointerEvent) => {
      const d = dragRef.current;
      if (!d) return;
      if (!d.started) {
        if (Math.abs(event.clientX - d.startX) < DRAG_THRESHOLD) return;
        d.started = true;
        document.body.style.userSelect = "none";
        document.body.style.cursor = "grabbing";
      }
      d.target = targetRank(event.clientX) ?? d.index;
      setDrag({ id: d.id, target: d.target });
    };

    const onUp = async () => {
      const d = dragRef.current;
      dragRef.current = null;
      document.body.style.userSelect = "";
      document.body.style.cursor = "";
      setDrag(null);
      if (!d || !d.started) return;
      justDragged.current = true;

      // The target rank is read on the complete row; once the tab is removed,
      // everything that followed it moves up a notch.
      const target = d.target > d.index ? d.target - 1 : d.target;
      if (target === d.index) return;
      const { ordered: currentItems, keyOf: keyOf } = state.current;
      const order = currentItems.map(keyOf).filter((key) => key !== d.id);
      order.splice(target, 0, d.id);

      setLocalOrder(order);
      try {
        await state.current.onReorder?.(order);
      } catch {
        // The reorder did not take: the list re-read by the mode is the authority, and
        // the order shown here clears to make room for it.
        setLocalOrder(null);
      }
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, []);

  /** What a tab carries to be dragged, to spread on its Tabs.Tab. */
  const tabProps = (key: K, index: number, style: CSSProperties) => ({
    // What the gesture uses to find the tabs in the row: see
    // TAB_ATTRIBUTE.
    [TAB_ATTRIBUTE]: "",
    onPointerDown: (event: ReactPointerEvent<HTMLElement>) => {
      justDragged.current = false;
      if (event.button !== 0 || !onReorder) return;
      zoneRef.current = zoneOf(event.currentTarget);
      dragRef.current = { id: key, index, startX: event.clientX, started: false, target: index };
    },
    style: {
      ...style,
      // The held tab stays in place, in transparency: the insertion
      // line alone says where it will land.
      ...(drag?.id === key ? { opacity: 0.4 } : {}),
      // On a touch screen, the gesture belongs to the tab: otherwise the
      // browser would see a scroll in it.
      ...(onReorder ? { touchAction: "none" } : {}),
    },
  });

  /**
   * The tab change, filtered: the click that follows a drop opens nothing,
   * the hand moved the tab, it did not ask to open it.
   */
  const guardChange =
    <V,>(onChange: (value: V) => void) =>
    (value: V) => {
      if (justDragged.current) {
        justDragged.current = false;
        return;
      }
      onChange(value);
    };

  /** True when the insertion line sits before the given rank (or at the end, at rank "ordered.length"). */
  const insertAt = (index: number) => drag?.target === index;

  return { ordered, tabProps, guardChange, insertAt };
}
