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

/**
 * Its actual size: as wide as SETTINGS_WIDTH plus what the tabs gain beyond
 * their 170 px ("Onglets"), and the themes' height ("Fenêtre" > "Hauteur").
 * A workspace's access (WorkspacesTab) takes the same, to cover it exactly.
 * The height is a value of the Settings window's own: elsewhere, it is read
 * from the variable the themes publish for every window (themeColors).
 */
export const SETTINGS_WINDOW_WIDTH = `calc(${SETTINGS_WIDTH}px + var(--milo-settings-tab-width) - 170px)`;
export const SETTINGS_WINDOW_HEIGHT = "var(--milo-settings-window-height)";
export const SETTINGS_OWN_HEIGHT = "var(--milo-settings-own-window-height)";

/** Its inner inset, wider than that of the other windows (MODAL_PADDING). */
export const SETTINGS_PADDING = 40;

/**
 * A panel's scrollbar, moved to the modal's right border and spanning its
 * full height. Same principle as the projects list (ProjectTable), except
 * that it anchors to the modal and not to the screen: it is "content" that
 * carries the reference (position: relative).
 *
 * Left in place, it would straddle the panel's padding and jump from
 * one tab to another depending on what each contains. The panel therefore
 * keeps its full width — the bar is out of the flow — and the content does
 * not shift when it appears. A workspace's access (WorkspacesTab) has the
 * same: its bar in the same place, the same size.
 */
export const SETTINGS_SCROLLBAR_STYLES = {
  root: { position: "static" as const },
  scrollbar: {
    position: "absolute" as const,
    top: 0,
    bottom: 0,
    right: 0,
    left: "auto",
    height: "auto",
    width: "var(--scrollarea-scrollbar-size)",
  },
  // Its color, set in the themes like its width.
  thumb: { backgroundColor: "var(--milo-settings-scrollbar)" },
};
