// Entra ID: the app registration everything rests on.
//
//   - User sign-in, through OpenID Connect (authorization code).
//   - The directory — users, groups, memberships —, through Microsoft Graph
//     with the app's permissions: User.Read.All, Group.Read.All,
//     GroupMember.Read.All.
//   - Mail of the support mailboxes and of notifications, through Graph
//     again: Mail.Read to read, Mail.Send to send on their behalf.
//   - Everyone's calendar, for the Calendar widget: Calendars.Read; their
//     inbox, for the Mail widget: Mail.Read again.
//
// The app's permissions require the consent of a tenant administrator, given
// once in the Azure portal. See the "Entra" section of the README.
//
// The secret is stored in the database with the rest of the settings and
// never comes back out through the API. This is not encryption: whoever can
// read the database can read it. The database is what needs protecting — it
// already holds the sessions.

import type {
  AccessCalendarEvent,
  AccessCalendarChoice,
  AccessMail,
  AccessMailAttachment,
  AccessMailFolder,
  AccessMailFolderCount,
  MailFolderKind,
  MailAddress,
  EntraPrincipal,
  EntraSettings,
  EntraCheck,
  EntraSettingsInput,
  EntraStatus,
} from "@milo/shared";
import { MAIL_FOLDER_KINDS } from "@milo/shared";
import { badRequest, fail } from "./http.js";
import type { MailAttachment } from "./mail-template.js";
import { readSetting, writeSetting } from "../repositories/settings.js";

const KEY = "entra";

/** The settings as stored: secret included. */
interface Stored {
  client_id: string;
  tenant: string;
  secret: string;
  /**
   * Milo has been disconnected from Entra via Settings: nothing goes through
   * Microsoft — sign-ins, directory, mail — until it is reconnected.
   */
  disconnected: boolean;
  /**
   * The address Milo's e-mails are sent from — notices, assignments, replies
   * to manually entered requests. A received request is answered from its own
   * mailbox.
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

/** The registration the OAuth mailer used to store, before Entra took it over. */
interface LegacyMessaging {
  oauth?: { client_id?: string; tenant?: string; secret?: string };
}

/**
 * The settings in the database. A database from before Entra has none: we
 * take over the registration the mailer knew.
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

/** What is not stated does not change; for the secret, the empty string clears it. */
export const updateEntra = (entry: EntraSettingsInput): void => {
  const nextItems = { ...entraSettings() };

  if (entry.client_id !== undefined) nextItems.client_id = text(entry.client_id);
  if (entry.tenant !== undefined) nextItems.tenant = text(entry.tenant);
  if (entry.secret !== undefined) nextItems.secret = String(entry.secret);
  if (entry.mail_sender !== undefined) {
    const address = text(entry.mail_sender);
    if (!address) badRequest("L'adresse d'envoi est requise");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address)) badRequest("Adresse d'envoi invalide");
    nextItems.mail_sender = address;
  }

  writeSetting(KEY, nextItems);
  cachedToken = null;
};

/** The shared sending address; empty until it has been set. */
export const sendingAddress = (): string => entraSettings().mail_sender;

const registrationComplete = (r: Stored): boolean => Boolean(r.client_id && r.tenant && r.secret);

/** The application's ID, directory and secret are all filled in. */
export const entraRegistered = (): boolean => registrationComplete(entraSettings());

/**
 * Is the registration complete, and Milo connected? Without them, nothing
 * goes through Microsoft.
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

// --- Tokens -----------------------------------------------------------------

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
    // Microsoft describes precisely what is missing (unregistered redirect,
    // expired secret, missing consent): this message beats any other.
    fail(400, token.error_description?.split("\n")[0] || token.error || "Microsoft a refusé la demande");
  }
  return token;
};

/**
 * The app's token for Graph, kept until a minute before it expires: every
 * sign-in and every send asks for one, and Microsoft need not issue one per
 * call.
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
 * The state of Milo's connection to Entra: an app token obtained is enough
 * to say it — the id, the tenant and the secret are accepted.
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
 * The application permissions of the last token the check obtained: the
 * check's first step asks for one, the following ones read it.
 */
