// Settings of the "Affichage" section of the Settings. They apply to the
// whole application, not to an account.

export interface DisplaySettings {
  /** Shows people's Gravatar in the actors' avatars and the profile; without
   *  it, only their initials. */
  showGravatars: boolean;
  /** Forgives typing mistakes in the search; without it, only the text as
   *  typed is found, whatever "searchThreshold" says. */
  fuzzySearch: boolean;
  /**
   * How far the search (Spotlight) strays from what is typed: Fuse.js's
   * threshold, from 0 (the text as typed, nothing else) to 1 (anything).
   */
  searchThreshold: number;
}

/** The search's tolerance by default: a letter or two off in a short word. */
export const DEFAULT_SEARCH_THRESHOLD = 0.45;
