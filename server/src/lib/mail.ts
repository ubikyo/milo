// La messagerie sortante : les réglages du serveur SMTP, le consentement
// OAuth d'Outlook, et l'envoi.
//
// Les secrets — mot de passe SMTP, secret d'application, jeton de
// rafraîchissement — sont rangés en base avec le reste des réglages et ne
// ressortent jamais par l'API : `reglagesPublics` n'en dit que la présence.
// Ce n'est pas du chiffrement, et cela n'y prétend pas : qui peut lire la base
// peut les lire. C'est la base qu'il faut protéger — elle porte déjà les
// jetons de session.

import nodemailer from "nodemailer";
import type { Transporter } from "nodemailer";
import type { MailEncryption, MailSettings, MailSettingsInput } from "@milo/shared";
import { OUTLOOK_SMTP, emptyMailSettings, isMailAuthMode, isMailEncryption } from "@milo/shared";
import { badRequest, fail } from "./http.js";
import { gabarit } from "./mail-template.js";
import type { PieceJointe } from "./mail-template.js";
import { now } from "./time.js";
import { readSetting, writeSetting } from "../repositories/settings.js";

const CLE = "mail";

/** Les réglages tels qu'ils sont rangés : comme ceux du client, secrets compris. */
interface ReglagesStockes {
  auth_mode: MailSettings["auth_mode"];
  encryption: MailEncryption;
  host: string;
  port: number;
  username: string;
  password: string;
  oauth: {
    client_id: string;
    tenant: string;
    secret: string;
    /** Le jeton de rafraîchissement, seule trace durable du consentement. */
    refresh_token: string;
    account: string;
    connected_at: string;
  };
}

const parDefaut = (): ReglagesStockes => {
  const vide = emptyMailSettings();
  return {
    auth_mode: vide.auth_mode,
    encryption: vide.encryption,
    host: vide.host,
    port: vide.port,
    username: vide.username,
    password: "",
    oauth: {
      client_id: vide.oauth.client_id,
      tenant: vide.oauth.tenant,
      secret: "",
      refresh_token: "",
      account: "",
      connected_at: "",
    },
  };
};

/** Les réglages en base, complétés des défauts pour ce qui manque. */
export const reglages = (): ReglagesStockes => {
  const defauts = parDefaut();
  const lus = readSetting<Partial<ReglagesStockes>>(CLE, {});
  return {
    ...defauts,
    ...lus,
    oauth: { ...defauts.oauth, ...(lus.oauth ?? {}) },
  };
};

const enregistrer = (valeur: ReglagesStockes): void => writeSetting(CLE, valeur);

/** Ce que le client reçoit : les réglages, et des secrets la seule présence. */
export const reglagesPublics = (): MailSettings => {
  const r = reglages();
  return {
    auth_mode: r.auth_mode,
    encryption: r.encryption,
    host: r.host,
    port: r.port,
    username: r.username,
    has_password: r.password !== "",
    oauth: {
      client_id: r.oauth.client_id,
      tenant: r.oauth.tenant,
      has_secret: r.oauth.secret !== "",
      connected: r.oauth.refresh_token !== "",
      account: r.oauth.account,
      connected_at: r.oauth.connected_at,
    },
  };
};

const texte = (valeur: unknown, max = 255): string => String(valeur ?? "").trim().slice(0, max);

/**
 * Les réglages modifiés. Ce qui n'est pas dit ne change pas ; pour les trois
 * secrets, la chaîne vide efface. Sans cette distinction, enregistrer le port
 * obligerait à retaper le mot de passe.
 */