let checkedRoles: string[] | null = null;

/** The "roles" claim of an access token: the application permissions granted. */
const tokenRoles = (token: string): string[] => {
  try {
    const payload = JSON.parse(Buffer.from(token.split(".")[1] ?? "", "base64url").toString("utf8")) as {
      roles?: unknown;
    };
    return Array.isArray(payload.roles) ? payload.roles.map(String) : [];
  } catch {
    return [];
  }
};

/**
 * One step of the connection check (ENTRA_CHECKS), even while disconnected:
 * it decides whether to reconnect. "token" asks Microsoft for a fresh app
 * token; a permission is looked up in that token's roles — they are written
 * in it as granted, with the administrator's consent.
 */
export const checkEntra = async (step: string): Promise<EntraCheck> => {
  try {
    if (step === "token" || !checkedRoles) {
      const r = entraSettings();
      if (!registrationComplete(r)) badRequest("Renseignez l'ID d'application, l'ID de l'annuaire et le secret");
      const token = await requestToken(
        r.tenant,
        new URLSearchParams({
          client_id: r.client_id,
          client_secret: r.secret,
          grant_type: "client_credentials",
          scope: "https://graph.microsoft.com/.default",
        }),
      );
      checkedRoles = tokenRoles(token.access_token!);
    }
    if (step === "token") return { ok: true, error: "" };
    return checkedRoles.includes(step)
      ? { ok: true, error: "" }
      : { ok: false, error: "Permission non accordée, ou sans consentement d'administrateur" };
  } catch (error) {
    if (step === "token") checkedRoles = null;
    return { ok: false, error: error instanceof Error ? error.message : "Microsoft a refusé la demande" };
  }
};

/**
 * Connects or disconnects Milo. In both cases the cached token is dropped:
 * reconnecting asks for a new one, and thus returns the real state.
 */
export const connectEntra = (connected: boolean): void => {
  writeSetting(KEY, { ...entraSettings(), disconnected: !connected });
  cachedToken = null;
};

interface GraphError {
  error?: { code?: string; message?: string };
}

/**
 * Exchange refuses more than four simultaneous requests from one app to one
 * mailbox ("MailboxConcurrency"): a Mail widget reading several folders, a
 * Calendar widget and a webhook reread easily exceed it. The calls to a
 * mailbox — "/users/{id}/…" — wait their turn beyond this many.
 */
const MAILBOX_CONCURRENCY = 3;

const mailboxQueues = new Map<string, { running: number; waiting: (() => void)[] }>();

/** The mailbox a Graph path reaches, if any: the "users" segment followed by more. */
const mailboxOfPath = (path: string): string | null =>
  /\/users\/([^/?]+)\/[^?]/.exec(path)?.[1]?.toLowerCase() ?? null;

const inMailboxTurn = async <T>(path: string, call: () => Promise<T>): Promise<T> => {
  const mailbox = mailboxOfPath(path);
  if (!mailbox) return call();
  let queue = mailboxQueues.get(mailbox);
  if (!queue) mailboxQueues.set(mailbox, (queue = { running: 0, waiting: [] }));
  if (queue.running >= MAILBOX_CONCURRENCY) await new Promise<void>((resolve) => queue!.waiting.push(resolve));
  queue.running++;
  try {
    return await call();
  } finally {
    queue.running--;
    const next = queue.waiting.shift();
    if (next) next();
    else if (queue.running === 0) mailboxQueues.delete(mailbox);
  }
};

