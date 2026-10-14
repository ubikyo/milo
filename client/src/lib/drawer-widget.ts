// The widget whose drawer is open (IndicatorDrawer), for the fields that show
// it — the "Widgets associés" screen (components/ui/WidgetLinks.tsx). In a
// module of its own: edited, the screen would otherwise get a new context
// (Fast Refresh) that the drawer does not provide.

import { createContext } from "react";
import type { ComponentType } from "react";

export type Icon = ComponentType<{ size?: number; stroke?: number }>;

/** The widget whose drawer is open, and how to name and draw the others (IndicatorDrawer). */
export interface DrawerWidget {
  label: string;
  icon: Icon;
  /** "#A1B2", once saved, for a widget that owns its key; empty otherwise. */
  reference?: string;
  widgetOf: (type: string) => { label: string; icon: Icon } | undefined;
}

export const DrawerWidgetContext = createContext<DrawerWidget | null>(null);
