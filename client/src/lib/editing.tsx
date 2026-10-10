// "Modifier l'interface": set once by the application, read by the
// lists. In edit mode, a row yields its right click to the menu of the widget
// that carries it; outside edit mode, it keeps its own.

import { createContext, useContext } from "react";

export const EditingContext = createContext(false);

export const useIsEditing = (): boolean => useContext(EditingContext);

/**
 * The widget a list is drawn in: how to save its configuration in place, and
 * whether its sections are locked. Set by the registry (widgets/index.tsx)
 * around the lists of a data type: in edit mode, a grid saves its columns'
 * widths through it (ColumnFields, useColumnWidthEditing).
 */
export interface WidgetConfigWriter {
  onChange: (config: Record<string, unknown>) => void | Promise<void>;
  locked: boolean;
}

export const WidgetConfigContext = createContext<WidgetConfigWriter | null>(null);
