// The team's reply to a request received by e-mail: the message written in
// Milo goes to the sender, from the inbox where their request arrived, in
// reply to their e-mail — in the same conversation, the original quoted below.
//
// The reply carries the ticket number: a reply from the sender comes back to
// it (lib/support-mail.ts). With MILO_SUPPORT_REPLY=simulate, sending is
// simulated for debugging: everything is prepared and logged, but nothing
// leaves Milo. The message then says what became of it (mail_status).

import { supportTicketRef } from "@milo/shared";
import type { Id, SupportMailStatus } from "@milo/shared";
import type { SupportRequestRow, TicketFileRow } from "../db/rows.js";
import { readTicket } from "./ticket-files.js";
import { env } from "../env.js";
import { supportComments } from "../repositories/support.js";
import { entraConfigured, replyByGraph } from "./entra.js";

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
    await replyByGraph(
      mailbox,
      request.mail_id,
      html,
      supportTicketRef(request.number),
      copies,
      attachments,
    );
    return record("sent");
  } catch (error) {
    console.error(`Reply to ${request.sender_email} from ${mailbox}:`, error);
    return record("failed");
  }
};
