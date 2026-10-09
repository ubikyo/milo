import { DARK_HEADER, DARK_HEADER_SIZE, DARK_HEADER_TEXT, DARK_HEADER_WEIGHT } from "./colors";

// Header shared by modal windows and drawers — Mantine builds them on the
// same base: a dark gray banner and a white title by default; the banner's
// color, and the title's color, size and weight, are set in the themes.
//
// "padding" is the window's inset: it restores the top one of the body, which
// Mantine removes as soon as there is a header, and the banner takes half of
// it to stay thin. The end inset is set explicitly, otherwise Mantine computes
// it from the window's inset and the two sides of the banner would be unequal.
//
// By default, the title uses the font's thinnest weight, and is one fifth
// larger than Mantine's size (16 × 1.2 ≈ 19 px). Same title for all windows
// and drawers.
//
// Not all fonts have a weight of 100: the browser then takes the thinnest it
// has, often the normal one. The title therefore relies on nothing but its
// size and its banner to stand out.

// Inset of small windows — confirmation, quick entry: double Mantine's
// "md".
export const MODAL_PADDING = 32;

/** Half the inset: a number, or a CSS value — a theme's variable. */
const half = (padding: number | string) =>
  typeof padding === "number" ? padding / 2 : `calc(${padding} / 2)`;

export const modalHeaderStyles = (padding: number | string) => ({
  title: {
    fontWeight: DARK_HEADER_WEIGHT,
    color: DARK_HEADER_TEXT,
    fontSize: DARK_HEADER_SIZE,
  },
  header: {
    backgroundColor: DARK_HEADER,
    padding: half(padding),
    paddingInlineEnd: half(padding),
  },
  body: { paddingTop: padding },
});

/**
 * The width of the Settings window, reused by the windows that open from it —
 * a workspace's access (WorkspacesTab).
 */
export const SETTINGS_WIDTH = 900;

/**
 * Its height's cap, the screen's: the windows opened from it reuse it too.
 * Its height is the themes' ("Fenêtre" > "Hauteur").
 */
export const SETTINGS_HEIGHT_MAX = "90vh";

/** Its inner inset, wider than that of the other windows (MODAL_PADDING). */
export const SETTINGS_PADDING = 40;
