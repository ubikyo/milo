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
export const SIZE_MAX = 25 * 1024 * 1024;
export const SIZE_MAX_MB = SIZE_MAX / (1024 * 1024);

/**
 * Les types que le serveur rend tels quels, déduits de l'extension. Tout le
 * reste s'en va en pièce jointe, sans type deviné.
 */
const INLINE_TYPES: Record<string, string> = {
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
const RANGE_NAME = /^[0-9a-f]{32}(\.[a-z0-9]{1,12})?$/;

/**
 * Les adresses de médias citées dans un HTML — la source des images d'une
 * description. Sert au ménage des orphelins : ce qui est cité reste. L'ancienne
 * adresse, « /api/medias/ », compte aussi : elle sert encore (app.ts).
 */
export const citedMedia = (html: string): string[] =>
  [...html.matchAll(/\/api\/medias?\/([0-9a-f]{32}(?:\.[a-z0-9]{1,12})?)/g)].map((m) => m[1]!);

/**
 * Vrai pour l'adresse d'un de nos médias, et elle seule — « /api/media/ », ou
 * l'ancienne « /api/medias/ ». C'est à cette aune que le nettoyage du HTML
 * garde ou jette une image (lib/html.ts) : une image d'ailleurs ferait sortir
 * la description de l'application.
 */
export const isMediaAddress = (src: unknown): boolean =>
  /^\/api\/medias?\/[0-9a-f]{32}(\.[a-z0-9]{1,12})?$/.test(String(src ?? ""));

// Le dossier est créé au chargement, comme celui de la base : une écriture ne
// doit pas avoir à se demander s'il existe.
fs.mkdirSync(env.mediaPath, { recursive: true });

/** L'extension d'un nom reçu, en minuscules, ou rien si elle n'en a pas l'allure. */
const extensionOf = (name: string): string => {
  const found = /\.([A-Za-z0-9]{1,12})$/.exec(name.trim());
  return found ? `.${found[1]!.toLowerCase()}` : "";
};

/** Le chemin d'un média, ou rien si le nom reçu n'est pas l'un des nôtres. */
export const mediaPath = (file: string): string | null =>
  RANGE_NAME.test(file) ? path.join(env.mediaPath, file) : null;

/** Écrit le fichier et rend le nom sous lequel il est rangé. */
export const writeMedia = (content: Buffer, originalName: string): string => {
  const file = `${crypto.randomBytes(16).toString("hex")}${extensionOf(originalName)}`;
  fs.writeFileSync(path.join(env.mediaPath, file), content);
  return file;
};

export const deleteMedia = (file: string): void => {
  const relativePath = mediaPath(file);
  if (relativePath) fs.rmSync(relativePath, { force: true });
};

/** L'adresse publique d'un média. Une seule écriture, lue de part et d'autre. */
export const mediaUrl = (file: string): string => `/api/media/${file}`;

/**
 * Comment rendre ce fichier : son type s'il est de ceux qu'on affiche, et rien
 * sinon — l'appelant en fait alors un téléchargement.
 */
export const inlineType = (file: string): string | null =>
  INLINE_TYPES[extensionOf(file)] ?? null;

/** Vrai pour les images que l'application montre d'elle-même (vignette, description). */
export const isImage = (file: string): boolean =>
  (inlineType(file) ?? "").startsWith("image/");

/**
 * Le ménage des fichiers que plus rien ne cite : une pièce jointe supprimée
 * avec sa carte, une image collée dans une description puis retirée.
 *
 * Le délai de grâce n'est pas une précaution de plus : une image collée est
 * déposée tout de suite, alors que la description qui la cite ne part au
 * serveur qu'à la fermeture du tiroir. Sans lui, le ménage effacerait l'image
 * d'une fiche restée ouverte.
 */
export const GRACE_PERIOD = 24 * 60 * 60 * 1000;

export const deleteOrphans = (cited: Set<string>): number => {
  const cutoff = Date.now() - GRACE_PERIOD;
  let deleted = 0;

  for (const file of fs.readdirSync(env.mediaPath)) {
    if (cited.has(file)) continue;
    const relativePath = mediaPath(file);
    // Un fichier qui n'a pas la forme des nôtres n'est pas à nous : on n'y
    // touche pas, quoi qu'il fasse là.
    if (!relativePath) continue;
    if (fs.statSync(relativePath).mtimeMs > cutoff) continue;
    fs.rmSync(relativePath, { force: true });
    deleted += 1;
  }

  return deleted;
};
