// Ce qui part quand un élément suivi change — ou un élément dont on est
// acteur : une notification à l'écran, et un e-mail.
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
import type {
  FollowKind,
  Id,
  Notification,
  NotificationKind,
  NotificationSettings,
} from "@milo/shared";
import { can, lienElement, supportTicketRef } from "@milo/shared";
import type { Area } from "@milo/shared";
import type { UserRow } from "../db/rows.js";
import { selection } from "../db/query.js";
import { follows } from "../repositories/follows.js";
import { taskCards } from "../repositories/tasks.js";
import { env } from "../env.js";
import { adresseDEnvoi } from "./entra.js";
import { envoyerCourrier, messagerieConfiguree } from "./mail.js";
import { gabarit } from "./mail-template.js";
import type { Ligne } from "./mail-template.js";
import { notifications } from "../repositories/notifications.js";
import { readSetting } from "../repositories/settings.js";
import { droitsSocietes, users } from "../repositories/users.js";
import { now } from "./time.js";

// --- Les réglages (Paramétrage › Notifications) ---------------------------

/**
 * Les réglages de la section « Notifications ». Le délai de regroupement
 * part, tant qu'on ne l'a pas réglé, de MILO_NOTIFY_WINDOW_MINUTES.
 */
export const reglagesNotifications = (): NotificationSettings => ({
  toasts: readSetting<boolean>("notify_toasts", true) !== false,
  email: readSetting<boolean>("notify_email", true) !== false,
  emailMode: readSetting<string>("notify_email_mode", "grouped") === "immediate" ? "immediate" : "grouped",
  emailDelayMinutes: readSetting<number>("notify_email_delay", env.notifyWindowMs / 60000),
});

/**
 * Le temps pendant lequel les faits s'accumulent avant de partir en un
 * e-mail. Zéro quand les e-mails partent à chaque évènement : la minuterie
 * part au tour suivant, et seuls les faits d'un même geste se retrouvent
 * ensemble.
 */
const fenetre = (): number => {
  const r = reglagesNotifications();
  return r.emailMode === "immediate" ? 0 : r.emailDelayMinutes * 60 * 1000;
};

/**
 * La boîte d'où partent les e-mails de notification, ou rien : les e-mails
 * sont coupés dans le Paramétrage, ou la messagerie n'est pas configurée.
 */
const boiteDEnvoi = (): string =>
  reglagesNotifications().email && messagerieConfiguree() ? adresseDEnvoi() : "";

/**
 * Qui a agi. Un compte le plus souvent ; l'expéditeur d'un e-mail reçu sur un
 * ticket n'en a pas toujours — son identifiant vaut alors 0, qui
 * n'écarte personne.
 */
export type Auteur = Pick<UserRow, "id" | "name" | "email">;

export interface Fait {
  /**
   * L'élément suivi : un projet, une carte, un ticket. Un
   * élément du mode Accès ne se suit pas.
   */
  kind: Exclude<NotificationKind, "access">;
  targetId: Id;
  /** Le nom de l'élément, tel qu'il s'affiche. */
  titre: string;
  /** Ce qui a changé, à la troisième personne : « a modifié la fiche ». */
  message: string;
  /** Qui a agi. C'est aussi la personne qu'on ne notifie pas. */
  auteur: Auteur;
  /**
   * La liste d'où la carte vient, quand elle en change. Ceux qui suivaient
   * cette liste-là sont prévenus eux aussi : une carte qui s'en va est une
   * modification de ce qu'elle contient, au même titre qu'une carte qui
   * arrive.
   */
  listeOrigine?: Id;
  /**
   * Des comptes à ne pas prévenir cette fois : ceux qu'une autre notification
   * vient de prévenir du même geste — les acteurs qu'on vient d'assigner à une
   * demande ont déjà la leur.
   */
  sauf?: Id[];
  /**
   * La racine de l'application, telle qu'on l'a jointe : « https://milo.exemple.fr ».
   * Vide quand on ne la connaît pas — une relève de boîte n'a pas de requête :
   * la notification reste alors à l'écran, sans e-mail au lien cassé.
   */
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
  /** La boîte de support de la société de l'élément. */
  expediteur: string;
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
    pied: "Vous recevez ce message parce que vous suivez cet élément dans Milo, ou que vous en êtes acteur.",
  });
};

