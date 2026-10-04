let measureContext: CanvasRenderingContext2D | null = null;

/**
 * La largeur d'un petit champ discret (EcartField.module.css) qui montre ce
 * texte : texte, air et bordure.
 */
export const fieldWidth = (text: string): number =>
  // La taille des petits champs discrets, la police de la page.
  textWidth(text, 11) + 6;

/** Les largeurs déjà mesurées : un champ se rend souvent, son texte change peu. */
const measures = new Map<string, number>();

/** La largeur d'un texte, à cette taille de police et dans celle de la page. */
export const textWidth = (text: string, size: number): number => {
  const key = `${size}|${text}`;
  const known = measures.get(key);
  if (known !== undefined) return known;
  measureContext ??= document.createElement("canvas").getContext("2d");
  if (!measureContext) return text.length * size * 0.6;
  measureContext.font = `${size}px ${getComputedStyle(document.body).fontFamily}`;
  const largeur = Math.ceil(measureContext.measureText(text).width);
  measures.set(key, largeur);
  return largeur;
};