/** How many times a throttled call (429) is retried, after the wait Graph asks for. */
const THROTTLE_RETRIES = 3;
const THROTTLE_WAIT_MAX = 10_000;

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** A call to Graph on behalf of the app. Throws what Graph answered. */
const graph = async <T>(
  path: string,
  init: { method?: string; body?: unknown; headers?: Record<string, string> } = {},
): Promise<T> => {
  const send = async () =>
    fetch(path.startsWith("https://") ? path : `${GRAPH}${path}`, {
      method: init.method ?? "GET",
      headers: {
        Authorization: `Bearer ${await appToken()}`,
        ...(init.body !== undefined ? { "Content-Type": "application/json" } : {}),
        ...init.headers,
      },
      ...(init.body !== undefined ? { body: JSON.stringify(init.body) } : {}),
    });

  const response = await inMailboxTurn(path, async () => {
    let attempt = await send();
    for (let retry = 1; attempt.status === 429 && retry <= THROTTLE_RETRIES; retry++) {
      const seconds = Number(attempt.headers.get("Retry-After"));
      await sleep(Math.min(THROTTLE_WAIT_MAX, seconds > 0 ? seconds * 1000 : 500 * 2 ** retry));
      attempt = await send();
    }
    return attempt;
  });

  if (response.status === 202 || response.status === 204) return undefined as T;
  const body = (await response.json().catch(() => ({}))) as T & GraphError;
  if (!response.ok) {
    // The app's permissions are written into the token when it is issued: a
    // cached token knows nothing of those granted since. A refusal forgets it,
    // and the next attempt asks for a fresh one.
    if (response.status === 401 || response.status === 403) cachedToken = null;
    fail(400, body.error?.message || `Microsoft Graph a répondu ${response.status}`);
  }
  return body;
};

interface Page<T> {
  value: T[];
  "@odata.nextLink"?: string;
}

/** All the pages of a Graph list. */
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

// --- Directory --------------------------------------------------------------

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

/** At most, per search and per kind: enough to see a whole family of groups. */
const RESULTS = 50;

/** The items of several lists, without duplicates, in alphabetical order. */
const merge = <T extends { id: string; displayName?: string }>(...lists: T[][]): T[] => {
  const byId = new Map<string, T>();
  for (const list of lists) for (const e of list) byId.set(e.id, e);
  return [...byId.values()].sort((x, y) =>
    (x.displayName ?? "").localeCompare(y.displayName ?? "", "fr", { sensitivity: "base" }),
  );
};

/**
 * The users and groups matching what is typed, two characters at least. Two
 * searches complement each other:
 *
 *   - `startswith`: the name — or the address, for a user — begins with the
 *     input, as is. That is what one expects for a name like "ARM_T2", which
 *     full-text search would split.
 *   - `$search`: a word of the name begins with the input ("dupont" finds
 *     "Jean Dupont"). Graph splits names there at spaces, at "_", at hyphens
 *     and at case changes; it requires the ConsistencyLevel header.
 */
