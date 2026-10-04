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
const FRAME_W = 600;
const FRAME_H = 240;

/** La qualité des formats qui en ont une (JPEG, WebP). */
const QUALITY = 0.85;

// Les formats que le canevas sait réécrire. Un GIF animé perdrait son
// animation, un SVG n'a pas de pixels : ils passent tels quels.
const REENCODED = ["image/jpeg", "image/png", "image/webp"];

/**
 * L'image réduite au plus petit format qui couvre encore le cadre, dans son
 * format. Celle qui est déjà assez petite, ou qu'on ne sait pas lire, revient
 * telle quelle.
 */
export const shrinkImage = async (file: File): Promise<File> => {
  if (!REENCODED.includes(file.type)) return file;

  let image: ImageBitmap;
  try {
    image = await createImageBitmap(file);
  } catch {
    return file;
  }

  const scale = Math.max(FRAME_W / image.width, FRAME_H / image.height);
  if (scale >= 1) {
    image.close();
    return file;
  }

  const largeur = Math.round(image.width * scale);
  const height = Math.round(image.height * scale);
  const canvas = document.createElement("canvas");
  canvas.width = largeur;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) {
    image.close();
    return file;
  }
  context.imageSmoothingQuality = "high";
  context.drawImage(image, 0, 0, largeur, height);
  image.close();

  const blob = await new Promise<Blob | null>((ok) =>
    canvas.toBlob(ok, file.type, QUALITY),
  );
  return blob ? new File([blob], file.name, { type: file.type }) : file;
};
