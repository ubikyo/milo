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
  ajouterJoursOuvres,
} from "@milo/shared";
import type { Id } from "@milo/shared";
import { transaction } from "../db/query.js";
import type { SupportRequestRow, TicketFileRow } from "../db/rows.js";
import { signalerEcriture } from "../middleware/events.js";
import {
  prochainNumeroDeTicket,
  replaceSupportActors,
  replaceSupportLabels,
  supportComments,
  supportRequests,
} from "../repositories/support.js";
import { boitesRecues, type Reception } from "../repositories/receptions.js";
import { users } from "../repositories/users.js";
import { readSetting, writeSetting } from "../repositories/settings.js";
import {
  deltaDeLaBoite,
  detailsDuCourrier,
  entraConfiguree,
  fichiersDuCourrier,
  supprimerCourrier,
  adresseDEnvoi,
} from "./entra.js";
import { SUJET_CONFIRMATION } from "./optin.js";
import type { CourrierRecu, DetailsCourrier } from "./entra.js";
import { emailPropre, porteDuContenu, sansHistorique } from "./html.js";
import {
  TAILLE_MAX_TICKET,
  ecrireTicket,
  fichiersDe,
  oublierFichiers,
  supprimerTicket,
  urlTicket,
} from "./ticket-files.js";
import { env } from "../env.js";
import { notifier, titreDemande } from "./notify.js";
import { heureDeParis, now } from "./time.js";
import { reglagesSupport } from "../routes/support-settings.js";
import { envoyerReponseAuto } from "./support-auto-reply.js";

