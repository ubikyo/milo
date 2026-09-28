// Ce qui part quand un élément suivi change : une notification à l'écran, et
// un e-mail.
//
// Deux principes tiennent le fichier.
//
//   1. On ne se notifie jamais de ses propres gestes. C'est le dépôt qui
//      écarte l'auteur (repositories/follows.ts), pas l'affichage : rien ne
//      part, donc rien n'est à filtrer plus loin.
//
//   2. La notification à l'écran est immédiate, l'e-mail ne l'est pas. Dix
//      retouches d'un titre en deux minutes font dix notifications — elles
//      s'empilent et disparaissent — mais un seul e-mail, qui les résume. Sans
//      ce regroupement, suivre un projet actif reviendrait à s'inscrire à une
//      rafale.

import crypto from "node:crypto";
import type { FollowKind, Id, Notification, NotificationKind } from "@milo/shared";
import { lienElement } from "@milo/shared";
import type { UserRow } from "../db/rows.js";
import { follows } from "../repositories/follows.js";
import { taskCards } from "../repositories/tasks.js";
import { env } from "../env.js";
import { envoyerCourrier, messagerieConfiguree } from "./mail.js";
import { gabarit } from "./mail-template.js";
import type { Ligne } from "./mail-template.js";
import { pousserNotification } from "../middleware/events.js";
import { now } from "./time.js";

/** Le temps pendant lequel les faits s'accumulent avant de partir en un e-mail. */
const FENETRE = env.notifyWindowMs;

export interface Fait {
  kind: NotificationKind;
  targetId: Id;
  /** Le nom de l'élément, tel qu'il s'affiche. */
  titre: string;
  /** Ce qui a changé, à la troisième personne : « a modifié la fiche ». */
  message: string;
  /** Qui a agi. C'est aussi la personne qu'on ne notifie pas. */
  auteur: UserRow;
  /**
   * La liste d'où la carte vient, quand elle en change. Ceux qui suivaient
   * cette liste-là sont prévenus eux aussi : une carte qui s'en va est une
   * modification de ce qu'elle contient, au même titre qu'une carte qui
   * arrive.
   */
  listeOrigine?: Id;
  /** La racine de l'application, telle qu'on l'a jointe : « https://milo.exemple.fr ». */
  base: string;
}

// --- Les e-mails en attente ------------------------------------------------

/**
 * Un fait empilé, c'est une ligne du gabarit : le texte, et le nombre de fois
 * qu'il s'est répété d'affilée. Corriger un titre trois fois de suite donne
 * trois fois la même phrase, et l'e-mail dit « (3 fois) » plutôt que de la
 * recopier.
 */
type FaitEmpile = Ligne;

interface EnAttente {
  destinataire: string;
  titre: string;
  lien: string;
  /** Les faits accumulés, dans l'ordre où ils sont arrivés. */
  faits: FaitEmpile[];
  minuterie: NodeJS.Timeout;
}

/**
 * Un envoi en attente par couple (personne, élément). En mémoire, comme les
 * compteurs de version : un redémarrage perd ce qui n'est pas encore parti. Ce
 * qui se perd alors, c'est un résumé de quelques minutes, et la notification à
 * l'écran, elle, a déjà eu lieu.
 */
const enAttente = new Map<string, EnAttente>();

const cle = (userId: Id, kind: NotificationKind, targetId: Id): string =>
  `${userId}:${kind}:${targetId}`;

const corps = (envoi: EnAttente): { text: string; html: string } => {
  const total = envoi.faits.reduce((somme, fait) => somme + fait.repetitions, 0);

  return gabarit({
    titre: envoi.titre,
    intro: total === 1 ? "Une modification :" : `${total} modifications :`,
    lignes: envoi.faits,
    action: { url: envoi.lien, libelle: "Ouvrir dans Milo" },
    pied: "Vous recevez ce message parce que vous suivez cet élément dans Milo.",
  });
};

