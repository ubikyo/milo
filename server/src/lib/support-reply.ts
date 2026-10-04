// La réponse de l'équipe à une demande reçue par e-mail : le message écrit
// dans Milo part à l'expéditeur, depuis la boîte où sa demande est arrivée, en
// réponse à son e-mail — dans la même conversation, l'original cité dessous.
//
// La réponse porte le numéro du ticket : une réponse de l'expéditeur y revient
// (lib/support-mail.ts). Avec MILO_SUPPORT_REPLY=simulate, l'envoi est simulé
// pour la mise au point : tout est préparé et consigné, mais rien ne quitte
// Milo. Le message dit ensuite ce qu'il en est advenu (mail_status).

import { supportTicketRef } from "@milo/shared";
import type { Id, SupportMailStatus } from "@milo/shared";
import type { SupportRequestRow, TicketFileRow } from "../db/rows.js";
import { readTicket } from "./ticket-files.js";
import { env } from "../env.js";
import { supportComments } from "../repositories/support.js";
import { entraConfigured, replyByGraph } from "./entra.js";

/**
 * La boîte d'où répondre à une demande, ou rien : une demande saisie dans
 * Milo n'a personne à qui répondre, et sans Entra rien ne part.
 */
export const replyMailbox = (request: SupportRequestRow): string => {
  if (!request.sender_email || !request.mail_id || !entraConfigured()) return "";
  return request.mailbox;
};

/**
 * Envoie — ou simule — la réponse, et note sur le message ce qu'il en est
 * advenu. Ne lève jamais : le message est enregistré quoi qu'il arrive, c'est
 * son état qui dit si l'e-mail est parti.
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
      `[Simulation] Réponse de ${mailbox} à ${request.sender_email} — « RE: ${request.subject} » (non envoyée)`,
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
    console.error(`Réponse à ${request.sender_email} depuis ${mailbox} :`, error);
    return record("failed");
  }
};
