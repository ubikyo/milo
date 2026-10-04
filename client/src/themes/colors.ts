// Les seuls rouge, orange, vert et bleu de l'application. Le thème (main.tsx)
// en remplit les palettes « red », « orange », « green », « teal » et
// « blue » de Mantine, toutes nuances confondues : « red.3 » comme
// « var(--mantine-color-teal-8) » rendent l'une d'elles, et aucun autre rouge,
// orange, vert ou bleu ne paraît nulle part.
export const PALETTE_RED = "#E03131";
export const ORANGE = "#E8590C";
export const PALETTE_GREEN = "#2F9E44";
export const BLUE = "#1971C2";

// Rouge unique de l'application : messages d'erreur, entête et actions de
// suppression. Une seule source pour éviter deux rouges voisins.
export const RED = PALETTE_RED;

// Couleur de la progression d'un projet : rouge en dessous de 30 %, orange
// de 30 à 70 %, vert au-delà. Sert à la barre du tableau comme au curseur du
// tiroir, pour qu'un même pourcentage se lise pareil partout.
export const statusColor = (status: number): string => {
  if (status < 30) return RED;
  if (status <= 70) return "orange";
  return "teal";
};

/**
 * La couleur d'un jalon qui n'en porte pas — ceux d'avant le choix des
 * couleurs, ou celui qu'on vient d'ajouter : celle que la règle ci-dessus
 * donne à sa valeur, en couleur d'étiquette.
 */
export const defaultMilestoneColor = (value: number): string => {
  if (value < 30) return "red.6";
  if (value <= 70) return "orange.6";
  return "teal.6";
};

/**
 * La couleur de la progression d'un projet, d'après les jalons de sa
 * catégorie : celle de la tranche où tombe la progression — le premier jalon
 * qui l'atteint ou la dépasse. Sans jalon au-delà (ou sans jalon du tout),
 * la règle par défaut reprend la main.
 */
export const progressColor = (
  status: number,
  milestones: { value: number; color?: string }[] = [],
): string => {
  const band = [...milestones]
    .sort((a, b) => a.value - b.value)
    .find((m) => status <= m.value);
  if (!band) return statusColor(status);
  return band.color ?? defaultMilestoneColor(band.value);
};

// Vert des messages de réussite : le pendant du rouge ci-dessus, dans le même
// rôle — un cadre qui rend compte de ce qui vient de se passer.
//
// Le vert unique de l'application, sur les deux thèmes.
export const GREEN = PALETTE_GREEN;

// Entête d'une confirmation que l'on ne veut pas dramatiser : gris foncé au
// lieu du rouge, le texte restant blanc dans les deux thèmes.
export const DARK_HEADER = "var(--mantine-color-dark-6)";

// Vert des actions « ajouter » posées au bout d'une liste, et sa nuance au
// survol : un ton plus foncé, sans fond. Chaque thème a sa paire, sinon le
// survol s'assombrirait jusqu'à devenir illisible sur fond sombre.
/**
 * Le trait pointillé et le « + » qui insèrent une carte entre deux cartes, une
 * liste entre deux listes, une section entre deux sections. Il va jusqu'au
 * blanc : il n'a qu'un pointillé d'un pixel pour se faire voir.
 */
export const INSERT_LINE = "var(--mantine-color-white)";

export const ADD_ACTION = {
  color: "light-dark(var(--mantine-color-teal-6), var(--mantine-color-teal-4))",
  hover: "light-dark(var(--mantine-color-teal-8), var(--mantine-color-teal-6))",
};

// Blanc sur fond sombre, quasi-noir sur fond clair : le contraste maximum dans
// les deux thèmes. Sert aux titres de modale et à l'onglet actif.
export const STRONG_TEXT =
  "light-dark(var(--mantine-color-black), var(--mantine-color-white))";

// Survol d'un bouton gris : les gris de Mantine tirent sur le bleu, celui-ci
// est franchement neutre. Gris clair sur le thème clair, gris foncé sur le
// sombre.
export const NEUTRAL_HOVER = "light-dark(#ececec, #2e2e2e)";

// Texte d'un bouton gris sans fond — « Fermer » : le gris de Mantine tire sur
// le bleu, celui-ci est neutre. Foncé sur le thème clair, clair sur le sombre.
export const NEUTRAL_TEXT = "light-dark(#4d4d4d, #c4c4c4)";

// Le trait du focus : gris, jamais le bleu de la couleur primaire de Mantine.
// Deux nuances, une par thème — un gris foncé se perdrait sur le fond sombre,
// où c'est un gris clair qui se détache.
export const FOCUS_BORDER =
  "light-dark(var(--mantine-color-gray-7), var(--mantine-color-dark-1))";

// Les icônes posées dans un champ — la barre de l'éditeur, le bout d'une ligne
// de checklist ou de pièce jointe : le gris de la barre d'outils de Mantine,
// foncé sur le thème clair, clair sur le sombre.
export const FIELD_ICON =
  "light-dark(var(--mantine-color-gray-7), var(--mantine-color-dark-1))";

// Fond d'un élément « encadré » : il se détache de la page sans trait ni
// ombre. C'est le gris neutre du survol ci-dessus, posé cette fois en
// permanence — plus sombre que le fond sur le thème clair, plus clair sur le
// sombre, à la même distance du fond dans les deux cas.
export const SUNKEN_BG = NEUTRAL_HOVER;
