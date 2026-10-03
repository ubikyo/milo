// L'onglet Entra du Paramétrage : l'application, le groupe des
// administrateurs, l'adresse d'expédition, et les vérifications — un message
// d'essai, l'accès aux boîtes de support que les listes de demandes reçoivent.

import { Router } from "express";
import type { MailboxCheck } from "@milo/shared";
import {
  adresseDEnvoi,
  connecterEntra,
  etatEntra,
  lireMessages,
  modifierEntra,
  reglagesEntraPublics,
} from "../lib/entra.js";
import { badRequest, requireText } from "../lib/http.js";
import { envoyerLeTest } from "../lib/mail.js";
import { boitesConfigurees } from "../repositories/receptions.js";

export const entraRoutes = Router();

entraRoutes.get("/", (_req, res) => {
  res.json(reglagesEntraPublics());
});

entraRoutes.put("/", (req, res) => {
  modifierEntra(req.body ?? {});
  res.json(reglagesEntraPublics());
});

// L'état de la connexion de Milo à Entra, et les deux actions qui le changent.
entraRoutes.get("/status", (_req, res, next) => {
  etatEntra()
    .then((etat) => res.json(etat))
    .catch(next);
});

entraRoutes.post("/connect", (_req, res, next) => {
  connecterEntra(true);
  etatEntra()
    .then((etat) => res.json(etat))
    .catch(next);
});

entraRoutes.post("/disconnect", (_req, res, next) => {
  connecterEntra(false);
  etatEntra()
    .then((etat) => res.json(etat))
    .catch(next);
});

entraRoutes.post("/test", (req, res, next) => {
  const destinataire = requireText(req.body?.to, "L'adresse de test est requise");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(destinataire)) badRequest("Adresse de test invalide");
  envoyerLeTest(destinataire)
    .then(() => res.json({ sent_to: destinataire }))
    .catch(next);
});

/**
 * Milo peut-il lire l'adresse d'envoi et chaque boîte que les listes de
 * demandes reçoivent ? La lecture d'un message suffit à le savoir : une
 * permission Mail.Read absente, ou une stratégie d'accès qui écarte la boîte,
 * s'y voient tout de suite.
 */
entraRoutes.get("/mailboxes", (_req, res, next) => {
  const boites = new Map<string, { email: string; usages: string[] }>();
  const ajouter = (email: string, usage: string) => {
    const deja = boites.get(email.toLowerCase());
    if (deja) deja.usages.push(usage);
    else boites.set(email.toLowerCase(), { email, usages: [usage] });
  };
  const expediteur = adresseDEnvoi();
  if (expediteur) ajouter(expediteur, "Adresse d'envoi");
  // Toutes celles que les listes disent, confirmées ou non : une boîte qui
  // attend sa confirmation doit déjà être lisible.
  for (const boite of boitesConfigurees()) ajouter(boite.valeur, boite.usage);

  Promise.all(
    [...boites.values()].map(async ({ email, usages }): Promise<MailboxCheck> => {
      const usage = usages.join(", ");
      try {
        await lireMessages(email, 1);
        return { email, usage, ok: true, error: "" };
      } catch (erreur) {
        return {
          email,
          usage,
          ok: false,
          error: erreur instanceof Error ? erreur.message : "Accès refusé",
        };
      }
    }),
  )
    .then((resultats) => res.json(resultats))
    .catch(next);
});
