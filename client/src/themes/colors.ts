import { PALETTE } from "@milo/shared";

// The only red, orange, green and blue of the application. The theme (main.tsx)
// fills Mantine's "red", "orange", "green", "teal" and
// "blue" palettes with them, all shades alike: "red.3" as
// "var(--mantine-color-teal-8)" render one of them, and no other red,
// orange, green or blue appears anywhere.
export const PALETTE_RED = PALETTE.red;
export const ORANGE = PALETTE.orange;
export const PALETTE_GREEN = PALETTE.green;
export const BLUE = PALETTE.blue;

// The application's single red: error messages, header and deletion
// actions. A single source to avoid two neighboring reds.
export const RED = PALETTE_RED;

// The color of a project's progress: red below 30%, orange
// from 30 to 70%, green beyond. Used for the board's bar as for the
// drawer's slider, so that the same percentage reads the same everywhere.
export const statusColor = (status: number): string => {
  if (status < 30) return RED;
  if (status <= 70) return "orange";
  return "teal";
};

/**
 * The color of a milestone that has none — those from before color
 * choice existed, or the one just added: the color the rule above
 * gives to its value, as a label color.
 */
export const defaultMilestoneColor = (value: number): string => {
  if (value < 30) return "red.6";
  if (value <= 70) return "orange.6";
  return "teal.6";
};

/**
 * The color of a project's progress, from the milestones of its
 * category: that of the bracket the progress falls in — the first milestone
 * that reaches it or exceeds it. Without a milestone beyond (or without any milestone),
 * the default rule takes over again.
 */
export const progressColor = (
  status: number,
  milestones: { value: number; color?: string }[] = [],
): string => {
  const band = [...milestones]
    .sort((a, b) => a.value - b.value)
    .find((m) => status <= m.value);
  if (!band) return statusColor(status);
  return band.color ?? defaultMilestoneColor(band.value);
};

// Green of success messages: the counterpart of the red above, in the same
// role — a frame that reports what has just happened.
//
// The application's single green, on both themes.
export const GREEN = PALETTE_GREEN;

// Header of the modals, and its title — color, size, weight: dark gray and a
// thin white title by default, set in the themes ("Fenêtre de dialogue").
export const DARK_HEADER = "var(--milo-dark-header)";
export const DARK_HEADER_TEXT = "var(--milo-dark-header-text)";
export const DARK_HEADER_SIZE = "var(--milo-dark-header-size)";
export const DARK_HEADER_WEIGHT = "var(--milo-dark-header-weight)";

// The tabs' row background and text — color, size, weight —; the active
// tab's background, text, and line — its frame and the row's line along the
// others: set in the themes ("Onglets", "Onglet actif").
export const TAB_TEXT = "var(--milo-tab-text)";
export const TAB_SIZE = "var(--milo-tab-size)";
export const TAB_WEIGHT = "var(--milo-tab-weight)";
export const TAB_ACTIVE_BG = "var(--milo-tab-active-bg)";
export const TAB_ACTIVE_JOINT = "var(--milo-tab-active-joint)";
export const TAB_ACTIVE_TEXT = "var(--milo-tab-active-text)";
export const TAB_ACTIVE_BORDER = "var(--milo-tab-active-border)";
export const TAB_ACTIVE_BORDER_WIDTH = "var(--milo-tab-active-border-width)";
export const TAB_ACTIVE_SIZE = "var(--milo-tab-active-size)";
export const TAB_ACTIVE_WEIGHT = "var(--milo-tab-active-weight)";

// Green of the "add" actions placed at the end of a list, and its shade on
// hover: a tone darker, without background. Each theme has its pair, otherwise the
// hover would darken until unreadable on a dark background.
/**
 * The dotted line and the "+" that insert a card between two cards, a
 * list between two lists, a section between two sections. It goes all the way to
 * white: it only has a one-pixel dotted line to make itself seen.
 */
export const INSERT_LINE = "var(--mantine-color-white)";

export const ADD_ACTION = {
  color: "light-dark(var(--mantine-color-teal-6), var(--mantine-color-teal-4))",
  hover: "light-dark(var(--mantine-color-teal-8), var(--mantine-color-teal-6))",
};

// White on a dark background, near-black on a light one: maximum contrast in
// both themes. Used for modal titles and the active tab.
export const STRONG_TEXT = "var(--milo-strong-text)";

// Hover of a gray button: Mantine's grays lean blue, this one
// is frankly neutral. Light gray on the light theme, dark gray on the
// dark one.
export const NEUTRAL_HOVER = "var(--milo-sunken-bg)";

// Text of a gray button without background — "Fermer": Mantine's gray leans
// blue, this one is neutral. Dark on the light theme, light on the dark one.
export const NEUTRAL_TEXT = "var(--milo-neutral-text)";

// Behind the options of a segmented choice: a neutral gray, where Mantine's
// leans blue. The chosen option stands on it in green.
export const SEGMENTS_BG = "var(--milo-subtle-bg)";

// The focus line: gray, never the blue of Mantine's primary color.
// Two shades, one per theme — a dark gray would get lost on the dark background,
// where a light gray stands out.
export const FOCUS_BORDER = "var(--milo-field-icon)";

// Icons placed in a field — the editor's bar, the end of a checklist
// or attachment row: the gray of Mantine's toolbar,
// dark on the light theme, light on the dark one.
export const FIELD_ICON = "var(--milo-field-icon)";

// Background of a "framed" element: it stands out from the page without a line or
// shadow. It is the neutral hover gray above, set this time
// permanently — darker than the background on the light theme, lighter on the
// dark one, at the same distance from the background in both cases.
export const SUNKEN_BG = NEUTRAL_HOVER;
