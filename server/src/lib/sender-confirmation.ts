// The sending address, confirmed on the first setup (FirstSetup) and on each
// change in the Settings (SenderField): Milo sends a four-digit code from the
// mailbox to itself, which proves at once that Mail.Send reaches it and that
// whoever sets it reads it. Once the code is entered, the address becomes the
// sending address.
//
// The pending code lives in memory: it only lasts the time of the confirmation, and
// a restart merely asks for a new one.

import { newCode } from "./optin.js";
import { updateEntra } from "./entra.js";
import { badRequest, fail } from "./http.js";
import { sendMail } from "./mail.js";
import { template } from "./mail-template.js";

/** Beyond this, the code is no longer valid: four digits could be guessed. */
const ATTEMPTS_MAX = 5;

/** The code sent, and the address it was sent to; null when none is pending. */
let pending: { email: string; code: string; attempts: number } | null = null;

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Sends a new code to the address, from itself; the previous one is no longer valid. */
export const sendSenderCode = async (address: string): Promise<void> => {
  const email = address.trim();
  if (!EMAIL.test(email)) badRequest("Adresse d'envoi invalide");
  const code = newCode();
  try {
    await sendMail({
      from: email,
      to: email,
      subject: "Milo — Confirmez l'adresse d'envoi",
      ...(await template(
        "mailbox_confirmation",
        {
          title: "Confirmez l'adresse d'envoi",
          intro: `Milo enverra ses e-mails depuis ${email}. Pour confirmer cette adresse, saisissez ce code dans Milo.`,
          rows: [{ text: `Code de confirmation : ${code}`, repetitions: 1 }],
          footer: "Si vous n'êtes pas à l'origine de cette demande, ignorez ce message.",
        },
        { email, code },
      )),
    });
  } catch (error) {
    fail(400, error instanceof Error ? error.message : "L'envoi a échoué");
  }
  // Kept once sent: a failed send does not replace the previous code.
  pending = { email, code, attempts: 0 };
};

/** Checks the code; right, the address becomes the sending address. */
export const confirmSender = (address: string, code: string): void => {
  const email = address.trim();
  if (!pending || pending.email.toLowerCase() !== email.toLowerCase()) {
    badRequest("Aucun code en cours pour cette adresse : envoyez-en un");
  }
  if (code.trim() !== pending!.code) {
    pending!.attempts += 1;
    if (pending!.attempts >= ATTEMPTS_MAX) {
      pending = null;
      badRequest("Code incorrect. Trop d'essais : envoyez-en un nouveau");
    }
    badRequest("Code incorrect");
  }
  pending = null;
  updateEntra({ mail_sender: email });
};
