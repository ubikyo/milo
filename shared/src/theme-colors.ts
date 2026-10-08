// The colors of the light and dark themes, set in the theme editor
// ("Paramétrage" > "Affichage").
// They apply to the whole application, not to an account.
//
// Each color has a value per theme. Its default is a hexadecimal value, a
// shade of the scale ("gray.6" on the light theme, "dark.6" on the dark one),
// or another of these colors ("@body"): a change of that shade or that color
// then carries over to every color that uses it.
// Only the colors that differ from their default are stored, as #RRGGBBAA.

/** A shade of the scale, another color ("@body"), a hexadecimal value, or Mantine's white or black. */
export type ThemeColorValue = string;

export interface ThemeColorDefinition {
  key: string;
  group: string;
  label: string;
  /** What the color is used for, under its name. */
  hint?: string;
  light: ThemeColorValue;
  dark: ThemeColorValue;
  /** The color carries its transparency — a chart's grid. */
  alpha?: boolean;
}

export interface ThemeColorGroup {
  key: string;
  label: string;
  /** What the group's colors have in common. */
  hint?: string;
  /**
   * The interface — the widgets drawer — whose groups these are: it names
   * itself in the page (data-theme-scope), and the theme editor's panel
   * beside it shows its groups alone; no other panel does.
   */
  scope?: string;
  /**
   * The group it is nested in, in the editor's tree — "Enregistrer" under
   * "Boutons", under "Interface". A group may hold only groups.
   */
  parent?: string;
}

/**
 * A number of the themes — a title's size or weight —, with a value per
 * theme: it becomes a CSS variable like the colors. Both themes share its
 * default.
 */
export interface ThemeSizeDefinition {
  key: string;
  group: string;
  label: string;
  hint?: string;
  defaultValue: number;
  min: number;
  max: number;
  /** The values go by this step — a font weight's hundreds. */
  step?: number;
  /** What follows the value in CSS and in the field: "px", or nothing for a weight — a list of its values in the editor. */
  unit: "px" | "";
  /**
   * One side of a padding: its four sizes are "<padding>-top", "-right",
   * "-bottom" and "-left", one row in the editor; the padding's own variable
   * gives them in that order (themeColors).
   */
  side?: ThemeSide;
  /**
   * The color it follows in its group's panel; otherwise it comes after the
   * colors.
   */
  after?: string;
  /**
   * Another size whose value it takes while it is not set — like a color's
   * "@body" —; defaultValue is then that size's own default.
   */
  defaultFrom?: string;
}

/**
 * The colors that differ from their default, by key; a missing theme keeps its
 * default. A size (THEME_SIZES) is stored the same way, its values per theme
 * in "sizes".
 */
export type ThemeColors = Record<
  string,
  { light?: string; dark?: string; sizes?: { light?: number; dark?: number } }
>;

export const THEME_COLOR_GROUPS: ThemeColorGroup[] = [
  { key: "dialogs", label: "Fenêtre de dialogue" },
  { key: "drawers", label: "Tiroirs" },
  { key: "tabs", label: "Onglets" },
  { key: "active-tab", label: "Onglet actif" },
  { key: "main-tabs", label: "Onglets de la fenêtre principale" },
  { key: "main-active-tab", label: "Onglet actif de la fenêtre principale" },
  {
    key: "scale",
    label: "Nuancier",
    hint: "Les dix gris de Mantine, du plus clair au plus foncé sur le thème clair, l'inverse sur le thème sombre. Toutes les couleurs définies sur une nuance la suivent.",
  },
  { key: "base", label: "Base", hint: "Les couleurs de Mantine : la page, le texte, les champs." },
  { key: "surfaces", label: "Fonds", hint: "Les fonds communs à plusieurs écrans." },
  { key: "lines", label: "Textes et lignes", hint: "Les textes, icônes, filets et bordures communs à plusieurs écrans." },
  { key: "widgets", label: "Widgets — textes", hint: "Les couleurs par défaut des textes de tous les widgets." },
  { key: "charts", label: "Widgets — graphiques", hint: "Les couleurs par défaut des indicateurs." },
  { key: "clock", label: "Widget Horloge", hint: "Les couleurs par défaut de l'horloge." },
  { key: "m365", label: "Widgets Microsoft 365", hint: "Calendrier, rendez-vous et messages." },
  { key: "settings-window", label: "Interface", scope: "settings" },
  { key: "settings-header", label: "Entête", scope: "settings" },
  { key: "settings-all-tabs", label: "Onglets", scope: "settings" },
  { key: "settings-titles", label: "Titres", scope: "settings" },
  { key: "settings-description", label: "Description", scope: "settings" },
  { key: "settings-checkboxes", label: "Case à cocher", scope: "settings" },
  { key: "settings-switches", label: "Switch", scope: "settings" },
  { key: "settings-slider", label: "Slider", scope: "settings" },
  { key: "settings-buttons", label: "Boutons", scope: "settings" },
  { key: "settings-lists", label: "Listes éditables", scope: "settings" },
  { key: "settings-title", label: "Titre onglet", scope: "settings", parent: "settings-titles" },
  { key: "settings-group-title", label: "Titre groupe", hint: "Au-dessus des listes éditables", scope: "settings", parent: "settings-titles" },
  { key: "settings-scrollbars", label: "Barre de défilement", scope: "settings", parent: "settings-window" },
  { key: "settings-save", label: "Enregistrer", scope: "settings", parent: "settings-buttons" },
  { key: "settings-close", label: "Fermer", scope: "settings", parent: "settings-buttons" },
  { key: "settings-checkbox", label: "Inactive", scope: "settings", parent: "settings-checkboxes" },
  { key: "settings-checkbox-active", label: "Active", scope: "settings", parent: "settings-checkboxes" },
  { key: "settings-switch", label: "Inactif", scope: "settings", parent: "settings-switches" },
  { key: "settings-switch-active", label: "Actif", scope: "settings", parent: "settings-switches" },
  { key: "settings-tabs", label: "Inactif", scope: "settings", parent: "settings-all-tabs" },
  { key: "settings-active-tab", label: "Actif", scope: "settings", parent: "settings-all-tabs" },
  { key: "settings-add-link", label: "Lien +", hint: "« Ajouter un utilisateur », « Ajouter un workspace »…", scope: "settings", parent: "settings-lists" },
  { key: "settings-lists-texts", label: "Textes", scope: "settings", parent: "settings-lists" },
  { key: "settings-theme-list-text", label: "Texte principal", hint: "Le nom des lignes", scope: "settings", parent: "settings-lists-texts" },
  { key: "settings-principals-email", label: "Texte secondaire", hint: "Sous le nom : l'adresse e-mail", scope: "settings", parent: "settings-lists-texts" },
  { key: "settings-principals-summary", label: "Texte état", hint: "En fin de ligne : les autorisations", scope: "settings", parent: "settings-lists-texts" },
  { key: "settings-lists-icons", label: "Icônes", scope: "settings", parent: "settings-lists" },
  { key: "settings-theme-list-icon", label: "Icône thème", hint: "Affichage", scope: "settings", parent: "settings-lists-icons" },
  { key: "settings-principals-icon", label: "Icône groupe/utilisateur", hint: "Gestion des droits", scope: "settings", parent: "settings-lists-icons" },
  { key: "settings-principals-chevron", label: "Icône accordéon", hint: "Gestion des droits", scope: "settings", parent: "settings-lists-icons" },
  { key: "settings-principals-chevron-open", label: "Ouvert", scope: "settings", parent: "settings-principals-chevron" },
  { key: "settings-principals-chevron-closed", label: "Fermé", scope: "settings", parent: "settings-principals-chevron" },
  { key: "settings-theme-list-select", label: "Select", hint: "Impression, Affichage", scope: "settings", parent: "settings-lists" },
  { key: "settings-inputs", label: "Zone de saisie", hint: "Les champs des lignes : leur fond, et le texte de ceux qui ne sont pas des noms", scope: "settings", parent: "settings-lists" },
  { key: "settings-input", label: "État normal", scope: "settings", parent: "settings-inputs" },
  { key: "settings-input-focus", label: "État sélectionné", scope: "settings", parent: "settings-inputs" },
  { key: "settings-principals-tag", label: "Tag", hint: "Gestion des droits, Impression, Modèles", scope: "settings", parent: "settings-lists" },
  { key: "settings-list-buttons", label: "Boutons", scope: "settings", parent: "settings-lists" },
  { key: "settings-workspaces-button", label: "Détail", hint: "Les boutons des lignes : Workspaces, Modèles", scope: "settings", parent: "settings-list-buttons" },
  { key: "settings-reset-button", label: "Réinitialiser", hint: "Le bouton de réinitialisation, quand il y a lieu : Modèles", scope: "settings", parent: "settings-list-buttons" },
  { key: "settings-row-checkboxes", label: "Case à cocher", scope: "settings", parent: "settings-lists" },
  { key: "settings-row-checkbox", label: "Inactive", scope: "settings", parent: "settings-row-checkboxes" },
  { key: "settings-row-checkbox-active", label: "Active", scope: "settings", parent: "settings-row-checkboxes" },
  { key: "settings-theme-list-selected", label: "Élément sélectionné", scope: "settings", parent: "settings-theme-list-select" },
  { key: "settings-theme-list-selected-normal", label: "État normal", scope: "settings", parent: "settings-theme-list-selected" },
  { key: "settings-theme-list-selected-hover", label: "État sélectionné", scope: "settings", parent: "settings-theme-list-selected" },
  { key: "settings-select-clear", label: "Bouton reset", hint: "La croix qui vide la valeur", scope: "settings", parent: "settings-theme-list-select" },
  { key: "settings-theme-list-dropdown", label: "Liste", scope: "settings", parent: "settings-theme-list-select" },
  { key: "settings-theme-list-options", label: "Texte", scope: "settings", parent: "settings-theme-list-dropdown" },
  { key: "settings-theme-list-option", label: "À l'état normal", scope: "settings", parent: "settings-theme-list-options" },
  { key: "settings-theme-list-option-hover", label: "Au survol", scope: "settings", parent: "settings-theme-list-options" },
  { key: "widgets-drawer", label: "Interface", scope: "widgets-drawer" },
  { key: "widgets-drawer-scrollbars", label: "Barre de défilement", scope: "widgets-drawer", parent: "widgets-drawer" },
  { key: "widgets-drawer-heading", label: "Titre", scope: "widgets-drawer" },
  { key: "widgets-drawer-kinds", label: "Groupes de widgets", scope: "widgets-drawer" },
  { key: "widgets-drawer-items", label: "Widgets", scope: "widgets-drawer" },
];

