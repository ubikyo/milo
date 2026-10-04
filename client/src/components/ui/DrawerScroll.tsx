import { ScrollArea } from "@mantine/core";
import type { CSSProperties, ReactNode } from "react";
import classes from "../../assets/styles/CardDrawer.module.css";

/** The drawers' inset, which the scrollbar must also know about. */
export const DRAWER_PADDING = 40;

/**
 * The styles of a drawer where only the open tab's panel scrolls: the tabs and
 * the bottom buttons stay in place, whatever the window height, and the content
 * always stops above the buttons.
 *
 * The drawer is the scrollbar's reference, which runs its full height along its
 * right edge (assets/styles/CardDrawer.module.css): everything between them
 * stays "static".
 */
export const DRAWER_STYLES = {
  content: {
    display: "flex",
    flexDirection: "column",
    position: "relative",
    "--milo-drawer-padding": `${DRAWER_PADDING}px`,
  } as CSSProperties,
  body: {
    flex: 1,
    display: "flex",
    flexDirection: "column",
    overflow: "hidden",
    position: "static",
  } as CSSProperties,
};

/**
 * The styles of the drawer's tabs: the inset under the tab bar, set once so
 * that all panels start at the same height, and the panels in "static" to let
 * the bar position itself on the drawer.
 */
export const DRAWER_TABS_STYLES = {
  panel: { paddingTop: 20, position: "static" as const },
};

/** A tab panel that takes the full free height of the drawer. */
export const DRAWER_PANEL_STYLE: CSSProperties = {
  flex: 1,
  minHeight: 0,
  display: "flex",
  flexDirection: "column",
};

interface DrawerScrollAreaProps {
  children: ReactNode;
  /**
   * The content takes at least the whole height of the zone: an empty comment
   * thread centers its prompt there.
   */
  fill?: boolean;
}

/**
 * The zone that scrolls inside a drawer panel. Its bar shows as soon as the
 * content overflows, laid on the drawer's right edge.
 */
export default function DrawerScrollArea({
  children,
  fill = false,
}: DrawerScrollAreaProps) {
  return (
    <ScrollArea
      type="auto"
      scrollbars="y"
      classNames={{
        root: classes.root,
        scrollbar: `${classes.scrollbar} ${classes.scrollbarRight}`,
        thumb: classes.thumb,
        ...(fill ? { viewport: classes.viewport } : {}),
      }}
      style={{ flex: 1, minHeight: 0 }}
    >
      {children}
    </ScrollArea>
  );
}
