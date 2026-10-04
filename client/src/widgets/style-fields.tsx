import { BLUE, ORANGE, PALETTE_RED, PALETTE_GREEN } from "../themes/colors";

// The colors offered with one click in the drawers' color fields
// (components/ui/SettingRows.tsx).

/**
 * The colors offered with one click, in two rows of seven: the application's
 * own, Mantine's other hues (shade 6, that of its buttons), and neutrals —
 * true grays, not Mantine's, which lean blue.
 */
export const SHADES = [
  PALETTE_RED,
  ORANGE,
  "#fab005", // yellow
  "#82c91e", // lime
  PALETTE_GREEN,
  "#1098ad", // cyan
  BLUE,
  "#4263eb", // indigo
  "#7048e8", // violet
  "#ae3ec9", // grape
  "#d6336c", // pink
  "#ffffff",
  "#c4c4c4",
  "#4d4d4d",
];

/** The number of shades per row. */
export const SHADES_PER_ROW = 7;
