// La messagerie sortante : ses réglages, le consentement OAuth d'Outlook, et
// le message d'essai.

import { Router } from "express";
import type { Request } from "express";
import { randomBytes } from "node:crypto";
import { badRequest, requireText } from "../lib/http.js";
import {
  envoyerLeTest,
  modifier,
  oublierLeConsentement,
  reglagesPublics,
  terminerLeConsentement,
  urlDeConsentement,
} from "../lib/mail.js";

/**
 * L'adresse de retour du consentement. Elle se déduit de celle par laquelle on
 * nous appelle plutôt que d'être réglée à part : elle doit être exactement
 * celle qu'attend Microsoft, et c'est le README qui dit de l'inscrire dans
 * Azure — l'onglet n'a pas à la montrer pour qu'elle soit juste.
 */
const adresseDeRetour = (req: Request): string =>
  `${req.protocol}://${req.get("host")}/api/mail/oauth/callback`;

/**
 * Les demandes de consentement en cours. En mémoire, comme la limitation des
 * tentatives : un redémarrage les oublie, ce qui oblige au pire à recliquer.
 *
 * L'état porté par `state` est ce qui lie le retour de Microsoft à la demande
 * qui l'a ouvert : sans lui, n'importe qui pourrait appeler l'adresse de
 * retour avec un code à lui et rattacher sa propre boîte à notre Milo.
 */
const DUREE = 10 * 60 * 1000;

interface Demande {
  redirectUri: string;
  expire: number;
}

const demandes = new Map<string, Demande>();

const oublierLesExpirees = (): void => {
  const maintenant = Date.now();
  for (const [cle, demande] of demandes) {
    if (demande.expire < maintenant) demandes.delete(cle);
  }
};

const echapper = (texte: string): string =>
  texte.replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`);

/**
 * La page que voit la fenêtre de consentement au retour. Elle se referme
 * d'elle-même quand tout s'est bien passé ; en cas de refus elle reste
 * ouverte, le message de Microsoft étant ce qu'il y a de plus utile à lire.
 * L'onglet, lui, relit les réglages dès que la fenêtre se ferme.
 */
const pageDeRetour = (titre: string, message: string, refermer: boolean): string => `<!doctype html>
<html lang="fr">
  <head><meta charset="utf-8"><title>${echapper(titre)}</title></head>
  <body style="font-family: system-ui, sans-serif; margin: 3rem; line-height: 1.5">
    <h1 style="font-size: 1.25rem; font-weight: 500">${echapper(titre)}</h1>
    <p>${echapper(message)}</p>
    ${refermer ? "<script>setTimeout(() => window.close(), 1200)</script>" : ""}
  </body>
</html>`;

/**
 * Le retour de Microsoft, seule route de la messagerie ouverte sans session :
 * le navigateur y arrive par une redirection, sans en-tête d'authentification.
 * C'est `state` qui tient lieu de preuve — trente-deux octets tirés au sort,
 * remis à l'instant à quelqu'un d'authentifié, et valables une fois.
 */
export const publicMailRoutes = Router();

publicMailRoutes.get("/oauth/callback", (req, res, next) => {
  void (async () => {
    oublierLesExpirees();

    const state = String(req.query["state"] ?? "");
    const demande = demandes.get(state);
    demandes.delete(state);

    if (!demande) {
      res.status(400).type("html").send(
        pageDeRetour(
          "Demande inconnue",
          "Cette demande de connexion a expiré ou a déjà servi. Relancez-la depuis Paramétrage → Messagerie.",
          false,
        ),
      );
      return;
    }

    const refus = String(req.query["error_description"] ?? req.query["error"] ?? "");
    if (refus) {
      res.status(400).type("html").send(pageDeRetour("Connexion refusée", refus, false));
      return;
    }

    try {
      await terminerLeConsentement(String(req.query["code"] ?? ""), demande.redirectUri);
      res.type("html").send(
        pageDeRetour("Compte connecté", "Vous pouvez refermer cette fenêtre.", true),
      );
    } catch (erreur) {
      res.status(400).type("html").send(
        pageDeRetour(
          "Connexion impossible",
          erreur instanceof Error ? erreur.message : "Microsoft a refusé la demande",
          false,
        ),
      );
    }
  })().catch(next);
});

export const mailRoutes = Router();

mailRoutes.get("/", (_req, res) => {
  res.json(reglagesPublics());
});

mailRoutes.put("/", (req, res) => {
  modifier(req.body ?? {});
  res.json(reglagesPublics());
});

/** Ouvre une demande de consentement et rend l'adresse à afficher. */
mailRoutes.post("/oauth/start", (req, res) => {
  oublierLesExpirees();

  const state = randomBytes(32).toString("hex");
  const redirectUri = adresseDeRetour(req);
  // L'adresse est construite avant de retenir la demande : sans inscription
  // d'application, elle lève, et rien ne reste en mémoire.
  const url = urlDeConsentement(redirectUri, state);

  demandes.set(state, { redirectUri, expire: Date.now() + DUREE });
  res.json({ url });
});

mailRoutes.post("/oauth/disconnect", (_req, res) => {
  oublierLeConsentement();
  res.json(reglagesPublics());
});

mailRoutes.post("/test", (req, res, next) => {
  const destinataire = requireText(req.body?.to, "L'adresse de test est requise");
  // Le serveur SMTP dirait bien mieux ce qui ne va pas dans une adresse, mais
  // pas avant d'avoir ouvert la connexion : autant écarter ici ce qui n'a
  // manifestement pas la forme d'une adresse.
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(destinataire)) badRequest("Adresse de test invalide");

  envoyerLeTest(destinataire)
    .then(() => res.json({ sent_to: destinataire }))
    .catch(next);
});
