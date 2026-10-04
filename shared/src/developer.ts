// Settings of the "Développeur" section of the Settings. They apply to
// the whole application, not to an account.

export interface DeveloperSettings {
  /**
   * Debug: text selection and the browser right-click menu
   * come back everywhere. Off, the interface goes without them — it is handled
   * like an application, not like a page.
   */
  debug: boolean;
}
