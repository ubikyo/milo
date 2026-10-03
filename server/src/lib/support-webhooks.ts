// Les notifications de changement de Graph : Microsoft prévient Milo dès qu'un
// e-mail arrive dans une boîte de support, et Milo relève aussitôt, sans
// attendre la relève périodique — qui reste, au cas où une notification se
// perdrait.
//
// Il y faut une adresse publique en https (MILO_PUBLIC_URL) : c'est Microsoft
// qui l'appelle. Sans elle, rien n'est demandé à Graph.
//
// Un abonnement à une boîte de réception vit au plus sept jours : ils sont
// renouvelés régulièrement, et recréés s'ils ont disparu.

import crypto from "node:crypto";
import { env } from "../env.js";
import { boitesRecues } from "../repositories/receptions.js";
import { readSetting, writeSetting } from "../repositories/settings.js";
import {
  creerAbonnement,
  entraConfiguree,
  renouvelerAbonnement,
  supprimerAbonnement,
} from "./entra.js";

/** Le chemin que Microsoft appelle, sous l'adresse publique. */
export const CHEMIN_NOTIFICATIONS = "/api/support-mail/notifications";

/** Le temps entre deux entretiens des abonnements. */
export const INTERVALLE_ENTRETIEN = 6 * 60 * 60 * 1000;

// Graph accepte un peu moins de sept jours pour un abonnement aux messages.
const DUREE_ABONNEMENT = 6 * 24 * 60 * 60 * 1000;
// Renouvelé dès qu'il lui reste moins de deux jours : un entretien manqué ne
// le laisse pas expirer.
const MARGE_RENOUVELLEMENT = 2 * 24 * 60 * 60 * 1000;

const CLE_ABONNEMENTS = "support_mail_subscriptions";
const CLE_SECRET = "support_mail_webhook_secret";

/** L'abonnement de chaque boîte, par adresse en minuscules. */
type Abonnements = Record<string, { id: string; expire: string }>;


/**
 * Le secret que Graph renvoie avec chaque notification (« clientState ») :
 * une notification qui ne le porte pas ne vient pas de nos abonnements.
 */
export const secretDesNotifications = (): string => {
  const deja = readSetting<string>(CLE_SECRET, "");
  if (deja) return deja;
  const secret = crypto.randomBytes(24).toString("hex");
  writeSetting(CLE_SECRET, secret);
  return secret;
};

export const notificationsActives = (): boolean =>
  entraConfiguree() && env.publicUrl.startsWith("https://");

let dejaSignale = false;

/**
 * Chaque boîte de support a son abonnement, et il ne va pas expirer : ceux
 * qui approchent de leur fin sont prolongés, ceux qui manquent créés, ceux des
 * boîtes qui ne sont plus de support supprimés. Une boîte qui échoue
 * n'empêche pas les autres.
 */
export const entretenirAbonnements = async (): Promise<void> => {
  if (!notificationsActives()) {
    if (!dejaSignale && entraConfiguree()) {
      console.log(
        "Notifications de Graph inactives : MILO_PUBLIC_URL (en https) n'est pas réglée. La relève périodique suffit.",
      );
      dejaSignale = true;
    }
    return;
  }

  const url = `${env.publicUrl}${CHEMIN_NOTIFICATIONS}`;
  const secret = secretDesNotifications();
  const abonnements = readSetting<Abonnements>(CLE_ABONNEMENTS, {});
  const suivants: Abonnements = {};
  const expiration = () => new Date(Date.now() + DUREE_ABONNEMENT).toISOString();
  const boites = new Set(boitesRecues().map((b) => b.valeur.toLowerCase()));

  for (const boite of boites) {
    const actuel = abonnements[boite];
    try {
      if (actuel && Date.parse(actuel.expire) - Date.now() > MARGE_RENOUVELLEMENT) {
        suivants[boite] = actuel;
        continue;
      }
      if (actuel) {
        try {
          const prolonge = await renouvelerAbonnement(actuel.id, expiration());
          suivants[boite] = { id: prolonge.id, expire: prolonge.expirationDateTime };
          continue;
        } catch {
          // Expiré ou supprimé chez Microsoft : il se recrée ci-dessous.
        }
      }
      const cree = await creerAbonnement(boite, url, secret, expiration());
      suivants[boite] = { id: cree.id, expire: cree.expirationDateTime };
    } catch (erreur) {
      console.error(`Abonnement aux e-mails de ${boite} :`, erreur);
    }
  }

  // Les boîtes qui ne sont plus celles d'une société n'ont plus à prévenir.
  for (const [boite, { id }] of Object.entries(abonnements)) {
    if (boites.has(boite)) continue;
    await supprimerAbonnement(id).catch(() => {});
  }

  writeSetting(CLE_ABONNEMENTS, suivants);
};
