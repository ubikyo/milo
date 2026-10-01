// La réponse de l'équipe à une demande reçue par e-mail : le message écrit
// dans Milo part à l'expéditeur, depuis la boîte de support de la société, en
// réponse à son e-mail — dans la même conversation, l'original cité dessous.
//
// La réponse porte le numéro du ticket : une réponse de l'expéditeur y revient
// (lib/support-mail.ts). Avec MILO_SUPPORT_REPLY=simulate, l'envoi est simulé
// pour la mise au point : tout est préparé et consigné, mais rien ne quitte
// Milo. Le message dit ensuite ce qu'il en est advenu (mail_status).

import { supportTicketRef } from "@milo/shared";
import type { Id, SupportMailStatus } from "@milo/shared";
import { selection } from "../db/query.js";
import type { SupportRequestRow, TicketFileRow } from "../db/rows.js";
import { lireTicket } from "./ticket-files.js";
import { env } from "../env.js";
import { supportComments } from "../repositories/support.js";
import { entraConfiguree, repondreParGraph } from "./entra.js";

const boiteDe = selection<{ support_email: string }>(
  "SELECT support_email FROM companies WHERE id = ?",
);

/**
 * Envoie — ou simule — la réponse, et note sur le message ce qu'il en est
 * advenu. Ne lève jamais : le message est enregistré quoi qu'il arrive, c'est
 * son état qui dit si l'e-mail est parti.
 */
export const repondreParEmail = async (
  demande: SupportRequestRow,
  commentId: Id,
  html: string,
  copies: { cc: string[]; bcc: string[] } = { cc: [], bcc: [] },
  fichiers: TicketFileRow[] = [],
): Promise<SupportMailStatus> => {
  // Une demande saisie dans Milo n'a personne à qui répondre.
  if (!demande.sender_email || !demande.mail_id) return "";
  const boite = boiteDe.get(demande.company_id)?.support_email ?? "";
  if (!boite || !entraConfiguree()) return "";

  const noter = (statut: SupportMailStatus) => {
    supportComments.setMailStatus.run(statut, demande.sender_email, commentId);
    supportComments.setMailCopies.run(copies.cc.join(", "), copies.bcc.join(", "), commentId);
    return statut;
  };

  if (!env.supportReplySend) {
    console.log(
      `[Simulation] Réponse de ${boite} à ${demande.sender_email} — « RE: ${demande.subject} » (non envoyée)`,
    );
    return noter("simulated");
  }

  try {
    const pieces = fichiers.flatMap((f) => {
      const contenu = lireTicket(f.file);
      return contenu ? [{ name: f.name, mime: f.mime, contenu }] : [];
    });
    await repondreParGraph(
      boite,
      demande.mail_id,
      html,
      supportTicketRef(demande.number),
      copies,
      pieces,
    );
    return noter("sent");
  } catch (erreur) {
    console.error(`Réponse à ${demande.sender_email} depuis ${boite} :`, erreur);
    return noter("failed");
  }
};
