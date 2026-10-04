// Entra ID : l'inscription d'application sur laquelle tout repose.
//
//   - La connexion des utilisateurs, par OpenID Connect (code d'autorisation).
//   - L'annuaire — utilisateurs, groupes, appartenances —, par Microsoft Graph
//     avec les permissions de l'application : User.Read.All, Group.Read.All,
//     GroupMember.Read.All.
//   - Le courrier des boîtes de support et des notifications, par Graph
//     encore : Mail.Read pour lire, Mail.Send pour envoyer en leur nom.
//   - L'agenda de chacun, pour le widget Calendrier : Calendars.Read ; sa
//     boîte de réception, pour le widget Mail : Mail.Read encore.
//
// Les permissions de l'application demandent le consentement d'un
// administrateur du locataire, donné une fois dans le portail Azure. Voir la
// section « Entra » du README.
//
// Le secret est rangé en base avec le reste des réglages et ne ressort jamais
// par l'API. Ce n'est pas du chiffrement : qui peut lire la base peut le
// lire. C'est la base qu'il faut protéger — elle porte déjà les sessions.

import type {
  AccessCalendarEvent,
  AccessMail,
  AccessMailAttachment,
  AccessMailPage,
  MailAddress,
  EntraPrincipal,
  EntraSettings,
  EntraSettingsInput,
  EntraStatus,
} from "@milo/shared";
import { badRequest, fail } from "./http.js";
import type { MailAttachment } from "./mail-template.js";
import { readSetting, writeSetting } from "../repositories/settings.js";

const KEY = "entra";

/** Les réglages tels qu'ils sont rangés : secret compris. */
interface Stored {
  client_id: string;
  tenant: string;
  secret: string;
  /**
   * Milo a été déconnecté d'Entra depuis le Paramétrage : plus rien ne passe
   * par Microsoft — connexions, annuaire, courrier — jusqu'à la reconnexion.
   */
  disconnected: boolean;
  /**
   * L'adresse d'où partent les e-mails de Milo — avis, assignations, réponses
   * aux demandes saisies. Une demande reçue répond de sa propre boîte.
   */
  mail_sender: string;
}

const EMPTY_VALUES: Stored = {
  client_id: "",
  tenant: "",
  secret: "",
  disconnected: false,
  mail_sender: "",
};

/** L'inscription que la messagerie OAuth rangeait, avant qu'Entra la reprenne. */
interface LegacyMessaging {
  oauth?: { client_id?: string; tenant?: string; secret?: string };
}

/**
 * Les réglages en base. Une base d'avant Entra n'en a pas : on reprend
 * l'inscription que la messagerie connaissait.
 */
export const entraSettings = (): Stored => {
  const readItems = readSetting<Partial<Stored> | null>(KEY, null);
  if (readItems) {
    return {
      client_id: readItems.client_id ?? "",
      tenant: readItems.tenant ?? "",
      secret: readItems.secret ?? "",
      disconnected: readItems.disconnected ?? false,
      mail_sender: readItems.mail_sender ?? "",
    };
  }

  const { oauth } = readSetting<LegacyMessaging>("mail", {});
  return {
    ...EMPTY_VALUES,
    client_id: oauth?.client_id ?? "",
    tenant: oauth?.tenant ?? "",
    secret: oauth?.secret ?? "",
  };
};

export const publicEntraSettings = (): EntraSettings => {
  const r = entraSettings();
  return {
    client_id: r.client_id,
    tenant: r.tenant,
    has_secret: r.secret !== "",
    mail_sender: r.mail_sender,
  };
};

const text = (value: unknown, max = 255): string =>
  String(value ?? "")
    .trim()
    .slice(0, max);

/** Ce qui n'est pas dit ne change pas ; pour le secret, la chaîne vide efface. */
export const updateEntra = (entry: EntraSettingsInput): void => {
  const nextItems = { ...entraSettings() };

  if (entry.client_id !== undefined) nextItems.client_id = text(entry.client_id);
  if (entry.tenant !== undefined) nextItems.tenant = text(entry.tenant);
  if (entry.secret !== undefined) nextItems.secret = String(entry.secret);
  if (entry.mail_sender !== undefined) {
    const address = text(entry.mail_sender);
    if (address && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address)) badRequest("Adresse d'envoi invalide");
    nextItems.mail_sender = address;
  }

  writeSetting(KEY, nextItems);
  cachedToken = null;
};

/** L'adresse d'envoi commune ; vide tant qu'on ne l'a pas réglée. */
export const sendingAddress = (): string => entraSettings().mail_sender;

const registrationComplete = (r: Stored): boolean => Boolean(r.client_id && r.tenant && r.secret);

/**
 * L'inscription est-elle complète, et Milo connecté ? Sans elles, rien ne
 * passe par Microsoft.
 */
export const entraConfigured = (): boolean => {
  const r = entraSettings();
  return registrationComplete(r) && !r.disconnected;
};

const requireRegistration = (): Stored => {
  const r = entraSettings();
  if (r.disconnected) badRequest("Milo est déconnecté d'Entra : reconnectez-le dans Paramétrage → Entra");
  if (!r.client_id) badRequest("Renseignez l'ID d'application dans Paramétrage → Entra");
  if (!r.tenant) badRequest("Renseignez l'ID de l'annuaire dans Paramétrage → Entra");
  if (!r.secret) badRequest("Renseignez le secret d'application dans Paramétrage → Entra");
  return r;
};

