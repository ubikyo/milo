// La messagerie sortante : par où partent les notifications par e-mail.
//
// Un principe tient tout le fichier : les secrets ne redescendent jamais au
// client. Le mot de passe SMTP, le secret d'application et le jeton de
// rafraîchissement vivent en base et n'en sortent pas ; l'interface n'apprend
// que leur présence (`has_password`, `has_secret`), ce qui suffit à afficher
// « défini » et à proposer de le remplacer.

/**
 * Comment le serveur SMTP reconnaît l'expéditeur. Les libellés ne répètent pas
 * le nom du champ qui les porte : il s'appelle déjà « Authentification ».
 */
export const MAIL_AUTH_MODES = [
  { value: "password", label: "Nom d'utilisateur" },
  { value: "oauth-outlook", label: "OAuth Outlook" },
] as const;

export type MailAuthMode = (typeof MAIL_AUTH_MODES)[number]["value"];

/**
 * Le chiffrement de la connexion. Les deux variantes de StartTLS chiffrent
 * toutes deux ; elles se séparent sur le certificat du serveur — la première
 * exige qu'il soit valide, la seconde s'en contente tel quel. « Sans
 * validation » protège donc de l'écoute, pas de l'usurpation : c'est ce qu'il
 * faut pour un relais interne à certificat maison, et rien d'autre.
 *
 * Les libellés disent l'essentiel et rien de plus : le protocole se nomme
 * StartTLS, et ce qui distingue les deux tient en deux mots.
 */
export const MAIL_ENCRYPTIONS = [
  { value: "none", label: "Aucun" },
  { value: "starttls", label: "StartTLS, avec validation" },
  { value: "starttls-only", label: "StartTLS, sans validation" },
] as const;

export type MailEncryption = (typeof MAIL_ENCRYPTIONS)[number]["value"];

/**
 * Ce que Microsoft impose pour la soumission authentifiée, et qui ne se règle
 * donc pas : l'authentification OAuth Outlook ne s'adresse qu'à Office 365.
 *
 * TLS y est exigé — « Aucun » est refusé — et les certificats de Microsoft
 * viennent d'une autorité publique, donc validés. Le nom du serveur est
 * documenté comme le seul à employer, jamais une adresse IP, et le port de
 * soumission est 587. Trois champs de moins à remplir, et trois façons de
 * moins de se tromper. Voir la section « Messagerie » du README.
 */
export const OUTLOOK_SMTP: { host: string; port: number; encryption: MailEncryption } = {
  host: "smtp.office365.com",
  port: 587,
  encryption: "starttls",
};

export const isMailAuthMode = (value: unknown): value is MailAuthMode =>
  MAIL_AUTH_MODES.some((m) => m.value === value);

export const isMailEncryption = (value: unknown): value is MailEncryption =>
  MAIL_ENCRYPTIONS.some((c) => c.value === value);

/** L'inscription d'application Azure et l'état du consentement. */
export interface MailOAuthState {
  client_id: string;
  /**
   * « organizations », l'identifiant d'un locataire, ou rien — auquel cas le
   * serveur s'adresse à « common », qui accepte tous les comptes Microsoft.
   */
  tenant: string;
  has_secret: boolean;
  /** Vrai quand un jeton de rafraîchissement est en base. */
  connected: boolean;
  /** L'adresse du compte qui a donné son consentement. */
  account: string;
  connected_at: string;
}

export interface MailSettings {
  auth_mode: MailAuthMode;
  encryption: MailEncryption;
  host: string;
  port: number;
  /**
   * Le nom d'utilisateur SMTP. Il tient aussi lieu d'adresse d'expéditeur
   * quand l'authentification se fait par mot de passe ; en OAuth, c'est
   * l'adresse du compte connecté qui expédie.
   */
  username: string;
  has_password: boolean;
  oauth: MailOAuthState;
}

/**
 * Ce que l'onglet envoie. Chaque champ est facultatif : ce qui n'est pas dit
 * ne change pas. Pour les trois secrets, la chaîne vide veut dire « efface »,
 * et l'absence « laisse celui qui est en base » — sans quoi il n'y aurait
 * aucun moyen d'enregistrer le reste sans retaper le mot de passe.
 */
export interface MailSettingsInput {
  auth_mode?: MailAuthMode;
  encryption?: MailEncryption;
  host?: string;
  port?: number;
  username?: string;
  password?: string;
  oauth_client_id?: string;
  oauth_tenant?: string;
  oauth_secret?: string;
}

/** L'adresse à laquelle envoyer le message d'essai. */
export interface MailTestInput {
  to: string;
}

export interface MailTestResult {
  sent_to: string;
}

/** Où commence l'onglet sur une base qui n'a jamais rien réglé. */
export const emptyMailSettings = (): MailSettings => ({
  auth_mode: "password",
  // Sans chiffrement, et sans rien deviner : un relais interne qui écoute en
  // clair est le cas le plus simple à régler. Office 365, lui, exige StartTLS
  // (voir le README) : l'essai le dit tout de suite si on l'a oublié.
  encryption: "none",
  host: "",
  // Le port de la soumission de message (RFC 6409), celui de StartTLS.
  port: 587,
  username: "",
  has_password: false,
  oauth: {
    client_id: "",
    tenant: "",
    has_secret: false,
    connected: false,
    account: "",
    connected_at: "",
  },
});
