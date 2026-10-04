import { Menu } from "@mantine/core";
import { createPortal } from "react-dom";
import type { MouseEvent as ReactMouseEvent, ReactNode } from "react";

// A context menu: opened on right click, placed at the clicked point — on a
// widget, a list, a card — or under the targeted tab (menuAnchor), which
// carries it as its menu.

/**
 * Where a context menu opens: the right-click point, or the whole element when
 * it has a width and a height.
 */
export interface PointMenuPosition {
  x: number;
  y: number;
  width?: number;
  height?: number;
}

/**
 * A tab's menu: it opens against it, not at the clicked point — under a board
 * tab, above a view.
 */
export const menuAnchor = (
  event: ReactMouseEvent<HTMLElement>,
  /** The element to place it against, if it is not the one that received the click. */
  element: Element = event.currentTarget,
): PointMenuPosition => {
  event.preventDefault();
  event.stopPropagation();
  const r = element.getBoundingClientRect();
  return { x: r.left, y: r.top, width: r.width, height: r.height };
};

// The right click opens our menu, not the browser's. From the keyboard, the
// event has no position: the menu is placed under the element.
export const menuPosition = (event: ReactMouseEvent<HTMLElement>): PointMenuPosition => {
  event.preventDefault();
  event.stopPropagation();
  if (event.clientX === 0 && event.clientY === 0) {
    const r = event.currentTarget.getBoundingClientRect();
    return { x: r.left, y: r.bottom };
  }
  return { x: event.clientX, y: event.clientY };
};

interface PointMenuProps {
  position: PointMenuPosition;
  /** Where the menu sits against the anchor: below by default. */
  placement?: "bottom-start" | "top-start";
  /** The gap to the anchor. */
  offset?: number;
  onClose: () => void;
  returnFocus?: boolean;
  children: ReactNode;
}

// The anchor is an invisible point placed at the click, carried outside the
// page: a parent's transform would skew the "fixed" position.
export default function PointMenu({
  position,
  placement = "bottom-start",
  offset,
  onClose,
  returnFocus,
  children,
}: PointMenuProps) {
  return createPortal(
    <Menu
      opened
      onChange={(isOpen) => !isOpen && onClose()}
      position={placement}
      offset={offset}
      withinPortal
      shadow="md"
      returnFocus={returnFocus}
    >
      <Menu.Target>
        <div
          style={{
            position: "fixed",
            left: position.x,
            top: position.y,
            width: position.width ?? 1,
            height: position.height ?? 1,
            pointerEvents: "none",
          }}
        />
      </Menu.Target>
      {/* React events bubble up through the portal: without this barrier, a
          press in a list's menu would mistake it for a drag, and a right click
          would reopen the menu elsewhere. */}
      <Menu.Dropdown
        onPointerDown={(e) => e.stopPropagation()}
        onContextMenu={(e) => {
          e.preventDefault();
          e.stopPropagation();
        }}
      >
        {children}
      </Menu.Dropdown>
    </Menu>,
    document.body,
  );
}
