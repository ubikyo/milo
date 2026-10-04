// La relève des boîtes de support : chaque e-mail reçu dans une boîte qu'une
// liste de demandes reçoit (repositories/receptions.ts) devient une demande du
// contexte que la liste lui associe.
//
// Rien n'est retiré des boîtes : les messages y restent tels quels, ni
// supprimés, ni déplacés, ni marqués comme lus. C'est l'identifiant Internet
// de chaque message, gardé sur la demande, qui empêche de l'importer deux fois.
//
// Un e-mail qui répond à une demande — il cite l'un de ses messages dans ses
// en-têtes, porte son numéro dans l'objet, ou arrive dans sa conversation —
// rejoint son fil au lieu d'ouvrir un nouveau ticket.
//
// L'e-mail est gardé tel qu'il a été écrit : son HTML, ses images intégrées et
// ses pièces jointes, rangées dans le dossier des tickets (lib/ticket-files.ts).
//
// La relève passe par la delta query de Graph : chaque boîte garde le lien
// que Graph lui a rendu la dernière fois, et n'apprend que ce qui est arrivé
// depuis. Elle a lieu à intervalle régulier, et aussitôt qu'une notification
// de changement de Graph annonce un e-mail (lib/support-webhooks.ts).

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
 * L'échéance d'une demande reçue à cet instant : autant de jours ouvrés après
 * le jour de réception, à Paris, que le Paramétrage en demande (Support). Sans
 * heure — minuit, qui se lit « la journée entière ». Vide si le réglage est à
 * zéro.
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
 * La première relève d'une boîte — sans lien delta — voit toute la boîte de
 * réception. Le temps de la mise au point, seuls les quinze derniers messages
 * en sont importés ; les suivantes importent tout ce qui arrive.
 */
const FIRST_POLL_LIMIT = 15;

/** Le lien delta de chaque boîte, par adresse en minuscules. */
const DELTA_KEY = "support_mail_delta";
type LinksDelta = Record<string, string>;

/** Le temps entre deux relèves. */
export const POLL_INTERVAL = 5 * 60 * 1000;


/** La date de réception, ramenée à l'ISO de la base ; l'instant présent à défaut. */
const dateOf = (iso: string): string => {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? now() : date.toISOString();
};

/**
 * Un e-mail déjà là dans cette liste : l'origine d'une demande, ou un message
 * d'un fil. Une autre liste qui reçoit la même boîte a le sien.
 */
const alreadyImported = (inbox: Inbox, mailId: string): boolean =>
  Boolean(
    supportRequests.byMailId.get(inbox.value, inbox.list, mailId) ??
      supportRequests.mailAlreadyFiled.get(inbox.value, inbox.list, mailId),
  );

/** L'e-mail du code de confirmation (lib/optin.ts) : Milo l'a envoyé, ce n'est pas une demande. */
const isConfirmation = (mail: ReceivedMail): boolean =>
  mail.subject.trim() === CONFIRMATION_SUBJECT &&
  mail.from_email.toLowerCase() === sendingAddress().toLowerCase();

/** Ce qu'un e-mail apporte, une fois ses fichiers rangés. */
interface Prepared {
  html: string;
  /**
   * Le même, sans l'historique cité : ce que garde une réponse, pour que le
   * fil ne répète pas à chaque message tous ceux qui le précèdent. Vide quand
   * on ne sait pas le détacher.
   */
  htmlSansHistorique: string;
  files: TicketFileRow[];
  /** Les identifiants Internet qu'il cite : In-Reply-To, References. */
  cited: string[];
}

/**
 * Va chercher ce que la delta query ne donne pas — les en-têtes qui citent les
 * e-mails précédents, les fichiers — et range les fichiers. Asynchrone, donc
 * hors de la transaction qui importe : ce qui est rangé ici et ne sert pas
 * finalement est effacé par l'appelant.
 */
const prepareMail = async (mailbox: string, mail: ReceivedMail): Promise<Prepared> => {
  const details = await mailDetails(mailbox, mail.graph_id).catch(() => null);
  const cited = details?.cited ?? [];
  if (details?.conversation_id) mail.conversation_id = details.conversation_id;

  // Une image intégrée ne compte pas comme pièce jointe pour Graph : le corps
  // qui en cite une suffit à aller voir.
  const hasFiles =
    mail.has_attachments || Boolean(details?.has_attachments) || /cid:/i.test(mail.body);
  const received = hasFiles
    ? await mailFiles(mailbox, mail.graph_id, TICKET_SIZE_MAX)
    : [];

  const images = new Map<string, string>();
  const files: TicketFileRow[] = received.map((received) => {
    const file = writeTicket(received.content, received.name);
    // Une image que le corps cite est intégrée, quoi qu'en dise Graph.
    const cited = Boolean(received.content_id) && mail.body.includes(`cid:${received.content_id}`);
    if (received.content_id) images.set(received.content_id, ticketUrl(file));
    return { file, name: received.name, mime: received.mime, size: received.size, inline: cited || (received.inline && Boolean(received.content_id)) };
  });

  return {
    html: cleanEmail(mail.body, mail.body_type, images),
    // Ce qu'Exchange détache de la conversation, recoupé aux repères des
    // logiciels : son « uniqueBody » garde parfois le dernier message cité.
    htmlSansHistorique: withoutHistoryOf(mail, details, images),
    files,
    cited,
  };
};