/**
 * The only red, orange, green and blue of the application: Mantine's
 * palettes of those names are filled with them, all shades alike.
 */
export const PALETTE = {
  red: "#E03131",
  orange: "#E8590C",
  green: "#2F9E44",
  blue: "#1971C2",
} as const;

/** Mantine's grays, the light theme's scale. */
const GRAY = ["#f8f9fa", "#f1f3f5", "#e9ecef", "#dee2e6", "#ced4da", "#adb5bd", "#868e96", "#495057", "#343a40", "#212529"];

/** Mantine's darks, the dark theme's scale. */
const DARK = ["#C9C9C9", "#b8b8b8", "#828282", "#696969", "#424242", "#3b3b3b", "#2e2e2e", "#242424", "#1f1f1f", "#141414"];

/** The scale's ten shades: "shade-0" is gray.0 on the light theme, dark.0 on the dark one. */
export const SHADE_KEYS = GRAY.map((_, i) => `shade-${i}`);

/** Mantine's own colors, set through its CSS variables (--mantine-color-<key>). */
export const MANTINE_COLOR_KEYS = new Set([
  "body",
  "text",
  "dimmed",
  "placeholder",
  "default",
  "default-hover",
  "default-border",
]);

export const THEME_COLORS: ThemeColorDefinition[] = [
  ...GRAY.map((gray, i) => ({
    key: `shade-${i}`,
    group: "scale",
    label: `Nuance ${i}`,
    hint: `gray.${i} en clair, dark.${i} en sombre`,
    light: gray,
    dark: DARK[i]!.toLowerCase(),
  })),

  { key: "body", group: "base", label: "Fond de page", light: "gray.1", dark: "dark.7" },
  { key: "text", group: "base", label: "Texte", light: "gray.9", dark: "dark.0" },
  { key: "dimmed", group: "base", label: "Texte atténué", light: "gray.6", dark: "dark.2" },
  { key: "placeholder", group: "base", label: "Texte indicatif", hint: "Dans un champ vide", light: "gray.5", dark: "dark.3" },
  { key: "default", group: "base", label: "Fond des champs", hint: "Champs, boutons, listes éditables", light: "white", dark: "dark.6" },
  { key: "default-hover", group: "base", label: "Survol des boutons", light: "gray.0", dark: "dark.5" },
  { key: "default-border", group: "base", label: "Bordures", hint: "Champs, cadres, séparateurs", light: "gray.4", dark: "dark.4" },

  { key: "sunken-bg", group: "drawers", label: "Fond encadré", hint: "Lignes des tiroirs, pièces jointes, survol des boutons gris", light: "gray.0", dark: "#2e2e2e" },
  { key: "sunken-hover", group: "drawers", label: "Survol d'un fond encadré", light: "white", dark: "dark.5" },
  { key: "header-bg", group: "drawers", label: "En-têtes", hint: "En-têtes des tiroirs, poignées, bordures de l'éditeur", light: "gray.3", dark: "dark.5" },
  { key: "subtle-bg", group: "surfaces", label: "Fond discret", hint: "Choix segmentés, références", light: "gray.2", dark: "dark.5" },
  { key: "field-hover", group: "surfaces", label: "Survol dans un champ", hint: "Lignes d'une liste éditable, barre de l'éditeur", light: "gray.1", dark: "dark.5" },
  { key: "menu-hover", group: "surfaces", label: "Survol dans les menus", light: "gray.2", dark: "dark.4" },
  { key: "row-hover", group: "surfaces", label: "Survol des grilles", hint: "Projets, support, parc", light: "gray.2", dark: "dark.6" },
  { key: "control-bg", group: "surfaces", label: "Fond des pastilles", hint: "Boutons de réinitialisation, avatars, anneaux", light: "gray.3", dark: "dark.4" },
  { key: "badge-bg", group: "surfaces", label: "Pastilles foncées", hint: "Numéros du parc, badge des mentions", light: "gray.7", dark: "#4d4d4d" },
  { key: "board-list-bg", group: "surfaces", label: "Listes du tableau", light: "gray.2", dark: "dark.5" },
  { key: "drop-bg", group: "surfaces", label: "Emplacement de dépôt", hint: "Sous une carte déplacée", light: "gray.4", dark: "dark.9" },
  { key: "inset-bg", group: "surfaces", label: "Fond en creux", hint: "Numéros du mode Accès", light: "gray.2", dark: "dark.8" },
  { key: "inset-border", group: "surfaces", label: "Bordure du fond en creux", light: "gray.3", dark: "dark.9" },
  { key: "message-bg", group: "surfaces", label: "Messages du support", light: "gray.0", dark: "dark.7" },
  { key: "dark-button", group: "surfaces", label: "Bouton foncé", hint: "Envoi d'une réponse, boutons actifs de l'éditeur", light: "gray.8", dark: "dark.4" },
  { key: "dark-button-hover", group: "surfaces", label: "Survol du bouton foncé", light: "gray.9", dark: "dark.5" },

  { key: "dark-header", group: "dialogs", label: "Couleur de fond", light: "gray.8", dark: "dark.6" },
  { key: "dark-header-text", group: "dialogs", label: "Couleur du titre", light: "white", dark: "white" },

  { key: "tab-bg", group: "tabs", label: "Couleur de fond", light: "#00000000", dark: "#00000000", alpha: true },
  { key: "tab-text", group: "tabs", label: "Couleur du texte", light: "@text", dark: "@text" },

  { key: "tab-active-bg", group: "active-tab", label: "Couleur de fond", light: "#00000000", dark: "#00000000", alpha: true },
  { key: "tab-active-text", group: "active-tab", label: "Couleur du texte", light: "@strong-text", dark: "@strong-text" },
  { key: "tab-active-border", group: "active-tab", label: "Couleur du trait", light: "@divider", dark: "@divider" },

  // The main window's top row (ModeBar): by default, the tabs' above. The
  // active tab's background keeps its former key.
  { key: "main-tab-bg", group: "main-tabs", label: "Couleur de fond", light: "@tab-bg", dark: "@tab-bg", alpha: true },
  { key: "main-tab-text", group: "main-tabs", label: "Couleur du texte", light: "@tab-text", dark: "@tab-text" },

  { key: "view-tab-active", group: "main-active-tab", label: "Couleur de fond", light: "@body", dark: "@body" },
  { key: "main-tab-active-text", group: "main-active-tab", label: "Couleur du texte", light: "@tab-active-text", dark: "@tab-active-text" },
  { key: "main-tab-active-border", group: "main-active-tab", label: "Couleur du trait", light: "@tab-active-border", dark: "@tab-active-border" },

  { key: "strong-text", group: "lines", label: "Texte fort", hint: "Titres des fenêtres, onglet actif", light: "black", dark: "white" },
  { key: "neutral-text", group: "lines", label: "Texte des boutons gris", hint: "« Fermer »", light: "gray.7", dark: "#c9c9c9" },
  { key: "field-icon", group: "lines", label: "Icônes et focus", hint: "Icônes dans les champs, contour du champ actif", light: "gray.7", dark: "dark.1" },
  { key: "search-placeholder", group: "lines", label: "Texte de la recherche", hint: "Quand elle est vide", light: "gray.6", dark: "dark.3" },
  { key: "search-text", group: "lines", label: "Saisie de la recherche", hint: "Le texte tapé", light: "black", dark: "dark.2" },
  { key: "divider", group: "lines", label: "Filets", hint: "Sous les en-têtes des grilles, pointillés des sections", light: "gray.3", dark: "dark.4" },
  { key: "table-border", group: "lines", label: "Lignes des grilles", light: "gray.4", dark: "dark.6" },
  { key: "scrollbar", group: "lines", label: "Barres de défilement", light: "gray.5", dark: "dark.2" },

  { key: "widget-text", group: "widgets", label: "Texte", hint: "Dates, liens, citations, flux, météo, graphiques", light: "gray.9", dark: "dark.0" },
  { key: "widget-dimmed", group: "widgets", label: "Texte atténué", hint: "Sources, détails, axes des graphiques", light: "gray.6", dark: "dark.2" },
  { key: "widget-title", group: "widgets", label: "Titres", light: "black", dark: "white" },
  { key: "widget-h2", group: "widgets", label: "Sous-titres (H2)", light: "gray.9", dark: "white" },
  { key: "widget-label", group: "widgets", label: "Libellés", hint: "Attributs du widget Nombre", light: "gray.7", dark: "#dcdcdc" },
  { key: "widget-value", group: "widgets", label: "Valeurs", hint: "Valeurs du widget Nombre", light: "black", dark: "white" },

  { key: "chart-separator", group: "charts", label: "Séparateur", hint: "Entre les parts d'un anneau", light: "gray.1", dark: "dark.7" },
  { key: "chart-grid", group: "charts", label: "Grille", light: "#adb5bd99", dark: "#69696999", alpha: true },
  { key: "chart-hover", group: "charts", label: "Survol", hint: "Sous la barre survolée", light: "#adb5bd26", dark: "#69696926", alpha: true },
  { key: "chart-track", group: "charts", label: "Piste", hint: "Partie vide d'un anneau", light: "gray.2", dark: "dark.6" },
  { key: "chart-not-started", group: "charts", label: "Non démarrés", hint: "Widget Progression", light: "gray.5", dark: "#3b3b3b" },
  { key: "chart-status-fill", group: "charts", label: "Remplissage des statuts", hint: "Widget Statuts du support", light: "#12b88633", dark: "#12b88633", alpha: true },
  { key: "chart-status-stroke", group: "charts", label: "Trait des statuts", hint: "Widget Statuts du support", light: "#12b886", dark: "#12b886" },

  { key: "clock-face", group: "clock", label: "Cadran", light: "white", dark: "#2e2e2e" },
  { key: "clock-stroke", group: "clock", label: "Contour", light: "gray.4", dark: "#4d4d4d" },
  { key: "clock-numerals", group: "clock", label: "Chiffres", light: "gray.9", dark: "#c9c9c9" },
  { key: "clock-hands", group: "clock", label: "Aiguilles", light: "gray.8", dark: "#ededed" },
  { key: "clock-seconds", group: "clock", label: "Trotteuse", light: "#12b886", dark: "#12b886" },

  { key: "m365-today", group: "m365", label: "Aujourd'hui", hint: "Cadre du jour dans le calendrier", light: "gray.4", dark: "dark.4" },
  { key: "m365-appointment", group: "m365", label: "Rendez-vous", light: "gray.2", dark: "dark.6" },
  { key: "m365-day", group: "m365", label: "En-tête des jours", hint: "Au-dessus des rendez-vous", light: "gray.8", dark: "dark.8" },
  { key: "m365-message", group: "m365", label: "Fond des messages", light: "gray.0", dark: "dark.6" },

  // The Settings window (SettingsModal): by default, what it showed before
  // having its own colors — the windows' header and tabs.
  { key: "settings-bg", group: "settings-window", label: "Couleur de fond", light: "@body", dark: "@body" },
  { key: "settings-scrollbar", group: "settings-scrollbars", label: "Couleur slider", light: "@scrollbar", dark: "@scrollbar" },
  { key: "settings-scrollbar-track", group: "settings-scrollbars", label: "Couleur piste", hint: "Au survol de la barre", light: "gray.0", dark: "dark.8" },
  { key: "settings-save-bg", group: "settings-save", label: "Couleur de fond", light: PALETTE.green, dark: PALETTE.green },
  { key: "settings-save-text", group: "settings-save", label: "Couleur", light: "white", dark: "white" },
  { key: "settings-close-bg", group: "settings-close", label: "Couleur de fond", light: "#00000000", dark: "#00000000", alpha: true },
  { key: "settings-close-text", group: "settings-close", label: "Couleur", hint: "« Fermer », « Déconnexion »", light: "@neutral-text", dark: "@neutral-text" },
  { key: "settings-add-link-text", group: "settings-add-link", label: "Couleur", light: PALETTE.green, dark: PALETTE.green },
  { key: "settings-checkbox-bg", group: "settings-checkbox", label: "Couleur de fond coche", light: "white", dark: "dark.6" },
  { key: "settings-checkbox-border", group: "settings-checkbox", label: "Couleur de bordure", light: "@default-border", dark: "@default-border" },
  { key: "settings-checkbox-text", group: "settings-checkbox", label: "Couleur", hint: "Le libellé", light: "@text", dark: "@text" },
  { key: "settings-checkbox-active-bg", group: "settings-checkbox-active", label: "Couleur de fond coche", light: PALETTE.green, dark: PALETTE.green },
  { key: "settings-checkbox-active-border", group: "settings-checkbox-active", label: "Couleur de bordure", light: "@settings-checkbox-active-bg", dark: "@settings-checkbox-active-bg" },
  { key: "settings-checkbox-active-check", group: "settings-checkbox-active", label: "Couleur coche", light: "white", dark: "white" },
  { key: "settings-checkbox-active-text", group: "settings-checkbox-active", label: "Couleur", hint: "Le libellé", light: "@settings-checkbox-text", dark: "@settings-checkbox-text" },
  { key: "settings-row-checkbox-bg", group: "settings-row-checkbox", label: "Couleur de fond coche", light: "white", dark: "dark.6" },
  { key: "settings-row-checkbox-border", group: "settings-row-checkbox", label: "Couleur de bordure", light: "@default-border", dark: "@default-border" },
  { key: "settings-row-checkbox-active-bg", group: "settings-row-checkbox-active", label: "Couleur de fond coche", light: PALETTE.green, dark: PALETTE.green },
  { key: "settings-row-checkbox-active-border", group: "settings-row-checkbox-active", label: "Couleur de bordure", light: "@settings-row-checkbox-active-bg", dark: "@settings-row-checkbox-active-bg" },
  { key: "settings-row-checkbox-active-check", group: "settings-row-checkbox-active", label: "Couleur coche", light: "white", dark: "white" },
  { key: "settings-switch-track", group: "settings-switch", label: "Couleur piste", light: "gray.3", dark: "dark.5" },
  { key: "settings-switch-thumb", group: "settings-switch", label: "Couleur curseur", light: "white", dark: "white" },
  { key: "settings-switch-active-track", group: "settings-switch-active", label: "Couleur piste", light: PALETTE.green, dark: PALETTE.green },
  { key: "settings-switch-active-thumb", group: "settings-switch-active", label: "Couleur curseur", light: "white", dark: "white" },
  { key: "settings-slider-mark", group: "settings-slider", label: "Couleur marque", hint: "Le centre des marques ; leur contour prend la couleur de la piste où elles sont", light: "white", dark: "white" },
  { key: "settings-slider-mark-label", group: "settings-slider", label: "Couleur texte marque", light: "gray.6", dark: "dark.2" },
  { key: "settings-slider-thumb", group: "settings-slider", label: "Couleur curseur", light: PALETTE.green, dark: "white" },
  { key: "settings-slider-bar", group: "settings-slider", label: "Couleur piste active", light: PALETTE.green, dark: PALETTE.green },
  { key: "settings-slider-track", group: "settings-slider", label: "Couleur piste inactive", light: "gray.2", dark: "dark.4" },
  { key: "settings-list-bg", group: "settings-lists", label: "Couleur de fond", hint: "Les lignes des listes", light: "@sunken-bg", dark: "@sunken-bg" },
  { key: "settings-theme-list-text-color", group: "settings-theme-list-text", label: "Couleur", light: "@text", dark: "@text" },
  { key: "settings-theme-list-icon-color", group: "settings-theme-list-icon", label: "Couleur", light: "@dimmed", dark: "@dimmed" },
  { key: "settings-theme-list-selected-color", group: "settings-theme-list-selected-normal", label: "Couleur", light: "@text", dark: "@text" },
  { key: "settings-theme-list-selected-chevron", group: "settings-theme-list-selected-normal", label: "Couleur de l'indicateur", hint: "La flèche du select", light: "@dimmed", dark: "@dimmed" },
  { key: "settings-theme-list-selected-hover-bg", group: "settings-theme-list-selected-hover", label: "Couleur de fond", hint: "Le select, sa liste ouverte", light: "@body", dark: "@body" },
  { key: "settings-group-title-color", group: "settings-group-title", label: "Couleur", light: "@text", dark: "@text" },
  { key: "settings-select-clear-bg", group: "settings-select-clear", label: "Couleur de fond", light: "#00000000", dark: "#00000000", alpha: true },
  { key: "settings-select-clear-icon", group: "settings-select-clear", label: "Couleur de l'icône", light: "@settings-theme-list-selected-chevron", dark: "@settings-theme-list-selected-chevron" },
  { key: "settings-input-color", group: "settings-input", label: "Couleur texte", light: "@text", dark: "@text" },
  { key: "settings-input-focus-bg", group: "settings-input-focus", label: "Couleur de fond", light: "@body", dark: "@body" },
  { key: "settings-input-focus-color", group: "settings-input-focus", label: "Couleur texte", light: "@settings-input-color", dark: "@settings-input-color" },
  { key: "settings-theme-list-dropdown-bg", group: "settings-theme-list-dropdown", label: "Couleur de fond", light: "@body", dark: "@body" },
  { key: "settings-theme-list-dropdown-border", group: "settings-theme-list-dropdown", label: "Couleur de bordure", light: "@default-border", dark: "@default-border" },
  { key: "settings-theme-list-option-color", group: "settings-theme-list-option", label: "Couleur texte", light: "@text", dark: "@text" },
  { key: "settings-theme-list-option-hover-bg", group: "settings-theme-list-option-hover", label: "Couleur de fond", hint: "L'option survolée", light: "gray.0", dark: "dark.7" },
  { key: "settings-theme-list-option-hover-color", group: "settings-theme-list-option-hover", label: "Couleur texte", light: "@settings-theme-list-option-color", dark: "@settings-theme-list-option-color" },
  { key: "settings-workspaces-button-bg", group: "settings-workspaces-button", label: "Couleur de fond", light: PALETTE.green, dark: PALETTE.green },
  { key: "settings-workspaces-button-icon", group: "settings-workspaces-button", label: "Couleur de l'icône", light: "@settings-workspaces-button-color", dark: "@settings-workspaces-button-color" },
  { key: "settings-workspaces-button-color", group: "settings-workspaces-button", label: "Couleur du texte", light: "white", dark: "white" },
  { key: "settings-reset-button-bg", group: "settings-reset-button", label: "Couleur de fond", light: PALETTE.green, dark: PALETTE.green },
  { key: "settings-reset-button-icon", group: "settings-reset-button", label: "Couleur de l'icône", light: "white", dark: "white" },
  { key: "settings-principals-chevron-open-color", group: "settings-principals-chevron-open", label: "Couleur", light: "gray.9", dark: "gray.0" },
  { key: "settings-principals-chevron-closed-color", group: "settings-principals-chevron-closed", label: "Couleur", light: "gray.9", dark: "gray.0" },
  { key: "settings-principals-icon-bg", group: "settings-principals-icon", label: "Couleur de fond", light: "@control-bg", dark: "@control-bg" },
  { key: "settings-principals-icon-color", group: "settings-principals-icon", label: "Couleur", light: "@text", dark: "@text" },
  { key: "settings-principals-tag-bg", group: "settings-principals-tag", label: "Couleur de fond", light: PALETTE.green, dark: PALETTE.green },
  { key: "settings-principals-tag-text", group: "settings-principals-tag", label: "Couleur", light: "white", dark: "white" },
  { key: "settings-principals-email-text", group: "settings-principals-email", label: "Couleur", light: "@dimmed", dark: "@dimmed" },
  { key: "settings-principals-summary-text", group: "settings-principals-summary", label: "Couleur", light: "@dimmed", dark: "@dimmed" },
  { key: "settings-header-bg", group: "settings-header", label: "Couleur de fond", light: "@dark-header", dark: "@dark-header" },
  { key: "settings-header-text", group: "settings-header", label: "Couleur", light: "@dark-header-text", dark: "@dark-header-text" },
  { key: "settings-title-text", group: "settings-title", label: "Couleur", light: "@text", dark: "@text" },
  { key: "settings-description-text", group: "settings-description", label: "Couleur", light: "@dimmed", dark: "@dimmed" },
  { key: "settings-tab-bg", group: "settings-tabs", label: "Couleur de fond", hint: "Derrière la colonne des onglets", light: "@tab-bg", dark: "@tab-bg", alpha: true },
  { key: "settings-tab-icon", group: "settings-tabs", label: "Couleur de l'icône", light: "@settings-tab-text", dark: "@settings-tab-text" },
  { key: "settings-tab-text", group: "settings-tabs", label: "Couleur du nom", light: "@tab-text", dark: "@tab-text" },
  { key: "settings-tab-active-bg", group: "settings-active-tab", label: "Couleur de fond", light: "@tab-active-bg", dark: "@tab-active-bg", alpha: true },
  { key: "settings-tab-active-icon", group: "settings-active-tab", label: "Couleur de l'icône", light: "@settings-tab-active-text", dark: "@settings-tab-active-text" },
  { key: "settings-tab-active-text", group: "settings-active-tab", label: "Couleur du nom", light: "@tab-active-text", dark: "@tab-active-text" },
  { key: "settings-tab-active-border", group: "settings-active-tab", label: "Couleur du filet", light: "@tab-active-border", dark: "@tab-active-border" },

  // The widgets drawer (WidgetDrawer): by default, what it showed before
  // having its own colors.
  { key: "widgets-drawer-bg", group: "widgets-drawer", label: "Couleur de fond", hint: "Fond du tiroir", light: "@body", dark: "@body" },
  { key: "widgets-drawer-scrollbar", group: "widgets-drawer-scrollbars", label: "Couleur slider", light: "@scrollbar", dark: "@scrollbar" },
  { key: "widgets-drawer-scrollbar-track", group: "widgets-drawer-scrollbars", label: "Couleur piste", hint: "Au survol de la barre", light: "gray.0", dark: "dark.8" },
  { key: "widgets-drawer-title", group: "widgets-drawer-heading", label: "Couleur", light: "white", dark: "white" },
  { key: "widgets-drawer-group", group: "widgets-drawer-kinds", label: "Couleur", hint: "Titres des groupes de widgets", light: "white", dark: "white" },
  { key: "widgets-drawer-item-bg", group: "widgets-drawer-items", label: "Couleur de fond", light: "@inset-bg", dark: "@inset-bg" },
  { key: "widgets-drawer-grip", group: "widgets-drawer-items", label: "Couleur poignée", light: "@dimmed", dark: "@dimmed" },
  { key: "widgets-drawer-icon", group: "widgets-drawer-items", label: "Couleur de l'icône", light: "@text", dark: "@text" },
  { key: "widgets-drawer-item-text", group: "widgets-drawer-items", label: "Couleur du nom", light: "@text", dark: "@text" },
];

