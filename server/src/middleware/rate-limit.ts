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

interface Window {
  attempts: number;
  start: number;
}

export interface RateLimitOptions {
  /** Nombre d'essais tolérés par fenêtre. */
  max: number;
  /** Durée de la fenêtre, en millisecondes. */
  windowMs: number;
}

export const rateLimit = ({ max, windowMs }: RateLimitOptions) => {
  const byKey = new Map<string, Window>();

  // Ménage périodique : sans lui, la table garderait une entrée par adresse
  // vue depuis le démarrage. `unref` laisse le processus se terminer.
  setInterval(() => {
    const cutoff = Date.now() - windowMs;
    for (const [key, window] of byKey) {
      if (window.start < cutoff) byKey.delete(key);
    }
  }, windowMs).unref();

  return (req: Request, _res: Response, next: NextFunction): void => {
    const key = req.ip ?? "inconnue";
    const currentTime = Date.now();
    const window = byKey.get(key);

    if (!window || currentTime - window.start > windowMs) {
      byKey.set(key, { attempts: 1, start: currentTime });
      return next();
    }

    window.attempts += 1;
    if (window.attempts > max) {
      throw new HttpError(429, "Trop de tentatives. Réessayez dans quelques minutes.");
    }
    next();
  };
};
