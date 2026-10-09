import type { CSSProperties } from "react";
import { NEUTRAL_TEXT, STRONG_TEXT } from "./colors";
import { TAB_ROW_HEIGHT } from "./tabs";

// The menus hanging from a row of tabs — "Actions", the company, the
// account — do not float: they rest on the rule that closes the row. The menu
// thus appears to come out of the tabs rather than sit on top of them.

/**
 * Height of the controls placed in a mode's row. All three — the two buttons
 * and the account badge — share it, otherwise they would not align and their
 * menus would drop at different heights.
 */
export const ROW_CONTROL_HEIGHT = 30;

/**
 * What separates the bottom of a control from the rule: the control is centered
 * in the row, so half of the difference remains on each side. That is the gap
 * the menu fills to touch the rule.
 */
export const ROW_MENU_OFFSET = (TAB_ROW_HEIGHT - ROW_CONTROL_HEIGHT) / 2;

/**
 * The same gap in a drawer's row of tabs. There, no height is imposed: the
 * button provides it, and only the bottom margin it gives itself to stand off
 * the rule remains.
 */
export const DRAWER_MENU_OFFSET = 4;

/**
 * The menu joins the rule: its top border would make a double line, and its
 * top corners a step.
 */
export const TAB_MENU_STYLES = {
  dropdown: {
    borderTop: "none",
    borderTopLeftRadius: 0,
    borderTopRightRadius: 0,
  },
} as const;

/**
 * The "Actions" button: bare text, with no background or inner padding, even on
 * hover or when disabled. Only the text reacts to hover, going from neutral
 * gray to maximum contrast. The button keeps its height: the gaps above are
 * computed from it so that the menu opens below the rule.
 */
export const ACTIONS_BUTTON_STYLE = {
  background: "transparent",
  padding: 0,
  "--button-color": NEUTRAL_TEXT,
  "--button-hover-color": STRONG_TEXT,
} as CSSProperties;
