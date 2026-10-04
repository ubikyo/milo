// Le seul endroit qui écrit une réponse d'erreur.

import type { NextFunction, Request, Response } from "express";
import { env } from "../env.js";
import { HttpError } from "../lib/http.js";
import { SIZE_MAX_MB } from "../lib/medias.js";

export const notFoundHandler = (req: Request, res: Response): void => {
  res.status(404).json({ error: `Route inconnue : ${req.method} ${req.path}` });
};

export const errorHandler = (
  err: unknown,
  _req: Request,
  res: Response,
  next: NextFunction,
): void => {
  // Réponse déjà commencée (le flux d'événements, par exemple) : Express sait
  // seul quoi en faire.
  if (res.headersSent) return next(err);

  if (err instanceof HttpError) {
    res.status(err.status).json({ error: err.message });
    return;
  }

  // Un fichier trop gros est arrêté par l'analyseur de corps, avant même
  // d'arriver à la route : lui seul sait le dire, et il le dit en anglais. La
  // limite est celle que la route a posée — 25 Mo pour une pièce jointe, bien
  // plus pour une sauvegarde — et c'est l'analyseur qui la porte.
  if (typeof err === "object" && err !== null && "type" in err) {
    const body = err as { type?: string; limit?: number };
    if (body.type === "entity.too.large") {
      const mo = body.limit ? Math.round(body.limit / (1024 * 1024)) : SIZE_MAX_MB;
      res.status(413).json({ error: `Fichier trop volumineux (${mo} Mo au maximum)` });
      return;
    }
  }

  // Tout le reste est un défaut de l'application : on le trace en entier, et
  // on n'en dit rien au client — un message d'erreur interne renseigne autant
  // l'attaquant que l'utilisateur.
  console.error("Erreur non gérée :", err);
  res.status(500).json({
    error: env.production ? "Erreur interne" : String(err instanceof Error ? err.stack : err),
  });
};
