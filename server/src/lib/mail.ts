// L'envoi du courrier de Milo : les notifications de suivi et le message
// d'essai. Il passe par Microsoft Graph, au nom de l'application Entra
// (lib/entra.ts), et part toujours de la boîte de support d'une société :
// celle de l'élément dont il parle.

import { sendingAddress, entraConfigured, sendViaGraph } from "./entra.js";
import { badRequest, fail } from "./http.js";
import { template } from "./mail-template.js";
import type { MailAttachment } from "./mail-template.js";

/**
 * Vrai quand la messagerie a de quoi envoyer. Les notifications de suivi le
 * demandent avant d'essayer : sans cela, chaque modification tenterait un
 * envoi voué à l'échec et emplirait le journal.
 */
export const mailboxConfigured = (): boolean => entraConfigured();

export interface Mail {
  /** La boîte qui expédie : celle du support d'une société. */
  from: string;
  to: string;
  subject: string;
  text: string;
  /** La version mise en forme. Les clients en mode texte lisent `text`. */
  html?: string;
  /** Ce que le HTML cite en « cid: » — le logo de l'entête. */
  attachments?: MailAttachment[];
}

/**
 * Un envoi. Lève ce que Microsoft a répondu : c'est cela qui apprend quelque
 * chose — « boîte introuvable », « accès refusé » —, là où « échec de l'envoi »
 * ne dirait rien. À l'appelant de décider s'il le remonte à l'écran ou s'il se
 * contente de le tracer.
 */
export const sendMail = (mail: Mail): Promise<void> => sendViaGraph(mail);

/**
 * Le message d'essai, parti de l'adresse d'envoi. Son échec se lit dans la
 * fenêtre qui l'a demandé.
 */
export const sendTest = async (recipient: string): Promise<void> => {
  const sender = sendingAddress();
  if (!sender) badRequest("Renseignez l'adresse d'envoi dans Paramétrage → Entra");

  try {
    await sendMail({
      from: sender,
      to: recipient,
      subject: "Milo — Message de test",
      ...template({
        title: "Message de test",
        intro: `Ce message confirme l'envoi par Milo depuis ${sender}.`,
        footer: "Envoyé depuis Paramétrage → Entra.",
      }),
    });
  } catch (error) {
    fail(400, error instanceof Error ? error.message : "L'envoi a échoué");
  }
};
