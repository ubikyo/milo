let measureContext: CanvasRenderingContext2D | null = null;

/**
 * The width of a small discreet field (GapField.module.css) showing this
 * text: text, padding and border.
 */
export const fieldWidth = (text: string): number =>
  // The size of the small discreet fields, the page's font.
  textWidth(text, 11) + 6;

/** The widths already measured: a field renders often, its text changes little. */
const measures = new Map<string, number>();

/** A text's width, at this font size and in the page's one. */
export const textWidth = (text: string, size: number): number => {
  const key = `${size}|${text}`;
  const known = measures.get(key);
  if (known !== undefined) return known;
  measureContext ??= document.createElement("canvas").getContext("2d");
  if (!measureContext) return text.length * size * 0.6;
  measureContext.font = `${size}px ${getComputedStyle(document.body).fontFamily}`;
  const width = Math.ceil(measureContext.measureText(text).width);
  measures.set(key, width);
  return width;
};
