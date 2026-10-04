// Polling of the support inboxes: every e-mail received in an inbox that a
// request list receives (repositories/inboxes.ts) becomes a request of that
// list, with the label the list associates with the inbox.
//
// Nothing is removed from the inboxes: messages stay there as they are, neither
// deleted, nor moved, nor marked as read. It is the Internet identifier of
// each message, kept on the request, that prevents importing it twice.
//
// An e-mail that replies to a request — it cites one of its messages in its
// headers, carries its number in the subject, or arrives in its conversation —
// joins its thread instead of opening a new ticket.
//
// The e-mail is kept as it was written: its HTML, its embedded images and its
// attachments, stored in the tickets folder (lib/ticket-files.ts).
//
// Polling goes through Graph's delta query: each inbox keeps the link Graph
// returned last time, and learns only what has arrived since. It runs at
// regular intervals, and as soon as a Graph change notification announces an
// e-mail (lib/support-webhooks.ts).

import {
  DEFAULT_SUPPORT_STATUS,
  REOPENED_SUPPORT_STATUS,
  LEGACY_REFERENCE_PREFIX,
  SUPPORT_TICKET_PREFIX,
  addBusinessDays,
} from "@milo/shared";
import type { Id } from "@milo/shared";
import { transaction } from "../db/query.js";
import type { SupportRequestRow, TicketFileRow } from "../db/rows.js";
import { signalWrite } from "../middleware/events.js";
import {
  nextTicketNumber,
  replaceSupportActors,
  replaceSupportLabels,
  supportComments,
  supportRequests,
} from "../repositories/support.js";
import { receivedMailboxes, type Inbox } from "../repositories/inboxes.js";
import { users } from "../repositories/users.js";
import { readSetting, writeSetting } from "../repositories/settings.js";
import {
  mailboxDelta,
  mailDetails,
  entraConfigured,
  mailFiles,
  deleteMail,
  sendingAddress,
} from "./entra.js";
import { CONFIRMATION_SUBJECT } from "./optin.js";
import type { ReceivedMail, MailDetails } from "./entra.js";
import { cleanEmail, hasContent, withoutHistory } from "./html.js";
import {
  TICKET_SIZE_MAX,
  writeTicket,
  filesOf,
  forgetFiles,
  deleteTicket,
  ticketUrl,
} from "./ticket-files.js";
import { env } from "../env.js";
import { notify, requestTitle } from "./notify.js";
import { parisTime, now } from "./time.js";
import { supportSettings } from "../routes/support-settings.js";
import { sendAutoReply } from "./support-auto-reply.js";

const PARIS_DAY = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Europe/Paris",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/**
 * The due date of a request received at this instant: as many working days
 * after the day of receipt, in Paris, as the Settings ask for (Support).
 * Without a time — midnight, which reads as "la journée entière". Empty if
 * the setting is zero.
 */
const defaultDue = (received: string): string => {
  const { default_due_days: days } = supportSettings();
  if (!days) return "";
  const [year, months, day] = PARIS_DAY.format(new Date(received)).split("-").map(Number);
  const target = addBusinessDays({ year: year!, months: months!, day: day! }, days);
  const text = `${target.year}-${String(target.months).padStart(2, "0")}-${String(target.day).padStart(2, "0")} 00:00`;
  return parisTime(text) ?? "";
};

/**
 * An inbox's first poll — without a delta link — sees the whole inbox. While
 * debugging, only the last fifteen messages are imported; later polls import
 * everything that arrives.
 */
const FIRST_POLL_LIMIT = 15;

/** Each inbox's delta link, by lowercase address. */
const DELTA_KEY = "support_mail_delta";
type LinksDelta = Record<string, string>;

/** The time between two polls. */
export const POLL_INTERVAL = 5 * 60 * 1000;


/** The received date, converted to the database's ISO; the present moment by default. */
const dateOf = (iso: string): string => {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? now() : date.toISOString();
};

/**
 * An e-mail already present in this list: a request's origin, or a message
 * of a thread. Another list that receives the same inbox has its own.
 */
