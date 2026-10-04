// Prepares the API deployment unit.
//
// The server is bundled into a single file by esbuild: its code, and the
// package shared with the client. Only the four real dependencies stay
// outside — including better-sqlite3, a native module that must be compiled on
// the target machine.
//
// The manifest written here pins the exact versions resolved at build time,
// which "npm ci" provided before the server became part of a
// workspace: the deployment thus installs exactly what was tested.

import { build } from "esbuild";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const racine = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const sortie = process.argv[2];
if (!sortie) {
  console.error("usage : node scripts/package-api.mjs <dossier de sortie>");
  process.exit(1);
}

const manifesteServeur = JSON.parse(
  await fs.readFile(path.join(racine, "server", "package.json"), "utf8"),
);

// Everything except the shared package, which is bundled into the file.
const externes = Object.keys(manifesteServeur.dependencies).filter(
  (nom) => nom !== "@milo/shared",
);

await fs.mkdir(sortie, { recursive: true });

await build({
  entryPoints: [path.join(racine, "server", "src", "index.ts")],
  bundle: true,
  platform: "node",
  target: "node20",
  format: "esm",
  outfile: path.join(sortie, "server.mjs"),
  external: externes,
  sourcemap: true,
  // Messages are in French: the file must remain UTF-8.
  charset: "utf8",
});

/**
 * The version actually installed for a dependency. npm hoists most
 * packages to the workspace root, but keeps native modules
 * in the one that declares them: we check both.
 */
const versionInstallee = async (nom) => {
  const candidats = [
    path.join(racine, "node_modules", nom, "package.json"),
    path.join(racine, "server", "node_modules", nom, "package.json"),
  ];
  for (const chemin of candidats) {
    try {
      return JSON.parse(await fs.readFile(chemin, "utf8")).version;
    } catch {
      /* not there: try the next location */
    }
  }
  throw new Error(`Dépendance introuvable : ${nom}`);
};

const dependances = Object.fromEntries(
  await Promise.all(externes.map(async (nom) => [nom, await versionInstallee(nom)])),
);

await fs.writeFile(
  path.join(sortie, "package.json"),
  `${JSON.stringify(
    {
      name: "milo-api",
      version: manifesteServeur.version,
      private: true,
      type: "module",
      main: "server.mjs",
      scripts: { start: "node server.mjs" },
      dependencies: dependances,
    },
    null,
    2,
  )}\n`,
);

console.log(`API empaquetée dans ${sortie}`);
for (const [nom, version] of Object.entries(dependances)) {
  console.log(`  ${nom}@${version}`);
}
