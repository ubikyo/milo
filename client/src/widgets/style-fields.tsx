import { BLUE, ORANGE, PALETTE_RED, PALETTE_GREEN } from "../themes/colors";

// The colors offered with one click in the drawers' color fields
// (components/ui/SettingRows.tsx).

/**
 * The colors offered with one click, in three rows of six: the application's
 * own and Mantine's other hues (shade 6, that of its buttons) on the first
 * two, then the grays the application uses — true grays, not Mantine's,
 * which lean blue —, from the lightest to the darkest.
 */
export const SHADES = [
  PALETTE_RED,
  ORANGE,
  "#fab005", // yellow
  "#82c91e", // lime
  PALETTE_GREEN,
  "#12b886", // teal
  "#1098ad", // cyan
  BLUE,
  "#4263eb", // indigo
  "#7048e8", // violet
  "#ae3ec9", // grape
  "#d6336c", // pink
  "#ffffff",
  "#ececec", // light neutral hover
  "#c9c9c9", // dark neutral text
  "#a6a6a6",
  "#4d4d4d", // light neutral text
  "#2e2e2e", // dark neutral hover
];

/** The number of shades per row. */
export const SHADES_PER_ROW = 6;

/**
 * The themes' palette (theme editor): Mantine's ten grays and ten
 * darks, the scale's defaults, then the usual shades.
 */
export const THEME_SHADES = [
  "#f8f9fa", "#f1f3f5", "#e9ecef", "#dee2e6", "#ced4da", "#adb5bd", "#868e96", "#495057", "#343a40", "#212529",
  "#c9c9c9", "#b8b8b8", "#828282", "#696969", "#424242", "#3b3b3b", "#2e2e2e", "#242424", "#1f1f1f", "#141414",
  ...SHADES,
];

/** Ten per row: a row for the grays, one for the darks. */
export const THEME_SHADES_PER_ROW = 10;