const partir = (cleEnvoi: string): void => {
  const envoi = enAttente.get(cleEnvoi);
  if (!envoi) return;
  enAttente.delete(cleEnvoi);

  envoyerCourrier({
    from: envoi.expediteur,
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
const empiler = (destinataire: UserRow, fait: Fait, lien: string, expediteur: string): void => {
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
    expediteur,
    destinataire: destinataire.email,
    titre: fait.titre,
    lien,
    faits: [{ texte: ligne, repetitions: 1 }],
    // `unref` laisse le processus se terminer sans attendre la fenêtre.
    minuterie: setTimeout(() => partir(cleEnvoi), fenetre()).unref(),
  });
};

// --- D'où part l'e-mail ----------------------------------------------------

// --- Qui est prévenu -------------------------------------------------------

/** Le mode dont relève l'élément suivi. */
const domaines: Record<Fait["kind"], Area> = {
  project: "projects",
  card: "tasks",
  support: "support",
};

/**
 * Les acteurs d'un élément, sauf celui qui vient d'agir : ceux d'un projet,
 * les membres d'une carte, les acteurs d'une demande. L'auteur d'un ticket —
 * l'expéditeur de l'e-mail, quand il a un compte, en devient acteur — n'est
 * pas de l'équipe : il n'est pas prévenu des gestes de celle-ci.
 */
const acteurs: Record<Fait["kind"], ReturnType<typeof selection<UserRow>>> = {
  project: selection(
    `SELECT users.* FROM project_actors a JOIN users ON users.id = a.user_id
     WHERE a.project_id = ? AND a.user_id != ?`,
  ),
  card: selection(
    `SELECT users.* FROM card_members m JOIN users ON users.id = m.user_id
     WHERE m.card_id = ? AND m.user_id != ?`,
  ),
  support: selection(
    `SELECT users.* FROM support_request_actors a
     JOIN users ON users.id = a.user_id
     JOIN support_requests r ON r.id = a.request_id
     WHERE a.request_id = ? AND a.user_id != ?
       AND (r.sender_email = '' OR lower(users.email) != lower(r.sender_email))`,
  ),
};

/**
 * Les comptes à prévenir : ceux qui suivent l'élément, et ses acteurs. Une
 * carte a deux sources de suiveurs : ceux qui suivent la carte, et ceux qui
 * suivent la liste où elle se trouve — suivre une liste, c'est suivre ses
 * cartes. Une même personne peut être à plusieurs titres : elle n'est
 * prévenue qu'une fois.
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
  for (const personne of acteurs[fait.kind].all(fait.targetId, fait.auteur.id)) {
    parId.set(personne.id, personne);
  }
  for (const id of fait.sauf ?? []) parId.delete(id);
  // Qui ne voit plus l'élément — ses permissions ont changé depuis qu'il le
  // suit — n'en est plus prévenu.
  return [...parId.values()].filter((p) => can(droitsSocietes(p), domaines[fait.kind], "view"));
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
    const expediteur = fait.base ? boiteDEnvoi() : "";

    for (const personne of destinataires) {
      notifications.emettre(personne.id, {
        id: crypto.randomBytes(8).toString("hex"),
        kind: fait.kind,
        target_id: fait.targetId,
        title: fait.titre,
        message: fait.message,
        author: fait.auteur.name || fait.auteur.email,
        deleted: false,
        created_at: quand,
      } satisfies Notification);

      if (expediteur) empiler(personne, fait, lien, expediteur);
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

// --- Rattachement d'un acteur ---------------------------------------------

export interface Rattachement {
  /** L'élément où la personne arrive : un projet, une carte. */
  kind: "project" | "card";
  targetId: Id;
  /** Le nom de l'élément, tel qu'il s'affiche. */
  titre: string;
  /**
   * Ce qui vient de se passer, adressé à la personne : « vous a ajouté comme
   * acteur », « vous a ajouté à l'élément « … » d'une checklist ».
   */
  message: string;
  /** Les comptes qui viennent d'arriver. */
  destinataires: Id[];
  auteur: Auteur;
  base: string;
}

