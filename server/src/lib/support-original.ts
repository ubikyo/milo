// The e-mail that opened a request, as a reply quotes it ({{ticket.original}}):
// the message it left in the thread — no need to go back to the mailbox. Its
// embedded images are Milo's files: the preview shows them as they are, an
// e-mail carries them, cited by "cid:".

import type { SupportRequestRow } from "../db/rows.js";
import { supportComments } from "../repositories/support.js";
import type { OriginalMail } from "./mail-template.js";
import { filesOf, readTicket, ticketUrl } from "./ticket-files.js";

/** An image the quote embeds, as an e-mail carries it. */
export interface QuotedImage {
  name: string;
  mime: string;
  content: Buffer;
  contentId: string;
}

const messageOf = (request: SupportRequestRow) =>
  request.mail_id ? supportComments.ofMail.get(request.id, request.mail_id) : undefined;

const asOriginal = (request: SupportRequestRow, created_at: string, html: string): OriginalMail => ({
  from_name: request.sender_name,
  from_email: request.sender_email,
  sent_at: created_at,
  to: request.mailbox,
  subject: request.subject,
  html,
});

/** The e-mail as the preview shows it; nothing for a request entered in Milo. */
export const originalMail = (request: SupportRequestRow): OriginalMail | null => {
  const message = messageOf(request);
  return message ? asOriginal(request, message.created_at, message.text) : null;
};

/** The e-mail as a reply sends it: its images go with it. */
export const sentOriginalMail = (
  request: SupportRequestRow,
): { original: OriginalMail | null; images: QuotedImage[] } => {
  const message = messageOf(request);
  if (!message) return { original: null, images: [] };

  let html = message.text;
  const images: QuotedImage[] = [];
  for (const file of filesOf(message.attachments)) {
    const url = ticketUrl(file.file);
    if (!file.inline || !html.includes(url)) continue;
    const content = readTicket(file.file);
    if (!content) continue;
    const contentId = `milo-${file.file}`;
    html = html.split(url).join(`cid:${contentId}`);
    images.push({ name: file.name, mime: file.mime, content, contentId });
  }
  return { original: asOriginal(request, message.created_at, html), images };
};