export const modifier = (entree: MailSettingsInput): void => {
  const actuels = reglages();
  const suivants: ReglagesStockes = { ...actuels, oauth: { ...actuels.oauth } };

  if (entree.auth_mode !== undefined) {
    if (!isMailAuthMode(entree.auth_mode)) badRequest("Mode d'authentification inconnu");
    suivants.auth_mode = entree.auth_mode;
  }

  if (entree.encryption !== undefined) {
    if (!isMailEncryption(entree.encryption)) badRequest("Chiffrement de connexion inconnu");
    suivants.encryption = entree.encryption;
  }

  if (entree.host !== undefined) suivants.host = texte(entree.host);
  if (entree.username !== undefined) suivants.username = texte(entree.username);
  if (entree.password !== undefined) suivants.password = String(entree.password);

  if (entree.port !== undefined) {
    const port = Number(entree.port);
    if (!Number.isInteger(port) || port < 1 || port > 65535) badRequest("Port SMTP invalide");
    suivants.port = port;
  }

  if (entree.oauth_client_id !== undefined) suivants.oauth.client_id = texte(entree.oauth_client_id);
  // Un locataire vide est une valeur : le point de terminaison retombe alors
  // sur « common », sans que l'onglet ait à afficher ce mot.
  if (entree.oauth_tenant !== undefined) suivants.oauth.tenant = texte(entree.oauth_tenant);
  if (entree.oauth_secret !== undefined) suivants.oauth.secret = String(entree.oauth_secret);

  // Changer d'inscription d'application invalide le consentement obtenu avec
  // la précédente : le jeton de rafraîchissement ne vaut que pour elle.
  if (
    suivants.oauth.client_id !== actuels.oauth.client_id ||
    suivants.oauth.tenant !== actuels.oauth.tenant
  ) {
    suivants.oauth.refresh_token = "";
    suivants.oauth.account = "";
    suivants.oauth.connected_at = "";
  }

  enregistrer(suivants);
};

// --- OAuth Outlook ---------------------------------------------------------

/**
 * Le droit d'envoyer par le SMTP d'Office 365, et rien d'autre.
 * `offline_access` est ce qui donne le jeton de rafraîchissement, sans lequel
 * il faudrait redemander le consentement à chaque envoi ; `openid email` sert
 * à connaître l'adresse du compte, pour l'afficher et pour expédier en son nom.
 */
const PORTEE = "offline_access openid email https://outlook.office.com/SMTP.Send";

const AUTORITE = "https://login.microsoftonline.com";

const pointDeTerminaison = (tenant: string, quoi: "authorize" | "token"): string =>
  `${AUTORITE}/${encodeURIComponent(tenant || "common")}/oauth2/v2.0/${quoi}`;

interface ReponseJeton {
  access_token?: string;
  refresh_token?: string;
  id_token?: string;
  expires_in?: number;
  error?: string;
  error_description?: string;
}

/**
 * L'adresse portée par le jeton d'identité. Il arrive du point de terminaison
 * de Microsoft, en direct et en TLS : sa charge utile se lit telle quelle. On
 * ne l'utilise que pour afficher un nom de compte et remplir l'expéditeur —
 * aucune décision d'accès ne s'y appuie, et rien ici ne vaut vérification de
 * signature.
 */
const adresseDuJeton = (idToken: string | undefined): string => {
  const charge = String(idToken ?? "").split(".")[1];
  if (!charge) return "";
  try {
    const decode: unknown = JSON.parse(Buffer.from(charge, "base64url").toString("utf8"));
    const claims = decode as { preferred_username?: string; email?: string };
    return texte(claims.preferred_username ?? claims.email ?? "");
  } catch {
    return "";
  }
};

const appelerJeton = async (tenant: string, corps: URLSearchParams): Promise<ReponseJeton> => {
  const reponse = await fetch(pointDeTerminaison(tenant, "token"), {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: corps,
  });

  const jeton = (await reponse.json().catch(() => ({}))) as ReponseJeton;
  if (!reponse.ok || !jeton.access_token) {
    // Microsoft décrit précisément ce qui manque (redirection non inscrite,
    // secret expiré) : ce message vaut mieux que « échec de l'authentification ».
    fail(400, jeton.error_description?.split("\n")[0] || jeton.error || "Microsoft a refusé la demande");
  }
  return jeton;
};

