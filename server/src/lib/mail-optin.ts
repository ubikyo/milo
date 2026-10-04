// The consent of the people whose mailbox a Mail widget reads
// (lib/widget-optin.ts): until its owner passes on the code, nothing is read
// from that mailbox; afterwards, everyone who sees the widget reads the
// e-mails of the folders chosen.

import { MAIL_KEY, MAIL_PEOPLE } from "@milo/shared";
import { mailOptins } from "../repositories/optins.js";
import { widgetOptin } from "./widget-optin.js";

export const MAIL_CONFIRMATION_SUBJECT = "Milo — Partage de votre boîte aux lettres";

export const mailOptin = widgetOptin({
  type: "mail",
  keyField: MAIL_KEY,
  peopleField: MAIL_PEOPLE,
  table: mailOptins,
  subject: MAIL_CONFIRMATION_SUBJECT,
  title: "Partager votre boîte aux lettres",
  intro: (who, board) =>
    `${who} souhaite afficher les e-mails de votre boîte Outlook dans Milo${board ? `, sur le tableau « ${board} »` : ""}. Les personnes qui voient ce tableau pourront lire les e-mails des dossiers choisis — expéditeur, objet, contenu et pièces jointes —, sans pouvoir les modifier ni y répondre. Si vous êtes d'accord, communiquez ce code à ${who}. Rien n'est lu de votre boîte avant.`,
  name: "Mail",
});
