// The reference lists that widget settings need: the
// open board's contexts, the tags that inventory agents
// report back. A widget's drawer only receives its configuration: it reads them
// here, set once by the application.

import { createContext, useContext } from "react";
import type { Context } from "@milo/shared";

export interface References {
  /** The open board's contexts, in order. */
  contexts: Context[];
  /** The GLPI tags of known workstations, without duplicates, sorted. */
  assetTags: string[];
}

export const ReferencesContext = createContext<References>({ contexts: [], assetTags: [] });

export const useReferences = (): References => useContext(ReferencesContext);