export const searchInDirectory = async (
  input: string,
  what: "all" | "groups" = "all",
): Promise<EntraPrincipal[]> => {
  const term = input.replace(/["\\]/g, "").trim();
  if (term.length < 2) return [];

  // An apostrophe is doubled in an OData string.
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

/** A user's profile: their name, their address. */
export const entraProfile = async (oid: string): Promise<GraphUser> =>
  graph<GraphUser>(
    `/users/${encodeURIComponent(oid)}?$select=id,displayName,givenName,surname,mail,userPrincipalName`,
  );

/** A user's record as Entra holds it: what the templates cite. */
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

/** A user's record, by their id. */
export const entraRecord = (oid: string): Promise<EntraRecord> =>
  graph<EntraRecord>(`/users/${encodeURIComponent(oid)}?$select=${RECORD_FIELDS}`);

/**
 * The record of whoever holds this address in the directory — their primary
 * address or their sign-in id; "null": nobody.
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
 * The user's groups, including those they belong to through another group:
 * their rights follow their groups, whatever the depth.
 */
export const entraGroups = async (oid: string): Promise<string[]> => {
  const groups = await allPages<{ id: string }>(
    `/users/${encodeURIComponent(oid)}/transitiveMemberOf/microsoft.graph.group?$select=id&$top=999`,
  );
  return groups.map((g) => g.id);
};

/**
 * A group's users, including those it holds through another group: the
 * people an invitation sent to the group reaches.
 */
export const entraGroupMembers = async (groupId: string): Promise<EntraPrincipal[]> => {
  const members = await allPages<GraphUser>(
    `/groups/${encodeURIComponent(groupId)}/transitiveMembers/microsoft.graph.user?$select=id,displayName,mail,userPrincipalName&$top=999`,
  );
  return members.map(toUser);
};

// --- Calendar ---------------------------------------------------------------

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
  sensitivity?: string | null;
}

/** A date that Graph returns in UTC without saying so: we make it say so. */
const toUtc = (value: string | undefined): string => {
  if (!value) return "";
  return /(Z|[+-]\d{2}:\d{2})$/.test(value) ? value : `${value.replace(/\.\d+$/, "")}Z`;
};

/** At most, over a period: enough to cover a busy month. */
const APPOINTMENTS_MAX = 500;

/**
 * A user's Outlook calendars — their main one, and those they created or that
 * were shared with them —, the main one first. Same permission as their
 * appointments (Calendars.Read).
 */
export const entraCalendars = async (user: string): Promise<AccessCalendarChoice[]> => {
  const calendars: AccessCalendarChoice[] = [];
  let nextPage: string | undefined =
    `/users/${encodeURIComponent(user)}/calendars?$select=id,name,isDefaultCalendar&$top=100`;
  while (nextPage) {
    const page: Page<{ id: string; name?: string | null; isDefaultCalendar?: boolean }> =
      await graph(nextPage);
    calendars.push(
      ...page.value.map((c) => ({
        id: c.id,
        name: c.name || "Calendrier",
        is_default: c.isDefaultCalendar === true,
      })),
    );
    nextPage = page["@odata.nextLink"];
  }
  return calendars.sort((a, b) => Number(b.is_default) - Number(a.is_default));
};

/**
 * The appointments in a user's calendar between two instants — their main
 * one, or the one "calendar" names —, occurrences of series included
 * (calendarView). Requires the Calendars.Read application permission;
 * cancelled appointments are not there. "user" is their Entra id or their
 * address; "owner" says whose they are — empty, the viewer's own. Someone
 * else's private appointments only show their times.
 */
export const entraAgenda = async (
  user: string,
  start: Date,
  end: Date,
  owner = "",
  calendar = "",
): Promise<AccessCalendarEvent[]> => {
  const searchParams = new URLSearchParams({
    startDateTime: start.toISOString(),
    endDateTime: end.toISOString(),
    $select: "id,subject,start,end,isAllDay,isCancelled,location,showAs,webLink,sensitivity",
    $orderby: "start/dateTime",
    $top: "100",
  });
  const appointments: GraphAppointment[] = [];
  let nextPage: string | undefined =
    `/users/${encodeURIComponent(user)}${calendar ? `/calendars/${encodeURIComponent(calendar)}` : ""}/calendarView?${searchParams.toString()}`;
  while (nextPage && appointments.length < APPOINTMENTS_MAX) {
    const page: Page<GraphAppointment> = await graph<Page<GraphAppointment>>(nextPage, {
      headers: { Prefer: 'outlook.timezone="UTC"' },
    });
    appointments.push(...page.value);
    nextPage = page["@odata.nextLink"];
  }
  return appointments
    .filter((r) => !r.isCancelled)
    .map((r) => {
      const hidden = owner !== "" && (r.sensitivity === "private" || r.sensitivity === "confidential");
      return {
        id: r.id,
        subject: hidden ? "Privé" : (r.subject ?? ""),
        start: toUtc(r.start?.dateTime),
        end: toUtc(r.end?.dateTime),
        all_day: r.isAllDay === true,
        location: hidden ? "" : (r.location?.displayName ?? ""),
        show_as: r.showAs ?? "",
        // Someone else's appointment does not open in the viewer's Outlook.
        url: owner ? "" : (r.webLink ?? ""),
        owner,
      };
    });
};

// --- Personal mailbox -------------------------------------------------------
//
// What the Mail widget shows: the inbox of whoever is looking, read by the
// application (Mail.Read). Nothing is modified there — an e-mail opened in
// Milo is not marked as read: that would require Mail.ReadWrite on all
// mailboxes.

interface GraphAddress {
  emailAddress?: { name?: string; address?: string };
}

interface GraphHeader {
  id: string;
  subject?: string | null;
  from?: GraphAddress | null;
  toRecipients?: GraphAddress[];
  categories?: string[];
  receivedDateTime?: string;
  bodyPreview?: string;
  isRead?: boolean;
  hasAttachments?: boolean;
  importance?: string;
}

const HEADER_FIELDS =
  "id,subject,from,toRecipients,receivedDateTime,bodyPreview,isRead,hasAttachments,importance,categories";

const toAddress = (a: GraphAddress | null | undefined): MailAddress => ({
  name: a?.emailAddress?.name ?? "",
  email: a?.emailAddress?.address ?? "",
});

/** "owner" says whose mailbox it comes from — empty, the viewer's —, "folder" where it sits. */
const toHeader = (m: GraphHeader, owner = "", folder = ""): AccessMail => ({
  id: m.id,
  subject: m.subject ?? "",
  from: toAddress(m.from),
  to: (m.toRecipients ?? []).map(toAddress),
  categories: m.categories ?? [],
  owner,
  folder,
  received_at: m.receivedDateTime ?? "",
  preview: m.bodyPreview ?? "",
  is_read: m.isRead !== false,
  has_attachments: Boolean(m.hasAttachments),
  importance: m.importance ?? "normal",
});

/**
 * A page of a mail folder — "inbox", or a folder's id — of a user's mailbox,
 * from most recent to oldest. "unreadOnly" keeps only unread ones: Graph then
 * wants the sort to cover the filter too, in the same order — hence the date
 * at the head of the filter. "owner" marks the e-mails: whose they are, empty
 * for the viewer's own. The folder's name and unread count come with them.
 */
export const folderPage = async (
  user: string,
  folder: string,
  offset: number,
  howMany: number,
  unreadOnly: boolean,
  owner = "",
): Promise<{ messages: AccessMail[]; more: boolean; unread: number; name: string }> => {
  const searchParams = new URLSearchParams({
    $top: String(howMany),
    $skip: String(offset),
    $select: HEADER_FIELDS,
    $orderby: "receivedDateTime desc",
  });
  if (unreadOnly) searchParams.set("$filter", "receivedDateTime ge 1900-01-01T00:00:00Z and isRead eq false");
  const path = `/users/${encodeURIComponent(user)}/mailFolders/${encodeURIComponent(folder)}`;
  const [page, details] = await Promise.all([
    graph<Page<GraphHeader>>(`${path}/messages?${searchParams.toString()}`),
    graph<{ displayName?: string; unreadItemCount?: number }>(
      `${path}?$select=displayName,unreadItemCount`,
    ),
  ]);
  const name = details.displayName ?? "";
  return {
    messages: page.value.map((m) => toHeader(m, owner, name)),
    more: Boolean(page["@odata.nextLink"]),
    unread: details.unreadItemCount ?? 0,
    name,
  };
};

interface GraphFolder {
  id: string;
  displayName?: string;
  childFolderCount?: number;
  totalItemCount?: number;
  unreadItemCount?: number;
}

const COUNT_FIELDS = "id,displayName,totalItemCount,unreadItemCount";

/**
 * A mail folder's counts — "inbox", or a folder's id: Exchange keeps them on
 * the folder itself, a single request gives them without reading a message.
 */
export const folderCounts = async (user: string, folder: string): Promise<AccessMailFolderCount> => {
  const f = await graph<GraphFolder>(
    `/users/${encodeURIComponent(user)}/mailFolders/${encodeURIComponent(folder)}?$select=${COUNT_FIELDS}`,
  );
  return {
    id: f.id,
    name: f.displayName ?? "",
    owner: user,
    total: f.totalItemCount ?? 0,
    unread: f.unreadItemCount ?? 0,
    kind: (await wellKnownFolders(user)).get(f.id) ?? "",
  };
};

/** Each mailbox's own folders, by id: their ids never change, they are asked once. */
const knownFolders = new Map<string, Promise<Map<string, MailFolderKind>>>();

/**
 * A mailbox's Outlook folders — inbox, sent items, drafts, deleted items,
 * junk e-mail —, by id. A request that fails is asked again next time.
 */
const wellKnownFolders = (user: string): Promise<Map<string, MailFolderKind>> => {
  const known = knownFolders.get(user);
  if (known) return known;
  const asked = Promise.all(
    MAIL_FOLDER_KINDS.map((kind) =>
      graph<{ id: string }>(`/users/${encodeURIComponent(user)}/mailFolders/${kind}?$select=id`)
        .then((f) => [f.id, kind] as const)
        // A mailbox without one of them — no junk folder — keeps the others.
        .catch(() => null),
    ),
  ).then((pairs) => new Map(pairs.filter((p) => p !== null)));
  knownFolders.set(user, asked);
  asked.then(
    (found) => found.size === 0 && knownFolders.delete(user),
    () => knownFolders.delete(user),
  );
  return asked;
};

/**
 * How many e-mails of a folder match an OData filter: Graph counts them
 * itself ($count) and returns a single id — nothing is read.
 */
export const countMessages = async (user: string, folder: string, filter: string): Promise<number> => {
  const searchParams = new URLSearchParams({
    $filter: filter,
    $count: "true",
    $top: "1",
    $select: "id",
  });
  const page = await graph<{ "@odata.count"?: number }>(
    `/users/${encodeURIComponent(user)}/mailFolders/${encodeURIComponent(folder)}/messages?${searchParams.toString()}`,
  );
  return page["@odata.count"] ?? 0;
};

/** How deep the folder tree is walked: beyond, a folder is rarely one to show. */
const FOLDER_DEPTH = 3;

/**
 * A user's mail folders, their subfolders under their path ("Boîte de
 * réception / Clients"), the inbox first. Same permission as their e-mails
 * (Mail.Read).
 */
export const entraMailFolders = async (user: string): Promise<AccessMailFolder[]> => {
  const base = `/users/${encodeURIComponent(user)}/mailFolders`;
  const [inbox, roots] = await Promise.all([
    graph<{ id: string }>(`${base}/inbox?$select=id`),
    allPages<GraphFolder>(`${base}?$select=id,displayName,childFolderCount&$top=100`),
  ]);
  const folders: AccessMailFolder[] = [];
  const walk = async (level: GraphFolder[], path: string, depth: number): Promise<void> => {
    for (const f of level) {
      const name = path ? `${path} / ${f.displayName ?? ""}` : (f.displayName ?? "");
      folders.push({ id: f.id, name, is_default: f.id === inbox.id });
      if ((f.childFolderCount ?? 0) > 0 && depth < FOLDER_DEPTH) {
        const children = await allPages<GraphFolder>(
          `${base}/${encodeURIComponent(f.id)}/childFolders?$select=id,displayName,childFolderCount&$top=100`,
        );
        await walk(children, name, depth + 1);
      }
    }
  };
  await walk(roots, "", 1);
  // The inbox and what it holds first, then the rest in Outlook's order.
  const inboxName = folders.find((f) => f.is_default)?.name ?? "";
  const underInbox = (f: AccessMailFolder) =>
    f.is_default || (inboxName !== "" && f.name.startsWith(`${inboxName} / `));
  return [...folders.filter(underInbox), ...folders.filter((f) => !underInbox(f))];
};

/** Beyond this, an embedded image is not fetched: it would make the body too heavy. */
const EMBEDDED_IMAGE_MAX = 2 * 1024 * 1024;

/**
 * An e-mail from the mailbox, body included as the sender wrote it, and its
 * attachments. Embedded images ("cid:") come back as "data:" addresses, ready
 * to replace their citation.
 */
export const mailOfMailbox = async (
  oid: string,
  id: string,
  owner = "",
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
  >(`${base}?$select=${HEADER_FIELDS},ccRecipients,body,webLink`);

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
    header: toHeader(message, owner),
    to: (message.toRecipients ?? []).map(toAddress),
    cc: (message.ccRecipients ?? []).map(toAddress),
    body: message.body?.content ?? "",
    body_type: (message.body?.contentType ?? "").toLowerCase() === "text" ? "text" : "html",
    // Someone else's e-mail does not open in the viewer's Outlook.
    url: owner ? "" : (message.webLink ?? ""),
    images,
    attachments,
  };
};

/** An attachment of a mailbox e-mail, content included. */
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

// --- User sign-in -----------------------------------------------------------

/** What sign-in requests: who the person is, nothing more. */
const SIGN_IN_SCOPE = "openid profile email";

/** The address of the Microsoft sign-in page. */
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

/** The claims of the identity token that we use. */
interface Claims {
  oid?: string;
  tid?: string;
  aud?: string;
  preferred_username?: string;
  email?: string;
  name?: string;
}

/**
 * The return code exchanged for an identity token, from which the person is
 * taken. The token arrives directly from Microsoft, over a TLS connection we
 * opened and authenticated with the secret: its signature need not be
 * re-verified (OpenID Connect, § 3.1.3.7). We do check, however, that it
 * comes from our tenant and that it is meant for us.
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
  // A tenant entered as a domain name is not compared with the token's id:
  // only an id is checked.
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

// --- Mail -------------------------------------------------------------------

export interface Sending {
  /** The sending mailbox: that of a company's support. */
  from: string;
  to: string;
  subject: string;
  text: string;
  html?: string;
  attachments?: MailAttachment[];
}

