// Une image de couverture n'a pas besoin de ses 50 mégapixels : elle se montre
// en vignette dans la fiche et en bandeau sur la carte, de la largeur d'une
// liste. Une photo prise telle
// quelle se décode pourtant en entier à chaque affichage, et la fiche met des
// secondes à s'ouvrir. Elle est donc réduite dans le navigateur, avant l'envoi.

/**
 * Le cadre à couvrir : la couverture d'une carte (270 × 120 px sur le
 * tableau), doublé pour les écrans haute densité et arrondi. L'image est
 * réduite juste assez pour le remplir, comme l'affiche « object-fit: cover » :
 * une photo large garde sa hauteur, une photo haute sa largeur.
 */
const CADRE_L = 600;
const CADRE_H = 240;

/** La qualité des formats qui en ont une (JPEG, WebP). */
const QUALITE = 0.85;

// Les formats que le canevas sait réécrire. Un GIF animé perdrait son
// animation, un SVG n'a pas de pixels : ils passent tels quels.
const REECRITS = ["image/jpeg", "image/png", "image/webp"];

/**
 * L'image réduite au plus petit format qui couvre encore le cadre, dans son
 * format. Celle qui est déjà assez petite, ou qu'on ne sait pas lire, revient
 * telle quelle.
 */
export const reduireImage = async (fichier: File): Promise<File> => {
  if (!REECRITS.includes(fichier.type)) return fichier;

  let image: ImageBitmap;
  try {
    image = await createImageBitmap(fichier);
  } catch {
    return fichier;
  }

  const echelle = Math.max(CADRE_L / image.width, CADRE_H / image.height);
  if (echelle >= 1) {
    image.close();
    return fichier;
  }

  const largeur = Math.round(image.width * echelle);
  const hauteur = Math.round(image.height * echelle);
  const canevas = document.createElement("canvas");
  canevas.width = largeur;
  canevas.height = hauteur;
  const contexte = canevas.getContext("2d");
  if (!contexte) {
    image.close();
    return fichier;
  }
  contexte.imageSmoothingQuality = "high";
  contexte.drawImage(image, 0, 0, largeur, hauteur);
  image.close();

  const blob = await new Promise<Blob | null>((ok) =>
    canevas.toBlob(ok, fichier.type, QUALITE),
  );
  return blob ? new File([blob], fichier.name, { type: fichier.type }) : fichier;
};
