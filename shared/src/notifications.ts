// Ce que le serveur pousse à une personne quand un élément qu'elle suit
// change. Distinct des compteurs de version (events.ts) : ceux-là disent à
// tous les clients « relisez les projets », celle-ci s'adresse à une personne
// et lui raconte un fait.

import type { Id } from "./domain.js";
import type { VersionPayload } from "./events.js";

/**
 * L'élément dont on parle, ou la famille de ce qui a été supprimé : « card »
 * vaut pour tout le mode Tâches — une liste ou un tableau supprimés s'y
 * rangent. « support » : une demande du mode Support. « access » : un élément
 * du mode Accès — une machine surveillée qui change d'état — ; l'identifiant
 * est celui de sa catégorie, qui est ce qui s'ouvre.
 */
export type NotificationKind = "project" | "card" | "support" | "access";

export interface Notification {
  /** Tiré au sort par le serveur : sert de clé à l'affichage. */
  id: string;
  kind: NotificationKind;
  target_id: Id;
  /** Le nom de l'élément, tel qu'il s'affiche dans l'application. */
  title: string;
  /** Ce qui a changé, en une phrase — « a modifié la fiche », « a commenté ». */
  message: string;
  /** Qui l'a fait. Jamais soi-même : on ne se notifie pas de ses propres gestes. */
  author: string;
  /**
   * L'élément n'existe plus : il vient d'être supprimé. Il n'y a rien à
   * ouvrir, la notification ne fait que le dire.
   */
  deleted: boolean;
  created_at: string;
}

/**
 * Ce qui circule sur le flux d'événements. Les deux messages se distinguent
 * par leur forme plutôt que par un champ « type » : le payload de versions
 * existait avant, et n'a pas eu à changer.
 */
export type FluxMessage = VersionPayload | { notification: Notification };

export const estNotification = (
  message: FluxMessage,
): message is { notification: Notification } => "notification" in message;