/**
 * A send on behalf of a mailbox, through Graph (Mail.Send). The message is
 * not kept in its sent items: these are notifications, not correspondence.
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

/** The latest messages in a mailbox's inbox (Mail.Read). */
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
  /** The Graph id, to fetch the rest of the message. */
  graph_id: string;
  /** The Internet id (Message-ID): it does not change if the message changes folder. */
  mail_id: string;
  /** The Graph conversation: a reply arrives in the same one. */
  conversation_id: string;
  subject: string;
  from_name: string;
  from_email: string;
  received_at: string;
  /** The body as the sender wrote it: HTML most often. */
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

/** A Graph message as the poll reads it, body included. */
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
 * The delta query of the inbox: what has arrived there since last time, and
 * the link that will serve the next. Without a link — the first time —, Graph
 * returns the whole mailbox, then the link. What was removed from the
 * mailbox ("@removed") is discarded: Milo removes nothing on its side.
 *
 * The body arrives as it was written, in HTML: converted to text by Graph, it
 * lost its images and layout and gained line breaks.
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
 * Removes a polled e-mail from the mailbox (Mail.ReadWrite). Graph puts it in
 * deleted items rather than erasing it: it can still be found there, and the
 * reply to its request (replyByGraph) still cites it.
 */
export const deleteMail = async (mailbox: string, graphId: string): Promise<void> => {
  await graph(`/users/${encodeURIComponent(mailbox)}/messages/${encodeURIComponent(graphId)}`, {
    method: "DELETE",
  });
};

