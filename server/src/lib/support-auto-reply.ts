// Les réponses par défaut qui partent d'office : un évènement — l'arrivée
// d'une demande par e-mail, sa fermeture… — envoie à l'expéditeur la réponse
// que le Paramétrage lui a attribuée (Support › Réponses par défaut).
//
// La réponse entre dans le fil de la demande, signée Milo, comme une réponse
// de l'équipe : on voit ce qui est parti, et si c'est parti. Elle part de la
// boîte de support, dans la conversation de l'e-mail d'origine
// (lib/support-reply.ts) — une demande saisie dans Milo n'en reçoit donc pas.

import { fillSupportTemplate, supportReplyValues } from "@milo/shared";
import type { Id, SupportReplyEvent, SupportStatus } from "@milo/shared";
import { signalWrite } from "../middleware/events.js";
import { supportComments, supportRequests } from "../repositories/support.js";
import { replyFor } from "../routes/support-replies.js";
import { hasContent } from "./html.js";
import { replyMailbox, replyByEmail } from "./support-reply.js";
import { senderPerson } from "./support-variables.js";
import { now } from "./time.js";

/** L'évènement qu'un nouveau statut déclenche ; « Nouveau » n'en déclenche aucun. */
export const statusEvent = (status: SupportStatus): SupportReplyEvent | null =>
  status === "new" ? null : status;

/**
 * Envoie la réponse qu'appelle l'évènement, s'il y en a une et que la demande
 * a quelqu'un à qui répondre, et que son modèle est renseigné. Ne lève
 * jamais : un échec se lit sur le message, dans le fil.
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
    // Partie d'office, la réponse n'a pas d'utilisateur : ses variables restent vides.
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
    await replyByEmail(request, lastInsertRowid as Id, html);
    signalWrite("support-requests");
  } catch (error) {
    console.error(`Réponse par défaut « ${event} » à la demande ${requestId} :`, error);
  }
};
