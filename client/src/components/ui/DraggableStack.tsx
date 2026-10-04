import { Text } from "@mantine/core";
import { IconGripVertical } from "@tabler/icons-react";
import { useEffect, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import type { Id } from "@milo/shared";

// Drag and drop of a vertical stack: checklists and their items
// (CardChecklists), the attribute rows of Access mode (widgets/common/number).

/** The drag in progress: what is being moved, and the rank where it will land. */
interface Drag {
  id: Id;
  target: number;
}

/** The same gesture, tracked outside of rendering: it changes on every movement. */
interface DragInProgress extends Drag {
  index: number;
  startY: number;
  /** False until the pointer has crossed the trigger threshold. */
  started: boolean;
}

// Pointer movement from which it is considered a drag. The same threshold as on
// the board.
const DRAG_THRESHOLD = 4;

// The insertion line during a drag: placed between two neighbors, it takes no
// height in the stack — nothing moves, and the measurements taken at the start
// stay accurate. At the top of the stack ("atEdge"), it has no neighbor above:
// it sits on the top edge of the first one, without overflowing onto what
// precedes the stack — a field's label.
export function InsertLine({ gap = 0, atEdge = false }: { gap?: number; atEdge?: boolean }) {
  return (
    <div style={{ position: "relative", height: 0 }}>
      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          top: atEdge ? 0 : -gap / 2 - 1,
          borderTop: "2px solid var(--mantine-color-teal-5)",
        }}
      />
    </div>
  );
}

/**
 * Drag and drop of a stack, for checklists as well as their items. Nothing
 * moves during the gesture: what is being dragged stays in place, made
 * transparent, and the insertion line shows where it will land. The measured
 * positions are therefore valid from start to finish.
 *
 * `selector` designates, within the zone, what can be dragged; `onReorder`
 * receives the full order, once the hand is released.
 */
export interface DraggableStack {
  ids: Id[];
  /** What, within the zone, can be dragged. */
  selector: string;
  onReorder: (order: Id[]) => void | Promise<void>;
}

export function useDraggableStack({ ids, selector, onReorder }: DraggableStack) {
  const [drag, setDrag] = useState<Drag | null>(null);
  const dragRef = useRef<DragInProgress | null>(null);
  const zoneRef = useRef<HTMLDivElement | null>(null);
  // The gesture runs on listeners set up once and for all: they read the
  // current state through a ref, rather than resubscribing on every render.
  const state = useRef({ ids, onReorder });
  state.current = { ids, onReorder };

  const onPointerDown = (id: Id, index: number) => (event: ReactPointerEvent) => {
    if (event.button !== 0) return;
    event.preventDefault();
    dragRef.current = {
      id,
      index,
      startY: event.clientY,
      started: false,
      target: index,
    };
  };

  useEffect(() => {
    const targetRank = (clientY: number): number | null => {
      const zone = zoneRef.current;
      if (!zone) return null;
      const rows = [...zone.querySelectorAll(selector)];
      for (let i = 0; i < rows.length; i += 1) {
        const rect = (rows[i] as HTMLElement).getBoundingClientRect();
        if (clientY < rect.top + rect.height / 2) return i;
      }
      return rows.length;
    };

    const onMove = (event: PointerEvent) => {
      const d = dragRef.current;
      if (!d) return;
      if (!d.started) {
        if (Math.abs(event.clientY - d.startY) < DRAG_THRESHOLD) return;
        d.started = true;
        document.body.style.userSelect = "none";
      }
      d.target = targetRank(event.clientY) ?? d.index;
      setDrag({ id: d.id, target: d.target });
    };

    const onUp = async () => {
      const d = dragRef.current;
      dragRef.current = null;
      document.body.style.userSelect = "";
      setDrag(null);
      if (!d || !d.started) return;

      // The target rank is read on the complete stack; once the item is
      // removed, everything that followed it moves up one slot.
      const target = d.target > d.index ? d.target - 1 : d.target;
      if (target === d.index) return;
      const order = state.current.ids.filter((id) => id !== d.id);
      order.splice(target, 0, d.id);
      await state.current.onReorder(order);
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, [selector]);

  return { zoneRef, drag, onPointerDown };
}

// The handle you drag by: only it moves things, everything else keeps its own
// clicks.
interface DragHandleProps {
  onPointerDown: (event: ReactPointerEvent) => void;
  visible?: boolean;
  label: string;
}

export function DragHandle({ onPointerDown, visible = true, label }: DragHandleProps) {
  return (
    <Text
      span
      c="dimmed"
      role="button"
      // No tooltip: the label is only for the keyboard and screen readers. The
      // handle's shape already says what it does.
      aria-label={label}
      onPointerDown={onPointerDown}
      style={{
        display: "inline-flex",
        cursor: "grab",
        touchAction: "none",
        flexShrink: 0,
        opacity: visible ? 1 : 0.35,
      }}
    >
      <IconGripVertical size={16} />
    </Text>
  );
}
