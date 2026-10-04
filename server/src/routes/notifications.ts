// Les notifications de la personne connectée : le tiroir « Notifications »
// les lit, les supprime une à une ou toutes d'un coup. Chacun ne voit et ne
// supprime que les siennes.

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
