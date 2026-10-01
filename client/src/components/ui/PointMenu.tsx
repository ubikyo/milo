import { Menu } from "@mantine/core";
import { createPortal } from "react-dom";
import type { MouseEvent as ReactMouseEvent, ReactNode } from "react";

// Un menu contextuel : ouvert au clic droit, posé au point cliqué. Sert aux
// listes et aux cartes du mode Tâche comme aux onglets des modes.

/** Là où s'ouvre un menu contextuel : le point du clic droit. */
export interface PointMenuPosition {
  x: number;
  y: number;
}

// Le clic droit ouvre notre menu, pas celui du navigateur. Depuis le clavier,
// l'événement n'a pas de position : le menu se pose sous l'élément.
export const positionDuMenu = (event: ReactMouseEvent<HTMLElement>): PointMenuPosition => {
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
  onClose: () => void;
  returnFocus?: boolean;
  children: ReactNode;
}

// L'ancre est un point invisible posé au clic, portée hors de la page : une
// transformation d'un parent fausserait la position « fixed ».
export default function PointMenu({ position, onClose, returnFocus, children }: PointMenuProps) {
  return createPortal(
    <Menu
      opened
      onChange={(ouvert) => !ouvert && onClose()}
      position="bottom-start"
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
            width: 1,
            height: 1,
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
