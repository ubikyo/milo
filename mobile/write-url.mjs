// Writes the server address where the offline page can read it, so its
// "Réessayer" button goes back to Milo. Run by `npm run sync`, from MILO_URL
// like capacitor.config.ts.
import { writeFileSync } from "node:fs";

const url = process.env.MILO_URL ?? "https://milo.lesmanufactures.art";
writeFileSync(new URL("www/milo-url.js", import.meta.url), `window.MILO_URL = ${JSON.stringify(url)};\n`);