/**
 * Une personne rattachée à un élément — acteur d'un projet ou d'une carte,
 * personne d'un élément de checklist — : une notification à l'écran, et un
 * e-mail aussitôt, sans attendre la fenêtre des modifications : on veut
 * savoir tout de suite qu'une part du travail nous revient. On ne se prévient
 * pas soi-même, ni qui ne voit pas l'élément. Ne lève jamais : le
 * rattachement est déjà enregistré.
 *
 * Rend les comptes prévenus : la notification de modification du même geste
 * les écarte (`Fait.sauf`), pour ne pas les prévenir deux fois.
 */
export const notifierRattachement = (r: Rattachement): Id[] => {
  const prevenus: Id[] = [];
  try {
    const quand = now();
    const lien = `${r.base}/${lienElement(r.kind, r.targetId)}`;
    const boite = r.base ? boiteDEnvoi() : "";
    const qui = r.auteur.name || r.auteur.email;

    for (const id of new Set(r.destinataires)) {
      if (id === r.auteur.id) continue;
      const personne = users.byId.get(id);
      if (!personne || personne.system) continue;
      if (!can(droitsSocietes(personne), domaines[r.kind], "view")) continue;

      notifications.emettre(personne.id, {
        id: crypto.randomBytes(8).toString("hex"),
        kind: r.kind,
        target_id: r.targetId,
        title: r.titre,
        message: r.message,
        author: qui,
        deleted: false,
        created_at: quand,
      } satisfies Notification);
      prevenus.push(personne.id);

      if (!boite || !personne.email) continue;
      envoyerCourrier({
        from: boite,
        to: personne.email,
        subject: `Milo — ${r.titre}`,
        ...gabarit({
          titre: r.titre,
          intro: `${qui} ${r.message}.`,
          action: { url: lien, libelle: "Ouvrir dans Milo" },
          pied: "Vous recevez ce message parce que vous avez été ajouté à cet élément dans Milo.",
        }),
      }).catch((erreur: unknown) => {
        console.error("Notification de rattachement non remise :", erreur);
      });
    }
  } catch (erreur) {
    console.error("Notification de rattachement abandonnée :", erreur);
  }
  return prevenus;
};

// --- Rappel d'une échéance ------------------------------------------------

export interface RappelEcheance {
  carte: { id: Id; text: string };
  /** Ce que dit le rappel : « vous rappelle l'échéance du 5 octobre à 17:00 ». */
  message: string;
  destinataires: Id[];
  /** La racine de l'application (MILO_PUBLIC_URL) ; vide, l'e-mail ne part pas. */
  base: string;
}

/**
 * Le rappel d'une échéance : il vient de Milo, pas d'une personne. Une
 * notification à l'écran et un e-mail à chaque acteur de la carte qui la voit
 * encore. Ne lève jamais.
 */
export const notifierRappel = (r: RappelEcheance): void => {
  try {
    const quand = now();
    const lien = `${r.base}/${lienElement("card", r.carte.id)}`;
    const boite = r.base ? boiteDEnvoi() : "";

    for (const id of new Set(r.destinataires)) {
      const personne = users.byId.get(id);
      if (!personne || personne.system) continue;
      if (!can(droitsSocietes(personne), "tasks", "view")) continue;

      notifications.emettre(personne.id, {
        id: crypto.randomBytes(8).toString("hex"),
        kind: "card",
        target_id: r.carte.id,
        title: r.carte.text,
        message: r.message,
        author: "Milo",
        deleted: false,
        created_at: quand,
      } satisfies Notification);

      if (!boite || !personne.email) continue;
      envoyerCourrier({
        from: boite,
        to: personne.email,
        subject: `Milo — ${r.carte.text}`,
        ...gabarit({
          titre: r.carte.text,
          intro: `Milo ${r.message}.`,
          action: { url: lien, libelle: "Ouvrir dans Milo" },
          pied: "Vous recevez ce message parce que vous êtes acteur de cette tâche dans Milo.",
        }),
      }).catch((erreur: unknown) => {
        console.error("Rappel d'échéance non remis :", erreur);
      });
    }
  } catch (erreur) {
    console.error("Rappel d'échéance abandonné :", erreur);
  }
};

