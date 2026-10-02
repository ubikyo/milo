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
import { signalerEcriture } from "../middleware/events.js";
import { supportComments, supportRequests } from "../repositories/support.js";
import { reponsePour } from "../routes/support-replies.js";
import { porteDuContenu } from "./html.js";
import { boiteDeReponse, repondreParEmail } from "./support-reply.js";
import { personneExpediteur } from "./support-variables.js";
import { now } from "./time.js";

/** L'évènement qu'un nouveau statut déclenche ; « Nouveau » n'en déclenche aucun. */
export const evenementDuStatut = (statut: SupportStatus): SupportReplyEvent | null =>
  statut === "new" ? null : statut;

/**
 * Envoie la réponse qu'appelle l'évènement, s'il y en a une et que la demande
 * a quelqu'un à qui répondre, et que son modèle est renseigné. Ne lève
 * jamais : un échec se lit sur le message, dans le fil.
 */
export const envoyerReponseAuto = async (
  demandeId: Id,
  evenement: SupportReplyEvent,
): Promise<void> => {
  try {
    const demande = supportRequests.byId.get(demandeId);
    if (!demande || !boiteDeReponse(demande)) return;
    const reponse = reponsePour(evenement);
    if (!reponse) return;

    if (!porteDuContenu(reponse.html)) return;
    // Partie d'office, la réponse n'a pas d'utilisateur : ses variables restent vides.
    const expediteur = await personneExpediteur(demande);
    const html = fillSupportTemplate(
      reponse.html,
      supportReplyValues({ expediteur, demande }),
    );

    const instant = now();
    const { lastInsertRowid } = supportComments.createAuto.run(
      demande.id,
      html,
      evenement,
      instant,
      instant,
    );
    await repondreParEmail(demande, lastInsertRowid as Id, html);
    signalerEcriture("support-requests");
  } catch (erreur) {
    console.error(`Réponse par défaut « ${evenement} » à la demande ${demandeId} :`, erreur);
  }
};
