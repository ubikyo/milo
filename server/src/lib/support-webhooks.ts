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
import { receivedMailboxes } from "../repositories/inboxes.js";
import { readSetting, writeSetting } from "../repositories/settings.js";
import {
  createSubscription,
  entraConfigured,
  renewSubscription,
  deleteSubscription,
} from "./entra.js";

/** Le chemin que Microsoft appelle, sous l'adresse publique. */
export const NOTIFICATIONS_PATH = "/api/support-mail/notifications";

/** Le temps entre deux entretiens des abonnements. */
export const MAINTENANCE_INTERVAL = 6 * 60 * 60 * 1000;

// Graph accepte un peu moins de sept jours pour un abonnement aux messages.
const SUBSCRIPTION_DURATION = 6 * 24 * 60 * 60 * 1000;
// Renouvelé dès qu'il lui reste moins de deux jours : un entretien manqué ne
// le laisse pas expirer.
const RENEWAL_MARGIN = 2 * 24 * 60 * 60 * 1000;

const SUBSCRIPTIONS_KEY = "support_mail_subscriptions";
const SECRET_KEY = "support_mail_webhook_secret";

/** L'abonnement de chaque boîte, par adresse en minuscules. */
type Subscriptions = Record<string, { id: string; expiresAt: string }>;


/**
 * Le secret que Graph renvoie avec chaque notification (« clientState ») :
 * une notification qui ne le porte pas ne vient pas de nos abonnements.
 */
export const notificationsSecret = (): string => {
  const already = readSetting<string>(SECRET_KEY, "");
  if (already) return already;
  const secret = crypto.randomBytes(24).toString("hex");
  writeSetting(SECRET_KEY, secret);
  return secret;
};

export const activeNotifications = (): boolean =>
  entraConfigured() && env.publicUrl.startsWith("https://");

let alreadyReported = false;

/**
 * Chaque boîte de support a son abonnement, et il ne va pas expirer : ceux
 * qui approchent de leur fin sont prolongés, ceux qui manquent créés, ceux des
 * boîtes qui ne sont plus de support supprimés. Une boîte qui échoue
 * n'empêche pas les autres.
 */
export const maintainSubscriptions = async (): Promise<void> => {
  if (!activeNotifications()) {
    if (!alreadyReported && entraConfigured()) {
      console.log(
        "Notifications de Graph inactives : MILO_PUBLIC_URL (en https) n'est pas réglée. La relève périodique suffit.",
      );
      alreadyReported = true;
    }
    return;
  }

  const url = `${env.publicUrl}${NOTIFICATIONS_PATH}`;
  const secret = notificationsSecret();
  const subscriptions = readSetting<Subscriptions>(SUBSCRIPTIONS_KEY, {});
  const nextItems: Subscriptions = {};
  const expiration = () => new Date(Date.now() + SUBSCRIPTION_DURATION).toISOString();
  const mailboxes = new Set(receivedMailboxes().map((b) => b.value.toLowerCase()));

  for (const mailbox of mailboxes) {
    const current = subscriptions[mailbox];
    try {
      if (current && Date.parse(current.expiresAt) - Date.now() > RENEWAL_MARGIN) {
        nextItems[mailbox] = current;
        continue;
      }
      if (current) {
        try {
          const extended = await renewSubscription(current.id, expiration());
          nextItems[mailbox] = { id: extended.id, expiresAt: extended.expirationDateTime };
          continue;
        } catch {
          // Expiré ou supprimé chez Microsoft : il se recrée ci-dessous.
        }
      }
      const created = await createSubscription(mailbox, url, secret, expiration());
      nextItems[mailbox] = { id: created.id, expiresAt: created.expirationDateTime };
    } catch (error) {
      console.error(`Abonnement aux e-mails de ${mailbox} :`, error);
    }
  }

  // Les boîtes qui ne sont plus celles d'une société n'ont plus à prévenir.
  for (const [mailbox, { id }] of Object.entries(subscriptions)) {
    if (mailboxes.has(mailbox)) continue;
    await deleteSubscription(id).catch(() => {});
  }

  writeSetting(SUBSCRIPTIONS_KEY, nextItems);
};