/** L'inscription d'application est-elle complète ? Sinon rien n'est possible. */
const exigerInscription = (r: ReglagesStockes): void => {
  if (!r.oauth.client_id) badRequest("Renseignez l'identifiant d'application avant de vous connecter");
  if (!r.oauth.secret) badRequest("Renseignez le secret d'application avant de vous connecter");
};

/** L'adresse du consentement Microsoft, à ouvrir dans une fenêtre. */
export const urlDeConsentement = (redirectUri: string, state: string): string => {
  const r = reglages();
  exigerInscription(r);

  const parametres = new URLSearchParams({
    client_id: r.oauth.client_id,
    response_type: "code",
    redirect_uri: redirectUri,
    response_mode: "query",
    scope: PORTEE,
    state,
    // Redemande le choix du compte à chaque fois : « se reconnecter » sert
    // aussi à changer de boîte.
    prompt: "select_account",
  });

  return `${pointDeTerminaison(r.oauth.tenant, "authorize")}?${parametres.toString()}`;
};

/** Le code de retour échangé contre un jeton de rafraîchissement, puis rangé. */
export const terminerLeConsentement = async (code: string, redirectUri: string): Promise<void> => {
  const r = reglages();
  exigerInscription(r);

  const jeton = await appelerJeton(
    r.oauth.tenant,
    new URLSearchParams({
      client_id: r.oauth.client_id,
      client_secret: r.oauth.secret,
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri,
      scope: PORTEE,
    }),
  );

  if (!jeton.refresh_token) {
    badRequest("Microsoft n'a pas renvoyé de jeton durable : vérifiez la permission « offline_access »");
  }

  enregistrer({
    ...r,
    oauth: {
      ...r.oauth,
      refresh_token: jeton.refresh_token!,
      account: adresseDuJeton(jeton.id_token) || r.username,
      connected_at: now(),
    },
  });
};

export const oublierLeConsentement = (): void => {
  const r = reglages();
  enregistrer({ ...r, oauth: { ...r.oauth, refresh_token: "", account: "", connected_at: "" } });
};

/**
 * Un jeton d'accès frais. Ils ne valent qu'une heure : on n'en garde aucun, on
 * le redemande au moment d'envoyer. Microsoft renvoie parfois un nouveau jeton
 * de rafraîchissement au passage — il remplace l'ancien, sans quoi le
 * consentement finirait par tomber.
 */
const jetonDAcces = async (r: ReglagesStockes): Promise<string> => {
  exigerInscription(r);
  if (!r.oauth.refresh_token) badRequest("Connectez le compte Outlook avant d'envoyer");

  const jeton = await appelerJeton(
    r.oauth.tenant,
    new URLSearchParams({
      client_id: r.oauth.client_id,
      client_secret: r.oauth.secret,
      grant_type: "refresh_token",
      refresh_token: r.oauth.refresh_token,
      scope: PORTEE,
    }),
  );

  if (jeton.refresh_token && jeton.refresh_token !== r.oauth.refresh_token) {
    enregistrer({ ...r, oauth: { ...r.oauth, refresh_token: jeton.refresh_token } });
  }

  return jeton.access_token!;
};

// --- Envoi -----------------------------------------------------------------

/**
 * Les trois chiffrements, tels que nodemailer les entend. Aucun ne passe par
 * `secure: true` : les trois choix proposés sont sur le port de soumission,
 * où la connexion s'ouvre en clair et monte en TLS par StartTLS.
 *
 *   - « none »          : on n'essaie même pas de monter en TLS.
 *   - « starttls »      : StartTLS exigé, certificat vérifié.
 *   - « starttls-only » : StartTLS exigé, certificat accepté tel quel. Protège
 *     de l'écoute, pas de l'usurpation — pour un relais interne à certificat
 *     maison, et rien d'autre.
 */
