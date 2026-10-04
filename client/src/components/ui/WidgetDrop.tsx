import { Box } from "@mantine/core";
import { useState } from "react";
import type { DragEvent } from "react";
import type { Id } from "@milo/shared";

// Drag-and-drop of a section's widgets, shared by Access mode and the
// statistics panels (SectionsBoard).
//
// A widget is picked up and dropped elsewhere: higher, lower, or in another
// section. One aims at a widget, not a gap: hovering its upper half
// drops before it, its lower half after it, and a line says so.
//
// This line is laid over, absolutely. A first version slid
// real slots between the widgets: they added to the column's height and
// pushed all the content down as soon as a widget was picked up.
// Nothing must move while nothing is dropped.
//
// The browser's native drag is enough here: a widget is not reordered
// to the pixel like a board card, it is dropped between two others.

/** What the sections row passes to what a section holds. */
export interface WidgetDrag {
  /** The widget being moved, or "null": it comes from any section. */
  dragged: Id | null;
  onDragStart: (id: Id) => void;
  onDragEnd: () => void;
  /** Drops the moved widget in this section, at this position. */
  onDrop: (sectionId: Id, index: number) => void;
}

/** Thickness of the line saying where the widget will land. */
const LINE_THICKNESS = 2;

/** Where the held widget will land: a widget, and on which side. */
export interface WidgetTarget {
  id: Id;
  before: boolean;
}

/**
 * The drag gestures on a section's widgets. "propsOf" is put on
 * what wraps each widget; "index" is its place among those the
 * section holds — the one the drop expects.
 */
export const useWidgetDrop = (sectionId: Id, drag: WidgetDrag, locked: boolean) => {
  const [target, setTarget] = useState<WidgetTarget | null>(null);

  const propsOf = (id: Id, index: number) => ({
    draggable: !locked,
    onDragStart: (e: DragEvent<HTMLElement>) => {
      // Some browsers do not start the drag without a payload.
      e.dataTransfer.setData("text/plain", String(id));
      e.dataTransfer.effectAllowed = "move";
      drag.onDragStart(id);
    },
    onDragEnd: () => {
      setTarget(null);
      drag.onDragEnd();
    },
    onDragOver: (e: DragEvent<HTMLElement>) => {
      if (drag.dragged === null || locked) return;
      e.preventDefault();
      const frame = e.currentTarget.getBoundingClientRect();
      setTarget({ id, before: e.clientY < frame.top + frame.height / 2 });
    },
    onDragLeave: () => setTarget((c) => (c?.id === id ? null : c)),
    onDrop: (e: DragEvent<HTMLElement>) => {
      if (drag.dragged === null || locked) return;
      e.preventDefault();
      const before = target?.before ?? true;
      setTarget(null);
      drag.onDrop(sectionId, before ? index : index + 1);
    },
  });

  return { target, propsOf };
};

/**
 * The insertion line, laid over the targeted widget: it takes no
 * room, so nothing moves while nothing is dropped. "gap": the space
 * between two widgets, in the middle of which the line sits. "standing": the
 * line of a column, on its left or right rather than above or
 * below.
 */
export function InsertionLine({
  before,
  gap = 0,
  standing = false,
}: {
  before: boolean;
  gap?: number;
  standing?: boolean;
}) {
  const offset = -(gap + LINE_THICKNESS) / 2 - (gap ? 0 : LINE_THICKNESS / 2);
  return (
    <Box
      aria-hidden
      style={{
        position: "absolute",
        ...(standing
          ? { top: 0, bottom: 0, [before ? "left" : "right"]: offset, width: LINE_THICKNESS }
          : { left: 0, right: 0, [before ? "top" : "bottom"]: offset, height: LINE_THICKNESS }),
        borderRadius: LINE_THICKNESS,
        backgroundColor: "var(--mantine-color-teal-filled)",
        pointerEvents: "none",
      }}
    />
  );
}