/**
 * Le corps d'une réponse sans l'historique qu'elle cite : ce qu'Exchange en
 * détache (« uniqueBody »), recoupé aux repères des logiciels — Exchange garde
 * parfois le dernier message cité. Vide quand il n'y a rien à détacher.
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
 * « [HLP-12] » dans un objet : le numéro d'un ticket auquel on répond. L'ancien
 * préfixe (« [LMA-12] ») reste reconnu, pour les fils ouverts avant.
 */
const REFERENCE = new RegExp(
  `\\[(?:${[SUPPORT_TICKET_PREFIX, LEGACY_REFERENCE_PREFIX]
    .map((p) => p.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    .join("|")})(\\d+)\\]`,
  "i",
);

/**
 * L'objet réduit à son sujet : sans « RE: », « TR: », « Fwd: » ni numéro de
 * ticket, sans casse ni espaces en trop.
 */
const bareSubject = (subject: string): string =>
  subject
    .replace(REFERENCE, " ")
    .replace(/^\s*((re|tr|fw|fwd|aw|wg|rv)\s*(\[\d+\])?\s*:\s*)+/i, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();

/**
 * La demande à laquelle un e-mail répond, s'il y en a une.
 *
 * Son numéro dans l'objet suffit : on l'y a mis exprès. Sinon, il faut qu'il
 * cite l'un de ses messages dans ses en-têtes, ou arrive dans sa
 * conversation — et qu'il parle encore du même sujet. Un e-mail parti d'un
 * ancien message dont on a changé l'objet ouvre un nouveau ticket : ses
 * en-têtes citent l'ancien, mais ce n'est plus la même demande.
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

  // Le plus récent d'abord : References les range du plus ancien au plus
  // récent, et In-Reply-To vient en premier.
  for (const id of [...cited].reverse()) {
    const foundItem = sameSubject(supportRequests.citedByMail.get(mailbox, list, id, id));
    if (foundItem) return foundItem;
  }
  return mail.conversation_id
    ? sameSubject(supportRequests.ofConversation.get(mailbox, list, mail.conversation_id))
    : undefined;
};

/** Ce qu'une importation a fait, pour ce qui suit la transaction. */
interface FollowUp {
  replied?: SupportRequestRow;
  reopened?: boolean;
  created?: Id;
}

/**
 * Un e-mail rejoint le fil de la demande à laquelle il répond, ou devient une
 * demande du contexte qui reçoit la boîte : son objet, son expéditeur pour acteur — le compte qui porte son
 * adresse, s'il y en a un —, et son contenu pour premier message. Rien si le
 * message était déjà là.
 */
const importSections = transaction(
  (
    inbox: Inbox,
    mail: ReceivedMail,
    prepare: Prepared,
    /**
     * Reçoit la demande à laquelle l'e-mail répond, quand il en rejoint une —
     * et si elle s'est rouverte —, ou celle qu'il a ouverte.
     */
    followUp: FollowUp,
  ): boolean => {
    const received = dateOf(mail.received_at);
    const account = mail.from_email ? users.byEmail.get(mail.from_email) : undefined;

    // Déjà importé — une autre relève l'a pris entre-temps : rien à faire, et
    // surtout pas de numéro consommé pour rien.
    if (alreadyImported(inbox, mail.mail_id)) return false;

    // Une réponse ne garde que ce qu'elle apporte : l'historique qu'elle
    // cite est déjà dans le fil. L'e-mail qui ouvre une demande, lui, se garde
    // entier — ce qu'il cite, souvent un échange transféré, en fait partie.
    const message = (requestId: Id, response: boolean) => {
      const html =
        response && hasContent(prepare.htmlSansHistorique)
          ? prepare.htmlSansHistorique
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
    // Une demande saisie à la main (sans boîte) se retrouve par son numéro
    // depuis chaque liste : son fil ne prend l'e-mail qu'une fois.
    if (targeted && supportRequests.mailInThread.get(targeted.id, mail.mail_id)) return false;
    if (targeted) {
      message(targeted.id, true);
      // L'expéditeur revient sur une demande qu'on croyait close : elle se
      // rouvre, sinon sa réponse passerait inaperçue.
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
      inbox.context_id,
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
    // Tout e-mail arrive avec les étiquettes du Paramétrage (Support) : c'est
    // à qui le lit d'en juger autrement.
    replaceSupportLabels(lastInsertRowid as Id, supportSettings().default_label_ids);
    message(lastInsertRowid as Id, false);
    followUp.created = lastInsertRowid as Id;
    return true;
  },
);

/**
 * Ce qui est arrivé dans une boîte depuis la dernière relève, du plus ancien au
 * plus récent, et le lien delta à garder une fois tout importé. Un lien que
 * Graph ne reconnaît plus — trop ancien — fait repartir de zéro.
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
    console.warn(`Relève de ${mailbox} : le lien delta ne vaut plus, la relève repart de zéro.`);
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

/** Une relève à la fois : une demande pendant qu'elle tourne en relance une après. */
/**
 * Ceux qui suivent une demande apprennent que son expéditeur y a répondu. Pas
 * de requête ici pour dire l'adresse de Milo : c'est MILO_PUBLIC_URL qui la
 * donne, et sans elle la notification reste à l'écran, sans e-mail.
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
 * Retire un e-mail importé de sa boîte, quand la liste le demande. Un échec —
 * la permission Mail.ReadWrite manque — n'arrête pas la relève : l'e-mail
 * reste, et la demande est là.
 */
const remove = async (mailbox: string, mail: ReceivedMail): Promise<void> => {
  try {
    await deleteMail(mailbox, mail.graph_id);
  } catch (error) {
    console.error(`Suppression d'un e-mail de ${mailbox} :`, error);
  }
};

let ongoing: Promise<number> | null = null;
let toRedo = false;

/**
 * Ce que devient un e-mail d'une boîte dans une liste qui la reçoit. Rend ce
 * qui s'est passé, pour la suite de la relève.
 */
const receive = async (
  inbox: Inbox & { confirmed_at: string },
  mail: ReceivedMail,
  /** Faux pour les listes qui suivent la première : le mot automatique ne part qu'une fois. */
  respond: boolean,
): Promise<{ imported: boolean; alreadyThere: boolean; replied: boolean }> => {
  // Ce qui est arrivé avant la confirmation de la liste (lib/optin.ts) ne
  // s'y relève pas.
  if (Date.parse(mail.received_at) < Date.parse(inbox.confirmed_at)) {
    return { imported: false, alreadyThere: false, replied: false };
  }
  if (alreadyImported(inbox, mail.mail_id)) return { imported: false, alreadyThere: true, replied: false };
  // Les fichiers se rangent pour chaque demande : chacune a les siens.
  const prepare = await prepareMail(inbox.value, mail);
  let imported = false;
  const followUp: FollowUp = {};
  try {
    imported = importSections(inbox, mail, prepare, followUp);
  } finally {
    // Rien n'a été écrit en base : ses fichiers ne servent à personne.
    if (!imported) prepare.files.forEach((f) => deleteTicket(f.file));
  }
  if (!imported) return { imported, alreadyThere: false, replied: false };
  if (followUp.replied) repliedByEmail(followUp.replied, mail);
  // Les réponses par défaut du Paramétrage : l'accusé de réception d'une
  // nouvelle demande, ou le mot qui dit qu'une demande close est rouverte.
  // L'expéditeur ne les reçoit qu'une fois, même si plusieurs listes ont la
  // boîte.
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
 * Les demandes nées d'un e-mail de code (lib/optin.ts), importées avant que
 * la relève ne le reconnaisse : elles s'en vont, avec leurs fichiers. Rend
 * vrai quand il y en avait.
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
  // Leurs étiquettes et leur fil partent avec elles, par clé étrangère.
  transaction(() => requests.forEach((d) => supportRequests.remove.run(d.id)))();
  forgetFiles(files);
  return true;
};

const poll = async (): Promise<number> => {
  let created = 0;
  const purged = purgeConfirmations();
  // Une boîte se relève une fois, et chaque e-mail va dans chaque liste qui
  // l'a confirmée.
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
        // Ce que la boîte s'envoie à elle-même n'est pas une demande.
        if (mail.from_email.toLowerCase() === mailbox.toLowerCase()) continue;
        // L'e-mail du code de confirmation ne sert plus une fois lu : il
        // quitte la boîte, sans devenir une demande.
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
          // Une liste qui ne garde pas de copie : l'e-mail quitte la boîte,
          // une fois que toutes l'ont reçu.
          if ((done.imported || done.alreadyThere) && inbox.remove) toRemove = true;
        }
        if (toRemove) await remove(mailbox, mail);
      }
      // Gardé une fois tout importé : une relève interrompue reprend là où
      // elle en était, pas après.
      keepLink(mailbox, link);
    } catch (error) {
      console.error(`Relève de ${mailbox} (${usage}) :`, error);
    }
  }
  if (created || purged) signalWrite("support-requests");
  return created;
};

/**
 * Relève la boîte de support de chaque société et importe ce qui est nouveau.
 * Une boîte inaccessible n'empêche pas de relever les autres. Rend le nombre
 * de demandes créées.
 *
 * Demandée pendant qu'une relève tourne — une notification de Graph qui tombe
 * au milieu —, elle en relance une dès la fin : l'e-mail annoncé a pu arriver
 * après que la relève en cours a lu sa boîte.
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
