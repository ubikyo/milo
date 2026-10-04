// La session qui porte le jeton reçu. Tout ce qui suit dans l'application
// exige qu'elle existe et qu'elle n'ait pas expiré.

import type { NextFunction, Request, Response } from "express";
import { env } from "../env.js";
import {
  hasAccess,
  inOwnWorkspace,
  settingsRights,
  canManageWorkspaces,
  sessions,
  users,
} from "../repositories/users.js";
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

const tokenOf = (req: Request): string | null => {
  const header = req.get("authorization") ?? "";
  return header.startsWith("Bearer ") ? header.slice(7) : null;
};

export const requireAuth = (req: Request, _res: Response, next: NextFunction): void => {
  const token = tokenOf(req);
  const session = token ? sessions.byToken.get(token) : undefined;

  if (!session || !token) throw new HttpError(401, "Authentification requise");

  // Une session oubliée finit par se fermer. « expires_at » est vide pour
  // celles ouvertes avant que les sessions expirent : la migration les a
  // laissées telles quelles, la première utilisation leur donne une date.
  const currentTime = Date.now();
  if (session.expires_at && Date.parse(session.expires_at) < currentTime) {
    sessions.close.run(token);
    throw new HttpError(401, "Session expirée");
  }

  const account = users.byId.get(session.user_id);
  if (!account) throw new HttpError(401, "Authentification requise");
  // Un accès retiré depuis la connexion ferme la session à la requête
  // suivante, sans attendre qu'elle expire.
  if (!hasAccess(account)) {
    sessions.close.run(token);
    throw new HttpError(401, "Votre accès à Milo a été retiré");
  }

  // Fenêtre glissante : la session repart pour un tour à chaque usage. On ne
  // réécrit pas la ligne à chaque requête — une fois par heure suffit à tenir
  // la fenêtre, et l'écriture est ce qui coûte.
  const seenAgo = session.last_seen_at ? currentTime - Date.parse(session.last_seen_at) : Infinity;
  if (seenAgo > 3_600_000) {
    sessions.touch.run(
      new Date(currentTime).toISOString(),
      new Date(currentTime + env.sessionMaxIdleMs).toISOString(),
      token,
    );
  }

  // Ce qu'il voit et ce qu'il peut faire suivent son workspace : il doit en
  // être un qu'il a encore.
  req.user = inOwnWorkspace(account);
  req.token = token;
  next();
};

/**
 * Le Paramétrage et ce qu'il règle — sociétés, types de jalons, rôles,
 * accès, Entra, sauvegarde. Le lire demande le droit « Voir » du
 * Paramétrage, y écrire le droit « Modifier ». Posé après `requireAuth`.
 */
export const requireSettings = (req: Request, _res: Response, next: NextFunction): void => {
  const rights = settingsRights(req.user);
  if (!rights.view) throw new HttpError(403, "Réservé à qui peut voir le Paramétrage");
  if (req.method !== "GET" && !rights.update) {
    throw new HttpError(403, "Réservé à qui peut modifier le Paramétrage");
  }
  next();
};

/**
 * Les sociétés et les types de jalons se lisent partout dans l'application :
 * seules leurs écritures demandent le droit « Modifier » du Paramétrage.
 */
export const requireSettingsToWrite = (req: Request, res: Response, next: NextFunction): void => {
  if (req.method === "GET") {
    next();
    return;
  }
  requireSettings(req, res, next);
};

/**
 * La sauvegarde, lecture comprise, demande le droit « Modifier » : l'archive
 * porte toute la base, secret d'application compris.
 */
export const requireSettingsUpdate = (req: Request, _res: Response, next: NextFunction): void => {
  if (!settingsRights(req.user).update) {
    throw new HttpError(403, "Réservé à qui peut modifier le Paramétrage");
  }
  next();
};

/**
 * La gestion des workspaces : le compte « admin », ou qui en a le droit dans
 * un workspace. Posé après `requireAuth`.
 */
export const requireWorkspaces = (req: Request, _res: Response, next: NextFunction): void => {
  if (!canManageWorkspaces(req.user)) {
    throw new HttpError(403, "Réservé à qui peut gérer les workspaces");
  }
  next();
};