const options = (chiffrement: MailEncryption) => ({
  secure: false,
  ignoreTLS: chiffrement === "none",
  requireTLS: chiffrement !== "none",
  tls: { rejectUnauthorized: chiffrement === "starttls" },
});

/** Au-delà, on rend la main : un test ne doit pas rester pendu. */
const DELAIS = { connectionTimeout: 15_000, greetingTimeout: 15_000, socketTimeout: 30_000 };

const transporteur = async (r: ReglagesStockes): Promise<{ envoi: Transporter; de: string }> => {
  // OAuth Outlook ne parle qu'à Office 365 : le serveur, le port et le
  // chiffrement sont ceux que Microsoft impose, et non ceux qui traînent en
  // base — ils appartiennent à l'autre mode d'authentification, et l'onglet ne
  // les propose plus ici. L'expéditeur est le compte qui a consenti.
  if (r.auth_mode === "oauth-outlook") {
    const de = r.oauth.account;
    if (!de) badRequest("Connectez le compte Outlook avant d'envoyer");
    return {
      de,
      envoi: nodemailer.createTransport({
        host: OUTLOOK_SMTP.host,
        port: OUTLOOK_SMTP.port,
        ...options(OUTLOOK_SMTP.encryption),
        ...DELAIS,
        auth: { type: "OAuth2", user: de, accessToken: await jetonDAcces(r) },
      }),
    };
  }

  if (!r.host) badRequest("Renseignez le serveur SMTP");
  if (!r.username) badRequest("Renseignez le nom d'utilisateur");

  return {
    de: r.username,
    envoi: nodemailer.createTransport({
      host: r.host,
      port: r.port,
      ...options(r.encryption),
      ...DELAIS,
      auth: { user: r.username, pass: r.password },
    }),
  };
};

/**
 * Vrai quand la messagerie a de quoi envoyer. Les notifications de suivi le
 * demandent avant d'essayer : sans cela, chaque modification tenterait un
 * envoi voué à l'échec et emplirait le journal.
 */
export const messagerieConfiguree = (): boolean => {
  const r = reglages();
  return r.auth_mode === "oauth-outlook"
    ? Boolean(r.oauth.refresh_token && r.oauth.account)
    : Boolean(r.host && r.username);
};

export interface Courrier {
  to: string;
  subject: string;
  text: string;
  /** La version mise en forme. Les clients en mode texte lisent `text`. */
  html?: string;
  /** Ce que le HTML cite en « cid: » — le logo de l'entête. */
  attachments?: PieceJointe[];
}

/**
 * Un envoi. Lève ce que le serveur SMTP a répondu : c'est cela qui apprend
 * quelque chose — « 535 authentification refusée », « certificat auto-signé » —,
 * là où « échec de l'envoi » ne dirait rien. À l'appelant de décider s'il le
 * remonte à l'écran ou s'il se contente de le tracer.
 */
export const envoyerCourrier = async ({
  to,
  subject,
  text,
  html,
  attachments,
}: Courrier): Promise<void> => {
  const { envoi, de } = await transporteur(reglages());

  try {
    await envoi.sendMail({
      from: de,
      to,
      subject,
      text,
      ...(html ? { html } : {}),
      ...(attachments?.length ? { attachments } : {}),
    });
  } finally {
    envoi.close();
  }
};

/** Le message d'essai, dont l'échec se lit dans la fenêtre qui l'a demandé. */
export const envoyerLeTest = async (destinataire: string): Promise<void> => {
  try {
    await envoyerCourrier({
      to: destinataire,
      subject: "Milo — Message de test",
      ...gabarit({
        titre: "Message de test",
        intro: "Ce message confirme le fonctionnement de la messagerie pour Milo.",
        pied: "Envoyé depuis Paramétrage → Messagerie.",
      }),
    });
  } catch (erreur) {
    fail(400, erreur instanceof Error ? erreur.message : "L'envoi a échoué");
  }
};
