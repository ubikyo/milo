// Milo's logo for e-mails.
//
// A raster image, not the app's SVG: half of the mail clients do not render
// SVG. It is written here in base64 rather than placed in a file, for two
// reasons — the server is bundled into a single file at deployment (esbuild
// does not carry resources along), and a remote image would be blocked by
// default for most recipients. Attached to the message and cited by its
// identifier ("cid:"), it displays without asking anything of anyone.
//
// Two variants, as in the app: dark mountains for a light background
// (Milo-2.svg), light ones for a dark background (Milo-Inv-2.svg) — the
// template shows the second to clients in dark mode. 400 px wide, ten times
// their display size: sharp on every screen.
//
// To redo them from the source, with sharp (server dependency):
//   sharp("client/src/assets/media/Milo-2.svg", { density: 600 })
//     .resize({ width: 400 }).png({ palette: true, compressionLevel: 9 })

/** The identifiers under which the HTML cites the attached images. */
export const LOGO_CID = "milo-logo";
export const LOGO_DARK_CID = "milo-logo-dark";

/** What the image measures on screen, in pixels. */
export const LOGO_WIDTH_PX = 37;
export const LOGO_HEIGHT_PX = 28;

const LIGHT_BASE64 =
  "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" +
  "RU5ErkJggg==";

const DARK_BASE64 =
  "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";

/** The logo for a light background, and the one for a dark background. */
export const attachedLogo = (): Buffer => Buffer.from(LIGHT_BASE64, "base64");
export const attachedDarkLogo = (): Buffer => Buffer.from(DARK_BASE64, "base64");