/** What the delta query does not say — or no longer — about an e-mail. */
export interface MailDetails {
  /** What it cites of those preceding it: In-Reply-To and References. */
  cited: string[];
  conversation_id: string;
  has_attachments: boolean;
  /**
   * What the e-mail brings that is new: its body without the history it
   * cites, as Exchange detaches it from the conversation. Empty if Graph does
   * not give it.
   */
  unique_body: string;
  unique_body_type: "html" | "text";
}

/**
 * Re-read message by message rather than in the delta query: the delta link
 * keeps the fields requested when it was created, and a link created before
 * they were requested would never return them.
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

/** A file attached to an e-mail: an image embedded in the body, or an attachment. */
export interface ReceivedFile {
  name: string;
  mime: string;
  size: number;
  inline: boolean;
  /** What the body cites ("cid:…") for an embedded image. */
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
 * The files of an e-mail, content included. Only files get through: an e-mail
 * attached to another, or a link to a shared document, has no content to
 * fetch. Beyond "maxSize", a file is left in the mailbox.
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
    // The content apart, raw: in the list, it would carry all the files as
    // base64 at once.
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
 * Replies to a received e-mail, from the mailbox that received it (Mail.Send):
 * the reply goes in the same conversation, the original message quoted below.
 * The message is found by its Internet id — the one Milo keeps —, Graph's id
 * changing when a message changes folder.
 *
 * It carries the ticket number, in its subject and in the X-Milo-Ticket
 * header: a reply from the sender thus finds its request, even if their
 * software has lost the thread of the conversation. Its own reply will in any
 * case cite the original e-mail in its headers (References).
 *
 * Everything goes through "reply", which only requires Mail.Send: a draft
 * ("createReply") would additionally require Mail.ReadWrite on the mailbox.
 */
export const replyByGraph = async (
  mailbox: string,
  mailId: string,
  html: string,
  ticket: string,
  copies: { cc: string[]; bcc: string[] } = { cc: [], bcc: [] },
  /** With a "contentId", the file is inline: the HTML cites it as "cid:". */
  graphAttachments: { name: string; mime: string; content: Buffer; contentId?: string }[] = [],
): Promise<void> => {
  const root = `/users/${encodeURIComponent(mailbox)}/messages`;
  const found = await graph<Page<{ id: string; subject?: string }>>(
    `${root}?$filter=internetMessageId eq '${mailId.replace(/'/g, "''")}'&$select=id,subject&$top=1`,
  );
  const message = found.value[0];
  if (!message) fail(400, "L'e-mail d'origine est introuvable dans la boîte de support");

  // "Imprimante" becomes "RE: [HLP-12] Imprimante"; a subject that already
  // carries the number keeps it as is.
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
          ...(p.contentId && { isInline: true, contentId: p.contentId }),
        })),
      },
    },
  });
};

