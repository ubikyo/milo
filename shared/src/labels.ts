// Palette des étiquettes : huit teintes rangées sur le cercle chromatique, du
// neutre au pourpre, déclinées en huit nuances. Une couleur s'écrit
// « teinte.nuance », comme partout chez Mantine.
//
// Le client dessinait la matrice et le serveur validait la même liste de
// teintes, chacun de son côté. Les deux la lisent désormais ici : ajouter une
// teinte ne demande plus de penser à l'autre fichier.

export const LABEL_HUES = [
  "gray",
  "red",
  "orange",
  "yellow",
  "green",
  "teal",
  "blue",
  "grape",
] as const;

export type LabelHue = (typeof LABEL_HUES)[number];

export const LABEL_SHADES = [2, 3, 4, 5, 6, 7, 8, 9] as const;

/** La matrice à plat, ligne par ligne : une nuance, ses huit teintes. */
export const LABEL_COLORS: string[] = LABEL_SHADES.flatMap((shade) =>
  LABEL_HUES.map((hue) => `${hue}.${shade}`),
);

/** Couleur par défaut d'une étiquette : le bleu de la nuance médiane. */
export const DEFAULT_LABEL_COLOR = "blue.6";

/**
 * Une couleur d'étiquette recevable. La teinte seule reste acceptée : c'est ce
 * que portent les étiquettes créées avant la matrice.
 */
export const isLabelColor = (color: unknown): boolean => {
  const parts = String(color).split(".");
  if (parts.length > 2) return false;
  const [hue, shade] = parts;
  if (!LABEL_HUES.includes(hue as LabelHue)) return false;
  return shade === undefined || /^[0-9]$/.test(shade);
};
