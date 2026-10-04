import { Menu } from "@mantine/core";
import { createPortal } from "react-dom";
import type { MouseEvent as ReactMouseEvent, ReactNode } from "react";

// Un menu contextuel : ouvert au clic droit, posé au point cliqué — sur un
// widget, une liste, une carte — ou sous l'onglet visé (ancreDuMenu), qui le
// porte comme son menu.

/**
 * Là où s'ouvre un menu contextuel : le point du clic droit, ou l'élément
 * entier quand il a une largeur et une hauteur.
 */
export interface PointMenuPosition {
  x: number;
  y: number;
  width?: number;
  height?: number;
}

/**
 * Le menu d'un onglet : il s'ouvre contre lui, et non au point cliqué — sous
 * un onglet de tableau, au-dessus d'une vue.
 */
export const menuAnchor = (
  event: ReactMouseEvent<HTMLElement>,
  /** L'élément contre lequel le poser, s'il n'est pas celui qui a reçu le clic. */
  element: Element = event.currentTarget,
): PointMenuPosition => {
  event.preventDefault();
  event.stopPropagation();
  const r = element.getBoundingClientRect();
  return { x: r.left, y: r.top, width: r.width, height: r.height };
};

// Le clic droit ouvre notre menu, pas celui du navigateur. Depuis le clavier,
// l'événement n'a pas de position : le menu se pose sous l'élément.
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
  /** Où le menu se pose contre l'ancre : dessous par défaut. */
  placement?: "bottom-start" | "top-start";
  /** L'écart à l'ancre. */
  offset?: number;
  onClose: () => void;
  returnFocus?: boolean;
  children: ReactNode;
}

// L'ancre est un point invisible posé au clic, portée hors de la page : une
// transformation d'un parent fausserait la position « fixed ».
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
      {/* Les événements React remontent à travers le portail : sans ce
          barrage, un appui dans le menu d'une liste la prendrait pour la
          glisser, et un clic droit rouvrirait le menu ailleurs. */}
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
