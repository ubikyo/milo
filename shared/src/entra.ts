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
import type { UserCompanyRole } from "./roles.js";

/** Un utilisateur ou un groupe de l'annuaire. */
/** Une personne de l'annuaire, proposée comme acteur. */
export interface DirectoryUser {
  /** L'identifiant d'objet Entra. */
  oid: string;
  name: string;
  email: string;
  /** Son compte dans Milo, si elle en a déjà un. */
  user_id: number | null;
}

export interface EntraPrincipal {
  type: "user" | "group";
  /** L'identifiant d'objet Entra (oid). */
  id: string;
  name: string;
  /** L'adresse de l'utilisateur, ou celle du groupe s'il en a une. */
  email: string;
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

/** Les rôles d'un utilisateur ou d'un groupe, société par société. */
export interface PrincipalAssignments {
  principal: EntraPrincipal;
  roles: UserCompanyRole[];
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

export const emptyEntraSettings = (): EntraSettings => ({
  client_id: "",
  tenant: "",
  has_secret: false,
});
