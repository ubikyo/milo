// L'envoi du courrier de Milo : les notifications de suivi et le message
// d'essai. Il passe par Microsoft Graph, au nom de l'application Entra
// (lib/entra.ts), et part toujours de la boîte de support d'une société :
// celle de l'élément dont il parle.

import { selection } from "../db/query.js";
import { entraConfiguree, envoyerParGraph } from "./entra.js";
import { badRequest, fail, orNotFound } from "./http.js";
import { gabarit } from "./mail-template.js";
import type { PieceJointe } from "./mail-template.js";

/**
 * Vrai quand la messagerie a de quoi envoyer. Les notifications de suivi le
 * demandent avant d'essayer : sans cela, chaque modification tenterait un
 * envoi voué à l'échec et emplirait le journal.
 */
export const messagerieConfiguree = (): boolean => entraConfiguree();

export interface Courrier {
  /** La boîte qui expédie : celle du support d'une société. */
  from: string;
  to: string;
  subject: string;
  text: string;
  /** La version mise en forme. Les clients en mode texte lisent `text`. */
  html?: string;
  /** Ce que le HTML cite en « cid: » — le logo de l'entête. */
  attachments?: PieceJointe[];
}

/**
 * Un envoi. Lève ce que Microsoft a répondu : c'est cela qui apprend quelque
 * chose — « boîte introuvable », « accès refusé » —, là où « échec de l'envoi »
 * ne dirait rien. À l'appelant de décider s'il le remonte à l'écran ou s'il se
 * contente de le tracer.
 */
export const envoyerCourrier = (courrier: Courrier): Promise<void> => envoyerParGraph(courrier);

const societe = selection<{ name: string; support_email: string }>(
  "SELECT name, support_email FROM companies WHERE id = ?",
);

/**
 * Le message d'essai, parti de la boîte de support d'une société. Son échec
 * se lit dans la fenêtre qui l'a demandé.
 */
export const envoyerLeTest = async (destinataire: string, companyId: number): Promise<void> => {
  const { name, support_email } = orNotFound(societe.get(companyId), "Société introuvable");
  if (!support_email) badRequest(`${name} n'a pas d'e-mail de support`);

  try {
    await envoyerCourrier({
      from: support_email,
      to: destinataire,
      subject: "Milo — Message de test",
      ...gabarit({
        titre: "Message de test",
        intro: `Ce message confirme l'envoi par Milo depuis la boîte de support de ${name}.`,
        pied: "Envoyé depuis Paramétrage → Entra.",
      }),
    });
  } catch (erreur) {
    fail(400, erreur instanceof Error ? erreur.message : "L'envoi a échoué");
  }
};
