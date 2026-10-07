// The invitations: an e-mail to whoever has just received an access to a
// workspace ("Nouvel utilisateur"), the administration ("Nouvel
// administrateur") or the boards of a view ("Nouveau partage"), when "Envoyer une invitation" is checked. A group is not
// written to: each of its users is, those of its subgroups included.

import type { EntraPrincipal } from "@milo/shared";
import type { UserRow } from "../db/rows.js";
import { entraGroupMembers, sendingAddress } from "./entra.js";
import { mailboxConfigured, sendMail } from "./mail.js";
import { sharesView, template } from "./mail-template.js";
import type { Message } from "./mail-template.js";

/**
 * The addresses the users and groups stand for, once each: a person who is
 * there in their own right and through a group receives a single e-mail.
 * The author is left out — they know.
 */
const recipientsOf = async (
  principals: EntraPrincipal[],
  author: UserRow,
): Promise<Map<string, EntraPrincipal[]>> => {
  const byAddress = new Map<string, EntraPrincipal[]>();
  for (const principal of principals) {
    const people = principal.type === "group" ? await entraGroupMembers(principal.id) : [principal];
    for (const person of people) {
      const address = person.email.trim().toLowerCase();
      if (!address || address === author.email.trim().toLowerCase()) continue;
      // Each person, with the users or groups through which they come.
      const through = byAddress.get(address) ?? [];
      byAddress.set(address, [...through, principal]);
    }
  }
  return byAddress;
};

const authorName = (author: UserRow): string => author.name || author.email;

/**
 * Sends each one their e-mail. Never throws: the access is already saved,
 * a lost invitation must not make it fail.
 */
const sendAll = (
  principals: EntraPrincipal[],
  author: UserRow,
  compose: (through: EntraPrincipal[]) => Promise<{ subject: string; content: Awaited<ReturnType<typeof template>> }>,
): void => {
  if (principals.length === 0) return;
  if (!mailboxConfigured() || !sendingAddress()) {
    console.error("Invitations not sent: no sending address");
    return;
  }
  const from = sendingAddress();
  recipientsOf(principals, author)
    .then((recipients) =>
      Promise.all(
        [...recipients].map(([to, through]) =>
          compose(through)
            .then(({ subject, content }) => sendMail({ from, to, subject, ...content }))
            .catch((error: unknown) => console.error(`Invitation to ${to} not delivered:`, error)),
        ),
      ),
    )
    .catch((error: unknown) => console.error("Invitations abandoned:", error));
};

/** "Nouvel utilisateur": access to a workspace has just been given to them. */
export const inviteToWorkspace = (
  principals: EntraPrincipal[],
  workspace: string,
  author: UserRow,
  base: string,
): void => {
  const who = authorName(author);
  const message: Message = {
    title: "Bienvenue dans Milo",
    intro: `${who} vous a donné accès au workspace « ${workspace} ».`,
    ...(base ? { action: { url: base, label: "Ouvrir Milo" } } : {}),
    footer: "Vous recevez ce message parce qu'un accès à Milo vous a été donné.",
  };
  sendAll(principals, author, async () => ({
    subject: `Milo — Accès au workspace ${workspace}`,
    content: await template("new_user", message, { invitation: { author: who, workspace } }),
  }));
};

/** "Nouvel administrateur": rights in the administration have just been given to them. */
export const inviteToAdministration = (principals: EntraPrincipal[], author: UserRow, base: string): void => {
  const who = authorName(author);
  const message: Message = {
    title: "Bienvenue dans Milo",
    intro: `${who} vous a désigné administrateur de Milo.`,
    ...(base ? { action: { url: base, label: "Ouvrir Milo" } } : {}),
    footer: "Vous recevez ce message parce qu'un accès à Milo vous a été donné.",
  };
  sendAll(principals, author, async () => ({
    subject: "Milo — Accès à l'administration",
    content: await template("new_admin", message, { invitation: { author: who } }),
  }));
};

/**
 * "Nouveau partage": boards of a view have just been shared with them. Each
 * person reads the boards they receive — theirs, and those of their groups
 * just added.
 */
export const inviteToShare = (
  principals: EntraPrincipal[],
  boardsOf: (principal: EntraPrincipal) => string[],
  view: { name: string; workspace: string },
  author: UserRow,
  base: string,
): void => {
  const who = authorName(author);
  sendAll(principals, author, async (through) => {
    const boards = [...new Set(through.flatMap(boardsOf))];
    const message: Message = {
      title: view.name,
      intro:
        boards.length === 1
          ? `${who} a partagé avec vous ce tableau :`
          : `${who} a partagé avec vous ces tableaux :`,
      rows: boards.map((text) => ({ text, repetitions: 1 })),
      ...(base ? { action: { url: base, label: "Ouvrir dans Milo" } } : {}),
      footer: "Vous recevez ce message parce qu'une vue a été partagée avec vous dans Milo.",
    };
    return {
      subject: `Milo — ${who} a partagé « ${view.name} » avec vous`,
      content: await template("new_share", message, sharesView(who, view.workspace, view.name, boards)),
    };
  });
};
