// Graph change notifications: Microsoft notifies Milo as soon as an e-mail
// arrives in a support inbox, and Milo polls right away, without waiting for
// the periodic poll — which stays, in case a notification gets lost.
//
// This requires a public https address (MILO_PUBLIC_URL): Microsoft is the one
// calling it. Without it, nothing is requested from Graph.
//
// A subscription to an inbox lives at most seven days: they are renewed
// regularly, and recreated if they have disappeared.

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

/** The path Microsoft calls, under the public address. */
export const NOTIFICATIONS_PATH = "/api/support-mail/notifications";

/** The time between two subscription maintenance runs. */
export const MAINTENANCE_INTERVAL = 6 * 60 * 60 * 1000;

// Graph accepts a little under seven days for a message subscription.
const SUBSCRIPTION_DURATION = 6 * 24 * 60 * 60 * 1000;
// Renewed as soon as less than two days remain: a missed maintenance run does
// not let it expire.
const RENEWAL_MARGIN = 2 * 24 * 60 * 60 * 1000;

const SUBSCRIPTIONS_KEY = "support_mail_subscriptions";
const SECRET_KEY = "support_mail_webhook_secret";

/** Each inbox's subscription, by lowercase address. */
type Subscriptions = Record<string, { id: string; expiresAt: string }>;


/**
 * The secret Graph sends back with each notification ("clientState"): a
 * notification that does not carry it does not come from our subscriptions.
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
 * Each support inbox has its subscription, and it will not expire: those
 * nearing their end are extended, missing ones created, those of inboxes that
 * are no longer support inboxes deleted. An inbox that fails does not prevent
 * the others.
 */
export const maintainSubscriptions = async (): Promise<void> => {
  if (!activeNotifications()) {
    if (!alreadyReported && entraConfigured()) {
      console.log(
        "Graph notifications inactive: MILO_PUBLIC_URL (in https) is not set. The periodic poll is enough.",
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
          // Expired or deleted at Microsoft: it is recreated below.
        }
      }
      const created = await createSubscription(mailbox, url, secret, expiration());
      nextItems[mailbox] = { id: created.id, expiresAt: created.expirationDateTime };
    } catch (error) {
      console.error(`Subscription to e-mails of ${mailbox}:`, error);
    }
  }

  // Inboxes that no longer belong to a company no longer need to notify.
  for (const [mailbox, { id }] of Object.entries(subscriptions)) {
    if (mailboxes.has(mailbox)) continue;
    await deleteSubscription(id).catch(() => {});
  }

  writeSetting(SUBSCRIPTIONS_KEY, nextItems);
};