// --- Jetons ----------------------------------------------------------------

const AUTHORITY = "https://login.microsoftonline.com";
const GRAPH = "https://graph.microsoft.com/v1.0";

const endpoint = (tenant: string, what: "authorize" | "token"): string =>
  `${AUTHORITY}/${encodeURIComponent(tenant)}/oauth2/v2.0/${what}`;

interface TokenResponse {
  access_token?: string;
  id_token?: string;
  expires_in?: number;
  error?: string;
  error_description?: string;
}

const requestToken = async (tenant: string, body: URLSearchParams): Promise<TokenResponse> => {
  const response = await fetch(endpoint(tenant, "token"), {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body,
  });
  const token = (await response.json().catch(() => ({}))) as TokenResponse;
  if (!response.ok || !token.access_token) {
    // Microsoft décrit précisément ce qui manque (redirection non inscrite,
    // secret expiré, consentement absent) : ce message vaut mieux qu'un autre.
    fail(400, token.error_description?.split("\n")[0] || token.error || "Microsoft a refusé la demande");
  }
  return token;
};

/**
 * Le jeton de l'application pour Graph, gardé jusqu'à une minute avant son
 * expiration : chaque connexion et chaque envoi en demandent un, Microsoft
 * n'a pas à en délivrer un par appel.
 */
let cachedToken: { value: string; expiresAt: number } | null = null;

const appToken = async (): Promise<string> => {
  if (cachedToken && cachedToken.expiresAt > Date.now()) return cachedToken.value;

  const r = requireRegistration();
  const token = await requestToken(
    r.tenant,
    new URLSearchParams({
      client_id: r.client_id,
      client_secret: r.secret,
      grant_type: "client_credentials",
      scope: "https://graph.microsoft.com/.default",
    }),
  );
  cachedToken = {
    value: token.access_token!,
    expiresAt: Date.now() + ((token.expires_in ?? 3600) - 60) * 1000,
  };
  return cachedToken.value;
};

/**
 * L'état de la connexion de Milo à Entra : un jeton d'application obtenu
 * suffit à le dire — l'identifiant, l'annuaire et le secret sont acceptés.
 */
export const entraState = async (): Promise<EntraStatus> => {
  const r = entraSettings();
  if (!registrationComplete(r)) return { state: "unconfigured", error: "" };
  if (r.disconnected) return { state: "disconnected", error: "" };
  try {
    await appToken();
    return { state: "connected", error: "" };
  } catch (error) {
    return {
      state: "error",
      error: error instanceof Error ? error.message : "Microsoft a refusé la demande",
    };
  }
};

/**
 * Connecte ou déconnecte Milo. Dans les deux cas le jeton en cache tombe :
 * la reconnexion en redemande un, et rend donc l'état réel.
 */
export const connectEntra = (connected: boolean): void => {
  writeSetting(KEY, { ...entraSettings(), disconnected: !connected });
  cachedToken = null;
};

interface GraphError {
  error?: { code?: string; message?: string };
}

/** Un appel à Graph au nom de l'application. Lève ce que Graph a répondu. */
const graph = async <T>(
  path: string,
  init: { method?: string; body?: unknown; headers?: Record<string, string> } = {},
): Promise<T> => {
  const response = await fetch(path.startsWith("https://") ? path : `${GRAPH}${path}`, {
    method: init.method ?? "GET",
    headers: {
      Authorization: `Bearer ${await appToken()}`,
      ...(init.body !== undefined ? { "Content-Type": "application/json" } : {}),
      ...init.headers,
    },
    ...(init.body !== undefined ? { body: JSON.stringify(init.body) } : {}),
  });

  if (response.status === 202 || response.status === 204) return undefined as T;
  const body = (await response.json().catch(() => ({}))) as T & GraphError;
  if (!response.ok) {
    // Les permissions de l'application sont inscrites dans le jeton à sa
    // délivrance : un jeton gardé en cache ignore celles accordées depuis. Un
    // refus l'oublie, et l'essai suivant en demande un neuf.
    if (response.status === 401 || response.status === 403) cachedToken = null;
    fail(400, body.error?.message || `Microsoft Graph a répondu ${response.status}`);
  }
  return body;
};

interface Page<T> {
  value: T[];
  "@odata.nextLink"?: string;
}

/** Toutes les pages d'une liste Graph. */
const allPages = async <T>(path: string): Promise<T[]> => {
  const result: T[] = [];
  let nextPage: string | undefined = path;
  while (nextPage) {
    const page: Page<T> = await graph<Page<T>>(nextPage);
    result.push(...page.value);
    nextPage = page["@odata.nextLink"];
  }
  return result;
};

// --- Annuaire --------------------------------------------------------------

interface GraphUser {
  id: string;
  displayName?: string;
  givenName?: string | null;
  surname?: string | null;
  mail?: string | null;
  userPrincipalName?: string;
  onPremisesSyncEnabled?: boolean | null;
}

