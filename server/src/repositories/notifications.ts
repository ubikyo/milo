// Les notifications reçues : ce que le tiroir « Notifications » relit. Chaque
// notification poussée à l'écran y est aussi rangée, et y reste jusqu'à ce que
// la personne la supprime — ou qu'elle soit trop ancienne pour être gardée.

import type { Id, Notification } from "@milo/shared";
import { mutation, selection, transaction } from "../db/query.js";
import { pousserNotification } from "../middleware/events.js";

/** Ce qu'on garde par personne : au-delà, les plus anciennes s'en vont. */
const GARDEES = 200;

const inserer = mutation(
  `INSERT INTO notifications (id, user_id, kind, target_id, title, message, author, deleted, created_at)
   VALUES (@id, @user_id, @kind, @target_id, @title, @message, @author, @deleted, @created_at)`,
);

const elaguer = mutation(
  `DELETE FROM notifications
    WHERE user_id = ?
      AND id NOT IN (
        SELECT id FROM notifications WHERE user_id = ?
         ORDER BY created_at DESC, rowid DESC LIMIT ${GARDEES}
      )`,
);

type NotificationRow = Omit<Notification, "deleted"> & { deleted: 0 | 1 };

const deQui = selection<NotificationRow>(
  `SELECT id, kind, target_id, title, message, author, deleted, created_at
     FROM notifications WHERE user_id = ?
    ORDER BY created_at DESC, rowid DESC`,
);

const retirer = mutation("DELETE FROM notifications WHERE id = ? AND user_id = ?");
const toutRetirer = mutation("DELETE FROM notifications WHERE user_id = ?");

const ranger = transaction((userId: Id, notification: Notification) => {
  inserer.run({ ...notification, deleted: notification.deleted ? 1 : 0, user_id: userId });
  elaguer.run(userId, userId);
});

export const notifications = {
  /**
   * Une notification pour une personne : rangée, puis poussée à ses onglets
   * ouverts. Rangée d'abord — un onglet qui la reçoit et ouvre aussitôt le
   * tiroir doit l'y trouver.
   */
  emettre: (userId: Id, notification: Notification): void => {
    ranger(userId, notification);
    pousserNotification(userId, notification);
  },
  /** Les notifications d'une personne, de la plus récente à la plus ancienne. */
  deQui: (userId: Id): Notification[] =>
    deQui.all(userId).map((ligne) => ({ ...ligne, deleted: ligne.deleted === 1 })),
  retirer: (id: string, userId: Id): void => void retirer.run(id, userId),
  toutRetirer: (userId: Id): void => void toutRetirer.run(userId),
};