export const THEME_SIDES = ["top", "right", "bottom", "left"] as const;

export type ThemeSide = (typeof THEME_SIDES)[number];

/**
 * A padding's sides — all four, or only those given —, at the same default
 * unless one side has its own. A side left out is 0 in its variable.
 */
const paddingSizes = (
  key: string,
  size: Omit<ThemeSizeDefinition, "key" | "unit" | "side" | "min">,
  sides: Partial<Record<ThemeSide, number>> = {},
  only: readonly ThemeSide[] = THEME_SIDES,
): ThemeSizeDefinition[] =>
  only.map((side) => ({
    ...size,
    key: `${key}-${side}`,
    side,
    min: 0,
    unit: "px",
    defaultValue: sides[side] ?? size.defaultValue,
  }));

/** The padding a side belongs to: "settings-padding-top" is "settings-padding"'s. */
export const themePaddingOf = (key: string): string => key.replace(/-(top|right|bottom|left)$/, "");

export const THEME_SIZES: ThemeSizeDefinition[] = [
  // The tabs' column, against the window's edges but on its right, where
  // the content begins.
  ...paddingSizes(
    "settings-padding",
    { group: "settings-all-tabs", label: "Padding", hint: "La colonne des onglets", defaultValue: 40, max: 80 },
    {},
    ["top", "bottom", "left"],
  ),
  // The tab's content and the buttons under it, beside the tabs.
  ...paddingSizes("settings-panel-padding", { group: "settings-all-tabs", label: "Padding du contenu", hint: "Le contenu de l'onglet ouvert et les boutons", defaultValue: 40, max: 80 }),
  { key: "settings-scrollbar-width", group: "settings-scrollbars", label: "Largeur", defaultValue: 2, min: 1, max: 16, unit: "px" },
  { key: "settings-save-size", group: "settings-save", label: "Taille", defaultValue: 14, min: 10, max: 30, unit: "px" },
  { key: "settings-save-weight", group: "settings-save", label: "Graisse", defaultValue: 600, min: 100, max: 900, step: 100, unit: "" },
  { key: "settings-close-size", group: "settings-close", label: "Taille", defaultValue: 14, min: 10, max: 30, unit: "px" },
  { key: "settings-close-weight", group: "settings-close", label: "Graisse", defaultValue: 600, min: 100, max: 900, step: 100, unit: "" },
  { key: "settings-add-link-size", group: "settings-add-link", label: "Taille", defaultValue: 12, min: 8, max: 30, unit: "px" },
  { key: "settings-add-link-weight", group: "settings-add-link", label: "Graisse", defaultValue: 600, min: 100, max: 900, step: 100, unit: "" },
  { key: "settings-checkbox-size", group: "settings-checkbox", label: "Taille", defaultValue: 14, min: 8, max: 30, unit: "px" },
  { key: "settings-checkbox-weight", group: "settings-checkbox", label: "Graisse", defaultValue: 400, min: 100, max: 900, step: 100, unit: "" },
  { key: "settings-checkbox-active-size", group: "settings-checkbox-active", label: "Taille", defaultValue: 14, min: 8, max: 30, unit: "px", defaultFrom: "settings-checkbox-size" },
  { key: "settings-checkbox-active-weight", group: "settings-checkbox-active", label: "Graisse", defaultValue: 400, min: 100, max: 900, step: 100, unit: "", defaultFrom: "settings-checkbox-weight" },
  { key: "settings-theme-list-text-size", group: "settings-theme-list-text", label: "Taille", defaultValue: 14, min: 8, max: 30, unit: "px" },
  { key: "settings-theme-list-text-weight", group: "settings-theme-list-text", label: "Graisse", defaultValue: 400, min: 100, max: 900, step: 100, unit: "" },
  { key: "settings-theme-list-selected-size", group: "settings-theme-list-selected-normal", label: "Taille", defaultValue: 14, min: 8, max: 30, unit: "px" },
  { key: "settings-theme-list-selected-weight", group: "settings-theme-list-selected-normal", label: "Graisse", defaultValue: 400, min: 100, max: 900, step: 100, unit: "" },
  { key: "settings-description-margin-bottom", group: "settings-description", label: "Marge basse", hint: "Sous la description et les textes d'introduction", defaultValue: 15, min: 0, max: 80, unit: "px" },
  { key: "settings-list-gap", group: "settings-lists", label: "Marge basse", hint: "Entre les listes d'un onglet (Affichage, Impression)", defaultValue: 30, min: 0, max: 80, unit: "px" },
  { key: "settings-group-title-size", group: "settings-group-title", label: "Taille", defaultValue: 14, min: 8, max: 40, unit: "px" },
  { key: "settings-group-title-weight", group: "settings-group-title", label: "Graisse", defaultValue: 500, min: 100, max: 900, step: 100, unit: "" },
  { key: "settings-input-size", group: "settings-input", label: "Taille", defaultValue: 12, min: 8, max: 30, unit: "px" },
  { key: "settings-input-weight", group: "settings-input", label: "Graisse", defaultValue: 400, min: 100, max: 900, step: 100, unit: "" },
  { key: "settings-input-focus-size", group: "settings-input-focus", label: "Taille", defaultValue: 12, min: 8, max: 30, unit: "px", defaultFrom: "settings-input-size" },
  { key: "settings-input-focus-weight", group: "settings-input-focus", label: "Graisse", defaultValue: 400, min: 100, max: 900, step: 100, unit: "", defaultFrom: "settings-input-weight" },
  { key: "settings-theme-list-dropdown-border-width", group: "settings-theme-list-dropdown", label: "Taille de la bordure", defaultValue: 1, min: 0, max: 10, unit: "px" },
  { key: "settings-theme-list-option-size", group: "settings-theme-list-option", label: "Taille texte", defaultValue: 14, min: 8, max: 30, unit: "px" },
  { key: "settings-theme-list-option-weight", group: "settings-theme-list-option", label: "Graisse texte", defaultValue: 400, min: 100, max: 900, step: 100, unit: "" },
  { key: "settings-theme-list-option-hover-size", group: "settings-theme-list-option-hover", label: "Taille texte", defaultValue: 14, min: 8, max: 30, unit: "px", defaultFrom: "settings-theme-list-option-size" },
  { key: "settings-theme-list-option-hover-weight", group: "settings-theme-list-option-hover", label: "Graisse texte", defaultValue: 400, min: 100, max: 900, step: 100, unit: "", defaultFrom: "settings-theme-list-option-weight" },
  { key: "settings-workspaces-button-size", group: "settings-workspaces-button", label: "Taille", defaultValue: 14, min: 8, max: 30, unit: "px" },
  { key: "settings-workspaces-button-weight", group: "settings-workspaces-button", label: "Graisse", defaultValue: 500, min: 100, max: 900, step: 100, unit: "" },
  { key: "settings-principals-tag-size", group: "settings-principals-tag", label: "Taille", defaultValue: 10, min: 8, max: 30, unit: "px" },
  { key: "settings-principals-tag-weight", group: "settings-principals-tag", label: "Graisse", defaultValue: 700, min: 100, max: 900, step: 100, unit: "" },
  { key: "settings-principals-email-size", group: "settings-principals-email", label: "Taille", defaultValue: 12, min: 8, max: 30, unit: "px" },
  { key: "settings-principals-email-weight", group: "settings-principals-email", label: "Graisse", defaultValue: 400, min: 100, max: 900, step: 100, unit: "" },
  { key: "settings-principals-summary-size", group: "settings-principals-summary", label: "Taille", defaultValue: 12, min: 8, max: 30, unit: "px" },
  { key: "settings-principals-summary-weight", group: "settings-principals-summary", label: "Graisse", defaultValue: 400, min: 100, max: 900, step: 100, unit: "" },
  // Its height is the title's and the padding's alone.
  ...paddingSizes("settings-header-padding", { group: "settings-header", label: "Padding", hint: "Marge intérieure de l'entête", defaultValue: 20, max: 60, after: "settings-header-bg" }),
  { key: "settings-header-size", group: "settings-header", label: "Taille", defaultValue: 19, min: 10, max: 40, unit: "px", defaultFrom: "dark-header-size" },
  { key: "settings-header-weight", group: "settings-header", label: "Graisse", defaultValue: 100, min: 100, max: 900, step: 100, unit: "", defaultFrom: "dark-header-weight" },
  { key: "settings-title-size", group: "settings-title", label: "Taille", defaultValue: 18, min: 10, max: 40, unit: "px" },
  { key: "settings-title-weight", group: "settings-title", label: "Graisse", defaultValue: 700, min: 100, max: 900, step: 100, unit: "" },
  { key: "settings-description-size", group: "settings-description", label: "Taille", defaultValue: 14, min: 10, max: 30, unit: "px" },
  { key: "settings-description-weight", group: "settings-description", label: "Graisse", defaultValue: 400, min: 100, max: 900, step: 100, unit: "" },
  { key: "settings-tab-icon-size", group: "settings-tabs", label: "Taille de l'icône", defaultValue: 16, min: 8, max: 40, unit: "px", after: "settings-tab-icon" },
  { key: "settings-tab-size", group: "settings-tabs", label: "Taille du nom", defaultValue: 14, min: 10, max: 30, unit: "px", after: "settings-tab-text", defaultFrom: "tab-size" },
  { key: "settings-tab-weight", group: "settings-tabs", label: "Graisse du nom", defaultValue: 400, min: 100, max: 900, step: 100, unit: "", after: "settings-tab-text", defaultFrom: "tab-weight" },
  { key: "settings-tab-width", group: "settings-tabs", label: "Largeur", hint: "Largeur des libellés : la fenêtre s'élargit d'autant", defaultValue: 170, min: 100, max: 400, unit: "px" },
  { key: "settings-tab-active-icon-size", group: "settings-active-tab", label: "Taille de l'icône", defaultValue: 16, min: 8, max: 40, unit: "px", after: "settings-tab-active-icon" },
  { key: "settings-tab-active-size", group: "settings-active-tab", label: "Taille du nom", defaultValue: 14, min: 10, max: 30, unit: "px", after: "settings-tab-active-text", defaultFrom: "tab-active-size" },
  { key: "settings-tab-active-weight", group: "settings-active-tab", label: "Graisse du nom", defaultValue: 400, min: 100, max: 900, step: 100, unit: "", after: "settings-tab-active-text", defaultFrom: "tab-active-weight" },
  { key: "settings-tab-active-border-width", group: "settings-active-tab", label: "Taille du filet", defaultValue: 1, min: 1, max: 10, unit: "px", after: "settings-tab-active-border", defaultFrom: "tab-active-border-width" },
  ...paddingSizes("widgets-drawer-padding", { group: "widgets-drawer", label: "Padding", hint: "Marge intérieure du tiroir", defaultValue: 30, max: 80, after: "widgets-drawer-bg" }),
  { key: "widgets-drawer-scrollbar-width", group: "widgets-drawer-scrollbars", label: "Largeur", defaultValue: 2, min: 1, max: 16, unit: "px" },
  { key: "widgets-drawer-title-size", group: "widgets-drawer-heading", label: "Taille", defaultValue: 18, min: 10, max: 40, unit: "px" },
  { key: "widgets-drawer-title-weight", group: "widgets-drawer-heading", label: "Graisse", defaultValue: 700, min: 100, max: 900, step: 100, unit: "" },
  { key: "widgets-drawer-group-size", group: "widgets-drawer-kinds", label: "Taille", defaultValue: 16, min: 10, max: 40, unit: "px" },
  { key: "widgets-drawer-group-weight", group: "widgets-drawer-kinds", label: "Graisse", defaultValue: 400, min: 100, max: 900, step: 100, unit: "" },
  { key: "widgets-drawer-item-size", group: "widgets-drawer-items", label: "Taille du nom", defaultValue: 14, min: 10, max: 30, unit: "px" },
  { key: "widgets-drawer-item-weight", group: "widgets-drawer-items", label: "Graisse du nom", defaultValue: 400, min: 100, max: 900, step: 100, unit: "" },
  { key: "widgets-drawer-icon-size", group: "widgets-drawer-items", label: "Taille de l'icône", defaultValue: 20, min: 10, max: 40, unit: "px", after: "widgets-drawer-icon" },
  { key: "dark-header-size", group: "dialogs", label: "Taille du titre", defaultValue: 19, min: 10, max: 40, unit: "px" },
  { key: "dark-header-weight", group: "dialogs", label: "Graisse du titre", defaultValue: 100, min: 100, max: 900, step: 100, unit: "" },
  { key: "tab-size", group: "tabs", label: "Taille du texte", defaultValue: 14, min: 10, max: 30, unit: "px" },
  { key: "tab-weight", group: "tabs", label: "Graisse du texte", defaultValue: 400, min: 100, max: 900, step: 100, unit: "" },
  { key: "tab-active-border-width", group: "active-tab", label: "Taille du trait", defaultValue: 1, min: 1, max: 10, unit: "px" },
  { key: "tab-active-size", group: "active-tab", label: "Taille du texte", defaultValue: 14, min: 10, max: 30, unit: "px" },
  { key: "tab-active-weight", group: "active-tab", label: "Graisse du texte", defaultValue: 400, min: 100, max: 900, step: 100, unit: "" },
  { key: "main-tab-size", group: "main-tabs", label: "Taille du texte", defaultValue: 14, min: 10, max: 30, unit: "px" },
  { key: "main-tab-weight", group: "main-tabs", label: "Graisse du texte", defaultValue: 400, min: 100, max: 900, step: 100, unit: "" },
  { key: "main-tab-active-border-width", group: "main-active-tab", label: "Taille du trait", defaultValue: 1, min: 1, max: 10, unit: "px" },
  { key: "main-tab-active-size", group: "main-active-tab", label: "Taille du texte", defaultValue: 14, min: 10, max: 30, unit: "px" },
  { key: "main-tab-active-weight", group: "main-active-tab", label: "Graisse du texte", defaultValue: 400, min: 100, max: 900, step: 100, unit: "" },
];

