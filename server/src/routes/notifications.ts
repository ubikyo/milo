// The signed-in person's notifications: the "Notifications" drawer reads
// them, deletes them one by one or all at once. Everyone only sees and
// deletes their own.

import { Router } from "express";
import { notifications } from "../repositories/notifications.js";

export const notificationRoutes = Router();

notificationRoutes.get("/", (req, res) => {
  res.json(notifications.forUser(req.user.id));
});

notificationRoutes.delete("/", (req, res) => {
  notifications.removeAll(req.user.id);
  res.status(204).end();
});

notificationRoutes.delete("/:id", (req, res) => {
  notifications.remove(String(req.params.id), req.user.id);
  res.status(204).end();
});
