// Sending Milo's mail: follow-up notifications and the test message. It goes
// through Microsoft Graph, on behalf of the Entra app (lib/entra.ts), and
// always leaves from a company's support mailbox: that of the item it is
// about.

import { sendingAddress, entraConfigured, sendViaGraph } from "./entra.js";
import { miloUrl } from "./milo-url.js";
import { badRequest, fail } from "./http.js";
import { template } from "./mail-template.js";
import type { MailAttachment } from "./mail-template.js";

/**
 * True when the mailer has what it takes to send. Follow-up notifications
 * ask before trying: otherwise, every modification would attempt a send
 * doomed to fail and fill the log.
 */
export const mailboxConfigured = (): boolean => entraConfigured();

export interface Mail {
  /** The sending mailbox: that of a company's support. */
  from: string;
  to: string;
  subject: string;
  text: string;
  /** The formatted version. Text-mode clients read `text`. */
  html?: string;
  /** What the HTML cites as "cid:" — the header logo. */
  attachments?: MailAttachment[];
}

/**
 * A send. Throws what Microsoft answered: that is what teaches something —
 * "mailbox not found", "access denied" —, where "send failed" would say
 * nothing. It is up to the caller to decide whether to surface it on screen
 * or merely to log it.
 */
export const sendMail = (mail: Mail): Promise<void> => sendViaGraph(mail);

/**
 * The test message, sent from the sending address. Its failure is read in
 * the window that requested it.
 */
export const sendTest = async (recipient: string): Promise<void> => {
  const sender = sendingAddress();
  if (!sender) badRequest("Renseignez l'adresse d'envoi dans Paramétrage → Notifications");

  try {
    await sendMail({
      from: sender,
      to: recipient,
      subject: "Milo — Message de test",
      ...(await template("test", {
        title: "Message de test",
        intro: `Test de l'envoi d'un message depuis ${sender}`,
        ...(miloUrl() && { action: { url: miloUrl(), label: "Ouvrir Milo" } }),
        footer: "Envoyé depuis Paramétrage → Notifications.",
      })),
    });
  } catch (error) {
    fail(400, error instanceof Error ? error.message : "L'envoi a échoué");
  }
};
