import { Box, Button, Text, TextInput } from "@mantine/core";
import { useRef, useState } from "react";
import { IconGripVertical } from "@tabler/icons-react";
import type { ComponentType, CSSProperties, DragEvent } from "react";
import EmptyPanel from "./EmptyPanel";
import { GREEN } from "../../themes/colors";

// L'allure commune des listes du tiroir d'un widget — ses colonnes
// (ChampsColonnes), les catégories et les étiquettes du tableau
// (ChampsListeDuTableau) : des lignes serrées sur un fond gris, une poignée à
// gauche, des champs qui ne se montrent qu'au focus.

/**
 * Le fond d'une ligne, posé à même le tiroir : un gris neutre sur le blanc,
 * et sur le sombre un gris plus clair que lui.
 */
export const ROW_BACKGROUND = "light-dark(#ededed, var(--mantine-color-dark-6))";

/** L'air autour du contenu d'une ligne, et à gauche de sa poignée. */
export const ROW_INSET = 4;
export const NAME_INSET = 10;

/**
 * Le fond d'un champ qu'on est en train de saisir — une largeur au focus, une
 * colonne en liste : celui du tiroir.
 */
export const INPUT_BACKGROUND = "var(--mantine-color-body)";

/** L'arrondi des champs d'une ligne. */
export const ROUNDING = "xs";

/** L'arrondi des bouts de la pile des lignes. */
const RADIUS = 8;

/**
 * Le style d'une ligne : seuls les bouts de la pile s'arrondissent, celles du
 * milieu restent droites ; la ligne qu'on glisse pâlit. À droite, le dernier
 * champ se cale au bord, à l'écart du haut et du bas.
 */
export const rowStyle = (rank: number, total: number, held: boolean): CSSProperties => ({
  padding: `${ROW_INSET}px ${ROW_INSET}px ${ROW_INSET}px ${NAME_INSET}px`,
  borderTopLeftRadius: rank === 0 ? RADIUS : 0,
  borderTopRightRadius: rank === 0 ? RADIUS : 0,
  borderBottomLeftRadius: rank === total - 1 ? RADIUS : 0,
  borderBottomRightRadius: rank === total - 1 ? RADIUS : 0,
  backgroundColor: ROW_BACKGROUND,
  opacity: held ? 0.5 : 1,
});

/** Le champ qu'on saisit : le fond du tiroir, sans trait. */
export const INPUT_STYLE: CSSProperties = { backgroundColor: INPUT_BACKGROUND };

/**
 * Le champ du nom d'une ligne, saisi sur place : sans bordure, à la hauteur
 * d'un champ « xs », transparent sur le gris de la ligne — le fond du tiroir
 * quand il a le focus (« saisi »).
 */
export const nameFieldStyle = (entered: boolean): CSSProperties => ({
  height: "var(--input-height-xs)",
  minHeight: "var(--input-height-xs)",
  paddingLeft: NAME_INSET,
  borderWidth: 0,
  ...(entered ? INPUT_STYLE : { backgroundColor: "transparent" }),
});

interface HandleProps {
  /** Ce que la poignée déplace, pour les lecteurs d'écran. */
  label: string;
  /** Faux tant que la ligne ne se glisse pas — une ligne pas encore remplie. */
  active?: boolean;
  onDragStart: (e: DragEvent<HTMLElement>) => void;
  onDragEnd: () => void;
}

/** La poignée d'une ligne : seule elle se prend, les champs restent des saisies. */
export function Handle({ label, active = true, onDragStart, onDragEnd }: HandleProps) {
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
export const move = <T,>(list: T[], held: number, to: number): T[] | null => {
  if (held === to || to < 0 || to >= list.length) return null;
  const next = [...list];
  const [moved] = next.splice(held, 1);
  next.splice(to, 0, moved!);
  return next;
};

/**
 * Ce qu'une liste du tiroir montre quand elle n'a encore rien — ni catégorie,
 * ni étiquette, ni adresse, ni tag : l'invite des écrans vides, sur le fond
 * des lignes, à la place de la pile. Le bouton « Ajouter » reste dessous.
 */
export function EmptyList({
  icon,
  message,
}: {
  icon: ComponentType<{ size?: number; color?: string }>;
  message: string;
}) {
  return (
    <Box py="md" style={{ backgroundColor: ROW_BACKGROUND, borderRadius: RADIUS }}>
      <EmptyPanel icon={icon} message={message} size="sm" fill={false} />
    </Box>
  );
}

/**
 * Le bouton au bout d'une ligne qui ouvre ce qu'elle porte — les jalons d'un
 * type, les accès d'un workspace — en en disant le nombre : « 3 jalons ». Le
 * vert de l'application.
 */
export function RowButton({
  icon: Icon,
  children,
  onClick,
  rightMargin = NAME_INSET - ROW_INSET,
}: {
  icon: ComponentType<{ size?: number }>;
  children: string;
  onClick: () => void;
  /** L'écart au bout de la ligne, en plus de son retrait (RETRAIT_LIGNE). */
  rightMargin?: number;
}) {
  return (
    <Button
      size="compact-sm"
      radius={3}
      onClick={onClick}
      leftSection={<Icon size={14} />}
      styles={{
        root: {
          flexShrink: 0,
          backgroundColor: GREEN,
          color: "#ffffff",
          fontWeight: 500,
          // Le bout de la ligne n'est qu'à RETRAIT_LIGNE : le bouton s'en
          // écarte jusqu'à RETRAIT_NOM, l'air qu'a le texte à gauche.
          marginRight: rightMargin,
        },
      }}
    >
      {children}
    </Button>
  );
}

/** « 1 jalon », « 3 jalons ». */
export const pluralize = (n: number, word: string) => `${n} ${word}${n > 1 ? "s" : ""}`;

/**
 * Le nom d'une ligne, saisi sur place (styleChampNom). Il part quand on
 * quitte le champ ou qu'on valide (« onValider », le nom sans ses espaces) ;
 * Échap revient au nom d'avant.
 */
export function RowField({
  name,
  onValidate,
  placeholder,
  label,
  autoFocus,
}: {
  name: string;
  onValidate: (name: string) => void;
  placeholder: string;
  label: string;
  autoFocus?: boolean;
}) {
  const [input, setInput] = useState(name);
  const [focus, setFocus] = useState(false);
  // Échap quitte le champ sans rien envoyer : la sortie qui suit le sait.
  const cancelled = useRef(false);
  return (
    <TextInput
      size="sm"
      radius={ROUNDING}
      style={{ flex: 1, minWidth: 0 }}
      styles={{ input: nameFieldStyle(focus) }}
      placeholder={placeholder}
      aria-label={label}
      value={input}
      onChange={(e) => setInput(e.currentTarget.value)}
      onKeyDown={(e) => {
        if (e.key === "Enter") e.currentTarget.blur();
        if (e.key === "Escape") {
          cancelled.current = true;
          e.currentTarget.blur();
        }
      }}
      autoFocus={autoFocus}
      onFocus={() => setFocus(true)}
      onBlur={() => {
        setFocus(false);
        if (cancelled.current) {
          cancelled.current = false;
          setInput(name);
          // Une ligne neuve abandonnée s'efface : elle n'a pas de nom.
          if (!name) onValidate("");
          return;
        }
        onValidate(input.trim());
      }}
    />
  );
}
