// The selects' look reaches every field picked from a list — a MultiSelect
// (main.tsx), a count picker built on a Combobox (ApiTab, SectionsPicker):
// they carry the Select's classes, so that the selects' rules
// (SettingsModal.module.css, SettingsList.module.css) and the theme editor
// (ThemeHighlight) find them too.

/** A select's parts, under their Select class. */
export const SELECT_CLASSES = {
  root: "mantine-Select-root",
  input: "mantine-Select-input",
  section: "mantine-Select-section",
  dropdown: "mantine-Select-dropdown",
  option: "mantine-Select-option",
};
