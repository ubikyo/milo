// Entra ID : l'annuaire Microsoft sur lequel reposent les comptes de Milo.
//
// Une seule inscription d'application sert à tout : la connexion des
// utilisateurs (OpenID Connect), la lecture des utilisateurs et des groupes,
// la lecture des boîtes de support des sociétés et l'envoi en leur nom
// (Microsoft Graph, avec les permissions de l'application).
//
// Le secret ne redescend jamais au client : l'interface n'en connaît que la
// présence (`has_secret`).

import type { Id } from "./domain.js";
import type { AppPermissions } from "./roles.js";

/** Un utilisateur ou un groupe de l'annuaire. */
/** Une personne de l'annuaire, proposée comme acteur. */
export interface DirectoryUser {
  /** L'identifiant d'objet Entra. */
  oid: string;
  name: string;
  email: string;
  /** Son compte dans Milo, si elle en a déjà un. */
  user_id: number | null;
  /** Synchronisée depuis l'Active Directory local (AD DS), plutôt que créée dans le cloud. */
  synced?: boolean;
}

export interface EntraPrincipal {
  type: "user" | "group";
  /** L'identifiant d'objet Entra (oid). */
  id: string;
  name: string;
  /** L'adresse de l'utilisateur, ou celle du groupe s'il en a une. */
  email: string;
  /**
   * Synchronisé depuis l'Active Directory local (AD DS), plutôt que créé dans
   * le cloud. Seule la recherche dans l'annuaire le renseigne.
   */
  synced?: boolean;
}

export interface EntraSettings {
  /** L'ID d'application (client). */
  client_id: string;
  /** L'ID de l'annuaire (locataire). */
  tenant: string;
  has_secret: boolean;
}

/**
 * Ce que l'onglet envoie. Ce qui n'est pas dit ne change pas ; pour le
 * secret, la chaîne vide efface et l'absence laisse celui qui est en base.
 */
export interface EntraSettingsInput {
  client_id?: string;
  tenant?: string;
  secret?: string;
}

/** Les permissions d'un utilisateur ou d'un groupe : le Paramétrage et ses types de widgets. */
export interface PrincipalAssignments {
  principal: EntraPrincipal;
  app: AppPermissions;
}

/** L'accès de Milo à la boîte de support d'une société. */
export interface MailboxCheck {
  company_id: Id;
  company_name: string;
  email: string;
  ok: boolean;
  /** Ce que Microsoft a répondu quand l'accès est refusé. */
  error: string;
}

/**
 * La connexion de Milo à Entra : l'inscription incomplète, déconnectée depuis
 * le Paramétrage, refusée par Microsoft (le message dans `error`), ou établie.
 */
export interface EntraStatus {
  state: "unconfigured" | "disconnected" | "error" | "connected";
  error: string;
}

export const emptyEntraSettings = (): EntraSettings => ({
  client_id: "",
  tenant: "",
  has_secret: false,
});
