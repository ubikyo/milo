import { BLUE, ORANGE, PALETTE_RED, PALETTE_GREEN } from "../themes/colors";

// Les couleurs proposées d'un clic dans les champs couleur des tiroirs
// (components/ui/LignesReglages.tsx).

/**
 * Les couleurs proposées d'un clic, sur deux rangées de sept : celles de
 * l'application, les autres teintes de Mantine (nuance 6, celle de ses
 * boutons), et des neutres — des gris francs, pas ceux de Mantine, qui tirent
 * sur le bleu.
 */
export const SHADES = [
  PALETTE_RED,
  ORANGE,
  "#fab005", // jaune
  "#82c91e", // lime
  PALETTE_GREEN,
  "#1098ad", // cyan
  BLUE,
  "#4263eb", // indigo
  "#7048e8", // violet
  "#ae3ec9", // grape
  "#d6336c", // rose
  "#ffffff",
  "#c4c4c4",
  "#4d4d4d",
];

/** Le nombre de nuances par rangée. */
export const SHADES_PER_ROW = 7;