const alreadyImported = (inbox: Inbox, mailId: string): boolean =>
  Boolean(
    supportRequests.byMailId.get(inbox.value, inbox.list, mailId) ??
      supportRequests.mailAlreadyFiled.get(inbox.value, inbox.list, mailId),
  );

/** The confirmation code e-mail (lib/optin.ts): Milo sent it, it is not a request. */
const isConfirmation = (mail: ReceivedMail): boolean =>
  mail.subject.trim() === CONFIRMATION_SUBJECT &&
  mail.from_email.toLowerCase() === sendingAddress().toLowerCase();

/** What an e-mail brings, once its files are stored. */
interface Prepared {
  html: string;
  /**
   * The same, without the quoted history: what a reply keeps, so that the
   * thread does not repeat all the preceding messages at each message. Empty
   * when it cannot be detached.
   */
  htmlWithoutHistory: string;
  files: TicketFileRow[];
  /** The Internet identifiers it cites: In-Reply-To, References. */
  cited: string[];
}

/**
 * Fetches what the delta query does not give — the headers citing previous
 * e-mails, the files — and stores the files. Asynchronous, hence outside the
 * importing transaction: what is stored here and ends up unused is deleted by
 * the caller.
 */
const prepareMail = async (mailbox: string, mail: ReceivedMail): Promise<Prepared> => {
  const details = await mailDetails(mailbox, mail.graph_id).catch(() => null);
  const cited = details?.cited ?? [];
  if (details?.conversation_id) mail.conversation_id = details.conversation_id;

  // An embedded image does not count as an attachment for Graph: a body that
  // cites one is enough to go and look.
  const hasFiles =
    mail.has_attachments || Boolean(details?.has_attachments) || /cid:/i.test(mail.body);
  const received = hasFiles
    ? await mailFiles(mailbox, mail.graph_id, TICKET_SIZE_MAX)
    : [];

  const images = new Map<string, string>();
  const files: TicketFileRow[] = received.map((received) => {
    const file = writeTicket(received.content, received.name);
    // An image the body cites is embedded, whatever Graph says.
    const cited = Boolean(received.content_id) && mail.body.includes(`cid:${received.content_id}`);
    if (received.content_id) images.set(received.content_id, ticketUrl(file));
    return { file, name: received.name, mime: received.mime, size: received.size, inline: cited || (received.inline && Boolean(received.content_id)) };
  });

  return {
    html: cleanEmail(mail.body, mail.body_type, images),
    // What Exchange detaches from the conversation, cross-checked against the
    // markers of mail clients: its "uniqueBody" sometimes keeps the last quoted message.
    htmlWithoutHistory: withoutHistoryOf(mail, details, images),
    files,
    cited,
  };
};

/**
 * The body of a reply without the history it quotes: what Exchange detaches
 * from it ("uniqueBody"), cross-checked against mail clients' markers —
 * Exchange sometimes keeps the last quoted message. Empty when there is
 * nothing to detach.
 */
const withoutHistoryOf = (
  mail: ReceivedMail,
  details: MailDetails | null,
  images: Map<string, string>,
): string => {
  const [body, type] = details?.unique_body
    ? [details.unique_body, details.unique_body_type]
    : [mail.body, mail.body_type];
  if (type === "text") return details?.unique_body ? cleanEmail(body, "text", images) : "";
  return cleanEmail(withoutHistory(body), "html", images);
};

/**
 * "[HLP-12]" in a subject: the number of a ticket being replied to. The old
 * prefix ("[LMA-12]") is still recognized, for threads opened before.
 */
const REFERENCE = new RegExp(
  `\\[(?:${[SUPPORT_TICKET_PREFIX, LEGACY_REFERENCE_PREFIX]
    .map((p) => p.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    .join("|")})(\\d+)\\]`,
  "i",
);

/**
 * The subject reduced to its topic: without "RE:", "TR:", "Fwd:" or ticket
 * number, without case or extra spaces.
 */
