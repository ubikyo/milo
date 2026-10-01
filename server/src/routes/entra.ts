// L'onglet Entra du Paramétrage : l'application, le groupe des
// administrateurs, l'adresse d'expédition, et les vérifications — un message
// d'essai, l'accès aux boîtes de support des sociétés.

import { Router } from "express";
import type { MailboxCheck } from "@milo/shared";
import { selection } from "../db/query.js";
import { lireMessages, modifierEntra, reglagesEntraPublics } from "../lib/entra.js";
import { badRequest, requireText } from "../lib/http.js";
import { envoyerLeTest } from "../lib/mail.js";

const boitesDeSupport = selection<{ id: number; name: string; support_email: string }>(
  "SELECT id, name, support_email FROM companies WHERE support_email != '' ORDER BY name",
);

export const entraRoutes = Router();

entraRoutes.get("/", (_req, res) => {
  res.json(reglagesEntraPublics());
});

entraRoutes.put("/", (req, res) => {
  modifierEntra(req.body ?? {});
  res.json(reglagesEntraPublics());
});

entraRoutes.post("/test", (req, res, next) => {
  const destinataire = requireText(req.body?.to, "L'adresse de test est requise");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(destinataire)) badRequest("Adresse de test invalide");
  envoyerLeTest(destinataire, Number(req.body?.company_id))
    .then(() => res.json({ sent_to: destinataire }))
    .catch(next);
});

/**
 * Milo peut-il lire la boîte de support de chaque société ? La lecture d'un
 * message suffit à le savoir : une permission Mail.Read absente, ou une
 * stratégie d'accès qui écarte la boîte, s'y voient tout de suite.
 */
entraRoutes.get("/mailboxes", (_req, res, next) => {
  Promise.all(
    boitesDeSupport.all().map(async (societe): Promise<MailboxCheck> => {
      try {
        await lireMessages(societe.support_email, 1);
        return {
          company_id: societe.id,
          company_name: societe.name,
          email: societe.support_email,
          ok: true,
          error: "",
        };
      } catch (erreur) {
        return {
          company_id: societe.id,
          company_name: societe.name,
          email: societe.support_email,
          ok: false,
          error: erreur instanceof Error ? erreur.message : "Accès refusé",
        };
      }
    }),
  )
    .then((resultats) => res.json(resultats))
    .catch(next);
});
