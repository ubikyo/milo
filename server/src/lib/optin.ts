// Confirmation of support inboxes. An address set in a request list is not
// polled until its inbox has proven it belongs to whoever set it: Milo sends it
// a four-digit code, which is entered in Milo (Actions → Confirmer une
// adresse). Until then, no e-mail is imported from it; afterwards, only those
// that arrived since the confirmation are (repositories/inboxes.ts).
//
// The code is drawn at random; a resend draws a new one, and the old one is no
// longer valid. There is no link: nothing opens outside Milo.

import { randomInt } from "node:crypto";
import { optins, pair } from "../repositories/optins.js";
import type { OptinTable } from "../repositories/optins.js";
import type { Id } from "@milo/shared";
import { listMailboxes } from "../repositories/inboxes.js";
import { sendingAddress, entraConfigured } from "./entra.js";
import { fail } from "./http.js";
import { sendMail } from "./mail.js";
import { template } from "./mail-template.js";

/**
 * Subject of the code e-mail. The poll recognizes it, sent from the sending
 * address, and never imports it (lib/support-mail.ts).
 */
export const CONFIRMATION_SUBJECT = "Milo — Confirmez la réception des tickets";

export const newCode = (): string => String(randomInt(0, 10_000)).padStart(4, "0");

/** Beyond this, the code is no longer valid: four digits could be guessed. */
const ATTEMPTS_MAX = 5;

/**
 * What is missing to send the code, reported to whoever resends; empty when
 * everything is there.
 */
export const missingLabel = (): string => {
  if (!entraConfigured()) return "La messagerie n'est pas configurée (Paramétrage → Entra)";
  if (!sendingAddress()) return "Renseignez l'adresse d'envoi dans Paramétrage → Notifications";
  return "";
};

/**
 * Sends a new code to the inbox, for the list "list" of the board "board" —
 * in its own template; "usage" says where its requests will go. Throws
 * whatever prevented sending.
 */
const send = async (board: Id | undefined, list: string, email: string, usage = ""): Promise<void> => {
  const reason = missingLabel();
  if (reason) throw new Error(reason);
  const code = newCode();
  await sendMail({
    from: sendingAddress(),
    to: email,
    subject: CONFIRMATION_SUBJECT,
    ...(await template("mailbox_confirmation", {
      title: "Confirmez cette boîte de support",
      intro: `Milo doit relever les e-mails de ${email} pour en faire des tickets${usage ? ` (${usage})` : ""}. Pour confirmer que cette boîte vous appartient, saisissez ce code dans Milo : Actions → Confirmer une adresse. Rien n'en sera importé avant.`,
      rows: [{ text: `Code de confirmation : ${code}`, repetitions: 1 }],
      footer: "Si vous n'êtes pas à l'origine de cette demande, ignorez ce message.",
    }, { email, code }, board !== undefined ? { board, list } : undefined)),
  });
  // Stored once sent: a failed send does not replace the previous code.
  optins.sent(list, email, code);
};

/**
 * The addresses that the request lists have just received: each one now
 * awaits confirmation, and its inbox receives the code. A failed send is made
 * up for by the resend.
 */
export const askForConfirmations = (): void => {
  // Each list confirms its addresses, even those another list has already
  // confirmed. An address a list no longer mentions is forgotten there:
  // added again, it must be confirmed again.
  const mailboxes = listMailboxes().filter((b) => b.list);
  optins.forgetExcept(new Set(mailboxes.map((b) => pair(b.list, b.value))));
  for (const mailbox of mailboxes) {
    if (!optins.create(mailbox.list, mailbox.value)) continue;
    send(mailbox.board_id, mailbox.list, mailbox.value, mailbox.usage).catch((error: unknown) =>
      console.error(`Confirmation of ${mailbox.value}:`, error),
    );
  }
};

/**
 * Sends a new code, through "send", to those of the owner's addresses that are
 * still pending — in "table". Returns the number of e-mails sent; throws when
 * none could be sent.
 */
export const resendCodes = async (
  table: OptinTable,
  owner: string,
  emails: string[],
  send: (email: string) => Promise<void>,
): Promise<number> => {
  const pending = [...new Set(emails.map((e) => e.trim().toLowerCase()))].filter(
    (e) => table.de(owner, e)?.confirmed_at === "",
  );
  const reason = missingLabel();
  if (reason && pending.length) fail(400, reason);
  let sent = 0;
  let last = "";
  for (const email of pending) {
    try {
      await send(email);
      sent += 1;
    } catch (error) {
      last = error instanceof Error ? error.message : String(error);
      console.error(`Resend to ${email}:`, error);
    }
  }
  if (pending.length && !sent) fail(400, last || "L'envoi a échoué");
  return sent;
};

/**
 * Sends a new code to the listed addresses that are still pending. Returns the
 * number of e-mails sent; throws when none could be sent.
 */
export const retry = (list: string, emails: string[]): Promise<number> => {
  const mailboxes = listMailboxes().filter((b) => b.list === list);
  const usages = new Map(mailboxes.map((b) => [b.value.toLowerCase(), b.usage]));
  // Its board, for the widget's own template.
  const board = mailboxes[0]?.board_id;
  return resendCodes(optins, list, emails, (email) => send(board, list, email, usages.get(email)));
};

/**
 * Confirms an owner's address — in "table" — with the code from its e-mail.
 * Throws when the code is wrong; after ATTEMPTS_MAX attempts, it is no longer
 * valid and a resend is needed.
 */
export const checkCode = (table: OptinTable, owner: string, email: string, code: string): void => {
  const row = table.de(owner, email);
  if (!row) fail(404, "Adresse inconnue : enregistrez d'abord le widget");
  if (row!.confirmed_at) return;
  if (!row!.code) fail(400, "Aucun code en cours : relancez la confirmation");
  if (code.trim() !== row!.code) {
    table.attempt(owner, email);
    if (row!.attempts + 1 >= ATTEMPTS_MAX) {
      table.forgetCode(owner, email);
      fail(400, "Code incorrect. Trop d'essais : relancez la confirmation pour en recevoir un neuf");
    }
    fail(400, "Code incorrect");
  }
  table.confirm(owner, email);
};

/** Confirms an inbox with the code from its e-mail (checkCode). */
export const confirmByCode = (list: string, email: string, code: string): void =>
  checkCode(optins, list, email, code);
