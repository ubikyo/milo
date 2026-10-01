import { IconPlus } from "@tabler/icons-react";
import { useState } from "react";
import { INSERT_LINE } from "../../themes/colors";
import { PLUS_SIZE } from "../../themes/plus";
import type { CSSProperties } from "react";

// Insérer une colonne entre deux autres : un trait pointillé vertical avec un
// « + » au milieu, qui n'apparaît qu'au survol — celui qui insère une carte
// entre deux cartes, debout. Sert aux sections du mode Accès et aux listes du
// mode Tâche. Posé en absolu dans l'écart entre deux colonnes, il ne prend
// aucune place : « style » dit où.

/** La largeur visée : plus large que le trait, pour qu'il soit facile à viser. */
export const COLUMN_INSERT_ZONE = 12;

interface ColumnInsertProps {
  style: CSSProperties;
  onClick: () => void;
  label: string;
}

export default function ColumnInsert({ style, onClick, label }: ColumnInsertProps) {
  const [survole, setSurvole] = useState(false);
  const trait = { flex: 1, borderLeft: `1px dashed ${INSERT_LINE}` };
  return (
    <div
      // Ni la liste voisine ni la rangée ne doivent prendre cet appui pour
      // un glisser.
      data-no-list-drag="true"
      onMouseEnter={() => setSurvole(true)}
      onMouseLeave={() => setSurvole(false)}
      onClick={onClick}
      aria-label={label}
      style={{
        position: "absolute",
        top: 0,
        bottom: 0,
        width: COLUMN_INSERT_ZONE,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 6,
        cursor: "pointer",
        color: INSERT_LINE,
        opacity: survole ? 0.8 : 0,
        transition: "opacity 120ms",
        zIndex: 1,
        ...style,
      }}
    >
      <span style={trait} />
      <IconPlus size={PLUS_SIZE} style={{ flexShrink: 0 }} />
      <span style={trait} />
    </div>
  );
}
