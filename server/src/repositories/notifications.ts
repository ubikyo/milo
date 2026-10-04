// Received notifications: what the "Notifications" drawer re-reads. Each
// notification pushed to the screen is also stored here, and stays until the
// person deletes it — or it is too old to be kept.

import type { Id, Notification } from "@milo/shared";
import { mutation, selection, transaction } from "../db/query.js";
import { pushNotification } from "../middleware/events.js";

/** What is kept per person: beyond this, the oldest go away. */
const KEPT_COUNT = 200;

const insert = mutation(
  `INSERT INTO notifications (id, user_id, kind, target_id, title, message, author, deleted, created_at)
   VALUES (@id, @user_id, @kind, @target_id, @title, @message, @author, @deleted, @created_at)`,
);

const prune = mutation(
  `DELETE FROM notifications
    WHERE user_id = ?
      AND id NOT IN (
        SELECT id FROM notifications WHERE user_id = ?
         ORDER BY created_at DESC, rowid DESC LIMIT ${KEPT_COUNT}
      )`,
);

type NotificationRow = Omit<Notification, "deleted"> & { deleted: 0 | 1 };

const forUser = selection<NotificationRow>(
  `SELECT id, kind, target_id, title, message, author, deleted, created_at
     FROM notifications WHERE user_id = ?
    ORDER BY created_at DESC, rowid DESC`,
);

const remove = mutation("DELETE FROM notifications WHERE id = ? AND user_id = ?");
const removeAll = mutation("DELETE FROM notifications WHERE user_id = ?");

const store = transaction((userId: Id, notification: Notification) => {
  insert.run({ ...notification, deleted: notification.deleted ? 1 : 0, user_id: userId });
  prune.run(userId, userId);
});

export const notifications = {
  /**
   * A notification for a person: stored, then pushed to their open tabs.
   * Stored first — a tab that receives it and immediately opens the drawer
   * must find it there.
   */
  emit: (userId: Id, notification: Notification): void => {
    store(userId, notification);
    pushNotification(userId, notification);
  },
  /** A person's notifications, from most recent to oldest. */
  forUser: (userId: Id): Notification[] =>
    forUser.all(userId).map((row) => ({ ...row, deleted: row.deleted === 1 })),
  remove: (id: string, userId: Id): void => void remove.run(id, userId),
  removeAll: (userId: Id): void => void removeAll.run(userId),
};
