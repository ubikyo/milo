// Settings of the "Affichage" section of the Settings. They apply to the
// whole application, not to an account.

export interface DisplaySettings {
  /** Shows people's Gravatar in the actors' avatars and the profile; without
   *  it, only their initials. */
  showGravatars: boolean;
  /** "Labo" > "Thèmes": the themes, still in development. Off, the themes'
   *  list, the theme editor and the profile's theme are hidden. */
  labThemes: boolean;
}
