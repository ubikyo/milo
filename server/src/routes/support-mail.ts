// Ce que Microsoft appelle : les notifications de changement de Graph sur les
// boîtes de support (lib/support-webhooks.ts). Sans session — c'est Microsoft
// au bout, pas une personne : c'est le secret de l'abonnement (« clientState »)
// qui dit qu'une notification vient bien de nous.

import { Router } from "express";
import { pollMailboxes } from "../lib/support-mail.js";
import { notificationsSecret } from "../lib/support-webhooks.js";

export const supportMailRoutes = Router();

interface Notification {
  clientState?: string;
}

supportMailRoutes.post("/notifications", (req, res) => {
  // La validation d'un abonnement : Graph attend son jeton en retour, en texte
  // brut, dans les dix secondes.
  const token = req.query["validationToken"];
  if (typeof token === "string") {
    res.type("text/plain").send(token);
    return;
  }

  // Graph attend une réponse rapide : la relève se fait après.
  res.status(202).end();

  const secret = notificationsSecret();
  const notifications = (req.body?.value ?? []) as Notification[];
  if (notifications.some((n) => n.clientState === secret)) {
    pollMailboxes().catch((error) => console.error("Relève sur notification :", error));
  }
});
