// Les fichiers : pièces jointes des cartes, et images collées dans une
// description. Tout vit à plat dans un seul dossier — « medias » à la racine
// en développement, MILO_MEDIA_PATH en production.
//
// Deux partis pris qui expliquent le reste du fichier :
//
//   1. Le nom d'origine ne sert jamais de nom de fichier. Il est gardé en base
//      pour l'afficher, et le fichier, lui, s'appelle seize octets tirés au
//      sort. Deux fichiers du même nom ne se marchent donc pas dessus, et rien
//      de ce que quelqu'un écrit ne devient un chemin.
//
//   2. Le type rendu est déduit de l'extension, jamais de ce que le client a
//      annoncé. Un fichier hors de la liste ci-dessous part en téléchargement,
//      sans être interprété : sans cela, un .html ou un .svg déposé sur une
//      carte s'exécuterait sur notre propre origine. C'est aussi pourquoi le
//      SVG n'est pas de la partie, tout image qu'il soit.

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { env } from "../env.js";

/** Au-delà, le dépôt est refusé. Dit en octets, et en clair pour le message. */
export const TAILLE_MAX = 25 * 1024 * 1024;
export const TAILLE_MAX_MO = TAILLE_MAX / (1024 * 1024);

/**
 * Les types que le serveur rend tels quels, déduits de l'extension. Tout le
 * reste s'en va en pièce jointe, sans type deviné.
 */
const TYPES_EN_LIGNE: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".avif": "image/avif",
  ".bmp": "image/bmp",
  ".pdf": "application/pdf",
};

/** La forme d'un nom de fichier des nôtres : seize octets tirés au sort, et une extension. */
const NOM_RANGE = /^[0-9a-f]{32}(\.[a-z0-9]{1,12})?$/;

/**
 * Les adresses de médias citées dans un HTML — la source des images d'une
 * description. Sert au ménage des orphelins : ce qui est cité reste.
 */
export const mediasCites = (html: string): string[] =>
  [...html.matchAll(/\/api\/medias\/([0-9a-f]{32}(?:\.[a-z0-9]{1,12})?)/g)].map((m) => m[1]!);

/**
 * Vrai pour l'adresse d'un de nos médias, et elle seule. C'est à cette aune
 * que le nettoyage du HTML garde ou jette une image (lib/html.ts) : une image
 * d'ailleurs ferait sortir la description de l'application.
 */
export const estUneAdresseMedia = (src: unknown): boolean =>
  /^\/api\/medias\/[0-9a-f]{32}(\.[a-z0-9]{1,12})?$/.test(String(src ?? ""));

// Le dossier est créé au chargement, comme celui de la base : une écriture ne
// doit pas avoir à se demander s'il existe.
fs.mkdirSync(env.mediaPath, { recursive: true });

/** L'extension d'un nom reçu, en minuscules, ou rien si elle n'en a pas l'allure. */
const extensionDe = (nom: string): string => {
  const trouve = /\.([A-Za-z0-9]{1,12})$/.exec(nom.trim());
  return trouve ? `.${trouve[1]!.toLowerCase()}` : "";
};

/** Le chemin d'un média, ou rien si le nom reçu n'est pas l'un des nôtres. */
export const cheminMedia = (fichier: string): string | null =>
  NOM_RANGE.test(fichier) ? path.join(env.mediaPath, fichier) : null;

/** Écrit le fichier et rend le nom sous lequel il est rangé. */
export const ecrireMedia = (contenu: Buffer, nomOrigine: string): string => {
  const fichier = `${crypto.randomBytes(16).toString("hex")}${extensionDe(nomOrigine)}`;
  fs.writeFileSync(path.join(env.mediaPath, fichier), contenu);
  return fichier;
};

export const supprimerMedia = (fichier: string): void => {
  const chemin = cheminMedia(fichier);
  if (chemin) fs.rmSync(chemin, { force: true });
};

/** L'adresse publique d'un média. Une seule écriture, lue de part et d'autre. */
export const urlMedia = (fichier: string): string => `/api/medias/${fichier}`;

/**
 * Comment rendre ce fichier : son type s'il est de ceux qu'on affiche, et rien
 * sinon — l'appelant en fait alors un téléchargement.
 */
export const typeEnLigne = (fichier: string): string | null =>
  TYPES_EN_LIGNE[extensionDe(fichier)] ?? null;

/** Vrai pour les images que l'application montre d'elle-même (vignette, description). */
export const estUneImage = (fichier: string): boolean =>
  (typeEnLigne(fichier) ?? "").startsWith("image/");

/**
 * Le ménage des fichiers que plus rien ne cite : une pièce jointe supprimée
 * avec sa carte, une image collée dans une description puis retirée.
 *
 * Le délai de grâce n'est pas une précaution de plus : une image collée est
 * déposée tout de suite, alors que la description qui la cite ne part au
 * serveur qu'à la fermeture du tiroir. Sans lui, le ménage effacerait l'image
 * d'une fiche restée ouverte.
 */
export const DELAI_DE_GRACE = 24 * 60 * 60 * 1000;

export const supprimerLesOrphelins = (cites: Set<string>): number => {
  const limite = Date.now() - DELAI_DE_GRACE;
  let supprimes = 0;

  for (const fichier of fs.readdirSync(env.mediaPath)) {
    if (cites.has(fichier)) continue;
    const chemin = cheminMedia(fichier);
    // Un fichier qui n'a pas la forme des nôtres n'est pas à nous : on n'y
    // touche pas, quoi qu'il fasse là.
    if (!chemin) continue;
    if (fs.statSync(chemin).mtimeMs > limite) continue;
    fs.rmSync(chemin, { force: true });
    supprimes += 1;
  }

  return supprimes;
};
