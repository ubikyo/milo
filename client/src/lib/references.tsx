// Les listes de référence dont les réglages des widgets ont besoin : les
// contextes du tableau ouvert, les tags que les agents d'inventaire
// remontent. Le tiroir d'un widget ne reçoit que sa configuration : il les lit
// ici, posées une fois par l'application.

import { createContext, useContext } from "react";
import type { Context } from "@milo/shared";

export interface References {
  /** Les contextes du tableau ouvert, dans l'ordre. */
  contexts: Context[];
  /** Les tags GLPI des postes connus, sans doublon, triés. */
  assetTags: string[];
}

export const ReferencesContext = createContext<References>({ contexts: [], assetTags: [] });

export const useReferences = (): References => useContext(ReferencesContext);
