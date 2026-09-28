// Limitation des tentatives sur les routes d'authentification.
//
// Rien ne freinait les essais de mot de passe : une adresse connue se
// forçait aussi vite que le serveur savait répondre. scrypt coûte assez cher
// pour que ce soit aussi une protection du serveur lui-même.
//
// Le compte est tenu en mémoire, par adresse IP. C'est suffisant ici :
// l'application tourne sur un seul processus, et un redémarrage qui remet les
// compteurs à zéro n'ouvre qu'une fenêtre de quelques essais.

import type { NextFunction, Request, Response } from "express";
import { HttpError } from "../lib/http.js";

interface Fenetre {
  essais: number;
  debut: number;
}

export interface RateLimitOptions {
  /** Nombre d'essais tolérés par fenêtre. */
  max: number;
  /** Durée de la fenêtre, en millisecondes. */
  fenetreMs: number;
}

export const rateLimit = ({ max, fenetreMs }: RateLimitOptions) => {
  const parCle = new Map<string, Fenetre>();

  // Ménage périodique : sans lui, la table garderait une entrée par adresse
  // vue depuis le démarrage. `unref` laisse le processus se terminer.
  setInterval(() => {
    const limite = Date.now() - fenetreMs;
    for (const [cle, fenetre] of parCle) {
      if (fenetre.debut < limite) parCle.delete(cle);
    }
  }, fenetreMs).unref();

  return (req: Request, _res: Response, next: NextFunction): void => {
    const cle = req.ip ?? "inconnue";
    const maintenant = Date.now();
    const fenetre = parCle.get(cle);

    if (!fenetre || maintenant - fenetre.debut > fenetreMs) {
      parCle.set(cle, { essais: 1, debut: maintenant });
      return next();
    }

    fenetre.essais += 1;
    if (fenetre.essais > max) {
      throw new HttpError(429, "Trop de tentatives. Réessayez dans quelques minutes.");
    }
    next();
  };
};
