// Settings of the "Affichage" section of the Settings. They apply to the
// whole application, not to an account.

export interface DisplaySettings {
  /** Shows people's Gravatar in the actors' avatars and the profile; without
   *  it, only their initials. */
  showGravatars: boolean;
}
