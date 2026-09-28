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

const BLOC = 512;

export interface Entree {
  /** Le chemin dans l'archive, en barres obliques : « medias/abc.png ». */
  nom: string;
  contenu: Buffer;
}

/** Un nombre en octal, complété de zéros à gauche et suivi d'un octet nul. */
const octal = (valeur: number, largeur: number): string =>
  `${valeur.toString(8).padStart(largeur - 1, "0")}\0`;

const entete = (entree: Entree, mtime: number): Buffer => {
  const bloc = Buffer.alloc(BLOC);

  // Un nom de plus de 100 octets demanderait le champ « prefix » ; les nôtres
  // — « milo.db », « medias/ » et trente-deux caractères — n'en approchent
  // pas, et on préfère refuser que produire une archive silencieusement fausse.
  const nom = Buffer.from(entree.nom, "utf8");
  if (nom.length > 100) throw new Error(`Nom trop long pour l'archive : ${entree.nom}`);
  nom.copy(bloc, 0);

  bloc.write(octal(0o644, 8), 100); // mode
  bloc.write(octal(0, 8), 108); // uid
  bloc.write(octal(0, 8), 116); // gid
  bloc.write(octal(entree.contenu.length, 12), 124);
  bloc.write(octal(Math.floor(mtime / 1000), 12), 136);
  bloc.write("        ", 148); // somme de contrôle : des espaces le temps du calcul
  bloc.write("0", 156); // fichier ordinaire
  bloc.write("ustar\0", 257);
  bloc.write("00", 263);

  // La somme de contrôle se calcule sur l'entête entier, son propre champ
  // compté comme huit espaces : d'où l'ordre ci-dessus. Six chiffres octaux,
  // un octet nul, une espace — c'est la forme qu'attendent les lecteurs.
  let somme = 0;
  for (const octet of bloc) somme += octet;
  bloc.write(`${somme.toString(8).padStart(6, "0")}\0 `, 148);

  return bloc;
};

/** Ce qu'il manque à un contenu pour terminer le dernier bloc entamé. */
const reste = (longueur: number): number => (BLOC - (longueur % BLOC)) % BLOC;

/** Les entrées, en une archive compressée. */
export const empaqueter = (entrees: Entree[]): Buffer => {
  const maintenant = Date.now();
  const morceaux: Buffer[] = [];

  for (const entree of entrees) {
    morceaux.push(entete(entree, maintenant), entree.contenu);
    morceaux.push(Buffer.alloc(reste(entree.contenu.length)));
  }
  // Deux blocs nuls closent une archive tar.
  morceaux.push(Buffer.alloc(BLOC * 2));

  return gzipSync(Buffer.concat(morceaux));
};

const texte = (bloc: Buffer, debut: number, longueur: number): string => {
  const brut = bloc.subarray(debut, debut + longueur);
  const fin = brut.indexOf(0);
  return brut.subarray(0, fin === -1 ? brut.length : fin).toString("utf8").trim();
};

const nombreOctal = (bloc: Buffer, debut: number, longueur: number): number => {
  const valeur = parseInt(texte(bloc, debut, longueur) || "0", 8);
  return Number.isFinite(valeur) && valeur >= 0 ? valeur : -1;
};

/**
 * L'archive relue, par nom de fichier. Lève si ce n'est pas une archive des
 * nôtres : c'est le premier tri de la restauration, avant même de regarder ce
 * qu'elle contient.
 */
export const depaqueter = (archive: Buffer): Map<string, Buffer> => {
  let tar: Buffer;
  try {
    tar = gunzipSync(archive);
  } catch {
    throw new Error("Ce fichier n'est pas une sauvegarde Milo");
  }

  const fichiers = new Map<string, Buffer>();
  let position = 0;

  while (position + BLOC <= tar.length) {
    const bloc = tar.subarray(position, position + BLOC);
    position += BLOC;

    const nom = texte(bloc, 0, 100);
    // Bloc nul : fin de l'archive.
    if (!nom) break;

    if (texte(bloc, 257, 6) !== "ustar") {
      throw new Error("Ce fichier n'est pas une sauvegarde Milo");
    }

    const taille = nombreOctal(bloc, 124, 12);
    if (taille < 0 || position + taille > tar.length) {
      throw new Error("Sauvegarde incomplète ou abîmée");
    }

    // Seuls les fichiers ordinaires nous intéressent : une sauvegarde n'en
    // contient pas d'autres, et on ne veut pas suivre un lien qui sortirait
    // du dossier des médias.
    const type = texte(bloc, 156, 1);
    if (type === "" || type === "0") {
      fichiers.set(nom, Buffer.from(tar.subarray(position, position + taille)));
    }

    position += taille + reste(taille);
  }

  return fichiers;
};