// --- Assignation d'un ticket ------------------------------------------------

export interface Assignation {
  /** La demande, son numéro de ticket et son objet. */
  demande: { id: Id; number: number; subject: string };
  /** Les comptes qui viennent d'y être assignés. */
  destinataires: UserRow[];
  auteur: UserRow;
  base: string;
}

/**
 * Une personne assignée à des demandes : une notification à l'écran par
 * demande, tout de suite, et un seul e-mail par personne qui les liste
 * toutes — assigner dix tickets d'un coup n'envoie pas dix e-mails.
 * On ne se prévient pas soi-même. Ne lève jamais : l'assignation est déjà
 * enregistrée.
 */
export const notifierAssignations = (assignations: Assignation[]): void => {
  try {
    const quand = now();
    const courriers = new Map<string, { personne: UserRow; boite: string; lignes: Ligne[]; lien: string; base: string; auteur: UserRow }>();

    for (const { demande, destinataires, auteur, base } of assignations) {
      const titre = titreDemande(demande);
      const lien = `${base}/${lienElement("support", demande.id)}`;
      const boite = boiteDEnvoi();

      for (const personne of destinataires) {
        if (personne.id === auteur.id) continue;
        notifications.emettre(personne.id, {
          id: crypto.randomBytes(8).toString("hex"),
          kind: "support",
          target_id: demande.id,
          title: titre,
          message: "vous a assigné cette demande",
          author: auteur.name || auteur.email,
          deleted: false,
          created_at: quand,
        } satisfies Notification);

        if (!boite || !personne.email) continue;
        const cleEnvoi = String(personne.id);
        const courant = courriers.get(cleEnvoi);
        if (courant) courant.lignes.push({ texte: titre, repetitions: 1 });
        else {
          courriers.set(cleEnvoi, {
            personne,
            boite,
            lignes: [{ texte: titre, repetitions: 1 }],
            lien,
            base,
            auteur,
          });
        }
      }
    }

    for (const { personne, boite, lignes, lien, base, auteur } of courriers.values()) {
      const qui = auteur.name || auteur.email;
      const une = lignes.length === 1;
      envoyerCourrier({
        from: boite,
        to: personne.email,
        subject: une ? `Milo — ${lignes[0]!.texte}` : `Milo — ${lignes.length} demandes vous sont assignées`,
        ...gabarit({
          titre: une ? "Demande assignée" : "Demandes assignées",
          intro: une
            ? `${qui} vous a assigné cette demande :`
            : `${qui} vous a assigné ces ${lignes.length} demandes :`,
          lignes,
          // Une seule demande : le lien l'ouvre. Plusieurs : il ouvre Milo,
          // où elles attendent dans le mode Support.
          action: { url: une ? lien : base, libelle: "Ouvrir dans Milo" },
          pied: "Vous recevez ce message parce qu'un ticket vous a été assigné dans Milo.",
        }),
      }).catch((erreur: unknown) => {
        console.error("Notification d'assignation non remise :", erreur);
      });
    }
  } catch (erreur) {
    console.error("Notification d'assignation abandonnée :", erreur);
  }
};

// --- Suppressions ----------------------------------------------------------
//
// Supprimer un élément prévient ceux qui s'y trouvaient engagés : les autres
// acteurs d'un projet ou d'un ticket, et ceux qui les suivent ;
// dans le mode Tâches, ceux qui suivent la carte, la liste ou le tableau. La
// notification passe à l'écran et se range dans « Notifications », sans
// e-mail : ce qu'elle annonce est fait, et un lien n'ouvrirait plus rien.
//
// Les destinataires se lisent AVANT la suppression : après, les acteurs et
// les cartes sont partis avec l'élément.

