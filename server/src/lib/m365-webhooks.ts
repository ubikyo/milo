// Graph change notifications for Mail and Calendar widgets: Microsoft notifies
// Milo as soon as an e-mail arrives in a folder a Mail widget reads, or an
// appointment is created, moved or removed in a calendar a Calendar widget
// shows, and the people reading it reread without waiting for the widget's
// periodic reread — which stays, in case a notification gets lost.
//
// Unlike support inboxes, what these widgets read depends on who looks at
// them (everyone sees their own mailbox and calendar): resources are
// subscribed to on demand, when a widget reads them (routes/board-widgets.ts),
// and the subscription is dropped once nobody has read them for a while.
//
// Like support (lib/support-webhooks.ts), this requires a public https address
// (MILO_PUBLIC_URL). Without it, nothing is requested from Graph.

import crypto from "node:crypto";
import type { Id, M365Change } from "@milo/shared";
import { env } from "../env.js";
import { pushM365Change } from "../middleware/events.js";
import { readSetting, writeSetting } from "../repositories/settings.js";
import { deleteSubscription, renewSubscription, subscribeTo } from "./entra.js";
import { activeNotifications } from "./support-webhooks.js";

/** The path Microsoft calls, under the public address. */
export const M365_NOTIFICATIONS_PATH = "/api/m365/notifications";

/** The time between two subscription maintenance runs. */
export const M365_MAINTENANCE_INTERVAL = 30 * 60 * 1000;

// A resource nobody reads is no longer worth a subscription: the widgets
// reread every few minutes, so an open page keeps it well within this.
const IDLE_AFTER = 60 * 60 * 1000;
// Short-lived: a subscription forgotten by a stopped Milo dies on its own.
const SUBSCRIPTION_DURATION = 24 * 60 * 60 * 1000;
const RENEWAL_MARGIN = 6 * 60 * 60 * 1000;

const SUBSCRIPTIONS_KEY = "m365_widget_subscriptions";
const SECRET_KEY = "m365_widget_webhook_secret";

/** What each kind of widget is told of. */
const CHANGES: Record<M365Change, string> = {
  mail: "created",
  calendar: "created,updated,deleted",
};

/** Each resource's subscription, by its Graph path. */
type Subscriptions = Record<string, { id: string; expiresAt: string; kind: M365Change }>;

/**
 * Who reads each resource, and when they last did: the people to notify. In
 * memory only — after a restart, the widgets' next reread fills it again.
 */
const readers = new Map<string, Map<Id, number>>();

/** The resources a subscription is being created for: two rereads do not create two. */
const creating = new Set<string>();

const notificationsSecret = (): string => {
  const already = readSetting<string>(SECRET_KEY, "");
  if (already) return already;
  const secret = crypto.randomBytes(24).toString("hex");
  writeSetting(SECRET_KEY, secret);
  return secret;
};

const expiration = () => new Date(Date.now() + SUBSCRIPTION_DURATION).toISOString();

/** A folder's messages: "inbox", or its id. */
export const folderResource = (mailbox: string, folder: string): string =>
  `users/${mailbox}/mailFolders('${folder}')/messages`;

/** A calendar's events: its id, or empty for the main one. */
export const calendarResource = (user: string, calendar = ""): string =>
  calendar ? `users/${user}/calendars/${calendar}/events` : `users/${user}/events`;

/**
 * A person read this resource through a widget: they will be told of what
 * changes in it, and the resource gets its subscription if it has none yet.
 */
export const watch = (userId: Id, kind: M365Change, resource: string): void => {
  if (!activeNotifications()) return;
  const who = readers.get(resource) ?? new Map<Id, number>();
  who.set(userId, Date.now());
  readers.set(resource, who);

  if (creating.has(resource) || readSetting<Subscriptions>(SUBSCRIPTIONS_KEY, {})[resource]) return;
  creating.add(resource);
  const url = `${env.publicUrl}${M365_NOTIFICATIONS_PATH}`;
  subscribeTo(resource, CHANGES[kind], url, notificationsSecret(), expiration())
    .then((created) => {
      const subscriptions = readSetting<Subscriptions>(SUBSCRIPTIONS_KEY, {});
      subscriptions[resource] = { id: created.id, expiresAt: created.expirationDateTime, kind };
      writeSetting(SUBSCRIPTIONS_KEY, subscriptions);
    })
    .catch((error) => console.error(`Subscription to ${resource}:`, error))
    .finally(() => creating.delete(resource));
};

/** What Graph sends for each change. */
export interface M365Notification {
  subscriptionId?: string;
  clientState?: string;
}

/** Graph says something changed: the people who read it reread. */
export const receiveNotifications = (notifications: M365Notification[]): void => {
  const secret = notificationsSecret();
  const subscriptions = readSetting<Subscriptions>(SUBSCRIPTIONS_KEY, {});
  const byId = new Map(Object.entries(subscriptions).map(([resource, s]) => [s.id, { resource, ...s }]));
  const recipients: Record<M365Change, Set<Id>> = { mail: new Set(), calendar: new Set() };
  for (const n of notifications) {
    if (n.clientState !== secret || !n.subscriptionId) continue;
    const s = byId.get(n.subscriptionId);
    if (!s) continue;
    for (const userId of readers.get(s.resource)?.keys() ?? []) recipients[s.kind].add(userId);
  }
  for (const kind of ["mail", "calendar"] as const) {
    if (recipients[kind].size) pushM365Change(recipients[kind], kind);
  }
};

/**
 * The subscriptions of resources still read are extended before they expire;
 * those nobody reads any more are deleted, as are the readers who have stopped.
 */
export const maintainM365Subscriptions = async (): Promise<void> => {
  if (!activeNotifications()) return;
  const now = Date.now();
  for (const [resource, who] of readers) {
    for (const [userId, at] of who) if (now - at > IDLE_AFTER) who.delete(userId);
    if (!who.size) readers.delete(resource);
  }

  const subscriptions = readSetting<Subscriptions>(SUBSCRIPTIONS_KEY, {});
  const kept: Subscriptions = {};
  for (const [resource, current] of Object.entries(subscriptions)) {
    if (!readers.has(resource)) {
      await deleteSubscription(current.id).catch(() => {});
      continue;
    }
    if (Date.parse(current.expiresAt) - now > RENEWAL_MARGIN) {
      kept[resource] = current;
      continue;
    }
    // Expired or deleted at Microsoft: dropped, the next read recreates it.
    try {
      const extended = await renewSubscription(current.id, expiration());
      kept[resource] = { ...current, expiresAt: extended.expirationDateTime };
    } catch {
      /* recreated by watch */
    }
  }
  // What watch recorded meanwhile is kept.
  const meanwhile = readSetting<Subscriptions>(SUBSCRIPTIONS_KEY, {});
  for (const [resource, value] of Object.entries(meanwhile)) {
    if (!(resource in subscriptions)) kept[resource] = value;
  }
  writeSetting(SUBSCRIPTIONS_KEY, kept);
};
