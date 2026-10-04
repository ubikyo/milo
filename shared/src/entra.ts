// Entra ID: the Microsoft directory on which Milo accounts rely.
//
// A single application registration serves everything: user sign-in
// (OpenID Connect), reading users and groups,
// reading the support mailboxes that widgets receive, and sending
// on their behalf
// (Microsoft Graph, with the application permissions).
//
// The secret never goes back down to the client: the interface only knows
// its presence (`has_secret`).

import type { AdminPermissions } from "./roles.js";
import type { WidgetRights } from "./widget-kinds.js";

/** A user or a group of the directory. */
/** A person of the directory, offered as an actor. */
export interface DirectoryUser {
  /** The Entra object id. */
  oid: string;
  name: string;
  email: string;
  /** Their Milo account, if they already have one. */
  user_id: number | null;
  /** Synced from the on-premises Active Directory (AD DS), rather than created in the cloud. */
  synced?: boolean;
}

export interface EntraPrincipal {
  type: "user" | "group";
  /** The Entra object id (oid). */
  id: string;
  name: string;
  /** The address of the user, or that of the group if it has one. */
  email: string;
  /**
   * Synced from the on-premises Active Directory (AD DS), rather than created in
   * the cloud. Only the directory search fills it in.
   */
  synced?: boolean;
}

export interface EntraSettings {
  /** The application (client) ID. */
  client_id: string;
  /** The directory (tenant) ID. */
  tenant: string;
  has_secret: boolean;
  /**
   * The address Milo emails are sent from — notices, assignments, submitted
   * requests. Replies to a received request are sent from its mailbox.
   */
  mail_sender: string;
}

/**
 * What the tab sends. What is not said does not change; for the
 * secret, the empty string clears it and absence keeps the one in the database.
 */
export interface EntraSettingsInput {
  client_id?: string;
  tenant?: string;
  secret?: string;
  mail_sender?: string;
}

/** Permissions of a user or a group, with who they concern. */
export interface PrincipalPermissions<T> {
  principal: EntraPrincipal;
  permissions: T;
}

/** Their access to a workspace: one permission per widget type. */
export type PrincipalAssignments = PrincipalPermissions<WidgetRights>;

/** Their administration of the application: the Settings and the workspaces. */
export type PrincipalAdministration = PrincipalPermissions<AdminPermissions>;

/** Milo's access to a mailbox: the sending one, or one a widget receives. */
export interface MailboxCheck {
  email: string;
  /** Where it is used: "Adresse d'envoi", or the contexts that receive it. */
  usage: string;
  ok: boolean;
  /** What Microsoft replied when access is denied. */
  error: string;
}

/**
 * Milo's connection to Entra: incomplete registration, disconnected from
 * the Settings, refused by Microsoft (the message in `error`), or established.
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
