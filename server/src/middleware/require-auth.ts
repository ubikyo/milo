// La session qui porte le jeton reçu. Tout ce qui suit dans l'application
// exige qu'elle existe et qu'elle n'ait pas expiré.

import type { NextFunction, Request, Response } from "express";
import { env } from "../env.js";
import { sessions, users } from "../repositories/users.js";
import type { UserRow } from "../db/rows.js";
import { HttpError } from "../lib/http.js";

declare global {
  // L'augmentation de module d'Express passe obligatoirement par un espace de
  // noms : c'est ainsi que ses propres types sont déclarés.
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      /** Posé par `requireAuth` : toute route qui le suit peut s'y fier. */
      user: UserRow;
      token: string;
    }
  }
}

const jetonDe = (req: Request): string | null => {
  const header = req.get("authorization") ?? "";
  return header.startsWith("Bearer ") ? header.slice(7) : null;
};

export const requireAuth = (req: Request, _res: Response, next: NextFunction): void => {
  const token = jetonDe(req);
  const session = token ? sessions.byToken.get(token) : undefined;

  if (!session || !token) throw new HttpError(401, "Authentification requise");

  // Une session oubliée finit par se fermer. « expires_at » est vide pour
  // celles ouvertes avant que les sessions expirent : la migration les a
  // laissées telles quelles, la première utilisation leur donne une date.
  const maintenant = Date.now();
  if (session.expires_at && Date.parse(session.expires_at) < maintenant) {
    sessions.close.run(token);
    throw new HttpError(401, "Session expirée");
  }

  const user = users.byId.get(session.user_id);
  if (!user) throw new HttpError(401, "Authentification requise");

  // Fenêtre glissante : la session repart pour un tour à chaque usage. On ne
  // réécrit pas la ligne à chaque requête — une fois par heure suffit à tenir
  // la fenêtre, et l'écriture est ce qui coûte.
  const vuIlYA = session.last_seen_at ? maintenant - Date.parse(session.last_seen_at) : Infinity;
  if (vuIlYA > 3_600_000) {
    sessions.touch.run(
      new Date(maintenant).toISOString(),
      new Date(maintenant + env.sessionMaxIdleMs).toISOString(),
      token,
    );
  }

  req.user = user;
  req.token = token;
  next();
};
