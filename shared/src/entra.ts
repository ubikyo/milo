// Entra ID : l'annuaire Microsoft sur lequel reposent les comptes de Milo.
//
// Une seule inscription d'application sert à tout : la connexion des
// utilisateurs (OpenID Connect), la lecture des utilisateurs et des groupes,
// la lecture des boîtes de support que les widgets reçoivent et l'envoi en
// leur nom
// (Microsoft Graph, avec les permissions de l'application).
//
// Le secret ne redescend jamais au client : l'interface n'en connaît que la
// présence (`has_secret`).

import type { AdminPermissions } from "./roles.js";
import type { WidgetRights } from "./widget-kinds.js";

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
  /**
   * L'adresse d'où partent les e-mails de Milo — avis, assignations, demandes
   * saisies. Les réponses à une demande reçue partent de sa boîte.
   */
  mail_sender: string;
}

/**
 * Ce que l'onglet envoie. Ce qui n'est pas dit ne change pas ; pour le
 * secret, la chaîne vide efface et l'absence laisse celui qui est en base.
 */
export interface EntraSettingsInput {
  client_id?: string;
  tenant?: string;
  secret?: string;
  mail_sender?: string;
}

/** Des permissions d'un utilisateur ou d'un groupe, avec qui elles concernent. */
export interface PrincipalPermissions<T> {
  principal: EntraPrincipal;
  permissions: T;
}

/** Ses accès à un workspace : une permission par type de widget. */
export type PrincipalAssignments = PrincipalPermissions<WidgetRights>;

/** Son administration de l'application : le Paramétrage et les workspaces. */
export type PrincipalAdministration = PrincipalPermissions<AdminPermissions>;

/** L'accès de Milo à une boîte : celle d'envoi, ou une que reçoit un widget. */
export interface MailboxCheck {
  email: string;
  /** Où elle sert : « Adresse d'envoi », ou les contextes qui la reçoivent. */
  usage: string;
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
  mail_sender: "",
});
