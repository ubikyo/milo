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
import { inlineType } from "./media.js";

/** Au-delà, une pièce jointe n'est pas rapatriée : l'e-mail le dit à sa place. */
export const TICKET_SIZE_MAX = 50 * 1024 * 1024;

/**
 * Au-delà, les pièces jointes d'une réponse ne partent pas par e-mail : Graph
 * refuse un envoi de plus de 4 Mo quand les fichiers voyagent dans la
 * requête, et le base64 les grossit d'un tiers. Au-delà, il faudrait passer
 * par un brouillon — et la permission Mail.ReadWrite.
 */
export const SEND_SIZE_MAX = 3 * 1024 * 1024;
export const SEND_SIZE_MAX_MB = SEND_SIZE_MAX / (1024 * 1024);

/**
 * Les fichiers d'une réponse, tels que le client les a déposés : seuls des
 * noms des nôtres, présents sur le disque. La taille est relue sur le disque,
 * pas crue sur parole.
 */
export const uploadedFiles = (value: unknown): TicketFileRow[] | null => {
  if (value === undefined) return [];
  if (!Array.isArray(value)) return null;
  const files: TicketFileRow[] = [];
  for (const raw of value as { file?: unknown; name?: unknown; mime?: unknown }[]) {
    const file = String(raw?.file ?? "");
    const relativePath = ticketPathFor(file);
    if (!relativePath || !fs.existsSync(relativePath)) return null;
    files.push({
      file,
      name: String(raw?.name ?? "").trim() || file,
      mime: String(raw?.mime ?? "") || "application/octet-stream",
      size: fs.statSync(relativePath).size,
      inline: false,
    });
  }
  return files;
};

/** Le contenu d'un fichier de ticket, pour l'envoyer. */
export const readTicket = (file: string): Buffer | null => {
  const relativePath = ticketPathFor(file);
  return relativePath && fs.existsSync(relativePath) ? fs.readFileSync(relativePath) : null;
};

const RANGE_NAME = /^[0-9a-f]{32}(\.[a-z0-9]{1,12})?$/;

fs.mkdirSync(env.ticketsPath, { recursive: true });

const extensionOf = (name: string): string => {
  const found = /\.([A-Za-z0-9]{1,12})$/.exec(name.trim());
  return found ? `.${found[1]!.toLowerCase()}` : "";
};

/** Le chemin d'un fichier de ticket, ou rien si le nom n'est pas l'un des nôtres. */
export const ticketPathFor = (file: string): string | null =>
  RANGE_NAME.test(file) ? path.join(env.ticketsPath, file) : null;

/** Écrit le fichier et rend le nom sous lequel il est rangé. */
export const writeTicket = (content: Buffer, originalName: string): string => {
  const file = `${crypto.randomBytes(16).toString("hex")}${extensionOf(originalName)}`;
  fs.writeFileSync(path.join(env.ticketsPath, file), content);
  return file;
};

export const deleteTicket = (file: string): void => {
  const relativePath = ticketPathFor(file);
  if (relativePath) fs.rmSync(relativePath, { force: true });
};

/** L'adresse publique d'un fichier de ticket. */
export const ticketUrl = (file: string): string => `/api/ticket-files/${file}`;

export { inlineType };

/** Les fichiers d'un message, relus de leur JSON ; rien s'il est illisible. */
export const filesOf = (json: string): TicketFileRow[] => {
  try {
    const list = JSON.parse(json) as unknown;
    return Array.isArray(list) ? (list as TicketFileRow[]) : [];
  } catch {
    return [];
  }
};

/** Les pièces jointes telles que le fil les montre : sans les images intégrées. */
export const parseAttachments = (json: string): SupportAttachment[] =>
  filesOf(json)
    .filter((f) => !f.inline)
    .map((f) => ({ name: f.name, url: ticketUrl(f.file), mime: f.mime, size: f.size }));

const messagesCiting = selection<{ attachments: string }>(
  "SELECT attachments FROM support_comments WHERE attachments LIKE ?",
);

/** Le fichier tel qu'un message le décrit : son nom d'origine, surtout. */
export const quotedFile = (file: string): TicketFileRow | undefined => {
  for (const { attachments } of messagesCiting.all(`%"${file}"%`)) {
    const found = filesOf(attachments).find((f) => f.file === file);
    if (found) return found;
  }
  return undefined;
};

/**
 * Efface ceux de ces fichiers qu'aucun message ne cite plus. Une fusion
 * recopie le fil d'une demande dans une autre, fichiers compris : supprimer
 * l'une ne doit pas priver l'autre de ses images.
 */
export const forgetFiles = (files: string[]): void => {
  for (const file of files) {
    if (!quotedFile(file)) deleteTicket(file);
  }
};
