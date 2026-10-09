// The windows the theme editor knows apart: every modal, and the widgets
// drawer, carry the windows' styles ("data-theme-scope"), and a name of
// their own ("data-theme-window"). A style may then take a value for one of
// them only — "settings-bg@profile" —, which the themes' style sheet sets on
// that window alone (themeColors).

export const THEME_SCOPE_ATTRIBUTE = "data-theme-scope";
export const THEME_WINDOW_ATTRIBUTE = "data-theme-window";

/** A window's content attributes (Mantine's "attributes"): the windows' styles, and its name. */
export const themeWindow = (id: string) => ({
  content: { [THEME_SCOPE_ATTRIBUTE]: "settings", [THEME_WINDOW_ATTRIBUTE]: id },
});