interface GraphGroup {
  id: string;
  displayName?: string;
  mail?: string | null;
  onPremisesSyncEnabled?: boolean | null;
}

const toUser = (u: GraphUser): EntraPrincipal => ({
  type: "user",
  id: u.id,
  name: u.displayName ?? "",
  email: u.mail || u.userPrincipalName || "",
  synced: u.onPremisesSyncEnabled === true,
});

const toGroup = (g: GraphGroup): EntraPrincipal => ({
  type: "group",
  id: g.id,
  name: g.displayName ?? "",
  email: g.mail ?? "",
  synced: g.onPremisesSyncEnabled === true,
});

/** Au plus, par recherche et par sorte : de quoi voir toute une famille de groupes. */
const RESULTS = 50;

/** Les éléments de plusieurs listes, sans doublon, dans l'ordre alphabétique. */
const merge = <T extends { id: string; displayName?: string }>(...lists: T[][]): T[] => {
  const byId = new Map<string, T>();
  for (const list of lists) for (const e of list) byId.set(e.id, e);
  return [...byId.values()].sort((x, y) =>
    (x.displayName ?? "").localeCompare(y.displayName ?? "", "fr", { sensitivity: "base" }),
  );
};

/**
 * Les utilisateurs et les groupes qui répondent à ce qu'on tape, deux
 * caractères au moins. Deux recherches se complètent :
 *
 *   - `startswith` : le nom — ou l'adresse, pour un utilisateur — commence
 *     par la saisie, telle quelle. C'est ce qu'on attend d'un nom comme
 *     « ARM_T2 », que la recherche plein texte découperait.
 *   - `$search` : un mot du nom commence par la saisie (« dupont » trouve
 *     « Jean Dupont »). Graph y découpe les noms aux espaces, aux « _ », aux
 *     tirets et aux changements de casse ; elle exige l'en-tête
 *     ConsistencyLevel.
 */
