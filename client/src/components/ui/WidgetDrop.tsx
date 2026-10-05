import { Box } from "@mantine/core";
import { useState } from "react";
import type { DragEvent } from "react";
import type { Id } from "@milo/shared";

// Drag-and-drop of a section's widgets, shared by Access mode and the
// statistics panels (SectionsBoard).
//
// A widget is picked up and dropped elsewhere: higher, lower, or in another
// section. What aims is the held widget's top edge, not the pointer: it is
// what the eye follows. The line goes to the gap nearest to that edge —
// above a widget while the edge is in its upper half, below it past that.
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
 * Where the held widget was grabbed, from its top edge: its top is the pointer
 * minus this. Only one widget is held at a time, whatever its section. A
 * widget coming from the drawer is held by its top: 0.
 */
let grabOffset = 0;

/**
 * The drag gestures on a section's widgets. "propsOf" is put on what wraps
 * each widget — "index" is its place among those the section holds, the one
 * the drop expects —, "stackProps" on what stacks them: the target is chosen
 * there, from all the widgets, since the held widget's top edge is not always
 * over the one under the pointer.
 */
export const useWidgetDrop = (sectionId: Id, drag: WidgetDrag, locked: boolean) => {
  const [target, setTarget] = useState<(WidgetTarget & { index: number }) | null>(null);

  const propsOf = (id: Id, index: number) => ({
    draggable: !locked,
    "data-widget-id": id,
    "data-widget-index": index,
    onDragStart: (e: DragEvent<HTMLElement>) => {
      // Some browsers do not start the drag without a payload.
      e.dataTransfer.setData("text/plain", String(id));
      e.dataTransfer.effectAllowed = "move";
      grabOffset = e.clientY - e.currentTarget.getBoundingClientRect().top;
      drag.onDragStart(id);
    },
    onDragEnd: () => {
      grabOffset = 0;
      setTarget(null);
      drag.onDragEnd();
    },
  });

  const stackProps = {
    onDragOver: (e: DragEvent<HTMLElement>) => {
      if (drag.dragged === null || locked) return;
      e.preventDefault();
      const top = e.clientY - grabOffset;
      const widgets = [...e.currentTarget.querySelectorAll<HTMLElement>(":scope > [data-widget-id]")];
      // The first widget whose middle is below the held one's top receives it
      // before itself; none: it lands after the last.
      const above = widgets.find((w) => {
        const frame = w.getBoundingClientRect();
        return top < frame.top + frame.height / 2;
      });
      const element = above ?? widgets[widgets.length - 1];
      if (!element) return;
      const id = Number(element.dataset.widgetId);
      const index = Number(element.dataset.widgetIndex);
      const before = Boolean(above);
      setTarget((c) =>
        c?.id === id && c.before === before ? c : { id, before, index: before ? index : index + 1 },
      );
    },
    onDragLeave: (e: DragEvent<HTMLElement>) => {
      if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setTarget(null);
    },
    onDrop: (e: DragEvent<HTMLElement>) => {
      if (drag.dragged === null || locked || !target) return;
      e.preventDefault();
      setTarget(null);
      drag.onDrop(sectionId, target.index);
    },
  };

  return { target, propsOf, stackProps };
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
