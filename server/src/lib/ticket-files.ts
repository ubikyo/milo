// Les fichiers des e-mails reçus au support : leurs images intégrées et leurs
// pièces jointes. Ils vivent à plat dans leur propre dossier — « upload/
// tickets » à la racine en développement, MILO_TICKETS_PATH en production —,
// à part des médias des cartes, dont le ménage ne les connaît pas.
//
// Mêmes partis pris que les médias (lib/medias.ts) : le fichier s'appelle
// seize octets tirés au sort, le nom d'origine n'est gardé qu'en base pour
// l'afficher, et le type rendu se déduit de l'extension — un .html joint à un
// e-mail part en téléchargement, il ne s'exécute pas sur notre origine.

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import type { SupportAttachment } from "@milo/shared";
import { selection } from "../db/query.js";
import type { TicketFileRow } from "../db/rows.js";
import { env } from "../env.js";
import { typeEnLigne } from "./medias.js";

/** Au-delà, une pièce jointe n'est pas rapatriée : l'e-mail le dit à sa place. */
export const TAILLE_MAX_TICKET = 50 * 1024 * 1024;

/**
 * Au-delà, les pièces jointes d'une réponse ne partent pas par e-mail : Graph
 * refuse un envoi de plus de 4 Mo quand les fichiers voyagent dans la
 * requête, et le base64 les grossit d'un tiers. Au-delà, il faudrait passer
 * par un brouillon — et la permission Mail.ReadWrite.
 */
export const TAILLE_MAX_ENVOI = 3 * 1024 * 1024;
export const TAILLE_MAX_ENVOI_MO = TAILLE_MAX_ENVOI / (1024 * 1024);

/**
 * Les fichiers d'une réponse, tels que le client les a déposés : seuls des
 * noms des nôtres, présents sur le disque. La taille est relue sur le disque,
 * pas crue sur parole.
 */
export const fichiersDeposes = (valeur: unknown): TicketFileRow[] | null => {
  if (valeur === undefined) return [];
  if (!Array.isArray(valeur)) return null;
  const fichiers: TicketFileRow[] = [];
  for (const brut of valeur as { file?: unknown; name?: unknown; mime?: unknown }[]) {
    const file = String(brut?.file ?? "");
    const chemin = cheminTicket(file);
    if (!chemin || !fs.existsSync(chemin)) return null;
    fichiers.push({
      file,
      name: String(brut?.name ?? "").trim() || file,
      mime: String(brut?.mime ?? "") || "application/octet-stream",
      size: fs.statSync(chemin).size,
      inline: false,
    });
  }
  return fichiers;
};

/** Le contenu d'un fichier de ticket, pour l'envoyer. */
export const lireTicket = (fichier: string): Buffer | null => {
  const chemin = cheminTicket(fichier);
  return chemin && fs.existsSync(chemin) ? fs.readFileSync(chemin) : null;
};

const NOM_RANGE = /^[0-9a-f]{32}(\.[a-z0-9]{1,12})?$/;

fs.mkdirSync(env.ticketsPath, { recursive: true });

const extensionDe = (nom: string): string => {
  const trouve = /\.([A-Za-z0-9]{1,12})$/.exec(nom.trim());
  return trouve ? `.${trouve[1]!.toLowerCase()}` : "";
};

/** Le chemin d'un fichier de ticket, ou rien si le nom n'est pas l'un des nôtres. */
export const cheminTicket = (fichier: string): string | null =>
  NOM_RANGE.test(fichier) ? path.join(env.ticketsPath, fichier) : null;

/** Écrit le fichier et rend le nom sous lequel il est rangé. */
export const ecrireTicket = (contenu: Buffer, nomOrigine: string): string => {
  const fichier = `${crypto.randomBytes(16).toString("hex")}${extensionDe(nomOrigine)}`;
  fs.writeFileSync(path.join(env.ticketsPath, fichier), contenu);
  return fichier;
};

export const supprimerTicket = (fichier: string): void => {
  const chemin = cheminTicket(fichier);
  if (chemin) fs.rmSync(chemin, { force: true });
};

/** L'adresse publique d'un fichier de ticket. */
export const urlTicket = (fichier: string): string => `/api/ticket-files/${fichier}`;

export { typeEnLigne };

/** Les fichiers d'un message, relus de leur JSON ; rien s'il est illisible. */
export const fichiersDe = (json: string): TicketFileRow[] => {
  try {
    const liste = JSON.parse(json) as unknown;
    return Array.isArray(liste) ? (liste as TicketFileRow[]) : [];
  } catch {
    return [];
  }
};

/** Les pièces jointes telles que le fil les montre : sans les images intégrées. */
export const piecesJointes = (json: string): SupportAttachment[] =>
  fichiersDe(json)
    .filter((f) => !f.inline)
    .map((f) => ({ name: f.name, url: urlTicket(f.file), mime: f.mime, size: f.size }));

const messagesQuiCitent = selection<{ attachments: string }>(
  "SELECT attachments FROM support_comments WHERE attachments LIKE ?",
);

/** Le fichier tel qu'un message le décrit : son nom d'origine, surtout. */
export const fichierCite = (fichier: string): TicketFileRow | undefined => {
  for (const { attachments } of messagesQuiCitent.all(`%"${fichier}"%`)) {
    const trouve = fichiersDe(attachments).find((f) => f.file === fichier);
    if (trouve) return trouve;
  }
  return undefined;
};

/**
 * Efface ceux de ces fichiers qu'aucun message ne cite plus. Une fusion
 * recopie le fil d'une demande dans une autre, fichiers compris : supprimer
 * l'une ne doit pas priver l'autre de ses images.
 */
export const oublierFichiers = (fichiers: string[]): void => {
  for (const fichier of fichiers) {
    if (!fichierCite(fichier)) supprimerTicket(fichier);
  }
};