export const searchInDirectory = async (
  input: string,
  what: "all" | "groups" = "all",
): Promise<EntraPrincipal[]> => {
  const term = input.replace(/["\\]/g, "").trim();
  if (term.length < 2) return [];

  // Une apostrophe se double dans une chaîne OData.
  const odata = term.replace(/'/g, "''");
  const headers = { ConsistencyLevel: "eventual" };
  const empty = Promise.resolve({ value: [] });

  const groups = Promise.all([
    graph<Page<GraphGroup>>(
      `/groups?$filter=${encodeURIComponent(`startswith(displayName,'${odata}')`)}&$select=id,displayName,mail,onPremisesSyncEnabled&$top=${RESULTS}`,
    ),
    graph<Page<GraphGroup>>(
      `/groups?$search=${encodeURIComponent(`"displayName:${term}"`)}&$select=id,displayName,mail,onPremisesSyncEnabled&$top=${RESULTS}`,
      { headers },
    ),
  ]);

  const users =
    what === "groups"
      ? Promise.all([empty, empty] as [Promise<Page<GraphUser>>, Promise<Page<GraphUser>>])
      : Promise.all([
          graph<Page<GraphUser>>(
            `/users?$filter=${encodeURIComponent(`startswith(displayName,'${odata}') or startswith(mail,'${odata}') or startswith(userPrincipalName,'${odata}')`)}&$select=id,displayName,mail,userPrincipalName,onPremisesSyncEnabled&$top=${RESULTS}`,
          ),
          graph<Page<GraphUser>>(
            `/users?$search=${encodeURIComponent(`"displayName:${term}" OR "mail:${term}"`)}&$select=id,displayName,mail,userPrincipalName,onPremisesSyncEnabled&$top=${RESULTS}`,
            { headers },
          ),
        ]);

  const [[u1, u2], [g1, g2]] = await Promise.all([users, groups]);
  return [
    ...merge(u1.value, u2.value).map(toUser),
    ...merge(g1.value, g2.value).map(toGroup),
  ];
};

/** Le profil d'un utilisateur : son nom, son adresse. */
export const entraProfile = async (oid: string): Promise<GraphUser> =>
  graph<GraphUser>(
    `/users/${encodeURIComponent(oid)}?$select=id,displayName,givenName,surname,mail,userPrincipalName`,
  );

/** La fiche d'un utilisateur telle qu'Entra la tient : ce que citent les modèles. */
export interface EntraRecord {
  givenName?: string | null;
  surname?: string | null;
  displayName?: string | null;
  mail?: string | null;
  userPrincipalName?: string | null;
  businessPhones?: string[] | null;
  mobilePhone?: string | null;
  jobTitle?: string | null;
  department?: string | null;
  companyName?: string | null;
  streetAddress?: string | null;
  city?: string | null;
  state?: string | null;
  postalCode?: string | null;
  country?: string | null;
}

const RECORD_FIELDS =
  "givenName,surname,displayName,mail,userPrincipalName,businessPhones,mobilePhone," +
  "jobTitle,department,companyName,streetAddress,city,state,postalCode,country";

/** La fiche d'un utilisateur, par son identifiant. */
export const entraRecord = (oid: string): Promise<EntraRecord> =>
  graph<EntraRecord>(`/users/${encodeURIComponent(oid)}?$select=${RECORD_FIELDS}`);

/**
 * La fiche de qui porte cette adresse dans l'annuaire — son adresse
 * principale ou son identifiant de connexion ; « null » : personne.
 */
export const entraRecordByAddress = async (address: string): Promise<EntraRecord | null> => {
  const value = address.trim().replace(/'/g, "''");
  if (!value) return null;
  const filter = encodeURIComponent(`mail eq '${value}' or userPrincipalName eq '${value}'`);
  const page = await graph<Page<EntraRecord>>(
    `/users?$filter=${filter}&$select=${RECORD_FIELDS}&$top=1`,
  );
  return page.value[0] ?? null;
};

/**
 * Les groupes de l'utilisateur, y compris ceux dont il est membre par un autre
 * groupe : ses droits suivent ses groupes, quelle que soit la profondeur.
 */
export const entraGroups = async (oid: string): Promise<string[]> => {
  const groups = await allPages<{ id: string }>(
    `/users/${encodeURIComponent(oid)}/transitiveMemberOf/microsoft.graph.group?$select=id&$top=999`,
  );
  return groups.map((g) => g.id);
};

// --- Agenda ----------------------------------------------------------------

interface GraphAppointment {
  id: string;
  subject?: string | null;
  start?: { dateTime?: string };
  end?: { dateTime?: string };
  isAllDay?: boolean;
  isCancelled?: boolean;
  location?: { displayName?: string | null } | null;
  showAs?: string | null;
  webLink?: string | null;
}

/** Une date que Graph rend en UTC sans le dire : on la lui fait dire. */
const toUtc = (value: string | undefined): string => {
  if (!value) return "";
  return /(Z|[+-]\d{2}:\d{2})$/.test(value) ? value : `${value.replace(/\.\d+$/, "")}Z`;
};

/** Au plus, sur une période : de quoi couvrir un mois chargé. */
const APPOINTMENTS_MAX = 500;

/**
 * Les rendez-vous de l'agenda principal de l'utilisateur entre deux instants,
 * occurrences des séries comprises (calendarView). Demande la permission
 * d'application Calendars.Read ; les rendez-vous annulés n'y sont pas.
 */
export const entraAgenda = async (
  oid: string,
  start: Date,
  end: Date,
): Promise<AccessCalendarEvent[]> => {
  const searchParams = new URLSearchParams({
    startDateTime: start.toISOString(),
    endDateTime: end.toISOString(),
    $select: "id,subject,start,end,isAllDay,isCancelled,location,showAs,webLink",
    $orderby: "start/dateTime",
    $top: "100",
  });
  const appointments: GraphAppointment[] = [];
  let nextPage: string | undefined =
    `/users/${encodeURIComponent(oid)}/calendarView?${searchParams.toString()}`;
  while (nextPage && appointments.length < APPOINTMENTS_MAX) {
    const page: Page<GraphAppointment> = await graph<Page<GraphAppointment>>(nextPage, {
      headers: { Prefer: 'outlook.timezone="UTC"' },
    });
    appointments.push(...page.value);
    nextPage = page["@odata.nextLink"];
  }
  return appointments
    .filter((r) => !r.isCancelled)
    .map((r) => ({
      id: r.id,
      subject: r.subject ?? "",
      start: toUtc(r.start?.dateTime),
      end: toUtc(r.end?.dateTime),
      all_day: r.isAllDay === true,
      location: r.location?.displayName ?? "",
      show_as: r.showAs ?? "",
      url: r.webLink ?? "",
    }));
};

// --- Boîte personnelle -----------------------------------------------------
//
// Ce que le widget Mail montre : la boîte de réception de qui regarde, lue
// par l'application (Mail.Read). Rien n'y est modifié — un e-mail ouvert dans
// Milo n'est pas marqué lu : cela demanderait Mail.ReadWrite sur toutes les
// boîtes.

interface GraphAddress {
  emailAddress?: { name?: string; address?: string };
}

interface GraphHeader {
  id: string;
  subject?: string | null;
  from?: GraphAddress | null;
  receivedDateTime?: string;
  bodyPreview?: string;
  isRead?: boolean;
  hasAttachments?: boolean;
  importance?: string;
}

const HEADER_FIELDS = "id,subject,from,receivedDateTime,bodyPreview,isRead,hasAttachments,importance";

const toAddress = (a: GraphAddress | null | undefined): MailAddress => ({
  name: a?.emailAddress?.name ?? "",
  email: a?.emailAddress?.address ?? "",
});

const toHeader = (m: GraphHeader): AccessMail => ({
  id: m.id,
  subject: m.subject ?? "",
  from: toAddress(m.from),
  received_at: m.receivedDateTime ?? "",
  preview: m.bodyPreview ?? "",
  is_read: m.isRead !== false,
  has_attachments: Boolean(m.hasAttachments),
  importance: m.importance ?? "normal",
});

/**
 * Une page de la boîte de réception, des plus récents aux plus anciens.
 * « nonLus » ne garde que les non lus : Graph veut alors que le tri porte
 * aussi sur le filtre, et dans le même ordre — d'où la date en tête du filtre.
 */
export const mailboxPage = async (
  oid: string,
  offset: number,
  howMany: number,
  unreadOnly: boolean,
): Promise<AccessMailPage> => {
  const searchParams = new URLSearchParams({
    $top: String(howMany),
    $skip: String(offset),
    $select: HEADER_FIELDS,
    $orderby: "receivedDateTime desc",
  });
  if (unreadOnly) searchParams.set("$filter", "receivedDateTime ge 1900-01-01T00:00:00Z and isRead eq false");
  const mailbox = `/users/${encodeURIComponent(oid)}/mailFolders/inbox`;
  const [page, folder] = await Promise.all([
    graph<Page<GraphHeader>>(`${mailbox}/messages?${searchParams.toString()}`),
    offset === 0
      ? graph<{ unreadItemCount?: number }>(`${mailbox}?$select=unreadItemCount`)
      : Promise.resolve(null),
  ]);
  return {
    messages: page.value.map(toHeader),
    more: Boolean(page["@odata.nextLink"]),
    ...(folder ? { unread: folder.unreadItemCount ?? 0 } : {}),
  };
};

/** Au-delà, une image intégrée n'est pas rapatriée : elle ferait un corps trop lourd. */
const EMBEDDED_IMAGE_MAX = 2 * 1024 * 1024;

/**
 * Un e-mail de la boîte, corps compris tel que l'expéditeur l'a écrit, et ses
 * pièces jointes. Les images intégrées (« cid: ») reviennent en adresses
 * « data: », prêtes à remplacer leur citation.
 */
export const mailOfMailbox = async (
  oid: string,
  id: string,
): Promise<{
  header: AccessMail;
  to: MailAddress[];
  cc: MailAddress[];
  body: string;
  body_type: "html" | "text";
  url: string;
  images: Map<string, string>;
  attachments: AccessMailAttachment[];
}> => {
  const base = `/users/${encodeURIComponent(oid)}/messages/${encodeURIComponent(id)}`;
  const message = await graph<
    GraphHeader & {
      toRecipients?: GraphAddress[];
      ccRecipients?: GraphAddress[];
      body?: { content?: string; contentType?: string };
      webLink?: string;
    }
  >(`${base}?$select=${HEADER_FIELDS},toRecipients,ccRecipients,body,webLink`);

  const images = new Map<string, string>();
  const attachments: AccessMailAttachment[] = [];
  if (message.hasAttachments || /cid:/i.test(message.body?.content ?? "")) {
    const graphAttachments = await allPages<GraphAttachment>(
      `${base}/attachments?$select=id,name,contentType,size,isInline`,
    );
    for (const attachment of graphAttachments) {
      if (attachment["@odata.type"] !== "#microsoft.graph.fileAttachment") continue;
      if (!attachment.isInline) {
        attachments.push({ id: attachment.id, name: attachment.name ?? "piece-jointe", size: attachment.size ?? 0 });
        continue;
      }
      if ((attachment.size ?? 0) > EMBEDDED_IMAGE_MAX) continue;
      const detail = await graph<GraphAttachment & { contentBytes?: string }>(
        `${base}/attachments/${encodeURIComponent(attachment.id)}`,
      );
      const cid = (detail.contentId ?? "").replace(/^<|>$/g, "");
      if (cid && detail.contentBytes && /^image\//.test(detail.contentType ?? "")) {
        images.set(cid, `data:${detail.contentType};base64,${detail.contentBytes}`);
      }
    }
  }

  return {
    header: toHeader(message),
    to: (message.toRecipients ?? []).map(toAddress),
    cc: (message.ccRecipients ?? []).map(toAddress),
    body: message.body?.content ?? "",
    body_type: (message.body?.contentType ?? "").toLowerCase() === "text" ? "text" : "html",
    url: message.webLink ?? "",
    images,
    attachments,
  };
};

/** Une pièce jointe d'un e-mail de la boîte, contenu compris. */
export const mailboxAttachment = async (
  oid: string,
  id: string,
  attachmentId: string,
): Promise<{ name: string; mime: string; content: Buffer }> => {
  const attachment = await graph<GraphAttachment & { contentBytes?: string }>(
    `/users/${encodeURIComponent(oid)}/messages/${encodeURIComponent(id)}/attachments/${encodeURIComponent(attachmentId)}`,
  );
  if (attachment["@odata.type"] !== "#microsoft.graph.fileAttachment" || !attachment.contentBytes) {
    fail(404, "Pièce jointe introuvable");
  }
  return {
    name: attachment.name ?? "piece-jointe",
    mime: attachment.contentType ?? "application/octet-stream",
    content: Buffer.from(attachment.contentBytes!, "base64"),
  };
};

// --- Connexion des utilisateurs --------------------------------------------

/** Ce que la connexion demande : qui est la personne, rien de plus. */
const SIGN_IN_SCOPE = "openid profile email";

/** L'adresse de la page de connexion Microsoft. */
export const loginUrl = (redirectUri: string, state: string): string => {
  const r = requireRegistration();
  const searchParams = new URLSearchParams({
    client_id: r.client_id,
    response_type: "code",
    redirect_uri: redirectUri,
    response_mode: "query",
    scope: SIGN_IN_SCOPE,
    state,
    prompt: "select_account",
  });
  return `${endpoint(r.tenant, "authorize")}?${searchParams.toString()}`;
};

/** Les revendications du jeton d'identité dont on se sert. */
interface Claims {
  oid?: string;
  tid?: string;
  aud?: string;
  preferred_username?: string;
  email?: string;
  name?: string;
}

/**
 * Le code de retour échangé contre un jeton d'identité, dont on tire la
 * personne. Le jeton arrive directement de Microsoft, par une connexion TLS
 * que nous avons ouverte et authentifiée par le secret : sa signature n'a pas
 * à être revérifiée (OpenID Connect, § 3.1.3.7). On contrôle en revanche
 * qu'il vient bien de notre locataire et qu'il nous est destiné.
 */
export const completeLogin = async (
  code: string,
  redirectUri: string,
): Promise<{ oid: string; email: string; name: string }> => {
  const r = requireRegistration();
  const token = await requestToken(
    r.tenant,
    new URLSearchParams({
      client_id: r.client_id,
      client_secret: r.secret,
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri,
      scope: SIGN_IN_SCOPE,
    }),
  );

  let claims: Claims = {};
  try {
    const loaded = token.id_token?.split(".")[1] ?? "";
    claims = JSON.parse(Buffer.from(loaded, "base64url").toString("utf8")) as Claims;
  } catch {
    fail(400, "Microsoft n'a pas renvoyé de jeton d'identité lisible");
  }

  if (claims.aud !== r.client_id) fail(400, "Jeton d'identité destiné à une autre application");
  // Un locataire saisi par son nom de domaine ne se compare pas à l'identifiant
  // du jeton : seul un identifiant est contrôlé.
  if (/^[0-9a-f-]{36}$/i.test(r.tenant) && claims.tid?.toLowerCase() !== r.tenant.toLowerCase()) {
    fail(403, "Ce compte n'appartient pas à l'annuaire de l'entreprise");
  }
  if (!claims.oid) fail(400, "Microsoft n'a pas renvoyé l'identifiant du compte");

  return {
    oid: claims.oid!,
    email: text(claims.email ?? claims.preferred_username ?? ""),
    name: text(claims.name ?? ""),
  };
};

// --- Courrier --------------------------------------------------------------

export interface Sending {
  /** La boîte qui expédie : celle du support d'une société. */
  from: string;
  to: string;
  subject: string;
  text: string;
  html?: string;
  attachments?: MailAttachment[];
}

/**
 * Un envoi au nom d'une boîte, par Graph (Mail.Send). Le message n'est pas
 * gardé dans ses éléments envoyés : ce sont des notifications, pas une
 * correspondance.
 */
export const sendViaGraph = async ({ from, to, subject, text, html, attachments }: Sending) => {
  await graph(`/users/${encodeURIComponent(from)}/sendMail`, {
    method: "POST",
    body: {
      message: {
        subject,
        body: html ? { contentType: "HTML", content: html } : { contentType: "Text", content: text },
        toRecipients: [{ emailAddress: { address: to } }],
        attachments: (attachments ?? []).map((p) => ({
          "@odata.type": "#microsoft.graph.fileAttachment",
          name: p.filename,
          contentType: p.contentType,
          contentBytes: p.content.toString("base64"),
          isInline: true,
          contentId: p.cid,
        })),
      },
      saveToSentItems: false,
    },
  });
};

export interface ReceivedMessage {
  id: string;
  subject: string;
  from: string;
  received_at: string;
  preview: string;
}

interface MessageGraph {
  id: string;
  subject?: string;
  receivedDateTime?: string;
  bodyPreview?: string;
  from?: { emailAddress?: { address?: string } };
}

/** Les derniers messages de la boîte de réception d'une boîte (Mail.Read). */
export const readMessages = async (mailbox: string, howMany = 25): Promise<ReceivedMessage[]> => {
  const page = await graph<Page<MessageGraph>>(
    `/users/${encodeURIComponent(mailbox)}/mailFolders/inbox/messages?$top=${howMany}&$select=id,subject,receivedDateTime,bodyPreview,from&$orderby=receivedDateTime desc`,
  );
  return page.value.map((m) => ({
    id: m.id,
    subject: m.subject ?? "",
    from: m.from?.emailAddress?.address ?? "",
    received_at: m.receivedDateTime ?? "",
    preview: m.bodyPreview ?? "",
  }));
};

export interface ReceivedMail {
  /** L'identifiant de Graph, pour aller chercher le reste du message. */
  graph_id: string;
  /** L'identifiant Internet (Message-ID) : il ne change pas si le message change de dossier. */
  mail_id: string;
  /** La conversation de Graph : une réponse arrive dans la même. */
  conversation_id: string;
  subject: string;
  from_name: string;
  from_email: string;
  received_at: string;
  /** Le corps tel que l'expéditeur l'a écrit : du HTML le plus souvent. */
  body: string;
  body_type: "html" | "text";
  has_attachments: boolean;
}

interface GraphMail {
  id: string;
  internetMessageId?: string;
  conversationId?: string;
  subject?: string;
  receivedDateTime?: string;
  from?: { emailAddress?: { address?: string; name?: string } };
  body?: { content?: string; contentType?: string };
  hasAttachments?: boolean;
}

/** Un message de Graph tel que la relève le lit, corps compris. */
const MAIL_FIELDS =
  "id,internetMessageId,conversationId,subject,receivedDateTime,from,body,hasAttachments";

const toMail = (m: GraphMail): ReceivedMail => ({
  graph_id: m.id,
  mail_id: m.internetMessageId || m.id,
  conversation_id: m.conversationId ?? "",
  subject: m.subject ?? "",
  from_name: m.from?.emailAddress?.name ?? "",
  from_email: m.from?.emailAddress?.address ?? "",
  received_at: m.receivedDateTime ?? "",
  body: m.body?.content ?? "",
  body_type: (m.body?.contentType ?? "").toLowerCase() === "text" ? "text" : "html",
  has_attachments: Boolean(m.hasAttachments),
});

interface PageDelta<T> extends Page<T> {
  "@odata.deltaLink"?: string;
}

/**
 * La delta query de la boîte de réception : ce qui y est arrivé depuis la
 * dernière fois, et le lien qui servira la prochaine. Sans lien — la première
 * fois —, Graph rend toute la boîte, puis le lien. Ce qui a été retiré de la
 * boîte (« @removed ») est écarté : Milo ne retire rien de son côté.
 *
 * Le corps arrive tel qu'il a été écrit, en HTML : converti en texte par
 * Graph, il perdait ses images, sa mise en page et gagnait des sauts de ligne.
 */
export const mailboxDelta = async (
  mailbox: string,
  link: string | null,
): Promise<{ mails: ReceivedMail[]; link: string }> => {
  let nextPage: string | undefined =
    link ??
    `/users/${encodeURIComponent(mailbox)}/mailFolders/inbox/messages/delta?$select=${MAIL_FIELDS}`;
  const mails: ReceivedMail[] = [];
  let deltaLink = "";
  while (nextPage) {
    const page: PageDelta<GraphMail & { "@removed"?: unknown }> = await graph(nextPage, {
      headers: { Prefer: "odata.maxpagesize=50" },
    });
    for (const m of page.value) if (!m["@removed"]) mails.push(toMail(m));
    nextPage = page["@odata.nextLink"];
    deltaLink = page["@odata.deltaLink"] ?? deltaLink;
  }
  return { mails, link: deltaLink };
};

/**
 * Retire un e-mail relevé de la boîte (Mail.ReadWrite). Graph le range dans
 * les éléments supprimés plutôt que de l'effacer : il y reste retrouvable,
 * et la réponse à sa demande (repondreParGraph) le cite toujours.
 */
export const deleteMail = async (mailbox: string, graphId: string): Promise<void> => {
  await graph(`/users/${encodeURIComponent(mailbox)}/messages/${encodeURIComponent(graphId)}`, {
    method: "DELETE",
  });
};

/** Ce que la delta query ne dit pas — ou plus — d'un e-mail. */
export interface MailDetails {
  /** Ce qu'il cite de ceux qui le précèdent : In-Reply-To et References. */
  cited: string[];
  conversation_id: string;
  has_attachments: boolean;
  /**
   * Ce que l'e-mail apporte de neuf : son corps sans l'historique qu'il cite,
   * tel qu'Exchange le détache de la conversation. Vide si Graph ne le donne pas.
   */
  unique_body: string;
  unique_body_type: "html" | "text";
}

/**
 * Relu message par message plutôt que dans la delta query : le lien delta
 * garde les champs demandés à sa création, et un lien créé avant qu'on les
 * demande ne les rendrait jamais.
 */
export const mailDetails = async (
  mailbox: string,
  graphId: string,
): Promise<MailDetails> => {
  const message = await graph<{
    internetMessageHeaders?: { name: string; value: string }[];
    conversationId?: string;
    hasAttachments?: boolean;
    uniqueBody?: { content?: string; contentType?: string };
  }>(
    `/users/${encodeURIComponent(mailbox)}/messages/${encodeURIComponent(graphId)}?$select=internetMessageHeaders,conversationId,hasAttachments,uniqueBody`,
  );
  return {
    cited: (message.internetMessageHeaders ?? [])
      .filter((e) => /^(in-reply-to|references)$/i.test(e.name))
      .flatMap((e) => e.value.match(/<[^>]+>/g) ?? []),
    conversation_id: message.conversationId ?? "",
    has_attachments: Boolean(message.hasAttachments),
    unique_body: message.uniqueBody?.content ?? "",
    unique_body_type:
      (message.uniqueBody?.contentType ?? "").toLowerCase() === "text" ? "text" : "html",
  };
};

/** Un fichier joint à un e-mail : une image intégrée au corps, ou une pièce jointe. */
export interface ReceivedFile {
  name: string;
  mime: string;
  size: number;
  inline: boolean;
  /** Ce que le corps cite (« cid:… ») pour une image intégrée. */
  content_id: string;
  content: Buffer;
}

interface GraphAttachment {
  "@odata.type"?: string;
  id: string;
  name?: string;
  contentType?: string;
  size?: number;
  isInline?: boolean;
  contentId?: string | null;
}

/**
 * Les fichiers d'un e-mail, contenu compris. Seuls les fichiers passent : un
 * e-mail joint à un autre, ou un lien vers un document partagé, n'a pas de
 * contenu à rapatrier. Au-delà de « tailleMax », un fichier est laissé dans la
 * boîte.
 */
export const mailFiles = async (
  mailbox: string,
  graphId: string,
  maxSize: number,
): Promise<ReceivedFile[]> => {
  const base = `/users/${encodeURIComponent(mailbox)}/messages/${encodeURIComponent(graphId)}/attachments`;
  const graphAttachments = await allPages<GraphAttachment>(
    `${base}?$select=id,name,contentType,size,isInline`,
  );
  const files: ReceivedFile[] = [];
  for (const attachment of graphAttachments) {
    if (attachment["@odata.type"] !== "#microsoft.graph.fileAttachment") continue;
    if ((attachment.size ?? 0) > maxSize) continue;
    // Le contenu à part, en brut : dans la liste, il ferait voyager tous les
    // fichiers en base64 d'un coup.
    const detail = await graph<GraphAttachment & { contentBytes?: string }>(
      `${base}/${encodeURIComponent(attachment.id)}`,
    );
    if (!detail.contentBytes) continue;
    files.push({
      name: attachment.name ?? "piece-jointe",
      mime: attachment.contentType ?? "application/octet-stream",
      size: attachment.size ?? 0,
      inline: Boolean(detail.isInline),
      content_id: (detail.contentId ?? "").replace(/^<|>$/g, ""),
      content: Buffer.from(detail.contentBytes, "base64"),
    });
  }
  return files;
};

/**
 * Répond à un e-mail reçu, depuis la boîte qui l'a reçu (Mail.Send) : la
 * réponse part dans la même conversation, le message d'origine cité dessous.
 * Le message est retrouvé par son identifiant Internet — celui que Milo garde
 * —, l'identifiant de Graph changeant quand un message change de dossier.
 *
 * Elle porte le numéro du ticket, dans son objet et dans l'en-tête
 * X-Milo-Ticket : une réponse de l'expéditeur retrouve ainsi sa demande, même
 * si son logiciel a perdu le fil de la conversation. Sa propre réponse citera
 * de toute façon l'e-mail d'origine dans ses en-têtes (References).
 *
 * Tout passe par « reply », qui n'exige que Mail.Send : un brouillon
 * (« createReply ») demanderait en plus Mail.ReadWrite sur la boîte.
 */
export const replyByGraph = async (
  mailbox: string,
  mailId: string,
  html: string,
  ticket: string,
  copies: { cc: string[]; bcc: string[] } = { cc: [], bcc: [] },
  graphAttachments: { name: string; mime: string; content: Buffer }[] = [],
): Promise<void> => {
  const root = `/users/${encodeURIComponent(mailbox)}/messages`;
  const found = await graph<Page<{ id: string; subject?: string }>>(
    `${root}?$filter=internetMessageId eq '${mailId.replace(/'/g, "''")}'&$select=id,subject&$top=1`,
  );
  const message = found.value[0];
  if (!message) fail(400, "L'e-mail d'origine est introuvable dans la boîte de support");

  // « Imprimante » devient « RE: [HLP-12] Imprimante » ; un objet qui porte
  // déjà le numéro le garde tel quel.
  const origin = (message!.subject ?? "").replace(/^((?:re|tr|fw|fwd)\s*:\s*)+/i, "");
  const subject = origin.includes(`[${ticket}]`) ? `RE: ${origin}` : `RE: [${ticket}] ${origin}`;

  await graph(`${root}/${encodeURIComponent(message!.id)}/reply`, {
    method: "POST",
    body: {
      comment: html,
      message: {
        subject: subject.trim(),
        internetMessageHeaders: [{ name: "X-Milo-Ticket", value: ticket }],
        ccRecipients: copies.cc.map((address) => ({ emailAddress: { address } })),
        bccRecipients: copies.bcc.map((address) => ({ emailAddress: { address } })),
        attachments: graphAttachments.map((p) => ({
          "@odata.type": "#microsoft.graph.fileAttachment",
          name: p.name,
          contentType: p.mime,
          contentBytes: p.content.toString("base64"),
        })),
      },
    },
  });
};

// --- Notifications de changement -------------------------------------------

export interface Subscription {
  id: string;
  expirationDateTime: string;
}

/**
 * Demande à Graph de prévenir Milo de chaque e-mail qui arrive dans la boîte
 * de réception. Graph vérifie l'adresse avant d'accepter : Milo doit déjà
 * écouter, et répondre à sa validation.
 */
export const createSubscription = (
  mailbox: string,
  notificationUrl: string,
  clientState: string,
  expiration: string,
): Promise<Subscription> =>
  graph<Subscription>("/subscriptions", {
    method: "POST",
    body: {
      changeType: "created",
      notificationUrl,
      resource: `users/${mailbox}/mailFolders('inbox')/messages`,
      expirationDateTime: expiration,
      clientState,
    },
  });

export const renewSubscription = (id: string, expiration: string): Promise<Subscription> =>
  graph<Subscription>(`/subscriptions/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: { expirationDateTime: expiration },
  });

export const deleteSubscription = (id: string): Promise<void> =>
  graph<void>(`/subscriptions/${encodeURIComponent(id)}`, { method: "DELETE" });
