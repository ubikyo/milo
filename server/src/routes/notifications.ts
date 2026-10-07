// The signed-in person's notifications: the "Notifications" drawer reads
// them, deletes them one by one or all at once. Everyone only sees and
// deletes their own — none without the right to on-screen notifications.

import { Router } from "express";
import { notifications } from "../repositories/notifications.js";
import { notificationRights } from "../repositories/users.js";

export const notificationRoutes = Router();

notificationRoutes.get("/", (req, res) => {
  res.json(notificationRights(req.user).screen ? notifications.forUser(req.user.id) : []);
});

notificationRoutes.delete("/", (req, res) => {
  notifications.removeAll(req.user.id);
  res.status(204).end();
});

notificationRoutes.delete("/:id", (req, res) => {
  notifications.remove(String(req.params.id), req.user.id);
  res.status(204).end();
});
