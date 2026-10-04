// The page inset, in pixels: the same at the top and on the sides, and the
// same for the two controls placed in the bottom corners — the mode switch on
// the left, the "?" of the shortcuts on the right. A single value, otherwise
// they end up no longer aligned with the content.
export const PAGE_GUTTER = 50;

/**
 * What separates the bottom of the content from the mode switch. The content
 * stops there: it does not pass behind the control, and does not leave an
 * empty band beside it either.
 */
export const BOTTOM_CLEARANCE = 30;

/**
 * The top of the view switch, measured from the bottom of the window. Published
 * by the switch itself (components/ui/ViewSwitch.tsx), since only it knows its
 * height — it changes with the text size and the number of views. The fallback
 * value covers the first render, before it has been able to measure itself:
 * the page inset, plus the height of the switch without inner padding.
 */
export const MODE_SWITCH_TOP = "--milo-modeswitch-top";
export const MODE_SWITCH_TOP_FALLBACK = 78;
