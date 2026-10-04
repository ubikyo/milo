// Une archive : plusieurs fichiers en un seul, compressé.
//
// Le format est celui de tar (ustar), écrit et relu ici en une centaine de
// lignes plutôt qu'avec une dépendance de plus. C'est un format simple — des
// entêtes de 512 octets suivis du contenu, complété jusqu'au bloc suivant — et
// il a l'avantage d'être ouvrable ailleurs : `tar tzf sauvegarde.milo.gz`
// montre ce qu'une sauvegarde contient, sans Milo.
//
// La compression est celle de gzip (node:zlib). Une base SQLite se comprime
// très bien ; les images déjà compressées, non, mais elles ne coûtent rien à
// traverser.

import { gunzipSync, gzipSync } from "node:zlib";

const BLOCK = 512;

export interface Entry {
  /** Le chemin dans l'archive, en barres obliques : « medias/abc.png ». */
  name: string;
  content: Buffer;
}

/** Un nombre en octal, complété de zéros à gauche et suivi d'un octet nul. */
const octal = (value: number, largeur: number): string =>
  `${value.toString(8).padStart(largeur - 1, "0")}\0`;

const header = (entry: Entry, mtime: number): Buffer => {
  const block = Buffer.alloc(BLOCK);

  // Un nom de plus de 100 octets demanderait le champ « prefix » ; les nôtres
  // — « milo.db », « medias/ » et trente-deux caractères — n'en approchent
  // pas, et on préfère refuser que produire une archive silencieusement fausse.
  const name = Buffer.from(entry.name, "utf8");
  if (name.length > 100) throw new Error(`Nom trop long pour l'archive : ${entry.name}`);
  name.copy(block, 0);

  block.write(octal(0o644, 8), 100); // mode
  block.write(octal(0, 8), 108); // uid
  block.write(octal(0, 8), 116); // gid
  block.write(octal(entry.content.length, 12), 124);
  block.write(octal(Math.floor(mtime / 1000), 12), 136);
  block.write("        ", 148); // somme de contrôle : des espaces le temps du calcul
  block.write("0", 156); // fichier ordinaire
  block.write("ustar\0", 257);
  block.write("00", 263);

  // La somme de contrôle se calcule sur l'entête entier, son propre champ
  // compté comme huit espaces : d'où l'ordre ci-dessus. Six chiffres octaux,
  // un octet nul, une espace — c'est la forme qu'attendent les lecteurs.
  let sum = 0;
  for (const byte of block) sum += byte;
  block.write(`${sum.toString(8).padStart(6, "0")}\0 `, 148);

  return block;
};

/** Ce qu'il manque à un contenu pour terminer le dernier bloc entamé. */
const rest = (length: number): number => (BLOCK - (length % BLOCK)) % BLOCK;

/** Les entrées, en une archive compressée. */
export const pack = (entries: Entry[]): Buffer => {
  const currentTime = Date.now();
  const chunks: Buffer[] = [];

  for (const entry of entries) {
    chunks.push(header(entry, currentTime), entry.content);
    chunks.push(Buffer.alloc(rest(entry.content.length)));
  }
  // Deux blocs nuls closent une archive tar.
  chunks.push(Buffer.alloc(BLOCK * 2));

  return gzipSync(Buffer.concat(chunks));
};

const text = (block: Buffer, start: number, length: number): string => {
  const raw = block.subarray(start, start + length);
  const end = raw.indexOf(0);
  return raw.subarray(0, end === -1 ? raw.length : end).toString("utf8").trim();
};

const octalNumber = (block: Buffer, start: number, length: number): number => {
  const value = parseInt(text(block, start, length) || "0", 8);
  return Number.isFinite(value) && value >= 0 ? value : -1;
};

/**
 * L'archive relue, par nom de fichier. Lève si ce n'est pas une archive des
 * nôtres : c'est le premier tri de la restauration, avant même de regarder ce
 * qu'elle contient.
 */
export const unpack = (archive: Buffer): Map<string, Buffer> => {
  let tar: Buffer;
  try {
    tar = gunzipSync(archive);
  } catch {
    throw new Error("Ce fichier n'est pas une sauvegarde Milo");
  }

  const files = new Map<string, Buffer>();
  let position = 0;

  while (position + BLOCK <= tar.length) {
    const block = tar.subarray(position, position + BLOCK);
    position += BLOCK;

    const name = text(block, 0, 100);
    // Bloc nul : fin de l'archive.
    if (!name) break;

    if (text(block, 257, 6) !== "ustar") {
      throw new Error("Ce fichier n'est pas une sauvegarde Milo");
    }

    const size = octalNumber(block, 124, 12);
    if (size < 0 || position + size > tar.length) {
      throw new Error("Sauvegarde incomplète ou abîmée");
    }

    // Seuls les fichiers ordinaires nous intéressent : une sauvegarde n'en
    // contient pas d'autres, et on ne veut pas suivre un lien qui sortirait
    // du dossier des médias.
    const type = text(block, 156, 1);
    if (type === "" || type === "0") {
      files.set(name, Buffer.from(tar.subarray(position, position + size)));
    }

    position += size + rest(size);
  }

  return files;
};
