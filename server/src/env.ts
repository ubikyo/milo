// Les réglages venus de l'environnement, lus une fois et nommés ici. Les
// chercher au fil du code revient à ne jamais savoir ce qui est réglable.

import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));

const jours = (n: number) => n * 24 * 60 * 60 * 1000;

const entier = (valeur: string | undefined, defaut: number): number => {
  const n = Number(valeur);
  return Number.isFinite(n) && n > 0 ? n : defaut;
};

export const env = {
  port: entier(process.env["PORT"], 3001),

  // En production, la base doit vivre hors du dossier déployé : un
  // déploiement remplace le code, il ne doit pas emporter les données.
  // MILO_DB_PATH=/var/lib/milo/data.db par exemple.
  dbPath: process.env["MILO_DB_PATH"] || path.join(here, "..", "data.db"),

  // Les fichiers déposés sur les cartes, et les images collées dans une
  // description. Même règle que la base : en production, ils vivent hors du
  // dossier déployé, sans quoi le déploiement suivant les emporterait.
  // MILO_MEDIA_PATH=/var/lib/milo/medias par exemple.
  mediaPath: process.env["MILO_MEDIA_PATH"] || path.join(here, "..", "..", "medias"),

  /**
   * Origines autorisées à appeler l'API depuis un navigateur, séparées par des
   * virgules. En production l'application est servie par le même hôte que
   * l'API : aucune origine tierce n'a de raison d'y accéder, et la liste reste
   * vide. En développement, Vite sert le client sur un autre port.
   */
  corsOrigins: (process.env["MILO_CORS_ORIGINS"] ?? "")
    .split(",")
    .map((o) => o.trim())
    .filter(Boolean),

  /**
   * Les modifications d'un même élément par la même personne dans cette
   * fenêtre tiennent en un seul e-mail de suivi. Trop court, on reçoit une
   * rafale ; trop long, on est prévenu tard. La notification à l'écran, elle,
   * est immédiate quelle que soit cette valeur.
   */
  notifyWindowMs: entier(process.env["MILO_NOTIFY_WINDOW_MINUTES"], 5) * 60 * 1000,

  /** Une session inutilisée pendant ce délai se ferme d'elle-même. */
  sessionMaxIdleMs: jours(entier(process.env["MILO_SESSION_DAYS"], 30)),

  /**
   * Les réponses du mode Support partent à l'expéditeur, en réponse à son
   * e-mail. « simulate » les simule, pour la mise au point : le message est
   * préparé et consigné, mais rien ne quitte Milo.
   */
  supportReplySend: process.env["MILO_SUPPORT_REPLY"] !== "simulate",

  // Les images et les pièces jointes des e-mails reçus au support. Même règle
  // que les médias : en production, hors du dossier déployé.
  // MILO_TICKETS_PATH=/var/lib/milo/tickets par exemple.
  ticketsPath:
    process.env["MILO_TICKETS_PATH"] || path.join(here, "..", "..", "upload", "tickets"),

  /**
   * L'adresse publique de Milo, en https — « https://milo.exemple.fr ».
   * Microsoft y prévient Milo de l'arrivée d'un e-mail (notifications de
   * changement de Graph). Sans elle, seule la relève périodique a cours.
   */
  publicUrl: (process.env["MILO_PUBLIC_URL"] ?? "").replace(/\/+$/, ""),

  production: process.env["NODE_ENV"] === "production",
} as const;
