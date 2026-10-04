// Label palette: eight hues arranged on the color wheel, from
// neutral to purple, in eight shades. A color is written
// "hue.shade", as everywhere in Mantine.
//
// The client drew the matrix and the server validated the same list of
// hues, each on its own. Both now read it from here: adding a
// hue no longer requires remembering the other file.

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

/** The flattened matrix, row by row: one shade, its eight hues. */
export const LABEL_COLORS: string[] = LABEL_SHADES.flatMap((shade) =>
  LABEL_HUES.map((hue) => `${hue}.${shade}`),
);

/**
 * The group a label goes into when none is named: the first one, or this one,
 * created when there is none yet.
 */
export const DEFAULT_LABEL_GROUP = "Priorités";

/** Default color of a label: the blue of the middle shade. */
export const DEFAULT_LABEL_COLOR = "blue.6";

/**
 * A valid label color. The hue alone is still accepted: that is what
 * labels created before the matrix carry.
 */
export const isLabelColor = (color: unknown): boolean => {
  const parts = String(color).split(".");
  if (parts.length > 2) return false;
  const [hue, shade] = parts;
  if (!LABEL_HUES.includes(hue as LabelHue)) return false;
  return shade === undefined || /^[0-9]$/.test(shade);
};
