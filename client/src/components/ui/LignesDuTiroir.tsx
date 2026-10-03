import { Box, Text } from "@mantine/core";
import { IconGripVertical } from "@tabler/icons-react";
import type { CSSProperties, DragEvent } from "react";

// L'allure commune des listes du tiroir d'un widget — ses colonnes
// (ChampsColonnes), les catégories et les étiquettes du tableau
// (ChampsListeDuTableau) : des lignes serrées sur un fond gris, une poignée à
// gauche, des champs qui ne se montrent qu'au focus.

/**
 * Le fond d'une ligne, posé à même le tiroir : un gris neutre sur le blanc,
 * et sur le sombre un gris plus clair que lui.
 */
export const FOND_LIGNE = "light-dark(#ededed, var(--mantine-color-dark-6))";

/** L'air autour du contenu d'une ligne, et à gauche de sa poignée. */
export const RETRAIT_LIGNE = 4;
export const RETRAIT_NOM = 10;

/**
 * Le fond d'un champ qu'on est en train de saisir — une largeur au focus, une
 * colonne en liste : celui du tiroir.
 */
export const FOND_SAISIE = "var(--mantine-color-body)";

/** L'arrondi des champs d'une ligne. */
export const ARRONDI = "xs";

/** L'arrondi des bouts de la pile des lignes. */
const RAYON = 8;

/**
 * Le style d'une ligne : seuls les bouts de la pile s'arrondissent, celles du
 * milieu restent droites ; la ligne qu'on glisse pâlit. À droite, le dernier
 * champ se cale au bord, à l'écart du haut et du bas.
 */
export const styleLigne = (rang: number, total: number, tenue: boolean): CSSProperties => ({
  padding: `${RETRAIT_LIGNE}px ${RETRAIT_LIGNE}px ${RETRAIT_LIGNE}px ${RETRAIT_NOM}px`,
  borderTopLeftRadius: rang === 0 ? RAYON : 0,
  borderTopRightRadius: rang === 0 ? RAYON : 0,
  borderBottomLeftRadius: rang === total - 1 ? RAYON : 0,
  borderBottomRightRadius: rang === total - 1 ? RAYON : 0,
  backgroundColor: FOND_LIGNE,
  opacity: tenue ? 0.5 : 1,
});

/** Le champ qu'on saisit : le fond du tiroir, sans trait. */
export const STYLE_SAISIE: CSSProperties = { backgroundColor: FOND_SAISIE };

interface PoigneeProps {
  /** Ce que la poignée déplace, pour les lecteurs d'écran. */
  label: string;
  /** Faux tant que la ligne ne se glisse pas — une ligne pas encore remplie. */
  active?: boolean;
  onDragStart: (e: DragEvent<HTMLElement>) => void;
  onDragEnd: () => void;
}

/** La poignée d'une ligne : seule elle se prend, les champs restent des saisies. */
export function Poignee({ label, active = true, onDragStart, onDragEnd }: PoigneeProps) {
  return (
    <Box
      draggable={active}
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = "move";
        e.dataTransfer.setData("text/plain", label);
        onDragStart(e);
      }}
      onDragEnd={onDragEnd}
      aria-label={label}
      style={{ display: "flex", cursor: "grab" }}
    >
      <Text c="dimmed" component="span" style={{ display: "flex" }}>
        <IconGripVertical size={16} />
      </Text>
    </Box>
  );
}

/**
 * Le nouvel ordre quand la ligne tenue survole celle de rang « vers » : elle
 * en prend la place. « null » quand rien ne bouge.
 */
export const deplacer = <T,>(liste: T[], tenue: number, vers: number): T[] | null => {
  if (tenue === vers || vers < 0 || vers >= liste.length) return null;
  const suivante = [...liste];
  const [deplacee] = suivante.splice(tenue, 1);
  suivante.splice(vers, 0, deplacee!);
  return suivante;
};
