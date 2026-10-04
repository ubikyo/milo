// Le suivi : ce qu'une personne demande à être prévenue quand cela change.
//
// Quatre sortes d'éléments se suivent. Un projet, une carte et une demande de
// support se suivent pour eux-mêmes ; une liste se suit pour ses cartes — on
// ne modifie pas une liste, on modifie ce qu'elle contient, et c'est de cela
// qu'on veut être prévenu.

import type { Id } from "./domain.js";

export const FOLLOW_KINDS = ["project", "card", "list", "support"] as const;

export type FollowKind = (typeof FOLLOW_KINDS)[number];

export const isFollowKind = (value: unknown): value is FollowKind =>
  FOLLOW_KINDS.includes(value as FollowKind);

/**
 * Ce que le client tient à jour : ce que la personne suit, par sorte. Une
 * seule lecture au démarrage, puis la liste suit les clics — il n'y a pas de
 * raison d'interroger le serveur à chaque ouverture d'un tiroir.
 */
export type Follows = Record<FollowKind, Id[]>;

export const emptyFollows = (): Follows => ({ project: [], card: [], list: [], support: [] });

/**
 * L'adresse qui ouvre un élément dans l'application. Une seule écriture, lue
 * par le client qui l'interprète au démarrage et par le serveur qui la met
 * dans ses e-mails.
 *
 * Une liste n'en a pas : ce qu'on notifie pour une liste, c'est toujours l'une
 * de ses cartes, et c'est vers elle que le lien pointe.
 */
export type LinkTargetKind = "project" | "card" | "support" | "asset" | "access";

/**
 * Un poste s'ouvre par son identifiant ; un élément du mode Accès, par sa
 * catégorie — c'est elle qui s'ouvre, l'élément n'a pas de fiche.
 */
export const QUERY_PARAMS: Record<LinkTargetKind, string> = {
  project: "project",
  card: "card",
  support: "ticket",
  asset: "asset",
  access: "access",
};

/**
 * Les noms d'avant, en français : des e-mails déjà partis et des descriptions
 * les citent encore (« ?carte=12 »). Ils s'ouvrent toujours.
 */
export const LEGACY_QUERY_PARAMS: Record<LinkTargetKind, string> = {
  project: "projet",
  card: "carte",
  support: "demande",
  asset: "poste",
  access: "acces",
};

export const itemLink = (kind: LinkTargetKind, id: Id): string => `?${QUERY_PARAMS[kind]}=${id}`;