const partir = (cleEnvoi: string): void => {
  const envoi = enAttente.get(cleEnvoi);
  if (!envoi) return;
  enAttente.delete(cleEnvoi);

  envoyerCourrier({
    to: envoi.destinataire,
    subject: `Milo — ${envoi.titre}`,
    ...corps(envoi),
  }).catch((erreur: unknown) => {
    // Personne n'attend cette réponse : l'écriture qui l'a déclenchée est
    // partie depuis longtemps. On la trace, et c'est tout — une notification
    // perdue ne doit pas faire échouer une modification réussie.
    console.error("Notification par e-mail non remise :", erreur);
  });
};

/** Ajoute un fait à l'envoi en cours pour cette personne et cet élément. */
const empiler = (destinataire: UserRow, fait: Fait, lien: string): void => {
  if (!destinataire.email) return;

  const cleEnvoi = cle(destinataire.id, fait.kind, fait.targetId);
  const courant = enAttente.get(cleEnvoi);
  const ligne = `${fait.auteur.name || fait.auteur.email} ${fait.message}`;

  if (courant) {
    // Le titre suit l'élément : s'il vient d'être renommé, c'est le nouveau
    // nom qu'on veut lire dans l'e-mail.
    courant.titre = fait.titre;

    const dernier = courant.faits[courant.faits.length - 1];
    if (dernier && dernier.texte === ligne) dernier.repetitions += 1;
    else courant.faits.push({ texte: ligne, repetitions: 1 });
    return;
  }

  enAttente.set(cleEnvoi, {
    destinataire: destinataire.email,
    titre: fait.titre,
    lien,
    faits: [{ texte: ligne, repetitions: 1 }],
    // `unref` laisse le processus se terminer sans attendre la fenêtre.
    minuterie: setTimeout(() => partir(cleEnvoi), FENETRE).unref(),
  });
};

// --- Qui est prévenu -------------------------------------------------------

/**
 * Les comptes à prévenir. Une carte a deux sources de suiveurs : ceux qui
 * suivent la carte, et ceux qui suivent la liste où elle se trouve — suivre
 * une liste, c'est suivre ses cartes. Une même personne peut être dans les
 * deux : elle n'est prévenue qu'une fois.
 */
const aPrevenir = (fait: Fait): UserRow[] => {
  const sortes: [FollowKind, Id][] = [[fait.kind, fait.targetId]];

  if (fait.kind === "card") {
    const carte = taskCards.byId.get(fait.targetId);
    if (carte) sortes.push(["list", carte.list_id]);
    if (fait.listeOrigine !== undefined) sortes.push(["list", fait.listeOrigine]);
  }

  const parId = new Map<Id, UserRow>();
  for (const [kind, id] of sortes) {
    for (const personne of follows.watchers(kind, id, fait.auteur.id)) {
      parId.set(personne.id, personne);
    }
  }
  return [...parId.values()];
};

/**
 * Le point d'entrée : une modification vient d'avoir lieu, on en tire ce qu'il
 * faut. Ne lève jamais — une notification qui échoue ne doit pas faire échouer
 * l'écriture qui l'a déclenchée, déjà enregistrée à ce stade.
 */
export const notifier = (fait: Fait): void => {
  try {
    const destinataires = aPrevenir(fait);
    if (destinataires.length === 0) return;

    const lien = `${fait.base}/${lienElement(fait.kind, fait.targetId)}`;
    const quand = now();

    for (const personne of destinataires) {
      pousserNotification(personne.id, {
        id: crypto.randomBytes(8).toString("hex"),
        kind: fait.kind,
        target_id: fait.targetId,
        title: fait.titre,
        message: fait.message,
        author: fait.auteur.name || fait.auteur.email,
        created_at: quand,
      } satisfies Notification);

      if (messagerieConfiguree()) empiler(personne, fait, lien);
    }
  } catch (erreur) {
    console.error("Notification de suivi abandonnée :", erreur);
  }
};

/**
 * La racine par laquelle on nous a joints, pour bâtir un lien qui s'ouvre. Le
 * serveur n'a pas d'autre moyen de connaître son adresse publique, et c'est
 * celle-là qui est juste : c'est celle que la personne a dans son navigateur.
 */
export const racine = (req: { protocol: string; get(nom: string): string | undefined }): string =>
  `${req.protocol}://${req.get("host") ?? ""}`;
