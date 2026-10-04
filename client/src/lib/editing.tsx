// "Modifier l'interface": set once by the application, read by the
// lists. In edit mode, a row yields its right click to the menu of the widget
// that carries it; outside edit mode, it keeps its own.

import { createContext, useContext } from "react";

export const EditingContext = createContext(false);

export const useIsEditing = (): boolean => useContext(EditingContext);
