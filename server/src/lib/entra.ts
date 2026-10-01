// Entra ID : l'inscription d'application sur laquelle tout repose.
//
//   - La connexion des utilisateurs, par OpenID Connect (code d'autorisation).
//   - L'annuaire — utilisateurs, groupes, appartenances —, par Microsoft Graph
//     avec les permissions de l'application : User.Read.All, Group.Read.All,
//     GroupMember.Read.All.
//   - Le courrier des boîtes de support et des notifications, par Graph
//     encore : Mail.Read pour lire, Mail.Send pour envoyer en leur nom.
//
// Les permissions de l'application demandent le consentement d'un
// administrateur du locataire, donné une fois dans le portail Azure. Voir la
// section « Entra » du README.
//
// Le secret est rangé en base avec le reste des réglages et ne ressort jamais
// par l'API. Ce n'est pas du chiffrement : qui peut lire la base peut le
// lire. C'est la base qu'il faut protéger — elle porte déjà les sessions.

import type { EntraPrincipal, EntraSettings, EntraSettingsInput } from "@milo/shared";
import { badRequest, fail } from "./http.js";
import type { PieceJointe } from "./mail-template.js";
import { readSetting, writeSetting } from "../repositories/settings.js";

const CLE = "entra";

/** Les réglages tels qu'ils sont rangés : secret compris. */
interface Stockes {
  client_id: string;
  tenant: string;
  secret: string;
}

const VIDES: Stockes = { client_id: "", tenant: "", secret: "" };

/** L'inscription que la messagerie OAuth rangeait, avant qu'Entra la reprenne. */
interface AncienneMessagerie {
  oauth?: { client_id?: string; tenant?: string; secret?: string };
}

/**
 * Les réglages en base. Une base d'avant Entra n'en a pas : on reprend
 * l'inscription que la messagerie connaissait.
 */
export const reglagesEntra = (): Stockes => {
  const lus = readSetting<Partial<Stockes> | null>(CLE, null);
  // Une adresse d'expédition et un groupe d'administrateurs ont été rangés
  // un temps ici : ils ne servent plus — chaque société expédie de sa boîte
  // de support, et le Paramétrage est un droit des rôles.
  if (lus) {
    return {
      client_id: lus.client_id ?? "",
      tenant: lus.tenant ?? "",
      secret: lus.secret ?? "",
    };
  }

  const { oauth } = readSetting<AncienneMessagerie>("mail", {});
  return {
    ...VIDES,
    client_id: oauth?.client_id ?? "",
    tenant: oauth?.tenant ?? "",
    secret: oauth?.secret ?? "",
  };
};

export const reglagesEntraPublics = (): EntraSettings => {
  const r = reglagesEntra();
  return {
    client_id: r.client_id,
    tenant: r.tenant,
    has_secret: r.secret !== "",
  };
};

const texte = (valeur: unknown, max = 255): string =>
  String(valeur ?? "")
    .trim()
    .slice(0, max);

/** Ce qui n'est pas dit ne change pas ; pour le secret, la chaîne vide efface. */
export const modifierEntra = (entree: EntraSettingsInput): void => {
  const suivants = { ...reglagesEntra() };

  if (entree.client_id !== undefined) suivants.client_id = texte(entree.client_id);
  if (entree.tenant !== undefined) suivants.tenant = texte(entree.tenant);
  if (entree.secret !== undefined) suivants.secret = String(entree.secret);

  writeSetting(CLE, suivants);
  jetonEnCache = null;
};

/** L'inscription est-elle complète ? Sans elle, rien ne passe par Microsoft. */
export const entraConfiguree = (): boolean => {
  const r = reglagesEntra();
  return Boolean(r.client_id && r.tenant && r.secret);
};

const exigerInscription = (): Stockes => {
  const r = reglagesEntra();
  if (!r.client_id) badRequest("Renseignez l'ID d'application dans Paramétrage → Entra");
  if (!r.tenant) badRequest("Renseignez l'ID de l'annuaire dans Paramétrage → Entra");
  if (!r.secret) badRequest("Renseignez le secret d'application dans Paramétrage → Entra");
  return r;
};

// --- Jetons ----------------------------------------------------------------

const AUTORITE = "https://login.microsoftonline.com";
const GRAPH = "https://graph.microsoft.com/v1.0";

const pointDeTerminaison = (tenant: string, quoi: "authorize" | "token"): string =>
  `${AUTORITE}/${encodeURIComponent(tenant)}/oauth2/v2.0/${quoi}`;