// --- Change notifications ---------------------------------------------------

export interface Subscription {
  id: string;
  expirationDateTime: string;
}

/**
 * Asks Graph to notify Milo of the changes to a resource — the messages of a
 * folder, the events of a calendar. Graph checks the address before
 * accepting: Milo must already be listening, and answer its validation.
 */
export const subscribeTo = (
  resource: string,
  changeType: string,
  notificationUrl: string,
  clientState: string,
  expiration: string,
): Promise<Subscription> =>
  graph<Subscription>("/subscriptions", {
    method: "POST",
    body: { changeType, notificationUrl, resource, expirationDateTime: expiration, clientState },
  });

/** Asks Graph to notify Milo of every e-mail that arrives in the inbox. */
export const createSubscription = (
  mailbox: string,
  notificationUrl: string,
  clientState: string,
  expiration: string,
): Promise<Subscription> =>
  subscribeTo(
    `users/${mailbox}/mailFolders('inbox')/messages`,
    "created",
    notificationUrl,
    clientState,
    expiration,
  );

export const renewSubscription = (id: string, expiration: string): Promise<Subscription> =>
  graph<Subscription>(`/subscriptions/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: { expirationDateTime: expiration },
  });

export const deleteSubscription = (id: string): Promise<void> =>
  graph<void>(`/subscriptions/${encodeURIComponent(id)}`, { method: "DELETE" });