const SIZE_DEFINITIONS = new Map(THEME_SIZES.map((s) => [s.key, s]));

/** A size's value: the stored one, otherwise its default. */
export const themeSizeValue = (colors: ThemeColors, key: string, scheme: ThemeScheme): number =>
  colors[key]?.sizes?.[scheme] ?? themeSizeDefault(colors, key, scheme);

/** A size's default: its own, or the current value of the size it follows (defaultFrom). */
export const themeSizeDefault = (colors: ThemeColors, key: string, scheme: ThemeScheme): number => {
  const definition = SIZE_DEFINITIONS.get(key);
  if (!definition) return 0;
  return definition.defaultFrom ? themeSizeValue(colors, definition.defaultFrom, scheme) : definition.defaultValue;
};

/** A size brought within its bounds and onto its step; null when it is not a number. */
export const cleanThemeSize = (definition: ThemeSizeDefinition, value: unknown): number | null => {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  const step = definition.step ?? 1;
  const stepped = Math.round(value / step) * step;
  return Math.min(definition.max, Math.max(definition.min, stepped));
};

export interface Rgba {
  r: number;
  g: number;
  b: number;
  /** From 0 to 1. */
  a: number;
}

const channel = (value: string) => Math.min(255, Math.max(0, Math.round(Number(value))));
const opacity = (value: string | undefined) =>
  value === undefined ? 1 : Math.min(1, Math.max(0, Number(value.endsWith("%") ? Number(value.slice(0, -1)) / 100 : value)));

