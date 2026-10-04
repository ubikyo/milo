// La confirmation des boîtes de support. Une adresse posée dans une liste de
// demandes ne se relève pas tant que sa boîte n'a pas prouvé qu'elle est à
// qui la pose : Milo lui envoie un code à quatre chiffres, qu'on saisit dans
// Milo (Actions → Confirmer une adresse). Jusque-là, aucun e-mail n'en est
// importé ; après, seuls ceux arrivés depuis la confirmation le sont
// (repositories/receptions.ts).
//
// Le code est tiré au hasard ; une relance en tire un neuf, et l'ancien ne
// vaut plus. Il n'y a pas de lien : rien ne s'ouvre hors de Milo.

import { randomInt } from "node:crypto";
import { optins, pair } from "../repositories/optins.js";
import { listMailboxes } from "../repositories/receptions.js";
import { sendingAddress, entraConfigured } from "./entra.js";
import { fail } from "./http.js";
import { sendMail } from "./mail.js";
import { template } from "./mail-template.js";

/**
 * L'objet de l'e-mail du code. La relève le reconnaît, parti de l'adresse
 * d'envoi, et ne l'importe jamais (lib/support-mail.ts).
 */
export const CONFIRMATION_SUBJECT = "Milo — Confirmez la réception des tickets";

const newCode = (): string => String(randomInt(0, 10_000)).padStart(4, "0");

/** Au-delà, le code ne vaut plus : quatre chiffres se devineraient. */
const ATTEMPTS_MAX = 5;

/**
 * Ce qui manque pour envoyer le code, dit à qui relance ; vide quand tout y
 * est.
 */
const missingLabel = (): string => {
  if (!entraConfigured()) return "La messagerie n'est pas configurée (Paramétrage → Entra)";
  if (!sendingAddress()) return "Renseignez l'adresse d'envoi dans Paramétrage → Entra";
  return "";
};

/**
 * Envoie un code neuf à la boîte, pour la liste « liste » ;
 * « usage » dit où ses demandes iront. Lève ce qui a empêché l'envoi.
 */
const send = async (list: string, email: string, usage = ""): Promise<void> => {
  const reason = missingLabel();
  if (reason) throw new Error(reason);
  const code = newCode();
  await sendMail({
    from: sendingAddress(),
    to: email,
    subject: CONFIRMATION_SUBJECT,
    ...template({
      title: "Confirmez cette boîte de support",
      intro: `Milo doit relever les e-mails de ${email} pour en faire des tickets${usage ? ` (${usage})` : ""}. Pour confirmer que cette boîte vous appartient, saisissez ce code dans Milo : Actions → Confirmer une adresse. Rien n'en sera importé avant.`,
      rows: [{ text: `Code de confirmation : ${code}`, repetitions: 1 }],
      footer: "Si vous n'êtes pas à l'origine de cette demande, ignorez ce message.",
    }),
  });
  // Rangé une fois parti : un envoi manqué ne remplace pas le code précédent.
  optins.sent(list, email, code);
};

/**
 * Les adresses que les listes de demandes viennent de recevoir : chacune
 * attend désormais sa confirmation, et sa boîte reçoit le code. Un envoi
 * manqué se rattrape par la relance.
 */
export const askForConfirmations = (): void => {
  // Chaque liste confirme ses adresses, même celles qu'une autre a déjà
  // confirmées. Une adresse qu'une liste ne dit plus y est oubliée :
  // rajoutée, elle se confirme de nouveau.
  const mailboxes = listMailboxes().filter((b) => b.list);
  optins.forgetExcept(new Set(mailboxes.map((b) => pair(b.list, b.value))));
  for (const mailbox of mailboxes) {
    if (!optins.create(mailbox.list, mailbox.value)) continue;
    send(mailbox.list, mailbox.value, mailbox.usage).catch((error: unknown) =>
      console.error(`Confirmation de ${mailbox.value} :`, error),
    );
  }
};

/**
 * Renvoie un code neuf aux adresses dites qui attendent encore. Rend le nombre
 * d'e-mails partis ; lève quand aucun n'a pu partir.
 */
export const retry = async (list: string, emails: string[]): Promise<number> => {
  const pending = [...new Set(emails.map((e) => e.trim().toLowerCase()))].filter(
    (e) => optins.de(list, e)?.confirmed_at === "",
  );
  const usages = new Map(
    listMailboxes()
      .filter((b) => b.list === list)
      .map((b) => [b.value.toLowerCase(), b.usage]),
  );
  const reason = missingLabel();
  if (reason && pending.length) fail(400, reason);
  let sent = 0;
  let last = "";
  for (const email of pending) {
    try {
      await send(list, email, usages.get(email));
      sent += 1;
    } catch (error) {
      last = error instanceof Error ? error.message : String(error);
      console.error(`Relance de ${email} :`, error);
    }
  }
  if (pending.length && !sent) fail(400, last || "L'envoi a échoué");
  return sent;
};

/**
 * Confirme une boîte par le code de son e-mail. Lève quand le code est faux ;
 * au bout de ESSAIS_MAX essais, il ne vaut plus et il faut relancer.
 */
export const confirmByCode = (list: string, email: string, code: string): void => {
  const row = optins.de(list, email);
  if (!row) fail(404, "Adresse inconnue : enregistrez d'abord le widget");
  if (row!.confirmed_at) return;
  if (!row!.code) fail(400, "Aucun code en cours : relancez la confirmation");
  if (code.trim() !== row!.code) {
    optins.attempt(list, email);
    if (row!.attempts + 1 >= ATTEMPTS_MAX) {
      optins.forgetCode(list, email);
      fail(400, "Code incorrect. Trop d'essais : relancez la confirmation pour en recevoir un neuf");
    }
    fail(400, "Code incorrect");
  }
  optins.confirm(list, email);
};