const bareSubject = (subject: string): string =>
  subject
    .replace(REFERENCE, " ")
    .replace(/^\s*((re|tr|fw|fwd|aw|wg|rv)\s*(\[\d+\])?\s*:\s*)+/i, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();

/**
 * The request an e-mail replies to, if there is one.
 *
 * Its number in the subject is enough: it was put there on purpose. Otherwise,
 * the e-mail must cite one of its messages in its headers, or arrive in its
 * conversation — and still be about the same subject. An e-mail sent from an
 * old message whose subject was changed opens a new ticket: its headers cite
 * the old one, but it is no longer the same request.
 */
const targetedRequest = (
  inbox: Inbox,
  mail: ReceivedMail,
  cited: string[],
): SupportRequestRow | undefined => {
  const { value: mailbox, list } = inbox;
  const reference = REFERENCE.exec(mail.subject);
  if (reference) {
    const foundItem = supportRequests.byNumber.get(mailbox, list, Number(reference[1]));
    if (foundItem) return foundItem;
  }

  const sameSubject = (request: SupportRequestRow | undefined) =>
    request && bareSubject(request.subject) === bareSubject(mail.subject) ? request : undefined;

  // Most recent first: References lists them from oldest to most recent,
  // and In-Reply-To comes first.
  for (const id of [...cited].reverse()) {
    const foundItem = sameSubject(supportRequests.citedByMail.get(mailbox, list, id, id));
    if (foundItem) return foundItem;
  }
  return mail.conversation_id
    ? sameSubject(supportRequests.ofConversation.get(mailbox, list, mail.conversation_id))
    : undefined;
};

/** What an import did, for what follows the transaction. */
interface FollowUp {
  replied?: SupportRequestRow;
  reopened?: boolean;
  created?: Id;
}

/**
 * An e-mail joins the thread of the request it replies to, or becomes a
 * request of the list that receives the inbox: its subject, its sender as
 * actor — the account carrying its address, if there is one —, and its
 * content as first message. Nothing if the message was already there.
 */
const importSections = transaction(
  (
    inbox: Inbox,
    mail: ReceivedMail,
    prepare: Prepared,
    /**
     * Receives the request the e-mail replies to, when it joins one — and
     * whether it was reopened —, or the one it opened.
     */
    followUp: FollowUp,
  ): boolean => {
    const received = dateOf(mail.received_at);
    const account = mail.from_email ? users.byEmail.get(mail.from_email) : undefined;

    // Already imported — another poll took it in the meantime: nothing to do,
    // and above all no number consumed for nothing.
    if (alreadyImported(inbox, mail.mail_id)) return false;

    // A reply keeps only what it brings: the history it cites is already in
    // the thread. The e-mail that opens a request, on the other hand, is kept
    // whole — what it cites, often a forwarded exchange, is part of it.
    const message = (requestId: Id, response: boolean) => {
      const html =
        response && hasContent(prepare.htmlWithoutHistory)
          ? prepare.htmlWithoutHistory
          : prepare.html;
      if (!hasContent(html) && prepare.files.length === 0) return;
      supportComments.createFromMail.run(
        requestId,
        account?.id ?? null,
        html,
        account ? "" : mail.from_name.trim(),
        account ? "" : mail.from_email.trim(),
        mail.mail_id,
        JSON.stringify(prepare.files),
        received,
        received,
      );
    };

    const targeted = targetedRequest(inbox, mail, prepare.cited);
    // A request entered by hand (without an inbox) is found by its number
    // from each list: its thread takes the e-mail only once.
    if (targeted && supportRequests.mailInThread.get(targeted.id, mail.mail_id)) return false;
    if (targeted) {
      message(targeted.id, true);
      // The sender comes back on a request thought closed: it reopens,
      // otherwise their reply would go unnoticed.
      const { changes: reopened } = supportRequests.reopen.run(
        REOPENED_SUPPORT_STATUS,
        received,
        targeted.id,
      );
      supportRequests.touch.run(received, targeted.id);
      followUp.replied = targeted;
      followUp.reopened = reopened > 0;
      return true;
    }

    const { changes, lastInsertRowid } = supportRequests.createFromMail.run(
      nextTicketNumber(),
      inbox.board_id,
      inbox.list,
      inbox.value,
      mail.subject.trim(),
      DEFAULT_SUPPORT_STATUS,
      defaultDue(received),
      mail.from_name.trim(),
      mail.from_email.trim(),
      mail.mail_id,
      mail.conversation_id,
      received,
      received,
    );
    if (!changes) return false;

    if (account) replaceSupportActors(lastInsertRowid as Id, [account.id]);
    // Every e-mail arrives with the Settings labels (Support): it is up to
    // whoever reads it to judge otherwise.
    // And with the label of its inbox (repositories/inboxes.ts): its context.
    const labels = supportSettings().default_label_ids;
    replaceSupportLabels(
      lastInsertRowid as Id,
      inbox.label_id === null || labels.includes(inbox.label_id) ? labels : [...labels, inbox.label_id],
    );
    message(lastInsertRowid as Id, false);
    followUp.created = lastInsertRowid as Id;
    return true;
  },
);

/**
 * What has arrived in an inbox since the last poll, from oldest to most
 * recent, and the delta link to keep once everything is imported. A link
 * Graph no longer recognizes — too old — restarts from zero.
 */
const updates = async (
  mailbox: string,
): Promise<{ mails: ReceivedMail[]; link: string }> => {
  const key = mailbox.toLowerCase();
  const link = readSetting<LinksDelta>(DELTA_KEY, {})[key] ?? null;

  let result: { mails: ReceivedMail[]; link: string };
  let first = link === null;
  try {
    result = await mailboxDelta(mailbox, link);
  } catch (error) {
    if (!link) throw error;
    console.warn(`Poll of ${mailbox}: the delta link is no longer valid, restarting the poll from zero.`);
    result = await mailboxDelta(mailbox, null);
    first = true;
  }

  const byDate = [...result.mails].sort((a, b) =>
    a.received_at < b.received_at ? -1 : a.received_at > b.received_at ? 1 : 0,
  );
  return {
    mails: first ? byDate.slice(-FIRST_POLL_LIMIT) : byDate,
    link: result.link,
  };
};

const keepLink = (mailbox: string, link: string): void => {
  if (!link) return;
  writeSetting(DELTA_KEY, { ...readSetting<LinksDelta>(DELTA_KEY, {}), [mailbox.toLowerCase()]: link });
};

/** One poll at a time: a request made while it runs triggers another one after it. */
/**
 * Those following a request learn that its sender replied to it. No query
 * here to get Milo's address: MILO_PUBLIC_URL provides it, and without it the
 * notification stays on screen, without e-mail.
 */
const repliedByEmail = (request: SupportRequestRow, mail: ReceivedMail): void => {
  const account = mail.from_email ? users.byEmail.get(mail.from_email) : undefined;
  notify({
    kind: "support",
    targetId: request.id,
    title: requestTitle(request),
    message: "a répondu par e-mail",
    author: account ?? { id: 0, name: mail.from_name.trim(), email: mail.from_email.trim() },
    base: env.publicUrl,
  });
};

/**
 * Removes an imported e-mail from its inbox, when the list asks for it. A
 * failure — the Mail.ReadWrite permission is missing — does not stop the poll:
 * the e-mail stays, and the request is there.
 */
const remove = async (mailbox: string, mail: ReceivedMail): Promise<void> => {
  try {
    await deleteMail(mailbox, mail.graph_id);
  } catch (error) {
    console.error(`Deleting an e-mail from ${mailbox}:`, error);
  }
};

let ongoing: Promise<number> | null = null;
let toRedo = false;

/**
 * What becomes of an inbox's e-mail in a list that receives it. Returns what
 * happened, for the rest of the poll.
 */
const receive = async (
  inbox: Inbox & { confirmed_at: string },
  mail: ReceivedMail,
  /** False for the lists after the first: the automatic reply is sent only once. */
  respond: boolean,
): Promise<{ imported: boolean; alreadyThere: boolean; replied: boolean }> => {
  // What arrived before the list's confirmation (lib/optin.ts) is not polled
  // there.
  if (Date.parse(mail.received_at) < Date.parse(inbox.confirmed_at)) {
    return { imported: false, alreadyThere: false, replied: false };
  }
  if (alreadyImported(inbox, mail.mail_id)) return { imported: false, alreadyThere: true, replied: false };
  // Files are stored for each request: each has its own.
  const prepare = await prepareMail(inbox.value, mail);
  let imported = false;
  const followUp: FollowUp = {};
  try {
    imported = importSections(inbox, mail, prepare, followUp);
  } finally {
    // Nothing was written to the database: its files are of no use to anyone.
    if (!imported) prepare.files.forEach((f) => deleteTicket(f.file));
  }
  if (!imported) return { imported, alreadyThere: false, replied: false };
  if (followUp.replied) repliedByEmail(followUp.replied, mail);
  // The Settings' default replies: the acknowledgement of receipt of a new
  // request, or the note saying a closed request is reopened. The sender
  // receives them only once, even if several lists have the inbox.
  let replied = false;
  if (respond && followUp.created) {
    await sendAutoReply(followUp.created, "new");
    replied = true;
  }
  if (respond && followUp.replied && followUp.reopened) {
    await sendAutoReply(followUp.replied.id, "reopened");
    replied = true;
  }
  return { imported, alreadyThere: false, replied };
};

/**
 * Requests born from a code e-mail (lib/optin.ts), imported before the poll
 * recognized it: they go away, with their files. Returns true when there were
 * any.
 */
const purgeConfirmations = (): boolean => {
  const sender = sendingAddress();
  if (!sender) return false;
  const requests = supportRequests.createdBySend.all(CONFIRMATION_SUBJECT, sender);
  if (!requests.length) return false;
  const files = requests.flatMap((d) =>
    supportComments.attachmentsOfRequest
      .all(d.id)
      .flatMap(({ attachments }) => filesOf(attachments).map((f) => f.file)),
  );
  // Their labels and thread go with them, through the foreign key.
  transaction(() => requests.forEach((d) => supportRequests.remove.run(d.id)))();
  forgetFiles(files);
  return true;
};

const poll = async (): Promise<number> => {
  let created = 0;
  const purged = purgeConfirmations();
  // An inbox is polled once, and each e-mail goes into every list that has
  // confirmed it.
  const byMailbox = new Map<string, (Inbox & { confirmed_at: string })[]>();
  for (const inbox of receivedMailboxes()) {
    const key = inbox.value.toLowerCase();
    byMailbox.set(key, [...(byMailbox.get(key) ?? []), inbox]);
  }
  for (const inboxes of byMailbox.values()) {
    const mailbox = inboxes[0]!.value;
    const usage = inboxes.map((r) => r.usage).join(", ");
    try {
      const { mails, link } = await updates(mailbox);
      for (const mail of mails) {
        // What the inbox sends to itself is not a request.
        if (mail.from_email.toLowerCase() === mailbox.toLowerCase()) continue;
        // The confirmation code e-mail is of no use once read: it leaves the
        // inbox, without becoming a request.
        if (isConfirmation(mail)) {
          await remove(mailbox, mail);
          continue;
        }
        let toRemove = false;
        let replied = false;
        for (const inbox of inboxes) {
          const done = await receive(inbox, mail, !replied);
          if (done.imported) created += 1;
          replied ||= done.replied;
          // A list that keeps no copy: the e-mail leaves the inbox, once all
          // of them have received it.
          if ((done.imported || done.alreadyThere) && inbox.remove) toRemove = true;
        }
        if (toRemove) await remove(mailbox, mail);
      }
      // Kept once everything is imported: an interrupted poll resumes where it
      // left off, not after.
      keepLink(mailbox, link);
    } catch (error) {
      console.error(`Poll of ${mailbox} (${usage}):`, error);
    }
  }
  if (created || purged) signalWrite("support-requests");
  return created;
};

/**
 * Polls each company's support inbox and imports what is new. An inaccessible
 * inbox does not prevent polling the others. Returns the number of requests
 * created.
 *
 * Requested while a poll is running — a Graph notification that lands in the
 * middle —, it triggers another one as soon as it ends: the announced e-mail
 * may have arrived after the current poll read its inbox.
 */
export const pollMailboxes = (): Promise<number> => {
  if (!entraConfigured()) return Promise.resolve(0);
  if (ongoing) {
    toRedo = true;
    return ongoing;
  }
  ongoing = poll().finally(() => {
    ongoing = null;
    if (toRedo) {
      toRedo = false;
      void pollMailboxes();
    }
  });
  return ongoing;
};
