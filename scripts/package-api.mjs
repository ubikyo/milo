// Prépare l'unité de déploiement de l'API.
//
// Le serveur est regroupé en un seul fichier par esbuild : son code, et le
// paquet partagé avec le client. Ne restent dehors que les quatre dépendances
// réelles — dont better-sqlite3, module natif qui doit être compilé sur la
// machine cible.
//
// Le manifeste écrit ici fige les versions exactes résolues au build, ce que
// « npm ci » apportait avant que le serveur ne fasse partie d'un espace de
// travail : le déploiement installe donc exactement ce qui a été testé.

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

// Tout sauf le paquet partagé, qui est regroupé dans le fichier.
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
  // Les messages sont en français : le fichier doit rester en UTF-8.
  charset: "utf8",
});

/**
 * La version réellement installée d'une dépendance. npm remonte la plupart des
 * paquets à la racine de l'espace de travail, mais garde les modules natifs
 * dans celui qui les déclare : on regarde les deux.
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
      /* pas là : on essaie l'emplacement suivant */
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