/** A color written in hexadecimal (3, 6 or 8 digits) or as rgb()/rgba(); null otherwise. */
export const parseThemeColor = (value: string): Rgba | null => {
  const v = value.trim().toLowerCase();
  let hex = /^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/.exec(v)?.[1];
  if (hex) {
    if (hex.length === 3) hex = [...hex].map((c) => c + c).join("");
    const n = (i: number) => parseInt(hex!.slice(i, i + 2), 16);
    return { r: n(0), g: n(2), b: n(4), a: hex.length === 8 ? n(6) / 255 : 1 };
  }
  const rgb = /^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*([\d.]+%?)\s*)?\)$/.exec(v);
  if (!rgb) return null;
  const color = { r: channel(rgb[1]!), g: channel(rgb[2]!), b: channel(rgb[3]!), a: opacity(rgb[4]) };
  return [color.r, color.g, color.b, color.a].some(Number.isNaN) ? null : color;
};

const hexPair = (n: number) => n.toString(16).padStart(2, "0");

/** The color as "#rrggbbaa", opaque included: the form the themes store and show. */
export const hexaString = ({ r, g, b, a }: Rgba): string =>
  `#${hexPair(r)}${hexPair(g)}${hexPair(b)}${hexPair(Math.round(a * 255))}`;

