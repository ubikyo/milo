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

/**
 * Le champ du nom d'une ligne, saisi sur place : sans bordure, à la hauteur
 * d'un champ « xs », transparent sur le gris de la ligne — le fond du tiroir
 * quand il a le focus (« saisi »).
 */
export const styleChampNom = (saisi: boolean): CSSProperties => ({
  height: "var(--input-height-xs)",
  minHeight: "var(--input-height-xs)",
  paddingLeft: RETRAIT_NOM,
  borderWidth: 0,
  ...(saisi ? STYLE_SAISIE : { backgroundColor: "transparent" }),
});

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

/**
 * Ce qu'une liste du tiroir montre quand elle n'a encore rien — ni catégorie,
 * ni étiquette, ni adresse, ni tag : l'invite des écrans vides, sur le fond
 * des lignes, à la place de la pile. Le bouton « Ajouter » reste dessous.
 */
export function ListeVide({
  icon,
  message,
}: {
  icon: ComponentType<{ size?: number; color?: string }>;
  message: string;
}) {
  return (
    <Box py="md" style={{ backgroundColor: FOND_LIGNE, borderRadius: RAYON }}>
      <EmptyPanel icon={icon} message={message} size="sm" fill={false} />
    </Box>
  );
}

/**
 * Le bouton au bout d'une ligne qui ouvre ce qu'elle porte — les jalons d'un
 * type, les accès d'un workspace — en en disant le nombre : « 3 jalons ». Le
 * vert de l'application.
 */
export function BoutonDeLigne({
  icon: Icone,
  children,
  onClick,
  margeDroite = RETRAIT_NOM - RETRAIT_LIGNE,
}: {
  icon: ComponentType<{ size?: number }>;
  children: string;
  onClick: () => void;
  /** L'écart au bout de la ligne, en plus de son retrait (RETRAIT_LIGNE). */
  margeDroite?: number;
}) {
  return (
    <Button
      size="compact-sm"
      radius={3}
      onClick={onClick}
      leftSection={<Icone size={14} />}
      styles={{
        root: {
          flexShrink: 0,
          backgroundColor: GREEN,
          color: "#ffffff",
          fontWeight: 500,
          // Le bout de la ligne n'est qu'à RETRAIT_LIGNE : le bouton s'en
          // écarte jusqu'à RETRAIT_NOM, l'air qu'a le texte à gauche.
          marginRight: margeDroite,
        },
      }}
    >
      {children}
    </Button>
  );
}

/** « 1 jalon », « 3 jalons ». */
export const pluriel = (n: number, mot: string) => `${n} ${mot}${n > 1 ? "s" : ""}`;

/**
 * Le nom d'une ligne, saisi sur place (styleChampNom). Il part quand on
 * quitte le champ ou qu'on valide (« onValider », le nom sans ses espaces) ;
 * Échap revient au nom d'avant.
 */
export function ChampDeLigne({
  nom,
  onValider,
  placeholder,
  label,
  autoFocus,
}: {
  nom: string;
  onValider: (nom: string) => void;
  placeholder: string;
  label: string;
  autoFocus?: boolean;
}) {
  const [saisie, setSaisie] = useState(nom);
  const [focus, setFocus] = useState(false);
  // Échap quitte le champ sans rien envoyer : la sortie qui suit le sait.
  const annule = useRef(false);
  return (
    <TextInput
      size="sm"
      radius={ARRONDI}
      style={{ flex: 1, minWidth: 0 }}
      styles={{ input: styleChampNom(focus) }}
      placeholder={placeholder}
      aria-label={label}
      value={saisie}
      onChange={(e) => setSaisie(e.currentTarget.value)}
      onKeyDown={(e) => {
        if (e.key === "Enter") e.currentTarget.blur();
        if (e.key === "Escape") {
          annule.current = true;
          e.currentTarget.blur();
        }
      }}
      autoFocus={autoFocus}
      onFocus={() => setFocus(true)}
      onBlur={() => {
        setFocus(false);
        if (annule.current) {
          annule.current = false;
          setSaisie(nom);
          // Une ligne neuve abandonnée s'efface : elle n'a pas de nom.
          if (!nom) onValider("");
          return;
        }
        onValider(saisie.trim());
      }}
    />
  );
}
