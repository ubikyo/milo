import {
  Box,
  getContrastColor,
  getPrimaryShade,
  useComputedColorScheme,
  useMantineTheme,
} from "@mantine/core";
import { useCallback } from "react";

// Couleurs proposées pour une étiquette : huit teintes rangées sur le cercle
// chromatique, du neutre au pourpre, déclinées en huit nuances de la plus
// claire à la plus sombre. La matrice se lit en colonnes de teintes et en
// lignes de nuances. Une couleur s'écrit « teinte.nuance », comme partout chez
// Mantine ; le serveur vérifie la même chose (server/index.js).
export const LABEL_HUES = [
  "gray",
  "red",
  "orange",
  "yellow",
  "green",
  "teal",
  "blue",
  "grape",
];

export const LABEL_SHADES = [2, 3, 4, 5, 6, 7, 8, 9];

// La matrice à plat, ligne par ligne : une nuance, ses huit teintes.
export const LABEL_COLORS = LABEL_SHADES.flatMap((shade) =>
  LABEL_HUES.map((hue) => `${hue}.${shade}`),
);

// Couleur par défaut d'une étiquette : le bleu de la nuance médiane.
export const DEFAULT_LABEL_COLOR = "blue.6";

// Le fond d'une étiquette et le texte qui va dessus. Comme pour les listes du
// tableau, la couleur du texte n'est pas choisie à la main : « getContrastColor »
// de Mantine tranche entre le noir et le blanc d'après la luminosité du fond,
// au seuil réglé pour l'application (main.jsx).
export function useLabelColors() {
  const theme = useMantineTheme();
  const colorScheme = useComputedColorScheme("light");

  return useCallback(
    (color) => {
      // « teinte.nuance », ou la seule teinte pour les étiquettes d'avant la
      // matrice : elles prennent alors la nuance courante du thème.
      const [nom, nuance] = String(color || "").split(".");
      const teinte = theme.colors[nom] ? nom : "blue";
      const rang =
        nuance === undefined ? getPrimaryShade(theme, colorScheme) : Number(nuance);
      const fond = theme.colors[teinte][rang] ?? theme.colors[teinte][6];
      return {
        backgroundColor: fond,
        color: getContrastColor({ color: fond, theme, autoContrast: true, colorScheme }),
      };
    },
    [theme, colorScheme],
  );
}

// Une étiquette : un rectangle de sa couleur, son nom au milieu. Sert partout
// où elle se montre — dans son choix, dans la fiche d'une carte, dans la liste
// qui les gère. « height » lui impose une hauteur fixe, pour qu'elle s'aligne
// sur les bulles des membres.
export default function LabelChip({ label, size = "sm", height, fullWidth = false }) {
  const couleurs = useLabelColors();
  const petite = size === "xs";

  return (
    <Box
      style={{
        ...couleurs(label.color),
        display: fullWidth ? "flex" : "inline-flex",
        alignItems: "center",
        justifyContent: fullWidth ? "flex-start" : "center",
        borderRadius: 4,
        height,
        width: fullWidth ? "100%" : undefined,
        padding: petite ? "1px 6px" : "3px 10px",
        fontSize: petite ? 11 : 12,
        fontWeight: 600,
        lineHeight: 1.4,
        maxWidth: "100%",
        overflow: "hidden",
        textOverflow: "ellipsis",
        whiteSpace: "nowrap",
      }}
    >
      {label.name}
    </Box>
  );
}

// L'étiquette telle qu'elle se pose sur une carte du tableau. Elle a deux
// états : déployée, elle montre son nom ; réduite, il ne reste qu'une barre de
// sa couleur. Le passage de l'un à l'autre s'anime — d'où des mesures chiffrées
// plutôt qu'un « auto », qui ne se laisse pas animer.
const CARD_LABEL_HEIGHT = 20;
const CARD_LABEL_MAX_WIDTH = 200;
const CARD_LABEL_COMPACT_WIDTH = 40;
const CARD_LABEL_COMPACT_HEIGHT = 8;
const CARD_LABEL_TRANSITION = "160ms ease";

export function CardLabel({ label, compact, onClick }) {
  const couleurs = useLabelColors();

  return (
    <Box
      component="button"
      type="button"
      // Le tableau déplace ses cartes au pointeur : cet attribut tient
      // l'étiquette hors du glisser, le sien comme celui de sa liste.
      data-no-list-drag="true"
      data-no-card-drag="true"
      onClick={onClick}
      aria-label={label.name}
      style={{
        ...couleurs(label.color),
        border: "none",
        cursor: "pointer",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: compact ? "center" : "flex-start",
        height: compact ? CARD_LABEL_COMPACT_HEIGHT : CARD_LABEL_HEIGHT,
        width: compact ? CARD_LABEL_COMPACT_WIDTH : undefined,
        maxWidth: compact ? CARD_LABEL_COMPACT_WIDTH : CARD_LABEL_MAX_WIDTH,
        borderRadius: compact ? 2 : 4,
        padding: compact ? 0 : "0 8px",
        fontSize: compact ? 0 : 11,
        fontWeight: 600,
        lineHeight: 1,
        overflow: "hidden",
        whiteSpace: "nowrap",
        textOverflow: "ellipsis",
        transition: [
          `height ${CARD_LABEL_TRANSITION}`,
          `max-width ${CARD_LABEL_TRANSITION}`,
          `border-radius ${CARD_LABEL_TRANSITION}`,
          `padding ${CARD_LABEL_TRANSITION}`,
          `font-size ${CARD_LABEL_TRANSITION}`,
        ].join(", "),
      }}
    >
      {label.name}
    </Box>
  );
}
