// Ce que le serveur pousse aux clients après chaque écriture.
//
// Avant, un compteur unique : n'importe quelle écriture faisait recharger aux
// huit jeux de données de tous les clients connectés. Renommer une étiquette
// relisait les projets, les sociétés, les comptes et les tableaux — huit
// requêtes par client, pour une couleur.
//
// Chaque route nomme désormais ce qu'elle touche, et le client ne relit que
// cela. Les compteurs restent en mémoire : un redémarrage les remet à zéro, ce
// qui provoque au pire un rechargement complet chez les clients connectés.

import type { NextFunction, Request, Response } from "express";
import type { Id, Notification, Resource, ResourceVersions, VersionPayload } from "@milo/shared";
import { emptyVersions } from "@milo/shared";

const versions: ResourceVersions = emptyVersions();

/** Somme des compteurs : une écriture, où qu'elle soit, la fait monter. */
const total = (): number => Object.values(versions).reduce((a, b) => a + b, 0);

export const payload = (): VersionPayload => ({ version: total(), versions: { ...versions } });

/**
 * Les clients connectés, et le compte auquel chacun appartient. C'était un
 * simple ensemble de réponses : les compteurs de version s'adressent à tout le
 * monde. Les notifications de suivi, elles, s'adressent à une personne, et il
 * faut donc savoir qui est au bout de chaque flux.
 */
const clients = new Map<Response, Id>();

const ecrire = (res: Response, data: string): void => {
  try {
    res.write(data);
  } catch {
    clients.delete(res);
  }
};

const diffuser = (): void => {
  const data = `data: ${JSON.stringify(payload())}\n\n`;
  for (const client of clients.keys()) ecrire(client, data);
};

/**
 * Une notification poussée à une personne, sur tous ses onglets ouverts. Si
 * elle n'en a aucun, elle ne verra rien : ce qui se perd ici est repris par
 * l'e-mail, qui lui arrive de toute façon.
 */
export const pousserNotification = (userId: Id, notification: Notification): void => {
  const data = `data: ${JSON.stringify({ notification })}\n\n`;
  for (const [client, id] of clients) {
    if (id === userId) ecrire(client, data);
  }
};

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Locals {
      touched?: Set<Resource>;
    }
  }
}

/**
 * Déclare ce que cette écriture modifie. Appelé par un routeur pour poser ce
 * qu'il touche d'ordinaire, et par une route pour ajouter ce qu'elle seule
 * emporte — la suppression d'une société, par exemple, emporte aussi ses
 * tableaux et leurs projets.
 */
export const touch =
  (...resources: Resource[]) =>
  (_req: Request, res: Response, next: NextFunction): void => {
    const deja = res.locals.touched ?? new Set<Resource>();
    for (const resource of resources) deja.add(resource);
    res.locals.touched = deja;
    next();
  };

/** La même chose, depuis le corps d'une route. */
export const touchNow = (res: Response, ...resources: Resource[]): void => {
  const deja = res.locals.touched ?? new Set<Resource>();
  for (const resource of resources) deja.add(resource);
  res.locals.touched = deja;
};

/**
 * Incrémente les compteurs des ressources touchées, une fois la réponse
 * partie et seulement si elle a réussi. Une lecture ne touche rien.
 */
export const compterEcritures = (req: Request, res: Response, next: NextFunction): void => {
  if (req.method === "GET") return next();
  res.on("finish", () => {
    const touched = res.locals.touched;
    if (res.statusCode >= 400 || !touched?.size) return;
    for (const resource of touched) versions[resource] += 1;
    diffuser();
  });
  next();
};

/**
 * Une écriture faite hors d'une requête — la relève des boîtes de support,
 * par exemple : les compteurs montent et les clients relisent, comme après
 * une route.
 */
export const signalerEcriture = (...resources: Resource[]): void => {
  if (!resources.length) return;
  for (const resource of resources) versions[resource] += 1;
  diffuser();
};

/**
 * Le flux d'événements (SSE). Le client le consomme avec `fetch` et non
 * `EventSource`, qui n'accepte pas d'en-tête d'authentification.
 */
export const flux = (req: Request, res: Response): void => {
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    // Demande à nginx de ne pas mettre la réponse en tampon.
    "X-Accel-Buffering": "no",
  });
  res.write(`data: ${JSON.stringify(payload())}\n\n`);
  clients.set(res, req.user.id);

  // Commentaire périodique : maintient la connexion ouverte à travers les
  // proxys.
  const battement = setInterval(() => ecrire(res, ": ping\n\n"), 25_000);

  req.on("close", () => {
    clearInterval(battement);
    clients.delete(res);
  });
};
