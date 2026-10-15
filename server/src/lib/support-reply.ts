// The team's reply to a request received by e-mail: the message written in
// Milo goes to the sender, from the inbox where their request arrived, in
// reply to their e-mail — in the same conversation, the original quoted where
// its template cites it ({{ticket.original}}).
//
// The reply carries the ticket number: a reply from the sender comes back to
// it (lib/support-mail.ts). With MILO_SUPPORT_REPLY=simulate, sending is
// simulated for debugging: everything is prepared and logged, but nothing
// leaves Milo. The message then says what became of it (mail_status).

import { itemLink, supportStatusLabel, supportTicketRef } from "@milo/shared";
import type { Id, SupportMailStatus, SupportStatus } from "@milo/shared";
import type { SupportRequestRow, TicketFileRow } from "../db/rows.js";
import { readTicket } from "./ticket-files.js";
import { env } from "../env.js";
import { supportComments } from "../repositories/support.js";
import { entraConfigured, replyByGraph } from "./entra.js";
import { replyTemplate } from "./mail-template.js";
import { ticketReference, withReference } from "./mail-reference.js";
import { miloUrl } from "./milo-url.js";
import { sentOriginalMail } from "./support-original.js";
import { senderPerson } from "./support-variables.js";

/**
 * The inbox to reply from for a request, or nothing: a request entered in
 * Milo has nobody to reply to, and without Entra nothing is sent.
 */
export const replyMailbox = (request: SupportRequestRow): string => {
  if (!request.sender_email || !request.mail_id || !entraConfigured()) return "";
  return request.mailbox;
};

/**
 * Sends — or simulates — the reply, and notes on the message what became of
 * it. Never throws: the message is saved no matter what, its state says
 * whether the e-mail went out.
 */
export const replyByEmail = async (
  request: SupportRequestRow,
  commentId: Id,
  html: string,
  copies: { cc: string[]; bcc: string[] } = { cc: [], bcc: [] },
  files: TicketFileRow[] = [],
  /** The template that lays it out: a team reply, or an automatic one. */
  kind: "support_reply" | "support_auto_reply" = "support_reply",
  /** An automatic reply's name, for its template's {{name}}. */
  name = "",
): Promise<SupportMailStatus> => {
  const mailbox = replyMailbox(request);
  if (!mailbox) return "";

  const record = (status: SupportMailStatus) => {
    supportComments.setMailStatus.run(status, request.sender_email, commentId);
    supportComments.setMailCopies.run(copies.cc.join(", "), copies.bcc.join(", "), commentId);
    return status;
  };

  if (!env.supportReplySend) {
    console.log(
      `[Simulation] Reply from ${mailbox} to ${request.sender_email} — "RE: ${request.subject}" (not sent)`,
    );
    return record("simulated");
  }

  try {
    const attachments = files.flatMap((f) => {
      const content = readTicket(f.file);
      return content ? [{ name: f.name, mime: f.mime, content }] : [];
    });
    const ticket = supportTicketRef(request.number);
    // Its ticket in a hidden line too: a reply whose subject lost it still finds the request.
    const content = withReference(html, ticketReference(ticket));
    const base = miloUrl();
    const requester = await senderPerson(request);
    const { original, images } = sentOriginalMail(request);
    const laidOut = await replyTemplate(kind, {
      content,
      ticket,
      subject: request.subject,
      name,
      status: supportStatusLabel(request.status as SupportStatus),
      url: base ? `${base}/${itemLink("support", request.id)}` : "",
      requester: requester ?? undefined,
      original,
    }, { board: request.board_id, list: request.list_key });
    // The logos its template cites go with it, inline.
    const logos = laidOut.attachments.map((a) => ({
      name: a.filename,
      mime: a.contentType,
      content: a.content,
      contentId: a.cid,
    }));
    // The original e-mail's images, if its template quotes it.
    const quoted = images.filter((i) => laidOut.html.includes(`cid:${i.contentId}`));
    await replyByGraph(
      mailbox,
      request.mail_id,
      laidOut.html || html,
      ticket,
      copies,
      [...attachments, ...logos, ...quoted],
    );
    return record("sent");
  } catch (error) {
    console.error(`Reply to ${request.sender_email} from ${mailbox}:`, error);
    return record("failed");
  }
};
