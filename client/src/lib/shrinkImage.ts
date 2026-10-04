// A cover image does not need its 50 megapixels: it is shown
// as a thumbnail in the record and as a banner on the card, the width of a
// list. A photo taken as is
// nonetheless decodes in full at every display, and the record takes
// seconds to open. It is therefore shrunk in the browser, before sending.

/**
 * The frame to cover: a card's cover (270 × 120 px on the
 * board), doubled for high-density screens and rounded. The image is
 * shrunk just enough to fill it, like the "object-fit: cover" poster:
 * a wide photo keeps its height, a tall photo its width.
 */
const FRAME_W = 600;
const FRAME_H = 240;

/** The quality of the formats that have one (JPEG, WebP). */
const QUALITY = 0.85;

// The formats the canvas can rewrite. An animated GIF would lose its
// animation, an SVG has no pixels: they pass through as is.
const REENCODED = ["image/jpeg", "image/png", "image/webp"];

/**
 * The image shrunk to the smallest size that still covers the frame, in its own
 * format. One that is already small enough, or that cannot be read, comes back
 * as is.
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

  const width = Math.round(image.width * scale);
  const height = Math.round(image.height * scale);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) {
    image.close();
    return file;
  }
  context.imageSmoothingQuality = "high";
  context.drawImage(image, 0, 0, width, height);
  image.close();

  const blob = await new Promise<Blob | null>((ok) =>
    canvas.toBlob(ok, file.type, QUALITY),
  );
  return blob ? new File([blob], file.name, { type: file.type }) : file;
};
