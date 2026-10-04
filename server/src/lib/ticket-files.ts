// Files of e-mails received by support: their embedded images and their
// attachments. They live flat in their own folder — "upload/tickets" at the
// root in development, MILO_TICKETS_PATH in production —, apart from card
// media, whose cleanup does not know them.
//
// Same design choices as media (lib/media.ts): the file is named with sixteen
// random bytes, the original name is kept only in the database to display it,
// and the served type is deduced from the extension — an .html attached to an
// e-mail is downloaded, it does not run on our origin.

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import type { SupportAttachment } from "@milo/shared";
import { selection } from "../db/query.js";
import type { TicketFileRow } from "../db/rows.js";
import { env } from "../env.js";
import { inlineType } from "./media.js";

/** Beyond this, an attachment is not fetched: the e-mail says so in its place. */
export const TICKET_SIZE_MAX = 50 * 1024 * 1024;

/**
 * Beyond this, a reply's attachments are not sent by e-mail: Graph refuses a
 * send of more than 4 MB when files travel in the request, and base64 inflates
 * them by a third. Beyond that, a draft would be needed — and the
 * Mail.ReadWrite permission.
 */
export const SEND_SIZE_MAX = 3 * 1024 * 1024;
export const SEND_SIZE_MAX_MB = SEND_SIZE_MAX / (1024 * 1024);

/**
 * A reply's files, as the client uploaded them: only names of ours, present
 * on disk. The size is re-read from disk, not taken on trust.
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

/** A ticket file's content, to send it. */
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

/** A ticket file's path, or nothing if the name is not one of ours. */
export const ticketPathFor = (file: string): string | null =>
  RANGE_NAME.test(file) ? path.join(env.ticketsPath, file) : null;

/** Writes the file and returns the name under which it is stored. */
export const writeTicket = (content: Buffer, originalName: string): string => {
  const file = `${crypto.randomBytes(16).toString("hex")}${extensionOf(originalName)}`;
  fs.writeFileSync(path.join(env.ticketsPath, file), content);
  return file;
};

export const deleteTicket = (file: string): void => {
  const relativePath = ticketPathFor(file);
  if (relativePath) fs.rmSync(relativePath, { force: true });
};

/** A ticket file's public address. */
export const ticketUrl = (file: string): string => `/api/ticket-files/${file}`;

export { inlineType };

/** A message's files, re-read from their JSON; nothing if it is unreadable. */
export const filesOf = (json: string): TicketFileRow[] => {
  try {
    const list = JSON.parse(json) as unknown;
    return Array.isArray(list) ? (list as TicketFileRow[]) : [];
  } catch {
    return [];
  }
};

/** Attachments as the thread shows them: without the embedded images. */
export const parseAttachments = (json: string): SupportAttachment[] =>
  filesOf(json)
    .filter((f) => !f.inline)
    .map((f) => ({ name: f.name, url: ticketUrl(f.file), mime: f.mime, size: f.size }));

const messagesCiting = selection<{ attachments: string }>(
  "SELECT attachments FROM support_comments WHERE attachments LIKE ?",
);

/** The file as a message describes it: its original name, mainly. */
export const quotedFile = (file: string): TicketFileRow | undefined => {
  for (const { attachments } of messagesCiting.all(`%"${file}"%`)) {
    const found = filesOf(attachments).find((f) => f.file === file);
    if (found) return found;
  }
  return undefined;
};

/**
 * Deletes those of these files that no message cites anymore. A merge copies
 * a request's thread into another, files included: deleting one must not
 * deprive the other of its images.
 */
export const forgetFiles = (files: string[]): void => {
  for (const file of files) {
    if (!quotedFile(file)) deleteTicket(file);
  }
};
