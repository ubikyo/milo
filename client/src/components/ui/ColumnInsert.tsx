import { IconPlus } from "@tabler/icons-react";
import { useState } from "react";
import { INSERT_LINE } from "../../themes/colors";
import { PLUS_SIZE } from "../../themes/plus";
import type { CSSProperties, PointerEvent as ReactPointerEvent } from "react";

// Insérer une colonne entre deux autres : un trait pointillé vertical avec un
// « + » au milieu, qui n'apparaît qu'au survol — celui qui insère une carte
// entre deux cartes, debout. Sert aux sections du mode Accès et aux listes du
// mode Tâche. Posé en absolu dans l'écart entre deux colonnes, il ne prend
// aucune place : « style » dit où.
//
// « onResizeStart » fait aussi de l'écart une poignée : glissé, il
// redimensionne une colonne voisine ; cliqué sans bouger, il insère toujours.

/** La largeur visée : plus large que le trait, pour qu'il soit facile à viser. */
export const COLUMN_INSERT_ZONE = 12;

interface ColumnInsertProps {
  style: CSSProperties;
  onClick: () => void;
  label: string;
  /** L'appui qui peut devenir un redimensionnement d'une colonne voisine. */
  onResizeStart?: (event: ReactPointerEvent<HTMLDivElement>) => void;
}

export default function ColumnInsert({ style, onClick, label, onResizeStart }: ColumnInsertProps) {
  const [hovering, setHovered] = useState(false);
  const line = { flex: 1, borderLeft: `1px dashed ${INSERT_LINE}` };
  return (
    <div
      // Ni la liste voisine ni la rangée ne doivent prendre cet appui pour
      // un glisser.
      data-no-list-drag="true"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={onClick}
      onPointerDown={onResizeStart}
      aria-label={label}
      title={onResizeStart ? "Glisser pour redimensionner, cliquer pour insérer" : undefined}
      style={{
        position: "absolute",
        top: 0,
        bottom: 0,
        width: COLUMN_INSERT_ZONE,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 6,
        cursor: onResizeStart ? "col-resize" : "pointer",
        touchAction: onResizeStart ? "none" : undefined,
        color: INSERT_LINE,
        opacity: hovering ? 0.8 : 0,
        transition: "opacity 120ms",
        zIndex: 1,
        ...style,
      }}
    >
      <span style={line} />
      <IconPlus size={PLUS_SIZE} style={{ flexShrink: 0 }} />
      <span style={line} />
    </div>
  );
}