/** The color in hexadecimal: 8 digits when it is translucent. */
export const hexString = ({ r, g, b, a }: Rgba): string => {
  return `#${hexPair(r)}${hexPair(g)}${hexPair(b)}${a < 1 ? hexPair(Math.round(a * 255)) : ""}`;
};

/** A value that can be stored: a color in hexadecimal or rgb()/rgba(). */
export const isThemeColor = (value: unknown): value is string =>
  typeof value === "string" && parseThemeColor(value) !== null;

export type ThemeScheme = "light" | "dark";

const DEFINITIONS = new Map(THEME_COLORS.map((c) => [c.key, c]));

/** The color as written: the stored one, otherwise its default. */
export const writtenThemeColor = (colors: ThemeColors, key: string, scheme: ThemeScheme): string =>
  colors[key]?.[scheme] ?? DEFINITIONS.get(key)?.[scheme] ?? "#000000";

const SHADE = /^(gray|dark)\.(\d)$/;

/** Another color of the themes, whose value a default takes: "@body". */
const REFERENCE = /^@([a-z0-9-]+)$/;

/**
 * A value in hexadecimal — 8 digits when translucent: a shade is that of
 * the scale, in its own theme; a reference is that color's, in the given
 * theme; a stored value is brought back to 6 digits when opaque.
 */