/** Une requête sur un seul élément, nommé « @id » autant de fois qu'il le faut. */
const idsDe = (sql: string) => {
  const requete = selection<{ user_id: Id }>(sql);
  return (id: Id): Id[] => requete.all({ id }).map((l) => l.user_id);
};

/** Qui est concerné par un élément, pour lui annoncer sa suppression. */
export const concernes = {
  /** Les acteurs du projet et ceux qui le suivent. */
  projet: idsDe(
    `SELECT user_id FROM project_actors WHERE project_id = @id
     UNION SELECT user_id FROM follows WHERE kind = 'project' AND target_id = @id`,
  ),
  /** Les acteurs de la demande et ceux qui la suivent. */
  demande: idsDe(
    `SELECT user_id FROM support_request_actors WHERE request_id = @id
     UNION SELECT user_id FROM follows WHERE kind = 'support' AND target_id = @id`,
  ),
  /** Ceux qui suivent la carte, et ceux qui suivent sa liste. */
  carte: idsDe(
    `SELECT user_id FROM follows WHERE kind = 'card' AND target_id = @id
     UNION SELECT user_id FROM follows
      WHERE kind = 'list' AND target_id = (SELECT list_id FROM task_cards WHERE id = @id)`,
  ),
  /** Ceux qui suivent la liste, et ceux qui suivent l'une de ses cartes. */
  liste: idsDe(
    `SELECT user_id FROM follows WHERE kind = 'list' AND target_id = @id
     UNION SELECT user_id FROM follows
      WHERE kind = 'card' AND target_id IN (SELECT id FROM task_cards WHERE list_id = @id)`,
  ),
  /** Ceux qui suivent l'une des listes du tableau, ou l'une de ses cartes. */
  tableau: idsDe(
    `SELECT user_id FROM follows
      WHERE kind = 'list' AND target_id IN (SELECT id FROM task_lists WHERE board_id = @id)
     UNION SELECT user_id FROM follows
      WHERE kind = 'card' AND target_id IN (
        SELECT t.id FROM task_cards t JOIN task_lists l ON l.id = t.list_id WHERE l.board_id = @id
      )`,
  ),
};

export interface Suppression {
  /** La famille de l'élément : « card » vaut pour tout le mode Tâches. */
  kind: NotificationKind;
  targetId: Id;
  /** Le nom de l'élément touché. */
  titre: string;
  /** Ce qui a été supprimé, à la troisième personne : « a supprimé le projet ». */
  message: string;
  auteur: Auteur;
  /** Les comptes à prévenir, lus avant la suppression (voir `concernes`). */
  destinataires: Id[];
  /**
   * Vrai quand c'est l'élément lui-même qui disparaît. Faux quand c'est une
   * partie de lui — un commentaire, une pièce jointe — : il s'ouvre toujours.
   */
  disparu: boolean;
}

/** Annonce une suppression. Ne lève jamais : la suppression est déjà faite. */
export const notifierSuppression = (suppression: Suppression): void => {
  try {
    const quand = now();
    for (const userId of new Set(suppression.destinataires)) {
      if (userId === suppression.auteur.id) continue;
      notifications.emettre(userId, {
        id: crypto.randomBytes(8).toString("hex"),
        kind: suppression.kind,
        target_id: suppression.targetId,
        title: suppression.titre,
        message: suppression.message,
        author: suppression.auteur.name || suppression.auteur.email,
        deleted: suppression.disparu,
        created_at: quand,
      } satisfies Notification);
    }
  } catch (erreur) {
    console.error("Notification de suppression abandonnée :", erreur);
  }
};

/** Le nom d'un ticket, tel que les notifications l'affichent. */
export const titreDemande = (demande: { number: number; subject: string }): string =>
  `${supportTicketRef(demande.number)}${demande.subject ? ` — ${demande.subject}` : ""}`;