const JOUR_DE_PARIS = new Intl.DateTimeFormat("en-CA", {
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
const echeanceParDefaut = (recu: string): string => {
  const { default_due_days: jours } = reglagesSupport();
  if (!jours) return "";
  const [annee, mois, jour] = JOUR_DE_PARIS.format(new Date(recu)).split("-").map(Number);
  const cible = ajouterJoursOuvres({ annee: annee!, mois: mois!, jour: jour! }, jours);
  const texte = `${cible.annee}-${String(cible.mois).padStart(2, "0")}-${String(cible.jour).padStart(2, "0")} 00:00`;
  return heureDeParis(texte) ?? "";
};

/**
 * La première relève d'une boîte — sans lien delta — voit toute la boîte de
 * réception. Le temps de la mise au point, seuls les quinze derniers messages
 * en sont importés ; les suivantes importent tout ce qui arrive.
 */
const PREMIERE_RELEVE = 15;

/** Le lien delta de chaque boîte, par adresse en minuscules. */
const CLE_DELTA = "support_mail_delta";
type LiensDelta = Record<string, string>;

/** Le temps entre deux relèves. */
export const INTERVALLE_RELEVE = 5 * 60 * 1000;


/** La date de réception, ramenée à l'ISO de la base ; l'instant présent à défaut. */
const dateDe = (iso: string): string => {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? now() : date.toISOString();
};

/**
 * Un e-mail déjà là dans cette liste : l'origine d'une demande, ou un message
 * d'un fil. Une autre liste qui reçoit la même boîte a le sien.
 */
const dejaImporte = (reception: Reception, mailId: string): boolean =>
  Boolean(
    supportRequests.byMailId.get(reception.valeur, reception.liste, mailId) ??
      supportRequests.mailDejaRange.get(reception.valeur, reception.liste, mailId),
  );

/** L'e-mail du code de confirmation (lib/optin.ts) : Milo l'a envoyé, ce n'est pas une demande. */
const estLaConfirmation = (courrier: CourrierRecu): boolean =>
  courrier.subject.trim() === SUJET_CONFIRMATION &&
  courrier.from_email.toLowerCase() === adresseDEnvoi().toLowerCase();

/** Ce qu'un e-mail apporte, une fois ses fichiers rangés. */
interface Prepare {
  html: string;
  /**
   * Le même, sans l'historique cité : ce que garde une réponse, pour que le
   * fil ne répète pas à chaque message tous ceux qui le précèdent. Vide quand
   * on ne sait pas le détacher.
   */
  htmlSansHistorique: string;
  fichiers: TicketFileRow[];
  /** Les identifiants Internet qu'il cite : In-Reply-To, References. */
  cites: string[];
}

/**
 * Va chercher ce que la delta query ne donne pas — les en-têtes qui citent les
 * e-mails précédents, les fichiers — et range les fichiers. Asynchrone, donc
 * hors de la transaction qui importe : ce qui est rangé ici et ne sert pas
 * finalement est effacé par l'appelant.
 */
const preparer = async (boite: string, courrier: CourrierRecu): Promise<Prepare> => {
  const details = await detailsDuCourrier(boite, courrier.graph_id).catch(() => null);
  const cites = details?.cites ?? [];
  if (details?.conversation_id) courrier.conversation_id = details.conversation_id;

  // Une image intégrée ne compte pas comme pièce jointe pour Graph : le corps
  // qui en cite une suffit à aller voir.
  const aDesFichiers =
    courrier.has_attachments || Boolean(details?.has_attachments) || /cid:/i.test(courrier.body);
  const recus = aDesFichiers
    ? await fichiersDuCourrier(boite, courrier.graph_id, TAILLE_MAX_TICKET)
    : [];

  const images = new Map<string, string>();
  const fichiers: TicketFileRow[] = recus.map((recu) => {
    const file = ecrireTicket(recu.contenu, recu.name);
    // Une image que le corps cite est intégrée, quoi qu'en dise Graph.
    const citee = Boolean(recu.content_id) && courrier.body.includes(`cid:${recu.content_id}`);
    if (recu.content_id) images.set(recu.content_id, urlTicket(file));
    return { file, name: recu.name, mime: recu.mime, size: recu.size, inline: citee || (recu.inline && Boolean(recu.content_id)) };
  });

  return {
    html: emailPropre(courrier.body, courrier.body_type, images),
    // Ce qu'Exchange détache de la conversation, recoupé aux repères des
    // logiciels : son « uniqueBody » garde parfois le dernier message cité.
    htmlSansHistorique: sansHistoriqueDe(courrier, details, images),
    fichiers,
    cites,
  };
};

/**
 * Le corps d'une réponse sans l'historique qu'elle cite : ce qu'Exchange en
 * détache (« uniqueBody »), recoupé aux repères des logiciels — Exchange garde
 * parfois le dernier message cité. Vide quand il n'y a rien à détacher.
 */
const sansHistoriqueDe = (
  courrier: CourrierRecu,
  details: DetailsCourrier | null,
  images: Map<string, string>,
): string => {
  const [corps, type] = details?.unique_body
    ? [details.unique_body, details.unique_body_type]
    : [courrier.body, courrier.body_type];
  if (type === "text") return details?.unique_body ? emailPropre(corps, "text", images) : "";
  return emailPropre(sansHistorique(corps), "html", images);
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
const sujet = (objet: string): string =>
  objet
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
const demandeVisee = (
  reception: Reception,
  courrier: CourrierRecu,
  cites: string[],
): SupportRequestRow | undefined => {
  const { valeur: boite, liste } = reception;
  const reference = REFERENCE.exec(courrier.subject);
  if (reference) {
    const trouvee = supportRequests.byNumber.get(boite, liste, Number(reference[1]));
    if (trouvee) return trouvee;
  }

  const memeSujet = (demande: SupportRequestRow | undefined) =>
    demande && sujet(demande.subject) === sujet(courrier.subject) ? demande : undefined;

  // Le plus récent d'abord : References les range du plus ancien au plus
  // récent, et In-Reply-To vient en premier.
  for (const id of [...cites].reverse()) {
    const trouvee = memeSujet(supportRequests.citeeParMail.get(boite, liste, id, id));
    if (trouvee) return trouvee;
  }
  return courrier.conversation_id
    ? memeSujet(supportRequests.deLaConversation.get(boite, liste, courrier.conversation_id))
    : undefined;
};

/** Ce qu'une importation a fait, pour ce qui suit la transaction. */
interface Suite {
  repondue?: SupportRequestRow;
  rouverte?: boolean;
  creee?: Id;
}

/**
 * Un e-mail rejoint le fil de la demande à laquelle il répond, ou devient une
 * demande du contexte qui reçoit la boîte : son objet, son expéditeur pour acteur — le compte qui porte son
 * adresse, s'il y en a un —, et son contenu pour premier message. Rien si le
 * message était déjà là.
 */
const importer = transaction(
  (
    reception: Reception,
    courrier: CourrierRecu,
    prepare: Prepare,
    /**
     * Reçoit la demande à laquelle l'e-mail répond, quand il en rejoint une —
     * et si elle s'est rouverte —, ou celle qu'il a ouverte.
     */
    suite: Suite,
  ): boolean => {
    const recu = dateDe(courrier.received_at);
    const compte = courrier.from_email ? users.byEmail.get(courrier.from_email) : undefined;

    // Déjà importé — une autre relève l'a pris entre-temps : rien à faire, et
    // surtout pas de numéro consommé pour rien.
    if (dejaImporte(reception, courrier.mail_id)) return false;

    // Une réponse ne garde que ce qu'elle apporte : l'historique qu'elle
    // cite est déjà dans le fil. L'e-mail qui ouvre une demande, lui, se garde
    // entier — ce qu'il cite, souvent un échange transféré, en fait partie.
    const message = (demandeId: Id, reponse: boolean) => {
      const html =
        reponse && porteDuContenu(prepare.htmlSansHistorique)
          ? prepare.htmlSansHistorique
          : prepare.html;
      if (!porteDuContenu(html) && prepare.fichiers.length === 0) return;
      supportComments.createFromMail.run(
        demandeId,
        compte?.id ?? null,
        html,
        compte ? "" : courrier.from_name.trim(),
        compte ? "" : courrier.from_email.trim(),
        courrier.mail_id,
        JSON.stringify(prepare.fichiers),
        recu,
        recu,
      );
    };

    const visee = demandeVisee(reception, courrier, prepare.cites);
    // Une demande saisie à la main (sans boîte) se retrouve par son numéro
    // depuis chaque liste : son fil ne prend l'e-mail qu'une fois.
    if (visee && supportRequests.mailDansLeFil.get(visee.id, courrier.mail_id)) return false;
    if (visee) {
      message(visee.id, true);
      // L'expéditeur revient sur une demande qu'on croyait close : elle se
      // rouvre, sinon sa réponse passerait inaperçue.
      const { changes: rouverte } = supportRequests.rouvrir.run(
        REOPENED_SUPPORT_STATUS,
        recu,
        visee.id,
      );
      supportRequests.touch.run(recu, visee.id);
      suite.repondue = visee;
      suite.rouverte = rouverte > 0;
      return true;
    }

    const { changes, lastInsertRowid } = supportRequests.createFromMail.run(
      prochainNumeroDeTicket(),
      reception.board_id,
      reception.context_id,
      reception.liste,
      reception.valeur,
      courrier.subject.trim(),
      DEFAULT_SUPPORT_STATUS,
      echeanceParDefaut(recu),
      courrier.from_name.trim(),
      courrier.from_email.trim(),
      courrier.mail_id,
      courrier.conversation_id,
      recu,
      recu,
    );
    if (!changes) return false;

    if (compte) replaceSupportActors(lastInsertRowid as Id, [compte.id]);
    // Tout e-mail arrive avec les étiquettes du Paramétrage (Support) : c'est
    // à qui le lit d'en juger autrement.
    replaceSupportLabels(lastInsertRowid as Id, reglagesSupport().default_label_ids);
    message(lastInsertRowid as Id, false);
    suite.creee = lastInsertRowid as Id;
    return true;
  },
);

/**
 * Ce qui est arrivé dans une boîte depuis la dernière relève, du plus ancien au
 * plus récent, et le lien delta à garder une fois tout importé. Un lien que
 * Graph ne reconnaît plus — trop ancien — fait repartir de zéro.
 */
const nouveautes = async (
  boite: string,
): Promise<{ courriers: CourrierRecu[]; lien: string }> => {
  const cle = boite.toLowerCase();
  const lien = readSetting<LiensDelta>(CLE_DELTA, {})[cle] ?? null;

  let resultat: { courriers: CourrierRecu[]; lien: string };
  let premiere = lien === null;
  try {
    resultat = await deltaDeLaBoite(boite, lien);
  } catch (erreur) {
    if (!lien) throw erreur;
    console.warn(`Relève de ${boite} : le lien delta ne vaut plus, la relève repart de zéro.`);
    resultat = await deltaDeLaBoite(boite, null);
    premiere = true;
  }

  const parDate = [...resultat.courriers].sort((a, b) =>
    a.received_at < b.received_at ? -1 : a.received_at > b.received_at ? 1 : 0,
  );
  return {
    courriers: premiere ? parDate.slice(-PREMIERE_RELEVE) : parDate,
    lien: resultat.lien,
  };
};

const garderLien = (boite: string, lien: string): void => {
  if (!lien) return;
  writeSetting(CLE_DELTA, { ...readSetting<LiensDelta>(CLE_DELTA, {}), [boite.toLowerCase()]: lien });
};

/** Une relève à la fois : une demande pendant qu'elle tourne en relance une après. */
/**
 * Ceux qui suivent une demande apprennent que son expéditeur y a répondu. Pas
 * de requête ici pour dire l'adresse de Milo : c'est MILO_PUBLIC_URL qui la
 * donne, et sans elle la notification reste à l'écran, sans e-mail.
 */
const repondueParEmail = (demande: SupportRequestRow, courrier: CourrierRecu): void => {
  const compte = courrier.from_email ? users.byEmail.get(courrier.from_email) : undefined;
  notifier({
    kind: "support",
    targetId: demande.id,
    titre: titreDemande(demande),
    message: "a répondu par e-mail",
    auteur: compte ?? { id: 0, name: courrier.from_name.trim(), email: courrier.from_email.trim() },
    base: env.publicUrl,
  });
};

/**
 * Retire un e-mail importé de sa boîte, quand la liste le demande. Un échec —
 * la permission Mail.ReadWrite manque — n'arrête pas la relève : l'e-mail
 * reste, et la demande est là.
 */
const retirer = async (boite: string, courrier: CourrierRecu): Promise<void> => {
  try {
    await supprimerCourrier(boite, courrier.graph_id);
  } catch (erreur) {
    console.error(`Suppression d'un e-mail de ${boite} :`, erreur);
  }
};

let enCours: Promise<number> | null = null;
let aRefaire = false;

/**
 * Ce que devient un e-mail d'une boîte dans une liste qui la reçoit. Rend ce
 * qui s'est passé, pour la suite de la relève.
 */
const recevoir = async (
  reception: Reception & { confirmee_le: string },
  courrier: CourrierRecu,
  /** Faux pour les listes qui suivent la première : le mot automatique ne part qu'une fois. */
  repondre: boolean,
): Promise<{ importe: boolean; dejaLa: boolean; repondu: boolean }> => {
  // Ce qui est arrivé avant la confirmation de la liste (lib/optin.ts) ne
  // s'y relève pas.
  if (Date.parse(courrier.received_at) < Date.parse(reception.confirmee_le)) {
    return { importe: false, dejaLa: false, repondu: false };
  }
  if (dejaImporte(reception, courrier.mail_id)) return { importe: false, dejaLa: true, repondu: false };
  // Les fichiers se rangent pour chaque demande : chacune a les siens.
  const prepare = await preparer(reception.valeur, courrier);
  let importe = false;
  const suite: Suite = {};
  try {
    importe = importer(reception, courrier, prepare, suite);
  } finally {
    // Rien n'a été écrit en base : ses fichiers ne servent à personne.
    if (!importe) prepare.fichiers.forEach((f) => supprimerTicket(f.file));
  }
  if (!importe) return { importe, dejaLa: false, repondu: false };
  if (suite.repondue) repondueParEmail(suite.repondue, courrier);
  // Les réponses par défaut du Paramétrage : l'accusé de réception d'une
  // nouvelle demande, ou le mot qui dit qu'une demande close est rouverte.
  // L'expéditeur ne les reçoit qu'une fois, même si plusieurs listes ont la
  // boîte.
  let repondu = false;
  if (repondre && suite.creee) {
    await envoyerReponseAuto(suite.creee, "new");
    repondu = true;
  }
  if (repondre && suite.repondue && suite.rouverte) {
    await envoyerReponseAuto(suite.repondue.id, "reopened");
    repondu = true;
  }
  return { importe, dejaLa: false, repondu };
};

/**
 * Les demandes nées d'un e-mail de code (lib/optin.ts), importées avant que
 * la relève ne le reconnaisse : elles s'en vont, avec leurs fichiers. Rend
 * vrai quand il y en avait.
 */
const purgerLesConfirmations = (): boolean => {
  const expediteur = adresseDEnvoi();
  if (!expediteur) return false;
  const demandes = supportRequests.nesDUnEnvoi.all(SUJET_CONFIRMATION, expediteur);
  if (!demandes.length) return false;
  const fichiers = demandes.flatMap((d) =>
    supportComments.attachmentsOfRequest
      .all(d.id)
      .flatMap(({ attachments }) => fichiersDe(attachments).map((f) => f.file)),
  );
  // Leurs étiquettes et leur fil partent avec elles, par clé étrangère.
  transaction(() => demandes.forEach((d) => supportRequests.remove.run(d.id)))();
  oublierFichiers(fichiers);
  return true;
};

const releve = async (): Promise<number> => {
  let creees = 0;
  const purgees = purgerLesConfirmations();
  // Une boîte se relève une fois, et chaque e-mail va dans chaque liste qui
  // l'a confirmée.
  const parBoite = new Map<string, (Reception & { confirmee_le: string })[]>();
  for (const reception of boitesRecues()) {
    const cle = reception.valeur.toLowerCase();
    parBoite.set(cle, [...(parBoite.get(cle) ?? []), reception]);
  }
  for (const receptions of parBoite.values()) {
    const boite = receptions[0]!.valeur;
    const usage = receptions.map((r) => r.usage).join(", ");
    try {
      const { courriers, lien } = await nouveautes(boite);
      for (const courrier of courriers) {
        // Ce que la boîte s'envoie à elle-même n'est pas une demande.
        if (courrier.from_email.toLowerCase() === boite.toLowerCase()) continue;
        // L'e-mail du code de confirmation ne sert plus une fois lu : il
        // quitte la boîte, sans devenir une demande.
        if (estLaConfirmation(courrier)) {
          await retirer(boite, courrier);
          continue;
        }
        let aRetirer = false;
        let repondu = false;
        for (const reception of receptions) {
          const fait = await recevoir(reception, courrier, !repondu);
          if (fait.importe) creees += 1;
          repondu ||= fait.repondu;
          // Une liste qui ne garde pas de copie : l'e-mail quitte la boîte,
          // une fois que toutes l'ont reçu.
          if ((fait.importe || fait.dejaLa) && reception.supprimer) aRetirer = true;
        }
        if (aRetirer) await retirer(boite, courrier);
      }
      // Gardé une fois tout importé : une relève interrompue reprend là où
      // elle en était, pas après.
      garderLien(boite, lien);
    } catch (erreur) {
      console.error(`Relève de ${boite} (${usage}) :`, erreur);
    }
  }
  if (creees || purgees) signalerEcriture("support-requests");
  return creees;
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
export const releverLesBoites = (): Promise<number> => {
  if (!entraConfiguree()) return Promise.resolve(0);
  if (enCours) {
    aRefaire = true;
    return enCours;
  }
  enCours = releve().finally(() => {
    enCours = null;
    if (aRefaire) {
      aRefaire = false;
      void releverLesBoites();
    }
  });
  return enCours;
};
