// Le suivi : ce qu'une personne demande à être prévenue quand cela change.
//
// Trois sortes d'éléments se suivent. Un projet et une carte se suivent pour
// eux-mêmes ; une liste se suit pour ses cartes — on ne modifie pas une liste,
// on modifie ce qu'elle contient, et c'est de cela qu'on veut être prévenu.

import type { Id } from "./domain.js";

export const FOLLOW_KINDS = ["project", "card", "list"] as const;

export type FollowKind = (typeof FOLLOW_KINDS)[number];

export const isFollowKind = (value: unknown): value is FollowKind =>
  FOLLOW_KINDS.includes(value as FollowKind);

/**
 * Ce que le client tient à jour : ce que la personne suit, par sorte. Une
 * seule lecture au démarrage, puis la liste suit les clics — il n'y a pas de
 * raison d'interroger le serveur à chaque ouverture d'un tiroir.
 */
export type Follows = Record<FollowKind, Id[]>;

export const emptyFollows = (): Follows => ({ project: [], card: [], list: [] });

/**
 * L'adresse qui ouvre un élément dans l'application. Une seule écriture, lue
 * par le client qui l'interprète au démarrage et par le serveur qui la met
 * dans ses e-mails.
 *
 * Une liste n'en a pas : ce qu'on notifie pour une liste, c'est toujours l'une
 * de ses cartes, et c'est vers elle que le lien pointe.
 */
export const lienElement = (kind: "project" | "card", id: Id): string =>
  kind === "project" ? `?projet=${id}` : `?carte=${id}`;
