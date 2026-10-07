import {
  TAB_ACTIVE_BG,
  TAB_ACTIVE_JOINT,
  TAB_ACTIVE_SIZE,
  TAB_ACTIVE_TEXT,
  TAB_ACTIVE_WEIGHT,
} from "./colors";

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
  // tabs on every tab change. Its background, color, size and weight come
  // from the themes ("Onglet actif"); its frame, the row's line (tabs.css).
  // Mantine draws the side open on the panel in the page's color,
  // whatever the orientation: on the tab only, that color becomes its
  // background's.
  ...(isActive
    ? {
        backgroundColor: TAB_ACTIVE_BG,
        "--mantine-color-body": TAB_ACTIVE_JOINT,
        color: TAB_ACTIVE_TEXT,
        fontSize: TAB_ACTIVE_SIZE,
        fontWeight: TAB_ACTIVE_WEIGHT,
        WebkitTextStroke: "0.04em currentColor",
      }
    : {}),
});

/**
 * Height of a row of tabs. Elsewhere, it is the "Actions" button at the end of
 * the row that sets it: a 36-pixel button and a 4-pixel bottom margin. A row
 * that has none — the statuses of the Support mode — would size itself on its
 * tabs alone, six pixels taller than the other modes: it therefore takes the
 * measure from here.
 */
export const TAB_ROW_HEIGHT = 40;