interface ReponseJeton {
  access_token?: string;
  id_token?: string;
  expires_in?: number;
  error?: string;
  error_description?: string;
}

const appelerJeton = async (tenant: string, corps: URLSearchParams): Promise<ReponseJeton> => {
  const reponse = await fetch(pointDeTerminaison(tenant, "token"), {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: corps,
  });
  const jeton = (await reponse.json().catch(() => ({}))) as ReponseJeton;
  if (!reponse.ok || !jeton.access_token) {
    // Microsoft décrit précisément ce qui manque (redirection non inscrite,
    // secret expiré, consentement absent) : ce message vaut mieux qu'un autre.
    fail(400, jeton.error_description?.split("\n")[0] || jeton.error || "Microsoft a refusé la demande");
  }
  return jeton;
};

/**
 * Le jeton de l'application pour Graph, gardé jusqu'à une minute avant son
 * expiration : chaque connexion et chaque envoi en demandent un, Microsoft
 * n'a pas à en délivrer un par appel.
 */
let jetonEnCache: { valeur: string; expire: number } | null = null;

const jetonApplication = async (): Promise<string> => {
  if (jetonEnCache && jetonEnCache.expire > Date.now()) return jetonEnCache.valeur;

  const r = exigerInscription();
  const jeton = await appelerJeton(
    r.tenant,
    new URLSearchParams({
      client_id: r.client_id,
      client_secret: r.secret,
      grant_type: "client_credentials",
      scope: "https://graph.microsoft.com/.default",
    }),
  );
  jetonEnCache = {
    valeur: jeton.access_token!,
    expire: Date.now() + ((jeton.expires_in ?? 3600) - 60) * 1000,
  };
  return jetonEnCache.valeur;
};

interface ErreurGraph {
  error?: { code?: string; message?: string };
}

/** Un appel à Graph au nom de l'application. Lève ce que Graph a répondu. */
const graph = async <T>(
  chemin: string,
  init: { method?: string; body?: unknown; entetes?: Record<string, string> } = {},
): Promise<T> => {
  const reponse = await fetch(chemin.startsWith("https://") ? chemin : `${GRAPH}${chemin}`, {
    method: init.method ?? "GET",
    headers: {
      Authorization: `Bearer ${await jetonApplication()}`,
      ...(init.body !== undefined ? { "Content-Type": "application/json" } : {}),
      ...init.entetes,
    },
    ...(init.body !== undefined ? { body: JSON.stringify(init.body) } : {}),
  });

  if (reponse.status === 202 || reponse.status === 204) return undefined as T;
  const corps = (await reponse.json().catch(() => ({}))) as T & ErreurGraph;
  if (!reponse.ok) {
    // Les permissions de l'application sont inscrites dans le jeton à sa
    // délivrance : un jeton gardé en cache ignore celles accordées depuis. Un
    // refus l'oublie, et l'essai suivant en demande un neuf.
    if (reponse.status === 401 || reponse.status === 403) jetonEnCache = null;
    fail(400, corps.error?.message || `Microsoft Graph a répondu ${reponse.status}`);
  }
  return corps;
};

interface Page<T> {
  value: T[];
  "@odata.nextLink"?: string;
}

/** Toutes les pages d'une liste Graph. */
const toutesLesPages = async <T>(chemin: string): Promise<T[]> => {
  const resultat: T[] = [];
  let suivante: string | undefined = chemin;
  while (suivante) {
    const page: Page<T> = await graph<Page<T>>(suivante);
    resultat.push(...page.value);
    suivante = page["@odata.nextLink"];
  }
  return resultat;
};

// --- Annuaire --------------------------------------------------------------

interface UtilisateurGraph {
  id: string;
  displayName?: string;
  givenName?: string | null;
  surname?: string | null;
  mail?: string | null;
  userPrincipalName?: string;
}

interface GroupeGraph {
  id: string;
  displayName?: string;
  mail?: string | null;
}

const versUtilisateur = (u: UtilisateurGraph): EntraPrincipal => ({
  type: "user",
  id: u.id,
  name: u.displayName ?? "",
  email: u.mail || u.userPrincipalName || "",
});

const versGroupe = (g: GroupeGraph): EntraPrincipal => ({
  type: "group",
  id: g.id,
  name: g.displayName ?? "",
  email: g.mail ?? "",
});

