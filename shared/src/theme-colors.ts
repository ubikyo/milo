// The colors of the light and dark themes, set in "Paramétrage" > "Thèmes".
// They apply to the whole application, not to an account.
//
// Each color has a value per theme. Its default is a hexadecimal value, or a
// shade of the scale ("gray.6" on the light theme, "dark.6" on the dark one):
// a shade changed in the scale then carries over to every color that uses it.
// Only the colors that differ from their default are stored.

/** A shade of the scale, a hexadecimal value, or Mantine's white or black. */
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
}

/** The colors that differ from their default, by key; a missing theme keeps its default. */
export type ThemeColors = Record<string, { light?: string; dark?: string }>;

export const THEME_COLOR_GROUPS: ThemeColorGroup[] = [
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
];

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

  { key: "body", group: "base", label: "Fond de page", light: "white", dark: "dark.7" },
  { key: "text", group: "base", label: "Texte", light: "black", dark: "dark.0" },
  { key: "dimmed", group: "base", label: "Texte atténué", light: "gray.6", dark: "dark.2" },
  { key: "placeholder", group: "base", label: "Texte indicatif", hint: "Dans un champ vide", light: "gray.5", dark: "dark.3" },
  { key: "default", group: "base", label: "Fond des champs", hint: "Champs, boutons, listes éditables", light: "white", dark: "dark.6" },
  { key: "default-hover", group: "base", label: "Survol des boutons", light: "gray.0", dark: "dark.5" },
  { key: "default-border", group: "base", label: "Bordures", hint: "Champs, cadres, séparateurs", light: "gray.4", dark: "dark.4" },

  { key: "sunken-bg", group: "surfaces", label: "Fond encadré", hint: "Lignes des tiroirs, pièces jointes, survol des boutons gris", light: "#ededed", dark: "#2e2e2e" },
  { key: "sunken-hover", group: "surfaces", label: "Survol d'un fond encadré", light: "#e2e2e2", dark: "dark.5" },
  { key: "header-bg", group: "surfaces", label: "En-têtes", hint: "En-têtes des tiroirs, poignées, bordures de l'éditeur", light: "#dcdcdc", dark: "dark.5" },
  { key: "subtle-bg", group: "surfaces", label: "Fond discret", hint: "Choix segmentés, références", light: "#f5f5f5", dark: "dark.5" },
  { key: "field-hover", group: "surfaces", label: "Survol dans un champ", hint: "Lignes d'une liste éditable, barre de l'éditeur", light: "gray.1", dark: "dark.5" },
  { key: "menu-hover", group: "surfaces", label: "Survol dans les menus", light: "#ececec", dark: "dark.4" },
  { key: "row-hover", group: "surfaces", label: "Survol des grilles", hint: "Projets, support, parc", light: "gray.2", dark: "dark.6" },
  { key: "control-bg", group: "surfaces", label: "Fond des pastilles", hint: "Boutons de réinitialisation, avatars, anneaux", light: "#d4d4d4", dark: "dark.4" },
  { key: "badge-bg", group: "surfaces", label: "Pastilles foncées", hint: "Numéros du parc, badge des mentions", light: "#4d4d4d", dark: "#4d4d4d" },
  { key: "board-list-bg", group: "surfaces", label: "Listes du tableau", light: "gray.2", dark: "dark.5" },
  { key: "drop-bg", group: "surfaces", label: "Emplacement de dépôt", hint: "Sous une carte déplacée", light: "gray.4", dark: "dark.9" },
  { key: "inset-bg", group: "surfaces", label: "Fond en creux", hint: "Numéros du mode Accès", light: "gray.1", dark: "dark.8" },
  { key: "inset-border", group: "surfaces", label: "Bordure du fond en creux", light: "gray.3", dark: "dark.9" },
  { key: "message-bg", group: "surfaces", label: "Messages du support", light: "gray.1", dark: "dark.7" },
  { key: "dark-button", group: "surfaces", label: "Bouton foncé", hint: "Envoi d'une réponse, boutons actifs de l'éditeur", light: "dark.6", dark: "dark.4" },
  { key: "dark-button-hover", group: "surfaces", label: "Survol du bouton foncé", light: "dark.7", dark: "dark.5" },
  { key: "dark-header", group: "surfaces", label: "Bandeau des confirmations", light: "dark.6", dark: "dark.6" },

  { key: "strong-text", group: "lines", label: "Texte fort", hint: "Titres des fenêtres, onglet actif", light: "black", dark: "white" },
  { key: "neutral-text", group: "lines", label: "Texte des boutons gris", hint: "« Fermer »", light: "#4d4d4d", dark: "#c9c9c9" },
  { key: "field-icon", group: "lines", label: "Icônes et focus", hint: "Icônes dans les champs, contour du champ actif", light: "gray.7", dark: "dark.1" },
  { key: "search-placeholder", group: "lines", label: "Texte de la recherche", hint: "Quand elle est vide", light: "gray.7", dark: "dark.4" },
  { key: "divider", group: "lines", label: "Filets", hint: "Sous les en-têtes des grilles, pointillés des sections", light: "gray.3", dark: "dark.4" },
  { key: "table-border", group: "lines", label: "Lignes des grilles", light: "gray.5", dark: "dark.6" },
  { key: "strong-border", group: "lines", label: "Bordures marquées", hint: "Menu des contextes", light: "gray.4", dark: "dark.3" },
  { key: "scrollbar", group: "lines", label: "Barres de défilement", light: "gray.5", dark: "dark.2" },

  { key: "widget-text", group: "widgets", label: "Texte", hint: "Dates, liens, citations, flux, météo, graphiques", light: "black", dark: "dark.0" },
  { key: "widget-dimmed", group: "widgets", label: "Texte atténué", hint: "Sources, détails, axes des graphiques", light: "gray.6", dark: "dark.2" },
  { key: "widget-title", group: "widgets", label: "Titres", light: "black", dark: "white" },
  { key: "widget-h2", group: "widgets", label: "Sous-titres (H2)", light: "black", dark: "white" },
  { key: "widget-label", group: "widgets", label: "Libellés", hint: "Attributs du widget Nombre", light: "#4d4d4d", dark: "#dcdcdc" },
  { key: "widget-value", group: "widgets", label: "Valeurs", hint: "Valeurs du widget Nombre", light: "black", dark: "white" },

  { key: "chart-separator", group: "charts", label: "Séparateur", hint: "Entre les parts d'un anneau", light: "white", dark: "dark.7" },
  { key: "chart-grid", group: "charts", label: "Grille", light: "#adb5bd99", dark: "#69696999", alpha: true },
  { key: "chart-hover", group: "charts", label: "Survol", hint: "Sous la barre survolée", light: "#adb5bd26", dark: "#69696926", alpha: true },
  { key: "chart-track", group: "charts", label: "Piste", hint: "Partie vide d'un anneau", light: "gray.1", dark: "dark.6" },
  { key: "chart-not-started", group: "charts", label: "Non démarrés", hint: "Widget Progression", light: "#3b3b3b", dark: "#3b3b3b" },
  { key: "chart-status-fill", group: "charts", label: "Remplissage des statuts", hint: "Widget Statuts du support", light: "#12b88633", dark: "#12b88633", alpha: true },
  { key: "chart-status-stroke", group: "charts", label: "Trait des statuts", hint: "Widget Statuts du support", light: "#12b886", dark: "#12b886" },

  { key: "clock-face", group: "clock", label: "Cadran", light: "#2e2e2e", dark: "#2e2e2e" },
  { key: "clock-stroke", group: "clock", label: "Contour", light: "#4d4d4d", dark: "#4d4d4d" },
  { key: "clock-numerals", group: "clock", label: "Chiffres", light: "#c9c9c9", dark: "#c9c9c9" },
  { key: "clock-hands", group: "clock", label: "Aiguilles", light: "#ededed", dark: "#ededed" },
  { key: "clock-seconds", group: "clock", label: "Trotteuse", light: "#12b886", dark: "#12b886" },

  { key: "m365-today", group: "m365", label: "Aujourd'hui", hint: "Cadre du jour dans le calendrier", light: "gray.4", dark: "dark.4" },
  { key: "m365-appointment", group: "m365", label: "Rendez-vous", light: "#c8c8c8", dark: "dark.6" },
  { key: "m365-day", group: "m365", label: "En-tête des jours", hint: "Au-dessus des rendez-vous", light: "#333333", dark: "dark.8" },
  { key: "m365-message", group: "m365", label: "Fond des messages", light: "gray.1", dark: "dark.6" },
];

/** A stored value: a hexadecimal color, with or without its transparency. */
export const isThemeHex = (value: unknown): value is string =>
  typeof value === "string" && /^#([0-9a-f]{6}|[0-9a-f]{8})$/i.test(value);
