// Rouge unique de l'application : messages d'erreur, entête et actions de
// suppression. Une seule source pour éviter deux rouges voisins.
export const RED = "#FF0000";

// Couleur de la progression d'un projet : rouge en dessous de 30 %, orange
// de 30 à 70 %, vert au-delà. Sert à la barre du tableau comme au curseur du
// tiroir, pour qu'un même pourcentage se lise pareil partout.
export const statusColor = (status) => {
  if (status < 30) return RED;
  if (status <= 70) return "orange";
  return "teal";
};

// Entête d'une confirmation que l'on ne veut pas dramatiser : gris foncé au
// lieu du rouge, le texte restant blanc dans les deux thèmes.
export const DARK_HEADER = "var(--mantine-color-dark-6)";

// Vert des actions « ajouter » posées au bout d'une liste, et sa nuance au
// survol : un ton plus foncé, sans fond. Chaque thème a sa paire, sinon le
// survol s'assombrirait jusqu'à devenir illisible sur fond sombre.
export const ADD_ACTION = {
  color: "light-dark(var(--mantine-color-teal-6), var(--mantine-color-teal-4))",
  hover: "light-dark(var(--mantine-color-teal-8), var(--mantine-color-teal-6))",
};

// Blanc sur fond sombre, quasi-noir sur fond clair : le contraste maximum dans
// les deux thèmes. Sert aux titres de modale et à l'onglet actif.
export const STRONG_TEXT = "light-dark(var(--mantine-color-black), var(--mantine-color-white))";

// Survol d'un bouton gris : les gris de Mantine tirent sur le bleu, celui-ci
// est franchement neutre. Gris clair sur le thème clair, gris foncé sur le
// sombre.
export const NEUTRAL_HOVER = "light-dark(#ececec, #2e2e2e)";

// Le trait du focus : gris, jamais le bleu de la couleur primaire de Mantine.
// Deux nuances, une par thème — un gris foncé se perdrait sur le fond sombre,
// où c'est un gris clair qui se détache.
export const FOCUS_BORDER =
  "light-dark(var(--mantine-color-gray-7), var(--mantine-color-dark-1))";
