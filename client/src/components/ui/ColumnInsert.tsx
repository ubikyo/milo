import { IconPlus } from "@tabler/icons-react";
import { useState } from "react";
import { INSERT_LINE } from "../../themes/colors";
import { PLUS_SIZE } from "../../themes/plus";
import type { CSSProperties, PointerEvent as ReactPointerEvent } from "react";

// Insert a column between two others: a vertical dotted line with a "+" in the
// middle, which only appears on hover — the one that inserts a card between two
// cards, upright. Used by the sections of Access mode and the lists of Task
// mode. Placed absolutely in the gap between two columns, it takes up no space:
// "style" says where.
//
// "onResizeStart" also turns the gap into a handle: dragged, it resizes a
// neighboring column; clicked without moving, it still inserts.

/** The target width: wider than the line, so it is easy to aim at. */
export const COLUMN_INSERT_ZONE = 12;

interface ColumnInsertProps {
  style: CSSProperties;
  onClick: () => void;
  label: string;
  /** The press that can become a resize of a neighboring column. */
  onResizeStart?: (event: ReactPointerEvent<HTMLDivElement>) => void;
}

export default function ColumnInsert({ style, onClick, label, onResizeStart }: ColumnInsertProps) {
  const [hovering, setHovered] = useState(false);
  const line = { flex: 1, borderLeft: `1px dashed ${INSERT_LINE}` };
  return (
    <div
      // Neither the neighboring list nor the row must take this press for a
      // drag.
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
