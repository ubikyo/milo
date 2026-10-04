import { STRONG_TEXT } from "./colors";

// Style shared by all the application's tabs (settings, project drawer,
// boards of the Projects and Tasks modes). The "outline" variant is set once
// and for all in the theme (main.jsx): the tabs are framed and the active one
// joins the panel.
//
// No colored accent: the gray rule of the frame already locates the open tab,
// which stands out only through a more contrasted and bolder text.
export const tabStyle = (isActive: boolean) => ({
  // No focus ring. Drawers and modals give focus to the first tab as soon as
  // they open, which surrounded it with blue although nobody had navigated by
  // keyboard. The frame and the bolder text are enough to locate the open tab,
  // including by keyboard: the arrows change the active tab, and so its
  // appearance.
  outline: "none",
  // The active tab's boldness is drawn with a text outline, not with the
  // font weight: a real weight widens the label and shifts all the following
  // tabs on every tab change.
  ...(isActive ? { color: STRONG_TEXT, WebkitTextStroke: "0.04em currentColor" } : {}),
});

/**
 * Height of a row of tabs. Elsewhere, it is the "Actions" button at the end of
 * the row that sets it: a 36-pixel button and a 4-pixel bottom margin. A row
 * that has none — the statuses of the Support mode — would size itself on its
 * tabs alone, six pixels taller than the other modes: it therefore takes the
 * measure from here.
 */
export const TAB_ROW_HEIGHT = 40;
