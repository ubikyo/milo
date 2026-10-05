// Default replies that are sent automatically: an event — the arrival of a
// request by e-mail, its closing… — sends the sender the reply that the
// Tickets widget assigned to it (Réponses automatiques).
//
// The reply enters the request's thread, signed Milo, like a team reply: you
// can see what was sent, and whether it went out. It is sent from the support
// inbox, in the original e-mail's conversation (lib/support-reply.ts) — so a
// request entered in Milo receives none.

import { fillSupportTemplate, supportReplyValues } from "@milo/shared";
import type { Id, SupportReplyEvent, SupportStatus } from "@milo/shared";
import { signalWrite } from "../middleware/events.js";
import { supportComments, supportRequests } from "../repositories/support.js";
import { replyFor } from "../routes/support-replies.js";
import { hasContent } from "./html.js";
import { replyMailbox, replyByEmail } from "./support-reply.js";
import { senderPerson } from "./support-variables.js";
import { now } from "./time.js";

/** The event a new status triggers; "Nouveau" triggers none. */
export const statusEvent = (status: SupportStatus): SupportReplyEvent | null =>
  status === "new" ? null : status;

/**
 * Sends the reply the event calls for, if there is one, the request has
 * someone to reply to, and its template is filled in. Never throws: a failure
 * is read on the message, in the thread.
 */
export const sendAutoReply = async (
  requestId: Id,
  event: SupportReplyEvent,
): Promise<void> => {
  try {
    const request = supportRequests.byId.get(requestId);
    if (!request || !replyMailbox(request)) return;
    const reply = replyFor(event);
    if (!reply) return;

    if (!hasContent(reply.html)) return;
    // Sent automatically, the reply has no user: its variables stay empty.
    const sender = await senderPerson(request);
    const html = fillSupportTemplate(
      reply.html,
      supportReplyValues({ sender, request }),
    );

    const instant = now();
    const { lastInsertRowid } = supportComments.createAuto.run(
      request.id,
      html,
      event,
      instant,
      instant,
    );
    await replyByEmail(
      request,
      lastInsertRowid as Id,
      html,
      undefined,
      [],
      "support_auto_reply",
      reply.name,
    );
    signalWrite("support-requests");
  } catch (error) {
    console.error(`Default reply "${event}" to request ${requestId}:`, error);
  }
};
