let mesureur: CanvasRenderingContext2D | null = null;

/**
 * La largeur d'un petit champ discret (EcartField.module.css) qui montre ce
 * texte : texte, air et bordure.
 */
export const largeurChamp = (texte: string): number =>
  // La taille des petits champs discrets, la police de la page.
  largeurTexte(texte, 11) + 6;

/** Les largeurs déjà mesurées : un champ se rend souvent, son texte change peu. */
const mesures = new Map<string, number>();

/** La largeur d'un texte, à cette taille de police et dans celle de la page. */
export const largeurTexte = (texte: string, taille: number): number => {
  const cle = `${taille}|${texte}`;
  const connue = mesures.get(cle);
  if (connue !== undefined) return connue;
  mesureur ??= document.createElement("canvas").getContext("2d");
  if (!mesureur) return texte.length * taille * 0.6;
  mesureur.font = `${taille}px ${getComputedStyle(document.body).fontFamily}`;
  const largeur = Math.ceil(mesureur.measureText(texte).width);
  mesures.set(cle, largeur);
  return largeur;
};
