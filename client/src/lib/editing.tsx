// « Modifier l'interface » : posé une fois par l'application, lu par les
// listes. En modification, une ligne cède son clic droit au menu du widget
// qui la porte ; hors modification, elle garde le sien.

import { createContext, useContext } from "react";

export const EditingContext = createContext(false);

export const useIsEditing = (): boolean => useContext(EditingContext);
