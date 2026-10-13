import { createContext, useContext } from "react";
import { DEFAULT_SEARCH_THRESHOLD } from "@milo/shared";
import type { SearchKind } from "@milo/shared";

// The search's tolerance, as the signed-in person set it in their profile
// (PreferencesModal): the Spotlight searches with it (SearchBox). The
// application provides it (App).

export interface SearchPreferences {
  fuzzy: boolean;
  threshold: number;
  /** The kinds of content left out. */
  excluded: SearchKind[];
}

export const SearchPreferencesContext = createContext<SearchPreferences>({
  fuzzy: true,
  threshold: DEFAULT_SEARCH_THRESHOLD,
  excluded: [],
});

export const useSearchPreferences = (): SearchPreferences => useContext(SearchPreferencesContext);
