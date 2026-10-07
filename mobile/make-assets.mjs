// Builds the sources of the icons and splash screens in assets/ from the
// client's logo, then `capacitor-assets generate` derives every size.
// Temporary: to be replaced by a dedicated icon.
import sharp from "sharp";

const WHITE = { r: 255, g: 255, b: 255, alpha: 1 };
const DARK = { r: 31, g: 31, b: 31, alpha: 1 };
const CLEAR = { r: 0, g: 0, b: 0, alpha: 0 };

/** The logo, `logo` pixels wide, centered on a `size` square. */
const square = async (svg, size, logo, background, out) => {
  const image = await sharp(svg, { density: 1200 })
    .resize(logo, logo, { fit: "contain", background: CLEAR })
    .toBuffer();
  await sharp({ create: { width: size, height: size, channels: 4, background } })
    .composite([{ input: image }])
    .flatten(background.alpha ? { background } : false)
    .png()
    .toFile(out);
};

const light = "../client/public/Milo-2.svg";
const dark = "../client/public/Milo-Inv-2.svg";

// iOS: opaque, the system rounds the corners.
await square(light, 1024, 680, WHITE, "assets/icon-only.png");
// Android adaptive icon: the foreground must fit the inner 66%.
await square(light, 1024, 560, CLEAR, "assets/icon-foreground.png");
await sharp({ create: { width: 1024, height: 1024, channels: 4, background: WHITE } })
  .png()
  .toFile("assets/icon-background.png");
await square(light, 2732, 640, WHITE, "assets/splash.png");
await square(dark, 2732, 640, DARK, "assets/splash-dark.png");
