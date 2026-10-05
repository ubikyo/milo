// The consent of the people whose Outlook a widget reads — a Calendar's
// calendars (lib/calendar-optin.ts), a Mail's mailboxes (lib/mail-optin.ts).
// Its drawer lists addresses; each receives a four-digit code, which its owner
// passes on to whoever set the widget, to be entered in Milo (Actions →
// Confirmer une adresse) — as for support inboxes (lib/optin.ts). Until then,
// nothing is read from them; afterwards, everyone who sees the widget sees
// what it reads.
//
// The consent belongs to the widget, by its key ("keyField"): another
// widget, or this one imported elsewhere, asks for its own.

import { selection } from "../db/query.js";
import { pair } from "../repositories/optins.js";
import type { OptinTable } from "../repositories/optins.js";
import { missingLabel, newCode, resendCodes } from "./optin.js";
import { sendingAddress } from "./entra.js";
import { sendMail } from "./mail.js";
import type { MailTemplateKey } from "@milo/shared";
import { template } from "./mail-template.js";

interface WidgetOptinOptions {
  /** The widget type: "calendar", "mail". */
  type: string;
  /** The configuration key that designates the widget (CALENDAR_KEY, MAIL_KEY). */
  keyField: string;
  /** The configuration key of the people's rows ({ "email": … }). */
  peopleField: string;
  table: OptinTable;
  /** The e-mail that carries the code. */
  subject: string;
  title: string;
  /** What will be shown, and to whom: "who" asks, on "board". */
  intro: (who: string, board: string) => string;
  /** The template of the e-mail that carries the code. */
  templateKey: MailTemplateKey;
  /** For the server's log: "Calendar", "Mail". */
  name: string;
}

/** A person a widget names, and the board where it shows them. */
interface Person {
  key: string;
  email: string;
  board: string;
}

export const widgetOptin = ({
  type,
  keyField,
  peopleField,
  table,
  subject,
  title,
  intro,
  templateKey,
  name,
}: WidgetOptinOptions) => {
  const widgets = selection<{ widget_key: string | null; email: string | null; board: string }>(
    `SELECT json_extract(w.config, '$.${keyField}') AS widget_key,
            json_extract(p.value, '$.email') AS email, b.name AS board
     FROM board_widgets w
     JOIN board_sections s ON s.id = w.section_id
     JOIN boards b ON b.id = s.board_id,
     json_each(w.config, '$.${peopleField}') p
     WHERE w.type = '${type}' AND json_valid(w.config)`,
  );

  /** The addresses the widgets of this type name, each with its widget's key. */
  const people = (): Person[] =>
    widgets
      .all()
      .map((r) => ({ key: r.widget_key ?? "", email: (r.email ?? "").trim(), board: r.board }))
      .filter((p) => p.key && p.email.includes("@"));

  /**
   * Sends a new code to "email", for the widget "key". "requester" — whoever
   * saved or resent — and "board" tell its owner who asks, and where it will
   * show. Throws whatever prevented sending.
   */
  const send = async (key: string, email: string, requester: string, board: string): Promise<void> => {
    const reason = missingLabel();
    if (reason) throw new Error(reason);
    const code = newCode();
    const who = requester || "Un utilisateur de Milo";
    await sendMail({
      from: sendingAddress(),
      to: email,
      subject,
      ...(await template(templateKey, {
        title,
        intro: intro(who, board),
        rows: [{ text: `Code de confirmation : ${code}`, repetitions: 1 }],
        footer: "Si vous n'êtes pas d'accord, ignorez ce message.",
      }, { email, code, requester: who, board })),
    });
    // Stored once sent: a failed send does not replace the previous code.
    table.sent(key, email, code);
  };

  return {
    table,

    /**
     * The addresses that the widgets have just received: each one now awaits
     * its consent, and its inbox receives the code. An address a widget no
     * longer names is forgotten there: added again, it must be confirmed again.
     */
    askForConfirmations: (requester: string): void => {
      const named = people();
      table.forgetExcept(new Set(named.map((p) => pair(p.key, p.email))));
      for (const person of named) {
        if (!table.create(person.key, person.email)) continue;
        send(person.key, person.email, requester, person.board).catch((error: unknown) =>
          console.error(`${name} confirmation of ${person.email}:`, error),
        );
      }
    },

    /**
     * Sends a new code to the widget's listed addresses that are still pending.
     * Returns the number of e-mails sent; throws when none could be sent.
     */
    retry: (key: string, emails: string[], requester: string): Promise<number> => {
      const boards = new Map(
        people()
          .filter((p) => p.key === key)
          .map((p) => [p.email.toLowerCase(), p.board]),
      );
      return resendCodes(table, key, emails, (email) =>
        send(key, email, requester, boards.get(email) ?? ""),
      );
    },

    /** The addresses the widget "key" may read: those confirmed, in lowercase. */
    confirmed: (key: string): Set<string> => {
      const prefix = `${key}|`;
      return new Set(
        [...table.confirmed().keys()]
          .filter((p) => p.startsWith(prefix))
          .map((p) => p.slice(prefix.length)),
      );
    },
  };
};

export type WidgetOptin = ReturnType<typeof widgetOptin>;