export const themeValueHex = (colors: ThemeColors, value: string, scheme: ThemeScheme): string => {
  const reference = REFERENCE.exec(value);
  if (reference) return themeColorHex(colors, reference[1]!, scheme);
  if (value === "white") return "#ffffff";
  if (value === "black") return "#000000";
  const shade = SHADE.exec(value);
  if (shade) return themeColorHex(colors, `shade-${shade[2]}`, shade[1] === "gray" ? "light" : "dark");
  const parsed = parseThemeColor(value);
  return parsed ? hexString(parsed) : value.toLowerCase();
};

/** The color in hexadecimal, in the given theme. */
export const themeColorHex = (colors: ThemeColors, key: string, scheme: ThemeScheme): string =>
  themeValueHex(colors, writtenThemeColor(colors, key, scheme), scheme);

/**
 * A theme of the list ("Paramétrage" > "Affichage" > "Thèmes"): a name, the
 * Mantine scheme it is built on — its fields, menus and shadows —, and its
 * colors, stored like the original pair's under that scheme only.
 */
export interface Theme {
  id: number;
  name: string;
  scheme: ThemeScheme;
  /**
   * The theme the system's preference picks for its scheme, for whoever
   * follows the system ("Lié au système"): exactly one dark theme and one
   * light theme carry it, and they cannot be deleted.
   */
  system: boolean;
  colors: ThemeColors;
}

/** The list as it starts: the original dark and light themes, both the system's. */
export const DEFAULT_THEMES: Theme[] = [
  { id: 1, name: "Thème dark", scheme: "dark", system: true, colors: {} },
  { id: 2, name: "Thème light", scheme: "light", system: true, colors: {} },
];

/** The theme the system picks for the scheme: the first one of it otherwise. */
export const systemTheme = (themes: Theme[], scheme: ThemeScheme): Theme =>
  themes.find((t) => t.scheme === scheme && t.system) ??
  themes.find((t) => t.scheme === scheme) ??
  DEFAULT_THEMES.find((t) => t.scheme === scheme)!;