/** Au plus, par recherche et par sorte : de quoi voir toute une famille de groupes. */
const RESULTATS = 50;

/** Les éléments de plusieurs listes, sans doublon, dans l'ordre alphabétique. */
const fusionner = <T extends { id: string; displayName?: string }>(...listes: T[][]): T[] => {
  const parId = new Map<string, T>();
  for (const liste of listes) for (const e of liste) parId.set(e.id, e);
  return [...parId.values()].sort((x, y) =>
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
export const chercherDansLAnnuaire = async (
  saisie: string,
  quoi: "all" | "groups" = "all",
): Promise<EntraPrincipal[]> => {
  const terme = saisie.replace(/["\\]/g, "").trim();
  if (terme.length < 2) return [];

  // Une apostrophe se double dans une chaîne OData.
  const odata = terme.replace(/'/g, "''");
  const entetes = { ConsistencyLevel: "eventual" };
  const vide = Promise.resolve({ value: [] });

  const groupes = Promise.all([
    graph<Page<GroupeGraph>>(
      `/groups?$filter=${encodeURIComponent(`startswith(displayName,'${odata}')`)}&$select=id,displayName,mail&$top=${RESULTATS}`,
    ),
    graph<Page<GroupeGraph>>(
      `/groups?$search=${encodeURIComponent(`"displayName:${terme}"`)}&$select=id,displayName,mail&$top=${RESULTATS}`,
      { entetes },
    ),
  ]);

  const utilisateurs =
    quoi === "groups"
      ? Promise.all([vide, vide] as [Promise<Page<UtilisateurGraph>>, Promise<Page<UtilisateurGraph>>])
      : Promise.all([
          graph<Page<UtilisateurGraph>>(
            `/users?$filter=${encodeURIComponent(`startswith(displayName,'${odata}') or startswith(mail,'${odata}') or startswith(userPrincipalName,'${odata}')`)}&$select=id,displayName,mail,userPrincipalName&$top=${RESULTATS}`,
          ),
          graph<Page<UtilisateurGraph>>(
            `/users?$search=${encodeURIComponent(`"displayName:${terme}" OR "mail:${terme}"`)}&$select=id,displayName,mail,userPrincipalName&$top=${RESULTATS}`,
            { entetes },
          ),
        ]);

  const [[u1, u2], [g1, g2]] = await Promise.all([utilisateurs, groupes]);
  return [
    ...fusionner(u1.value, u2.value).map(versUtilisateur),
    ...fusionner(g1.value, g2.value).map(versGroupe),
  ];
};

/** Le profil d'un utilisateur : son nom, son adresse. */
export const profilEntra = async (oid: string): Promise<UtilisateurGraph> =>
  graph<UtilisateurGraph>(
    `/users/${encodeURIComponent(oid)}?$select=id,displayName,givenName,surname,mail,userPrincipalName`,
  );

/**
 * Les groupes de l'utilisateur, y compris ceux dont il est membre par un autre
 * groupe : ses droits suivent ses groupes, quelle que soit la profondeur.
 */
export const groupesEntra = async (oid: string): Promise<string[]> => {
  const groupes = await toutesLesPages<{ id: string }>(
    `/users/${encodeURIComponent(oid)}/transitiveMemberOf/microsoft.graph.group?$select=id&$top=999`,
  );
  return groupes.map((g) => g.id);
};

// --- Connexion des utilisateurs --------------------------------------------

/** Ce que la connexion demande : qui est la personne, rien de plus. */
const PORTEE_CONNEXION = "openid profile email";

/** L'adresse de la page de connexion Microsoft. */
export const urlDeConnexion = (redirectUri: string, state: string): string => {
  const r = exigerInscription();
  const parametres = new URLSearchParams({
    client_id: r.client_id,
    response_type: "code",
    redirect_uri: redirectUri,
    response_mode: "query",
    scope: PORTEE_CONNEXION,
    state,
    prompt: "select_account",
  });
  return `${pointDeTerminaison(r.tenant, "authorize")}?${parametres.toString()}`;
};

/** Les revendications du jeton d'identité dont on se sert. */
interface Revendications {
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
export const terminerLaConnexion = async (
  code: string,
  redirectUri: string,
): Promise<{ oid: string; email: string; name: string }> => {
  const r = exigerInscription();
  const jeton = await appelerJeton(
    r.tenant,
    new URLSearchParams({
      client_id: r.client_id,
      client_secret: r.secret,
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri,
      scope: PORTEE_CONNEXION,
    }),
  );

  let revendications: Revendications = {};
  try {
    const charge = jeton.id_token?.split(".")[1] ?? "";
    revendications = JSON.parse(Buffer.from(charge, "base64url").toString("utf8")) as Revendications;
  } catch {
    fail(400, "Microsoft n'a pas renvoyé de jeton d'identité lisible");
  }

  if (revendications.aud !== r.client_id) fail(400, "Jeton d'identité destiné à une autre application");
  // Un locataire saisi par son nom de domaine ne se compare pas à l'identifiant
  // du jeton : seul un identifiant est contrôlé.
  if (/^[0-9a-f-]{36}$/i.test(r.tenant) && revendications.tid?.toLowerCase() !== r.tenant.toLowerCase()) {
    fail(403, "Ce compte n'appartient pas à l'annuaire de l'entreprise");
  }
  if (!revendications.oid) fail(400, "Microsoft n'a pas renvoyé l'identifiant du compte");

  return {
    oid: revendications.oid!,
    email: texte(revendications.email ?? revendications.preferred_username ?? ""),
    name: texte(revendications.name ?? ""),
  };
};

// --- Courrier --------------------------------------------------------------

export interface Envoi {
  /** La boîte qui expédie : celle du support d'une société. */
  from: string;
  to: string;
  subject: string;
  text: string;
  html?: string;
  attachments?: PieceJointe[];
}

/**
 * Un envoi au nom d'une boîte, par Graph (Mail.Send). Le message n'est pas
 * gardé dans ses éléments envoyés : ce sont des notifications, pas une
 * correspondance.
 */
export const envoyerParGraph = async ({ from, to, subject, text, html, attachments }: Envoi) => {
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

export interface MessageRecu {
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
export const lireMessages = async (boite: string, combien = 25): Promise<MessageRecu[]> => {
  const page = await graph<Page<MessageGraph>>(
    `/users/${encodeURIComponent(boite)}/mailFolders/inbox/messages?$top=${combien}&$select=id,subject,receivedDateTime,bodyPreview,from&$orderby=receivedDateTime desc`,
  );
  return page.value.map((m) => ({
    id: m.id,
    subject: m.subject ?? "",
    from: m.from?.emailAddress?.address ?? "",
    received_at: m.receivedDateTime ?? "",
    preview: m.bodyPreview ?? "",
  }));
};

export interface CourrierRecu {
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

interface CourrierGraph {
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
const CHAMPS_COURRIER =
  "id,internetMessageId,conversationId,subject,receivedDateTime,from,body,hasAttachments";

const versCourrier = (m: CourrierGraph): CourrierRecu => ({
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
export const deltaDeLaBoite = async (
  boite: string,
  lien: string | null,
): Promise<{ courriers: CourrierRecu[]; lien: string }> => {
  let suivante: string | undefined =
    lien ??
    `/users/${encodeURIComponent(boite)}/mailFolders/inbox/messages/delta?$select=${CHAMPS_COURRIER}`;
  const courriers: CourrierRecu[] = [];
  let prochain = "";
  while (suivante) {
    const page: PageDelta<CourrierGraph & { "@removed"?: unknown }> = await graph(suivante, {
      entetes: { Prefer: "odata.maxpagesize=50" },
    });
    for (const m of page.value) if (!m["@removed"]) courriers.push(versCourrier(m));
    suivante = page["@odata.nextLink"];
    prochain = page["@odata.deltaLink"] ?? prochain;
  }
  return { courriers, lien: prochain };
};

/** Ce que la delta query ne dit pas — ou plus — d'un e-mail. */
export interface DetailsCourrier {
  /** Ce qu'il cite de ceux qui le précèdent : In-Reply-To et References. */
  cites: string[];
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
export const detailsDuCourrier = async (
  boite: string,
  graphId: string,
): Promise<DetailsCourrier> => {
  const message = await graph<{
    internetMessageHeaders?: { name: string; value: string }[];
    conversationId?: string;
    hasAttachments?: boolean;
    uniqueBody?: { content?: string; contentType?: string };
  }>(
    `/users/${encodeURIComponent(boite)}/messages/${encodeURIComponent(graphId)}?$select=internetMessageHeaders,conversationId,hasAttachments,uniqueBody`,
  );
  return {
    cites: (message.internetMessageHeaders ?? [])
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
export interface FichierRecu {
  name: string;
  mime: string;
  size: number;
  inline: boolean;
  /** Ce que le corps cite (« cid:… ») pour une image intégrée. */
  content_id: string;
  contenu: Buffer;
}

interface PieceGraph {
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
export const fichiersDuCourrier = async (
  boite: string,
  graphId: string,
  tailleMax: number,
): Promise<FichierRecu[]> => {
  const base = `/users/${encodeURIComponent(boite)}/messages/${encodeURIComponent(graphId)}/attachments`;
  const pieces = await toutesLesPages<PieceGraph>(
    `${base}?$select=id,name,contentType,size,isInline`,
  );
  const fichiers: FichierRecu[] = [];
  for (const piece of pieces) {
    if (piece["@odata.type"] !== "#microsoft.graph.fileAttachment") continue;
    if ((piece.size ?? 0) > tailleMax) continue;
    // Le contenu à part, en brut : dans la liste, il ferait voyager tous les
    // fichiers en base64 d'un coup.
    const detail = await graph<PieceGraph & { contentBytes?: string }>(
      `${base}/${encodeURIComponent(piece.id)}`,
    );
    if (!detail.contentBytes) continue;
    fichiers.push({
      name: piece.name ?? "piece-jointe",
      mime: piece.contentType ?? "application/octet-stream",
      size: piece.size ?? 0,
      inline: Boolean(detail.isInline),
      content_id: (detail.contentId ?? "").replace(/^<|>$/g, ""),
      contenu: Buffer.from(detail.contentBytes, "base64"),
    });
  }
  return fichiers;
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
export const repondreParGraph = async (
  boite: string,
  mailId: string,
  html: string,
  ticket: string,
  copies: { cc: string[]; bcc: string[] } = { cc: [], bcc: [] },
  pieces: { name: string; mime: string; contenu: Buffer }[] = [],
): Promise<void> => {
  const racine = `/users/${encodeURIComponent(boite)}/messages`;
  const trouve = await graph<Page<{ id: string; subject?: string }>>(
    `${racine}?$filter=internetMessageId eq '${mailId.replace(/'/g, "''")}'&$select=id,subject&$top=1`,
  );
  const message = trouve.value[0];
  if (!message) fail(400, "L'e-mail d'origine est introuvable dans la boîte de support");

  // « Imprimante » devient « RE: [LMA-12] Imprimante » ; un objet qui porte
  // déjà le numéro le garde tel quel.
  const origine = (message!.subject ?? "").replace(/^((?:re|tr|fw|fwd)\s*:\s*)+/i, "");
  const objet = origine.includes(`[${ticket}]`) ? `RE: ${origine}` : `RE: [${ticket}] ${origine}`;

  await graph(`${racine}/${encodeURIComponent(message!.id)}/reply`, {
    method: "POST",
    body: {
      comment: html,
      message: {
        subject: objet.trim(),
        internetMessageHeaders: [{ name: "X-Milo-Ticket", value: ticket }],
        ccRecipients: copies.cc.map((address) => ({ emailAddress: { address } })),
        bccRecipients: copies.bcc.map((address) => ({ emailAddress: { address } })),
        attachments: pieces.map((p) => ({
          "@odata.type": "#microsoft.graph.fileAttachment",
          name: p.name,
          contentType: p.mime,
          contentBytes: p.contenu.toString("base64"),
        })),
      },
    },
  });
};

// --- Notifications de changement -------------------------------------------

export interface Abonnement {
  id: string;
  expirationDateTime: string;
}

/**
 * Demande à Graph de prévenir Milo de chaque e-mail qui arrive dans la boîte
 * de réception. Graph vérifie l'adresse avant d'accepter : Milo doit déjà
 * écouter, et répondre à sa validation.
 */
export const creerAbonnement = (
  boite: string,
  notificationUrl: string,
  clientState: string,
  expiration: string,
): Promise<Abonnement> =>
  graph<Abonnement>("/subscriptions", {
    method: "POST",
    body: {
      changeType: "created",
      notificationUrl,
      resource: `users/${boite}/mailFolders('inbox')/messages`,
      expirationDateTime: expiration,
      clientState,
    },
  });

export const renouvelerAbonnement = (id: string, expiration: string): Promise<Abonnement> =>
  graph<Abonnement>(`/subscriptions/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: { expirationDateTime: expiration },
  });

export const supprimerAbonnement = (id: string): Promise<void> =>
  graph<void>(`/subscriptions/${encodeURIComponent(id)}`, { method: "DELETE" });
