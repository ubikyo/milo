// The API client. Each call says what it returns: the types come from
// @milo/shared, the same ones the server honors.

import type {
  DirectoryUser,
  WidgetKind,
  WorkspacePeople,
  AccessCalendar,
  AccessCalendarChoice,
  AccessFeed,
  AccessFeedProbe,
  AccessMailDetail,
  AccessMailFolder,
  AccessMailPage,
  AccessMailCount,
  AccessMailFolderCounts,
  MailMetric,
  AccessWeather,
  AccessQuote,
  WeatherPlace,
  ApiError,
  ManagedDeviceAsset,
  ManagedDeviceAssetDetail,
  IndicatorSection,
  IndicatorSectionInput,
  ExportedLayout,
  MailboxOptinState,
  ImportResult,
  ManagedDeviceAssetRefresh,
  Attachment,
  CardCover,
  AuthResult,
  BackupInfo,
  Board,
  BoardInput,
  BoardWidget,
  BoardWidgetInput,
  View,
  Workspace,
  ViewInput,
  ViewShares,
  SubviewGroup,
  SubviewsInput,
  SubviewsSaved,
  ViewSharesInput,
  CardLocation,
  CascadeResult,
  Category,
  Milestone,
  CardLink,
  CardLinkInput,
  LinkCandidates,
  Checklist,
  ChecklistItem,
  ChecklistItemInput,
  Comment,
  MilestoneType,
  AdminPermissions,
  CopyResult,
  EntraPrincipal,
  EntraSettings,
  EntraSettingsInput,
  EntraCheck,
  EntraStatus,
  MailboxCheck,
  PrincipalAdministration,
  WorkspacePermissions,
  PrincipalAssignments,
  FollowKind,
  Follows,
  Id,
  LinkTargetKind,
  Label,
  LabelGroup,
  LabelGroupLayout,
  LabelInput,
  LabelsBase,
  ListRef,
  SourceWidget,
  ListColor,
  MailTestResult,
  Project,
  ProjectAttachment,
  ProjectCopyInput,
  ProjectDetail,
  ProjectFilters,
  ProjectInput,
  ProjectLabel,
  PublicUser,
  RestoreResult,
  SetupInput,
  SetupState,
  SupportComment,
  SupportLabel,
  SupportLabelInput,
  SupportRequest,
  SupportRequestDetail,
  SupportRequestInput,
  SupportStatus,
  TaskCardDetail,
  TaskCardInput,
  TaskCardRow,
  TaskList,
  TaskListCopyInput,
  MailTemplate,
  MailTemplateKey,
  MailTemplatePreview,
  DisplaySettings,
  MiloSettings,
  ApiToken,
  ApiTokenInput,
  CreatedApiToken,
  CreatedMiloProxy,
  MiloProxy,
  MiloProxyInput,
  Printer,
  PrinterInput,
  PrinterInfos,
  PaperFormat,
  PaperFormatInput,
  Theme,
  TitleStyle,
  SupportContent,
  SupportContentEvent,
  SupportPerson,
  SupportReply,
  SupportReplyEvent,
  SupportSettings,
  ManagedDeviceAssetSettings,
  LabelPreview,
  LabelTemplate,
  LabelTemplateKind,
  LabelTemplates,
  AssetNumberTemplate,
  AssetNumberTemplates,
  LabelTestPrint,
  DeclaredAsset,
  DeclaredAssetAttachment,
  DeclaredAssetFiles,
  DeclaredAssetInput,
  DeclaredAssetKind,
  DeclaredAssetPhoto,
  DeclaredAssetSettings,
  Contact,
  ContactComment,
  ContactInput,
  ContactSettings,
  Product,
  ProductAttachment,
  ProductComment,
  ProductFiles,
  ProductInput,
  ProductPhoto,
  ProductSettings,
  Order,
  OrderContent,
  OrderContentEvent,
  OrderMessage,
  OrderMailKind,
  ReplyTemplateKey,
  OrderNumberFormat,
  OrderNumberTemplate,
  OrderNumberTemplates,
  OrderAttachment,
  OrderComment,
  OrderInput,
  Tax,
  ValueItem,
  ValueItemInput,
  Warehouse,
  WarehouseInput,
  WarehouseSettings,
  Location,
  LocationInput,
  UpdateMeInput,
  VersionPayload,
  SearchResult,
  Notification,
} from "@milo/shared";
import {
  CONTACT_ROUTES,
  DECLARED_ASSET_ROUTES,
  ORDER_ROUTES,
  PRODUCT_ROUTES,
  TAX_ROUTES,
  VALUE_LIST_ROUTES,
  WAREHOUSE_ROUTES,
  LOCATION_ROUTES,
} from "@milo/shared";
import { getToken, setToken } from "../lib/auth";

/** An uploaded reply attachment: what the reply then cites. */
export interface SupportFileDeposit {
  file: string;
  name: string;
  mime: string;
  size: number;
}

const BASE_URL = "/api";

// Notifies the application when the server rejects the session (expired token,
// sign-out from another tab).
let onUnauthorized: () => void = () => {};
export const setUnauthorizedHandler = (fn: () => void): void => {
  onUnauthorized = fn;
};

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getToken();
  const res = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  });

  // Only a refusal of the session in place closes it: a request sent without
  // a token, or with the one a new sign-in has just replaced — on the return
  // from Microsoft, the first reads leave before the token is stored —, says
  // nothing about it.
  if (res.status === 401 && !path.startsWith("/auth/") && token && getToken() === token) {
    setToken(null);
    onUnauthorized();
  }
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as Partial<ApiError>;
    throw new HttpError(res.status, body.error || `Erreur ${res.status}`);
  }
  if (res.status === 204) return null as T;
  return (await res.json()) as T;
}

/** An error response: its status distinguishes a refusal from an outage. */
export class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

/** The verbs, so each call fits on one line. */
const get = <T>(path: string) => request<T>(path);
const post = <T>(path: string, body?: unknown) =>
  request<T>(path, { method: "POST", body: JSON.stringify(body ?? {}) });
const put = <T>(path: string, body?: unknown) =>
  request<T>(path, { method: "PUT", body: JSON.stringify(body ?? {}) });
const del = (path: string) => request<null>(path, { method: "DELETE" });
/** A deletion that can be undone: the server returns its token (lib/undo.tsx). */
const undoableDel = (path: string) => request<{ undo: string }>(path, { method: "DELETE" });

/**
 * A file upload: the request body is the file itself, its name and type
 * travel in the URL. No multipart form — the server expects only a file,
 * and reads it as is.
 */
const upload = <T>(path: string, file: File) =>
  request<T>(
    `${path}?name=${encodeURIComponent(file.name)}&type=${encodeURIComponent(file.type)}`,
    {
      method: "POST",
      body: file,
      // The real type is stated in the URL: announcing "octet-stream" keeps
      // the body away from the server's JSON parser, including when
      // uploading a .json file.
      headers: { "Content-Type": "application/octet-stream" },
    },
  );

/**
 * A file sent as is: the backup to restore. Like uploading an
 * attachment, but with no name or type to state — the server only expects an
 * archive.
 */
const sendFile = <T>(path: string, file: File) =>
  request<T>(path, {
    method: "POST",
    body: file,
    headers: { "Content-Type": "application/octet-stream" },
  });

/**
 * A response that is a file, not JSON: the backup
 * download. It doesn't go through `request`, which always reads JSON, but
 * carries the same token and reads errors the same way.
 */
const download = async (path: string): Promise<Blob> => {
  const token = getToken();
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });

  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as Partial<ApiError>;
    throw new Error(body.error || `Erreur ${res.status}`);
  }
  return res.blob();
};

/** "all" and empty values are not filters: they are not sent. */
const queryString = (params: Record<string, unknown>): string => {
  const searchParams = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value && value !== "all") searchParams.set(key, String(value));
  }
  const qs = searchParams.toString();
  return qs ? `?${qs}` : "";
};

/**
 * A board's sections: its columns. Sections are read and created through the
 * board; they are then modified by their identifier.
 */
/** Fired with the kind of labels whose groups have changed: their readers re-read. */
export const LABEL_GROUPS_EVENT = "milo:label-groups";

/** A change to the groups of "base": signaled once the server has made it. */
const groupsChange = <T>(base: LabelsBase, change: Promise<T>): Promise<T> =>
  change.then((result) => {
    window.dispatchEvent(new CustomEvent(LABEL_GROUPS_EVENT, { detail: base }));
    return result;
  });

/**
 * What a read of a list's settings names: a list (ListRef), or a whole board —
 * every list's, each row carrying its list key.
 */
type ListScope = ListRef | Id | string;

/** The query of a read: "?board=…&list=…". */
const scopeQuery = (scope: ListScope | null | undefined): string =>
  scope !== null && typeof scope === "object"
    ? queryString({ board: scope.board, list: scope.list })
    : queryString({ board: scope });

/** The body fields that name a list, on a write. */
const listBody = (ref: ListRef) => ({ board_id: ref.board, list_key: ref.list });

/** A copy from one list widget to another. */
const copyBody = (from: ListRef, to: ListRef, replace: boolean) => ({
  from_board: from.board,
  from_list: from.list,
  to_board: to.board,
  to_list: to.list,
  replace,
});

const boardSections = (boardId: Id | string) => ({
  all: () => get<IndicatorSection[]>(`/boards/${boardId}/sections`),
  create: (data: IndicatorSectionInput) =>
    post<IndicatorSection>(`/boards/${boardId}/sections`, data),
  update: (id: Id, data: IndicatorSectionInput) =>
    put<IndicatorSection>(`/board-sections/${id}`, data),
  /** The copy, with its widgets, is placed right after the original. */
  duplicate: (id: Id) => post<IndicatorSection>(`/board-sections/${id}/duplicate`, {}),
  remove: (id: Id) => undoableDel(`/board-sections/${id}`),
  reorder: (ids: Id[]) => put<IndicatorSection[]>(`/boards/${boardId}/sections/reorder`, { ids }),
  /** An exported layout replaces the board's structure. */
  importSections: (layout: ExportedLayout) =>
    post<ImportResult>(`/boards/${boardId}/import`, layout),
});

/** Writes and reads of a board's sections. */
export type PanelSections = ReturnType<typeof boardSections>;

export const api = {
  // --- Session -------------------------------------------------------------
  getSetupState: () => get<SetupState>("/auth/setup"),
  setup: (data: SetupInput) => post<AuthResult>("/auth/setup", data),
  // Only the "admin" account signs in with a password; the others
  // go through Microsoft (entraLoginUrl).
  login: (username: string, password: string) =>
    post<AuthResult>("/auth/login", { username, password }),
  logout: () => post<null>("/auth/logout"),
  me: () => get<PublicUser>("/auth/me"),
  updateMe: (data: UpdateMeInput) => put<PublicUser>("/auth/me", data),
  /** The view and board the account is on, kept if it remembers its session. */
  saveSessionBoard: (view: string, board: string) =>
    put<null>("/auth/me/session-board", { view, board }),

  getVersion: () => get<VersionPayload>("/version"),

  // --- Accounts ------------------------------------------------------------
  getUsers: () => get<PublicUser[]>("/users"),
  // The signed-in person's favorite actors: they come first in
  // the actor lists.
  getFavorites: () => get<Id[]>("/users/favorites"),
  /** The sort and search of the grids, kept for the signed-in person, by scope (lib/gridStates). */
  getGridStates: () => get<Record<string, Record<string, unknown>>>("/grid-states"),
  saveGridState: (scope: string, state: Record<string, unknown>) =>
    put<null>(`/grid-states/${encodeURIComponent(scope)}`, { state }),
  addFavorite: (id: Id) => put<Id[]>(`/users/favorites/${id}`),
  removeFavorite: (id: Id) => request<Id[]>(`/users/favorites/${id}`, { method: "DELETE" }),
  // Who can be an actor in the current workspace: those who read this widget
  // type — its users, its groups' listed individually, and its groups.
  getWorkspacePeople: (kind: WidgetKind) =>
    get<WorkspacePeople>(`/users/workspace?kind=${kind}`),
  // The people of the Entra directory, and the account of one of them — created
  // if it doesn't exist yet — to make them an actor.
  searchDirectoryUsers: (q: string) =>
    get<DirectoryUser[]>(`/users/directory?q=${encodeURIComponent(q)}`),
  // Its users and groups, and a group's users: the Support actors may be anyone in it.
  searchDirectoryPrincipals: (q: string) =>
    get<EntraPrincipal[]>(`/users/directory/principals?q=${encodeURIComponent(q)}`),
  getDirectoryGroupMembers: (oid: string) =>
    get<DirectoryUser[]>(`/users/directory/groups/${encodeURIComponent(oid)}/members`),
  addDirectoryUser: (oid: string) =>
    post<PublicUser>(`/users/directory/${encodeURIComponent(oid)}`),

  // --- Workspaces ----------------------------------------------------------
  // Switching to another of one's workspaces.
  switchWorkspace: (workspace: Id) => put<PublicUser>("/auth/me/workspace", { workspace }),
  // The workspace a link's item sits in, if the account reads it there.
  getLinkWorkspace: (kind: LinkTargetKind, id: Id) =>
    get<{ workspace: Id }>(`/auth/me/link-workspace/${kind}/${id}`),
  // Their management: reserved to those entitled to it.
  getWorkspaces: () => get<Workspace[]>("/workspaces"),
  createWorkspace: (name: string) => post<Workspace>("/workspaces", { name }),
  updateWorkspace: (id: Id, name: string) => put<Workspace>(`/workspaces/${id}`, { name }),
  deleteWorkspace: (id: Id) => del(`/workspaces/${id}`),

  // --- Workspace access (Entra users and groups) --------------------------
  getAssignments: (workspace: Id) =>
    get<PrincipalAssignments[]>(`/assignments?workspace=${workspace}`),
  // The types and notifications sent replace everything; with none, the
  // principal stays listed without any access. "invite": if just added, they
  // receive the "Nouvel accès à un élément" e-mail.
  setAssignments: (
    principal: EntraPrincipal,
    permissions: WorkspacePermissions,
    workspace: Id,
    invite = false,
  ) =>
    put<PrincipalAssignments[]>(
      `/assignments/${principal.type}/${encodeURIComponent(principal.id)}?workspace=${workspace}`,
      { name: principal.name, email: principal.email, permissions, invite },
    ),
  deleteAssignments: (principal: EntraPrincipal, workspace: Id) =>
    request<PrincipalAssignments[]>(
      `/assignments/${principal.type}/${encodeURIComponent(principal.id)}?workspace=${workspace}`,
      { method: "DELETE" },
    ),

  // --- Administration: Paramétrage and workspace management ----------------
  getAdministration: () => get<PrincipalAdministration[]>("/administration"),
  // "invite": if just added, they receive the "Nouvel accès à un élément" e-mail.
  setAdministration: (principal: EntraPrincipal, permissions: AdminPermissions, invite = false) =>
    put<PrincipalAdministration[]>(
      `/administration/${principal.type}/${encodeURIComponent(principal.id)}`,
      { name: principal.name, email: principal.email, permissions, invite },
    ),
  deleteAdministration: (principal: EntraPrincipal) =>
    request<PrincipalAdministration[]>(
      `/administration/${principal.type}/${encodeURIComponent(principal.id)}`,
      { method: "DELETE" },
    ),
  searchDirectory: (q: string, groupsOnly = false) =>
    get<EntraPrincipal[]>(
      `/assignments/search?q=${encodeURIComponent(q)}${groupsOnly ? "&groups=1" : ""}`,
    ),

  // --- Backup --------------------------------------------------------------
  getBackupInfo: () => get<BackupInfo>("/backup"),
  // The archive isn't opened by the client: it goes from the server to
  // disk, and comes back as is on the day of a restore.
  downloadBackup: () => download("/backup/archive"),
  restoreBackup: (file: File) =>
    sendFile<RestoreResult>("/backup/restore", file),

  // --- Entra ---------------------------------------------------------------
  getEntraSettings: () => get<EntraSettings>("/entra"),
  updateEntraSettings: (data: EntraSettingsInput) =>
    put<EntraSettings>("/entra", data),
  // The test message is sent from the chosen company's support mailbox.
  testMail: (to: string) => post<MailTestResult>("/entra/test", { to }),
  checkMailboxes: () => get<MailboxCheck[]>("/entra/mailboxes"),
  getEntraStatus: () => get<EntraStatus>("/entra/status"),
  connectEntra: () => post<EntraStatus>("/entra/connect"),
  disconnectEntra: () => post<EntraStatus>("/entra/disconnect"),
  checkEntra: (step: string) => post<EntraCheck>(`/entra/check/${encodeURIComponent(step)}`),
  // The first setup's sending address: a code sent to it, then entered.
  sendSenderCode: (email: string) => post<MailTestResult>("/entra/sender/code", { email }),
  confirmSender: (email: string, code: string) =>
    post<EntraSettings>("/entra/sender/confirm", { email, code }),

  // --- Follows -------------------------------------------------------------
  // The client keeps the list of what it follows: each write returns it
  // in full, so there is never a need to re-read it after a click.
  getFollows: () => get<Follows>("/follows"),
  follow: (kind: FollowKind, id: Id) => put<Follows>(`/follows/${kind}/${id}`),
  unfollow: (kind: FollowKind, id: Id) =>
    request<Follows>(`/follows/${kind}/${id}`, { method: "DELETE" }),

  // --- Views and boards ----------------------------------------------------
  // The views, in the order the account arranged them. A view is born with its
  // first board.
  getViews: () => get<View[]>("/views"),
  /** Born without a board. */
  createView: (name: string) => post<View>("/views", { name }),
  updateView: (id: Id, data: ViewInput) => put<View>(`/views/${id}`, data),
  deleteView: (id: Id) => undoableDel(`/views/${id}`),
  /** "Masquer" for this account; returns its views. */
  hideView: (id: Id, hidden: boolean) => put<View[]>(`/views/${id}/hidden`, { hidden }),
  /** "Partager": the view's boards, whom they can go to, and to whom they went. */
  getViewShares: (id: Id) => get<ViewShares>(`/views/${id}/shares`),
  /** Replaces the view's sharing as a whole. */
  setViewShares: (id: Id, data: ViewSharesInput) => put<ViewShares>(`/views/${id}/shares`, data),
  reorderViews: (ids: Id[]) => put<View[]>("/views/reorder", { ids }),
  /** A view's sub-views, in their groups. */
  getSubviews: (id: Id | string) => get<SubviewGroup[]>(`/views/${id}/subviews`),
  /** Replaces a view's sub-views as a whole. */
  saveSubviews: (id: Id | string, data: SubviewsInput) =>
    put<SubviewsSaved>(`/views/${id}/subviews`, data),

  // A view's boards, in the order the account arranged them.
  /** A view's boards, or those of one of its "page" sub-views. */
  getBoards: (viewId: Id | string, subviewId: Id | string | null = null) =>
    get<Board[]>(`/boards${queryString({ view: viewId, subview: subviewId ?? undefined })}`),
  createBoard: (view_id: Id | string, name: string, subview_id: Id | string | null = null) =>
    post<Board>("/boards", { view_id, name, subview_id }),
  /** A single board: enough to know which view it is in. */
  getBoard: (id: Id | string) => get<Board>(`/boards/${id}`),
  updateBoard: (id: Id, data: BoardInput) => put<Board>(`/boards/${id}`, data),
  deleteBoard: (id: Id | string) => undoableDel(`/boards/${id}`),
  /** "Masquer" for this account; returns the boards of its view. */
  hideBoard: (id: Id, hidden: boolean) => put<Board[]>(`/boards/${id}/hidden`, { hidden }),

  /** The context this account views in this board — a label name; null for all. */
  selectContext: (boardId: Id, context: string | null) =>
    put<Board>(`/boards/${boardId}/contexts/selected`, { context }),
  reorderBoards: (view_id: Id | string, ids: Id[], subview_id: Id | string | null = null) =>
    put<Board[]>("/boards/reorder", { view_id, ids, subview_id }),

  // What a board carries: its sections and its widgets.
  boardSections: boardSections,
  getBoardWidgets: (boardId: Id | string) => get<BoardWidget[]>(`/boards/${boardId}/widgets`),
  createBoardWidget: (data: BoardWidgetInput) => post<BoardWidget>("/board-widgets", data),
  // Only the configuration moves — except the category and the sub-category,
  // which convert into one another.
  updateBoardWidget: (id: Id, data: BoardWidgetInput) =>
    put<BoardWidget>(`/board-widgets/${id}`, data),
  /** The copy is placed right below the original. */
  duplicateBoardWidget: (id: Id) => post<BoardWidget>(`/board-widgets/${id}/duplicate`, {}),
  deleteBoardWidget: (id: Id) => undoableDel(`/board-widgets/${id}`),
  /**
   * A cut widget, pasted: moved to this section — of its board or of another
   * —, at this place. It stays the same widget: a list keeps its items.
   */
  moveBoardWidget: (id: Id, sectionId: Id, index: number) =>
    put<BoardWidget>(`/board-widgets/${id}/move`, { section_id: sectionId, index }),
  /** Puts back what a deletion carried away, by the token it returned. */
  undoDeletion: (token: string) => post<null>(`/undo/${token}`),
  /** What the section now carries: a widget from another one moves into it. */
  reorderBoardWidgets: (sectionId: Id, ids: Id[]) =>
    put<BoardWidget[]>("/board-widgets/reorder", { section_id: sectionId, ids }),
  // The confirmation of support mailboxes: their state, and re-sending the link
  // to those that are waiting.
  // Each list — by its list key — confirms its own addresses.
  getMailboxOptins: (list: string, emails: string[]) =>
    get<MailboxOptinState[]>(
      `/mailbox-optins?list_key=${encodeURIComponent(list)}&emails=${encodeURIComponent(emails.join(","))}`,
    ),
  resendMailboxOptins: (list: string, emails: string[]) =>
    post<{ sent: number }>("/mailbox-optins/resend", { list_key: list, emails }),
  /** The four-digit code from the e-mail, in place of the link. */
  confirmMailboxOptin: (list: string, email: string, code: string) =>
    post<MailboxOptinState>("/mailbox-optins/confirm", { list_key: list, email, code }),
  // The consent of the people whose calendar a Calendar widget shows, by its key.
  getCalendarOptins: (key: string, emails: string[]) =>
    get<MailboxOptinState[]>(
      `/calendar-optins?calendar_key=${encodeURIComponent(key)}&emails=${encodeURIComponent(emails.join(","))}`,
    ),
  resendCalendarOptins: (key: string, emails: string[]) =>
    post<{ sent: number }>("/calendar-optins/resend", { calendar_key: key, emails }),
  confirmCalendarOptin: (key: string, email: string, code: string) =>
    post<MailboxOptinState>("/calendar-optins/confirm", { calendar_key: key, email, code }),
  // The Outlook calendars of a person who consented: those the widget may read.
  getPersonCalendars: (key: string, email: string) =>
    get<AccessCalendarChoice[]>(
      `/calendar-optins/calendars?calendar_key=${encodeURIComponent(key)}&email=${encodeURIComponent(email)}`,
    ),
  // The consent of the people whose mailbox a Mail widget reads, by its key.
  getMailOptins: (key: string, emails: string[]) =>
    get<MailboxOptinState[]>(
      `/mail-optins?mail_key=${encodeURIComponent(key)}&emails=${encodeURIComponent(emails.join(","))}`,
    ),
  resendMailOptins: (key: string, emails: string[]) =>
    post<{ sent: number }>("/mail-optins/resend", { mail_key: key, emails }),
  confirmMailOptin: (key: string, email: string, code: string) =>
    post<MailboxOptinState>("/mail-optins/confirm", { mail_key: key, email, code }),
  // The Outlook mail folders of a person who consented: those the widget may read.
  getPersonFolders: (key: string, email: string) =>
    get<AccessMailFolder[]>(
      `/mail-optins/folders?mail_key=${encodeURIComponent(key)}&email=${encodeURIComponent(email)}`,
    ),
  // An RSS widget's feed, as the database keeps it: the server fetches
  // the source itself, at the interval the widget sets.
  getAccessFeed: (widgetId: Id) => get<AccessFeed>(`/board-widgets/${widgetId}/feed`),
  probeAccessFeed: (url: string) =>
    get<AccessFeedProbe>(`/board-widgets/feed/probe?url=${encodeURIComponent(url)}`),
  // The weather of a Météo widget's location, and the location search to set it.
  getAccessWeather: (widgetId: Id) => get<AccessWeather>(`/board-widgets/${widgetId}/weather`),
  // A Citation widget's quote or joke; "renew" draws another one.
  getAccessQuote: (widgetId: Id, renew = false) =>
    get<AccessQuote>(`/board-widgets/${widgetId}/quote${renew ? "?renew=1" : ""}`),
  searchWeatherPlaces: (q: string) =>
    get<WeatherPlace[]>(`/board-widgets/weather/places?q=${encodeURIComponent(q)}`),
  // The Outlook appointments a Calendar widget shows, between two instants.
  getAccessCalendar: (widgetId: Id, start: Date, end: Date) =>
    get<AccessCalendar>(
      `/board-widgets/${widgetId}/calendar?start=${encodeURIComponent(start.toISOString())}&end=${encodeURIComponent(end.toISOString())}`,
    ),
  // Those of the Calendar widget a "Rendez-vous" widget, or its indicator, follows.
  getAppointments: (widgetId: Id, start: Date, end: Date) =>
    get<AccessCalendar>(
      `/board-widgets/${widgetId}/appointments?start=${encodeURIComponent(start.toISOString())}&end=${encodeURIComponent(end.toISOString())}`,
    ),
  // The mailboxes a Mail widget reads, page by page — "cursor", the previous
  // page's, says where the next one starts —, an opened e-mail and its
  // attachments; "owner" says whose mailbox, empty for the viewer's own.
  getAccessMails: (widgetId: Id, cursor: string, top: number, unread: boolean) =>
    get<AccessMailPage>(
      `/board-widgets/${widgetId}/mails?top=${top}${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}${unread ? "&unread=1" : ""}`,
    ),
  /** "since": the start of the viewer's day, for the e-mails received today. */
  getMailCount: (widgetId: Id, metric: MailMetric, since: string) =>
    get<AccessMailCount>(
      `/board-widgets/${widgetId}/mail-count?metric=${metric}&since=${encodeURIComponent(since)}`,
    ),
  getMailFolderCounts: (widgetId: Id) =>
    get<AccessMailFolderCounts>(`/board-widgets/${widgetId}/mail-folders`),
  /** Into the mailbox's deleted items. */
  deleteAccessMail: (widgetId: Id, mailId: string, owner: string) =>
    del(
      `/board-widgets/${widgetId}/mails/${encodeURIComponent(mailId)}?owner=${encodeURIComponent(owner)}`,
    ),
  getAccessMail: (widgetId: Id, mailId: string, owner: string) =>
    get<AccessMailDetail>(
      `/board-widgets/${widgetId}/mails/${encodeURIComponent(mailId)}?owner=${encodeURIComponent(owner)}`,
    ),
  downloadAccessMailAttachment: (widgetId: Id, mailId: string, attachmentId: string, owner: string) =>
    download(
      `/board-widgets/${widgetId}/mails/${encodeURIComponent(mailId)}/attachments/${encodeURIComponent(attachmentId)}?owner=${encodeURIComponent(owner)}`,
    ),
  // An image uploaded for an Image widget: the widget stores its URL.
  uploadWidgetImage: (file: File) => upload<{ url: string }>("/widget-images", file),

  // --- Projects ------------------------------------------------------------
  // Categories belong to a "Projets" widget; a board's are all of its widgets'.
  getCategories: (scope?: ListScope | null) => get<Category[]>(`/categories${scopeQuery(scope)}`),
  // Under "parent_id", or at the root.
  createCategory: (ref: ListRef, name: string, parent_id: Id | null = null) =>
    post<Category>("/categories", { ...listBody(ref), name, parent_id }),
  // "replace": those of the destination widget go first, except
  // those that still hold projects.
  copyCategories: (from: ListRef, to: ListRef, replace = false) =>
    post<CopyResult>("/categories/copy", copyBody(from, to, replace)),
  // The name, the parent and the milestones are modified separately: what
  // isn't sent stays.
  updateCategory: (
    id: Id,
    data: string | { name?: string; parent_id?: Id | null; milestones?: Milestone[] },
  ) =>
    put<Category>(
      `/categories/${id}`,
      typeof data === "string" ? { name: data } : data,
    ),
  deleteCategory: (id: Id) =>
    request<CascadeResult>(`/categories/${id}`, { method: "DELETE" }),
  // The full order of a widget's categories.
  reorderCategories: (ref: ListRef, ids: Id[]) =>
    put<Category[]>("/categories/reorder", { ...listBody(ref), ids }),

  getProjectLabels: (scope: ListScope) => get<ProjectLabel[]>(`/project-labels${scopeQuery(scope)}`),
  createProjectLabel: (ref: ListRef, name: string, color: string, group_id?: Id) =>
    post<ProjectLabel>("/project-labels", { ...listBody(ref), name, color, group_id }),
  // A widget's labels placed in another. Those that already carry
  // the same name there are not duplicated: the report counts them.
  // "replace": those of the destination widget go first.
  copyProjectLabels: (from: ListRef, to: ListRef, replace = false) =>
    post<CopyResult>("/project-labels/copy", copyBody(from, to, replace)),
  updateProjectLabel: (id: Id, data: LabelInput) =>
    put<ProjectLabel>(`/project-labels/${id}`, data),
  deleteProjectLabel: (id: Id) => del(`/project-labels/${id}`),

  // An Asset widget's labels: each names the GLPI tag of the machines it brings.
  getManagedDeviceAssetLabels: (scope: ListScope) =>
    get<Label[]>(`/managed-device-asset-labels${scopeQuery(scope)}`),
  createManagedDeviceAssetLabel: (ref: ListRef, name: string, color: string, group_id?: Id) =>
    post<Label>("/managed-device-asset-labels", { ...listBody(ref), name, color, group_id }),
  updateManagedDeviceAssetLabel: (id: Id, data: LabelInput) =>
    put<Label>(`/managed-device-asset-labels/${id}`, data),
  deleteManagedDeviceAssetLabel: (id: Id) => del(`/managed-device-asset-labels/${id}`),

  // A declared asset widget's labels: its own, named by no tag.
  getDeclaredAssetLabels: (kind: DeclaredAssetKind, scope: ListScope) =>
    get<Label[]>(`${DECLARED_ASSET_ROUTES[kind].labels}${scopeQuery(scope)}`),
  createDeclaredAssetLabel: (
    kind: DeclaredAssetKind,
    ref: ListRef,
    name: string,
    color: string,
    group_id?: Id,
  ) => post<Label>(DECLARED_ASSET_ROUTES[kind].labels, { ...listBody(ref), name, color, group_id }),
  updateDeclaredAssetLabel: (kind: DeclaredAssetKind, id: Id, data: LabelInput) =>
    put<Label>(`${DECLARED_ASSET_ROUTES[kind].labels}/${id}`, data),
  deleteDeclaredAssetLabel: (kind: DeclaredAssetKind, id: Id) =>
    del(`${DECLARED_ASSET_ROUTES[kind].labels}/${id}`),

  // A Contact widget's labels (shared, contacts.ts).
  getContactLabels: (scope: ListScope) => get<Label[]>(`${CONTACT_ROUTES.labels}${scopeQuery(scope)}`),
  createContactLabel: (ref: ListRef, name: string, color: string, group_id?: Id) =>
    post<Label>(CONTACT_ROUTES.labels, { ...listBody(ref), name, color, group_id }),
  updateContactLabel: (id: Id, data: LabelInput) =>
    put<Label>(`${CONTACT_ROUTES.labels}/${id}`, data),
  deleteContactLabel: (id: Id) => del(`${CONTACT_ROUTES.labels}/${id}`),

  // A Produits widget's labels (shared, products.ts).
  getProductLabels: (scope: ListScope) => get<Label[]>(`${PRODUCT_ROUTES.labels}${scopeQuery(scope)}`),
  createProductLabel: (ref: ListRef, name: string, color: string, group_id?: Id) =>
    post<Label>(PRODUCT_ROUTES.labels, { ...listBody(ref), name, color, group_id }),
  updateProductLabel: (id: Id, data: LabelInput) =>
    put<Label>(`${PRODUCT_ROUTES.labels}/${id}`, data),
  deleteProductLabel: (id: Id) => del(`${PRODUCT_ROUTES.labels}/${id}`),

  // An Entrepôts widget's labels (shared, warehouses.ts).
  getWarehouseLabels: (scope: ListScope) => get<Label[]>(`${WAREHOUSE_ROUTES.labels}${scopeQuery(scope)}`),
  createWarehouseLabel: (ref: ListRef, name: string, color: string, group_id?: Id) =>
    post<Label>(WAREHOUSE_ROUTES.labels, { ...listBody(ref), name, color, group_id }),
  updateWarehouseLabel: (id: Id, data: LabelInput) =>
    put<Label>(`${WAREHOUSE_ROUTES.labels}/${id}`, data),
  deleteWarehouseLabel: (id: Id) => del(`${WAREHOUSE_ROUTES.labels}/${id}`),

  // An Emplacements widget's labels (shared, locations.ts).
  getLocationLabels: (scope: ListScope) => get<Label[]>(`${LOCATION_ROUTES.labels}${scopeQuery(scope)}`),
  createLocationLabel: (ref: ListRef, name: string, color: string, group_id?: Id) =>
    post<Label>(LOCATION_ROUTES.labels, { ...listBody(ref), name, color, group_id }),
  updateLocationLabel: (id: Id, data: LabelInput) =>
    put<Label>(`${LOCATION_ROUTES.labels}/${id}`, data),
  deleteLocationLabel: (id: Id) => del(`${LOCATION_ROUTES.labels}/${id}`),

  // A Commandes widget's labels (shared, orders.ts).
  getOrderLabels: (scope: ListScope) => get<Label[]>(`${ORDER_ROUTES.labels}${scopeQuery(scope)}`),
  createOrderLabel: (ref: ListRef, name: string, color: string, group_id?: Id) =>
    post<Label>(ORDER_ROUTES.labels, { ...listBody(ref), name, color, group_id }),
  updateOrderLabel: (id: Id, data: LabelInput) =>
    put<Label>(`${ORDER_ROUTES.labels}/${id}`, data),
  deleteOrderLabel: (id: Id) => del(`${ORDER_ROUTES.labels}/${id}`),

  // The groups of a kind of labels: those of a list widget, or of all a
  // board's, each carrying its list key.
  getLabelGroups: (base: LabelsBase, scope: ListScope) =>
    get<LabelGroup[]>(`${base}/groups${scopeQuery(scope)}`),
  createLabelGroup: (base: LabelsBase, name: string, ref: ListRef) =>
    groupsChange(base, post<LabelGroup>(`${base}/groups`, { ...listBody(ref), name })),
  renameLabelGroup: (base: LabelsBase, id: Id, name: string) =>
    groupsChange(base, put<LabelGroup>(`${base}/groups/${id}`, { name })),
  deleteLabelGroup: (base: LabelsBase, id: Id) => groupsChange(base, del(`${base}/groups/${id}`)),
  // Every group in order, each with all its labels: labels may change group.
  arrangeLabels: (base: LabelsBase, groups: LabelGroupLayout[], ref: ListRef) =>
    groupsChange(base, put<null>(`${base}/arrange`, { ...listBody(ref), groups })),

  getProjects: (filters: ProjectFilters = {}) =>
    get<Project[]>(
      `/projects${queryString(filters as Record<string, unknown>)}`,
    ),
  /** The actor accounts of at least one project of the board (and of the context). */
  getProjectActorIds: (filters: Pick<ProjectFilters, "board"> & { context: string | null }) =>
    get<Id[]>(`/projects/actors${queryString(filters as Record<string, unknown>)}`),
  getProject: (id: Id) => get<ProjectDetail>(`/projects/${id}`),
  createProject: (data: ProjectInput) => post<Project>("/projects", data),
  updateProject: (id: Id, data: ProjectInput) =>
    put<Project>(`/projects/${id}`, data),
  deleteProject: (id: Id) => del(`/projects/${id}`),
  uploadProjectAttachment: (id: Id, file: File) =>
    upload<ProjectAttachment>(`/projects/${id}/attachments`, file),
  reorderProjectAttachments: (id: Id, ids: Id[]) =>
    put<ProjectAttachment[]>(`/projects/${id}/attachments/order`, { ids }),
  deleteProjectAttachment: (id: Id) => del(`/projects/attachments/${id}`),
  // The copy takes the record, the actors, the labels and the documents, but
  // not the thread; without "board_id", it stays in the original board.
  copyProject: (id: Id, data: ProjectCopyInput = {}) =>
    post<Project>(`/projects/${id}/copy`, data),

  addComment: (projectId: Id, text: string) =>
    post<Comment>(`/projects/${projectId}/comments`, { text }),
  updateComment: (id: Id, text: string) =>
    put<Comment>(`/comments/${id}`, { text }),
  deleteComment: (id: Id) => del(`/comments/${id}`),

  // The milestone types of a "Projets" widget — or of all a board's, each
  // carrying its list key. The name and the milestones are modified
  // separately: what isn't sent stays.
  getMilestoneTypes: (scope: ListScope) => get<MilestoneType[]>(`/milestone-types${scopeQuery(scope)}`),
  createMilestoneType: (ref: ListRef, name: string) =>
    post<MilestoneType>("/milestone-types", { ...listBody(ref), name }),
  updateMilestoneType: (
    id: Id,
    data: { name?: string; milestones?: Milestone[] },
  ) => put<MilestoneType>(`/milestone-types/${id}`, data),
  deleteMilestoneType: (id: Id) => del(`/milestone-types/${id}`),


  // --- Tasks ---------------------------------------------------------------
  getTaskLists: (boardId: string | Id) =>
    get<TaskList[]>(`/task-lists${queryString({ board: boardId })}`),
  // Without "index", the list goes to the end of the board.
  /** "list_key": the "Tâches" widget it is created from. */
  createTaskList: (board_id: Id | string, name: string, index?: number, list_key?: string) =>
    post<TaskList>("/task-lists", { board_id, name, index, list_key }),
  updateTaskList: (
    id: Id,
    data: { name?: string; color?: ListColor; board_id?: Id },
  ) => put<TaskList>(`/task-lists/${id}`, data),
  deleteTaskList: (id: Id) => del(`/task-lists/${id}`),
  // Empties the list of its tasks; its separators stay, unless "all".
  deleteTaskListCards: (id: Id, all = false) =>
    del(`/task-lists/${id}/cards${all ? "?all=1" : ""}`),
  // The copy takes the list's cards; without "board_id", it stays
  // in the original board.
  copyTaskList: (id: Id, data: TaskListCopyInput = {}) =>
    post<TaskList>(`/task-lists/${id}/copy`, data),
  reorderTaskLists: (board_id: Id | string, ids: Id[]) =>
    put<TaskList[]>("/task-lists/reorder", { board_id, ids }),

  // "kind" is "card" or "separator"; a card by default.
  // A description can follow at creation: that of a task created
  // from another mode carries the link to the item it comes from.
  createTaskCard: (
    list_id: Id,
    text: string,
    kind: "card" | "separator" = "card",
    description?: string,
    /** The context being viewed: the card receives its label. */
    context?: string | null,
  ) =>
    post<TaskCardRow>("/task-cards", {
      list_id,
      text,
      kind,
      description,
      context: context ?? undefined,
    }),
  updateTaskCard: (id: Id, text: string) =>
    put<TaskCardDetail>(`/task-cards/${id}`, { text }),
  /** The copy is placed right below the original, with everything it carries. */
  duplicateTaskCard: (id: Id) => post<TaskCardRow>(`/task-cards/${id}/duplicate`),
  deleteTaskCard: (id: Id) => del(`/task-cards/${id}`),
  reorderTaskCards: (list_id: Id, ids: Id[]) =>
    put<TaskList[]>("/task-cards/reorder", { list_id, ids }),

  // A card's record: its description, its members, its labels and its
  // comment thread.
  getTaskCard: (id: Id) => get<TaskCardDetail>(`/task-cards/${id}`),
  // Where this card lives: enough to position oneself on it before opening it, when
  // arriving by a link rather than through the board.
  getCardLocation: (id: Id) =>
    get<CardLocation>(`/task-cards/${id}/location`),
  updateTaskCardDetails: (id: Id, data: TaskCardInput) =>
    put<TaskCardDetail>(`/task-cards/${id}`, data),
  addTaskCardComment: (id: Id, text: string) =>
    post<Comment>(`/task-cards/${id}/comments`, { text }),
  updateTaskCardComment: (id: Id, text: string) =>
    put<Comment>(`/card-comments/${id}`, { text }),
  deleteTaskCardComment: (id: Id) => del(`/card-comments/${id}`),

  // A card's checklists: each carries its title and its items. Everything
  // is saved as gestures happen, without waiting for "Enregistrer".
  createChecklist: (cardId: Id, title: string) =>
    post<Checklist>(`/task-cards/${cardId}/checklists`, { title }),
  updateChecklist: (id: Id, data: { title?: string }) =>
    put<Checklist>(`/checklists/${id}`, data),
  deleteChecklist: (id: Id) => del(`/checklists/${id}`),
  createChecklistItem: (checklistId: Id, text = "") =>
    post<ChecklistItem>(`/checklists/${checklistId}/items`, { text }),
  updateChecklistItem: (id: Id, data: ChecklistItemInput) =>
    put<Checklist>(`/checklist-items/${id}`, data),
  deleteChecklistItem: (id: Id) => del(`/checklist-items/${id}`),
  reorderChecklists: (cardId: Id, ids: Id[]) =>
    put<Checklist[]>(`/task-cards/${cardId}/checklists/reorder`, { ids }),
  reorderChecklistItems: (checklistId: Id, ids: Id[]) =>
    put<Checklist>(`/checklists/${checklistId}/items/reorder`, { ids }),

  // A card's dependencies: each is read from the card viewing it —
  // "bloque" here, "est bloqué par" on the other. Saved immediately.
  createCardLink: (cardId: Id, data: CardLinkInput) =>
    post<CardLink>(`/task-cards/${cardId}/links`, data),
  updateCardLink: (id: Id, cardId: Id, data: CardLinkInput) =>
    put<CardLink>(`/card-links/${id}`, { ...data, card_id: cardId }),
  deleteCardLink: (id: Id, cardId: Id) =>
    del(`/card-links/${id}${queryString({ card: cardId })}`),
  // The cards a dependency can link, page by page: those of the
  // board first, then those of the other boards.
  getLinkCandidates: (cardId: Id, q: string, offset: number) =>
    get<LinkCandidates>(`/task-cards/${cardId}/links/candidates${queryString({ q, offset })}`),

  // A card's attachments: the files dropped on it. Upload and
  // removal go out immediately, without waiting for the drawer to close.
  uploadAttachment: (cardId: Id, file: File) =>
    upload<Attachment>(`/task-cards/${cardId}/attachments`, file),
  deleteAttachment: (id: Id) => del(`/attachments/${id}`),
  reorderAttachments: (cardId: Id, ids: Id[]) =>
    put<Attachment[]>(`/task-cards/${cardId}/attachments/order`, { ids }),

  // A card's cover images: uploaded, arranged and removed immediately.
  // The first is the one the card shows on the board.
  uploadCover: (cardId: Id, file: File) =>
    upload<CardCover>(`/task-cards/${cardId}/covers`, file),
  reorderCovers: (cardId: Id, ids: Id[]) =>
    put<CardCover[]>(`/task-cards/${cardId}/covers/order`, { ids }),
  deleteCover: (id: Id) => del(`/covers/${id}`),

  // An image pasted in a card's description: it is uploaded right
  // away, and the editor inserts its URL.
  uploadCardImage: (cardId: Id, file: File) =>
    upload<{ url: string }>(`/task-cards/${cardId}/images`, file),

  // --- Assets mode ---------------------------------------------------------
  // The workstations reported by the inventory agents. The list only carries the
  // name: everything else waits until the workstation is opened, and so only travels
  // for the one being viewed.
  /** A board's workstations. */
  getManagedDeviceAssets: (boardId: Id) =>
    get<ManagedDeviceAsset[]>(`/managed-device-assets${queryString({ board: boardId })}`),
  getManagedDeviceAsset: (id: Id) => get<ManagedDeviceAssetDetail>(`/managed-device-assets/${id}`),

  // The notifications received, for the "Notifications" drawer.
  getNotifications: () => get<Notification[]>("/notifications"),
  deleteNotification: (id: string) => del(`/notifications/${encodeURIComponent(id)}`),
  clearNotifications: () => del("/notifications"),

  // Everything the person sees, for the tab row search (Spotlight), which
  // searches it itself.
  getSearchIndex: () => get<SearchResult[]>("/search"),


  // The "Développeur" section of the Paramétrage, common to all.
  // The "Support" section of the Paramétrage: the default due date.
  getSupportSettings: () => get<SupportSettings>("/support-settings"),
  updateSupportSettings: (data: Partial<SupportSettings>) =>
    put<SupportSettings>("/support-settings", data),
  // A Tickets widget's automatic replies: the title and the template are modified separately.
  getSupportReplies: (ref: ListRef) => get<SupportReply[]>(`/support-replies${scopeQuery(ref)}`),
  createSupportReply: (ref: ListRef, name: string, event: SupportReplyEvent | null = null) =>
    post<SupportReply>("/support-replies", { ...listBody(ref), name, event }),
  updateSupportReply: (
    id: Id,
    data: { name?: string; html?: string; event?: SupportReplyEvent | null },
  ) => put<SupportReply>(`/support-replies/${id}`, data),
  deleteSupportReply: (id: Id) => del(`/support-replies/${id}`),
  // The Entra profiles the templates cite: the signed-in account, and
  // the request's sender when one is given.
  getSupportVariables: (requestId?: Id) =>
    get<{ user: SupportPerson; sender: SupportPerson | null }>(
      `/support-requests/variables${requestId ? `?request=${requestId}` : ""}`,
    ),
  // What is placed by default in a reply's editor: a signature…
  getOrderContents: () => get<OrderContent[]>("/order-contents"),
  createOrderContent: (name: string, event: OrderContentEvent | null = null) =>
    post<OrderContent>("/order-contents", { name, event }),
  updateOrderContent: (id: Id, data: { name?: string; html?: string; event?: OrderContentEvent | null }) =>
    put<OrderContent>(`/order-contents/${id}`, data),
  deleteOrderContent: (id: Id) => del(`/order-contents/${id}`),
  /** The contents in this order. */
  reorderOrderContents: (ids: Id[]) => put<OrderContent[]>("/order-contents/order", { ids }),
  // A Tickets widget's predefined replies: its own.
  getSupportContents: (ref: ListRef) => get<SupportContent[]>(`/support-contents${scopeQuery(ref)}`),
  createSupportContent: (ref: ListRef, name: string, event: SupportContentEvent | null = null) =>
    post<SupportContent>("/support-contents", { ...listBody(ref), name, event }),
  updateSupportContent: (
    id: Id,
    data: { name?: string; html?: string; event?: SupportContentEvent | null },
  ) => put<SupportContent>(`/support-contents/${id}`, data),
  deleteSupportContent: (id: Id) => del(`/support-contents/${id}`),
  /** The contents in this order. */
  reorderSupportContents: (ref: ListRef, ids: Id[]) =>
    put<SupportContent[]>("/support-contents/order", { ...listBody(ref), ids }),
  // An Asset widget's settings: the templates table, the VLAN one.
  getManagedDeviceAssetSettings: (ref: ListRef) =>
    get<ManagedDeviceAssetSettings>(`/managed-device-asset-settings${scopeQuery(ref)}`),
  updateManagedDeviceAssetSettings: (ref: ListRef, data: Partial<ManagedDeviceAssetSettings>) =>
    put<ManagedDeviceAssetSettings>(`/managed-device-asset-settings${scopeQuery(ref)}`, data),
  // An asset widget's label templates; the preview is drawn by the format's
  // printer, the test printed on it.
  getLabelTemplates: (kind: LabelTemplateKind, ref: ListRef) =>
    get<LabelTemplates>(`/label-templates/${kind}${scopeQuery(ref)}`),
  updateLabelTemplates: (kind: LabelTemplateKind, ref: ListRef, templates: LabelTemplate[]) =>
    put<LabelTemplates>(`/label-templates/${kind}${scopeQuery(ref)}`, { templates }),
  previewLabelTemplate: (kind: LabelTemplateKind, ref: ListRef, data: Omit<LabelTemplate, "name">) =>
    post<LabelPreview>(`/label-templates/${kind}/preview${scopeQuery(ref)}`, data),
  printLabelTemplate: (kind: LabelTemplateKind, ref: ListRef, data: Omit<LabelTemplate, "name">) =>
    post<LabelTestPrint>(`/label-templates/${kind}/print${scopeQuery(ref)}`, data),
  // A declared asset widget's number templates: the browser runs them.
  getAssetNumberTemplates: (kind: DeclaredAssetKind, ref: ListRef) =>
    get<AssetNumberTemplates>(`/asset-number-templates/${kind}${scopeQuery(ref)}`),
  updateAssetNumberTemplates: (kind: DeclaredAssetKind, ref: ListRef, templates: AssetNumberTemplate[]) =>
    put<AssetNumberTemplates>(`/asset-number-templates/${kind}${scopeQuery(ref)}`, { templates }),
  // An asset's label, from the template of this name.
  printAssetLabel: (kind: LabelTemplateKind, assetId: Id, name: string) =>
    post<LabelTestPrint>(`/label-templates/${kind}/assets/${assetId}/print`, { name }),
  // A declared asset widget's lists: categories, suppliers, makers, products.
  getDeclaredAssetSettings: (kind: DeclaredAssetKind, ref: ListRef) =>
    get<DeclaredAssetSettings>(`${DECLARED_ASSET_ROUTES[kind].settings}${scopeQuery(ref)}`),
  updateDeclaredAssetSettings: (kind: DeclaredAssetKind, ref: ListRef, data: Partial<DeclaredAssetSettings>) =>
    put<DeclaredAssetSettings>(`${DECLARED_ASSET_ROUTES[kind].settings}${scopeQuery(ref)}`, data),
  // A board's declared assets, by kind. Their photos and documents go out on
  // upload, like a card's.
  getDeclaredAssets: (kind: DeclaredAssetKind, boardId: Id) =>
    get<DeclaredAsset[]>(`${DECLARED_ASSET_ROUTES[kind].assets}${queryString({ board: boardId })}`),
  createDeclaredAsset: (kind: DeclaredAssetKind, data: DeclaredAssetInput) =>
    post<DeclaredAsset>(DECLARED_ASSET_ROUTES[kind].assets, data),
  updateDeclaredAsset: (kind: DeclaredAssetKind, id: Id, data: DeclaredAssetInput) =>
    put<DeclaredAsset>(`${DECLARED_ASSET_ROUTES[kind].assets}/${id}`, data),
  deleteDeclaredAsset: (kind: DeclaredAssetKind, id: Id) =>
    del(`${DECLARED_ASSET_ROUTES[kind].assets}/${id}`),
  getDeclaredAssetFiles: (kind: DeclaredAssetKind, id: Id) =>
    get<DeclaredAssetFiles>(`${DECLARED_ASSET_ROUTES[kind].assets}/${id}/files`),
  uploadDeclaredAssetPhoto: (kind: DeclaredAssetKind, id: Id, file: File) =>
    upload<DeclaredAssetPhoto>(`${DECLARED_ASSET_ROUTES[kind].assets}/${id}/photos`, file),
  reorderDeclaredAssetPhotos: (kind: DeclaredAssetKind, id: Id, ids: Id[]) =>
    put<DeclaredAssetPhoto[]>(`${DECLARED_ASSET_ROUTES[kind].assets}/${id}/photos/order`, { ids }),
  deleteDeclaredAssetPhoto: (kind: DeclaredAssetKind, id: Id) =>
    del(`${DECLARED_ASSET_ROUTES[kind].assets}/photos/${id}`),
  uploadDeclaredAssetAttachment: (kind: DeclaredAssetKind, id: Id, file: File) =>
    upload<DeclaredAssetAttachment>(`${DECLARED_ASSET_ROUTES[kind].assets}/${id}/attachments`, file),
  reorderDeclaredAssetAttachments: (kind: DeclaredAssetKind, id: Id, ids: Id[]) =>
    put<DeclaredAssetAttachment[]>(
      `${DECLARED_ASSET_ROUTES[kind].assets}/${id}/attachments/order`,
      { ids },
    ),
  deleteDeclaredAssetAttachment: (kind: DeclaredAssetKind, id: Id) =>
    del(`${DECLARED_ASSET_ROUTES[kind].assets}/attachments/${id}`),
  // A board's contacts, and its contact lists: payment terms, currencies.
  getContacts: (boardId: Id) =>
    get<Contact[]>(`${CONTACT_ROUTES.contacts}${queryString({ board: boardId })}`),
  createContact: (data: ContactInput & { board_id: Id; list_key: string }) =>
    post<Contact>(CONTACT_ROUTES.contacts, data),
  updateContact: (id: Id, data: ContactInput) =>
    put<Contact>(`${CONTACT_ROUTES.contacts}/${id}`, data),
  deleteContact: (id: Id) => del(`${CONTACT_ROUTES.contacts}/${id}`),
  getContactComments: (id: Id) => get<ContactComment[]>(`${CONTACT_ROUTES.contacts}/${id}/comments`),
  addContactComment: (id: Id, text: string) =>
    post<ContactComment>(`${CONTACT_ROUTES.contacts}/${id}/comments`, { text }),
  updateContactComment: (id: Id, text: string) =>
    put<ContactComment>(`${CONTACT_ROUTES.contacts}/comments/${id}`, { text }),
  deleteContactComment: (id: Id) => del(`${CONTACT_ROUTES.contacts}/comments/${id}`),
  // A Contact widget's lists.
  getContactSettings: (ref: ListRef) => get<ContactSettings>(`${CONTACT_ROUTES.settings}${scopeQuery(ref)}`),
  updateContactSettings: (ref: ListRef, data: Partial<ContactSettings>) =>
    put<ContactSettings>(`${CONTACT_ROUTES.settings}${scopeQuery(ref)}`, data),
  // A board's warehouses.
  getWarehouses: (boardId: Id) =>
    get<Warehouse[]>(`${WAREHOUSE_ROUTES.warehouses}${queryString({ board: boardId })}`),
  createWarehouse: (data: WarehouseInput & { board_id: Id; list_key: string }) =>
    post<Warehouse>(WAREHOUSE_ROUTES.warehouses, data),
  updateWarehouse: (id: Id, data: WarehouseInput) =>
    put<Warehouse>(`${WAREHOUSE_ROUTES.warehouses}/${id}`, data),
  deleteWarehouse: (id: Id) => del(`${WAREHOUSE_ROUTES.warehouses}/${id}`),
  // A board's locations; a place's label, from the template of this name.
  getLocations: (boardId: Id) =>
    get<Location[]>(`${LOCATION_ROUTES.locations}${queryString({ board: boardId })}`),
  createLocation: (data: LocationInput & { board_id: Id; list_key: string }) =>
    post<Location>(LOCATION_ROUTES.locations, data),
  updateLocation: (id: Id, data: LocationInput) =>
    put<Location>(`${LOCATION_ROUTES.locations}/${id}`, data),
  deleteLocation: (id: Id) => del(`${LOCATION_ROUTES.locations}/${id}`),
  printLocationLabel: (id: Id, place: string, name: string) =>
    post<LabelTestPrint>(
      `${LOCATION_ROUTES.locations}/${id}/places/${encodeURIComponent(place)}/print`,
      { name },
    ),
  // An Entrepôts widget's lists.
  // A Taxes widget's taxes, in their order (shared, taxes.ts).
  getTaxes: (ref: ListRef) => get<Tax[]>(`${TAX_ROUTES.taxes}${scopeQuery(ref)}`),
  updateTaxes: (ref: ListRef, taxes: Tax[]) => put<Tax[]>(`${TAX_ROUTES.taxes}${scopeQuery(ref)}`, taxes),
  // A Liste widget's items, in their order (shared, value-lists.ts).
  getValueItems: (ref: ListRef) => get<ValueItem[]>(`${VALUE_LIST_ROUTES.items}${scopeQuery(ref)}`),
  updateValueItems: (ref: ListRef, items: ValueItemInput[]) =>
    put<ValueItem[]>(`${VALUE_LIST_ROUTES.items}${scopeQuery(ref)}`, items),
  getWarehouseSettings: (ref: ListRef) =>
    get<WarehouseSettings>(`${WAREHOUSE_ROUTES.settings}${scopeQuery(ref)}`),
  updateWarehouseSettings: (ref: ListRef, data: WarehouseSettings) =>
    put<WarehouseSettings>(`${WAREHOUSE_ROUTES.settings}${scopeQuery(ref)}`, data),
  // A board's products, their files and their comments.
  getProducts: (boardId: Id) =>
    get<Product[]>(`${PRODUCT_ROUTES.products}${queryString({ board: boardId })}`),
  createProduct: (data: ProductInput & { board_id: Id; list_key: string }) =>
    post<Product>(PRODUCT_ROUTES.products, data),
  /** Archived, or back: an archived product is no longer offered to an order. */
  archiveProduct: (id: Id, archived: boolean) =>
    put<Product>(`${PRODUCT_ROUTES.products}/${id}/archive`, { archived }),
  updateProduct: (id: Id, data: ProductInput) =>
    put<Product>(`${PRODUCT_ROUTES.products}/${id}`, data),
  duplicateProduct: (id: Id) => post<Product>(`${PRODUCT_ROUTES.products}/${id}/duplicate`),
  deleteProduct: (id: Id) => del(`${PRODUCT_ROUTES.products}/${id}`),
  getProductFiles: (id: Id) => get<ProductFiles>(`${PRODUCT_ROUTES.products}/${id}/files`),
  uploadProductPhoto: (id: Id, file: File) =>
    upload<ProductPhoto>(`${PRODUCT_ROUTES.products}/${id}/photos`, file),
  reorderProductPhotos: (id: Id, ids: Id[]) =>
    put<ProductPhoto[]>(`${PRODUCT_ROUTES.products}/${id}/photos/order`, { ids }),
  deleteProductPhoto: (id: Id) => del(`${PRODUCT_ROUTES.products}/photos/${id}`),
  uploadProductAttachment: (id: Id, file: File) =>
    upload<ProductAttachment>(`${PRODUCT_ROUTES.products}/${id}/attachments`, file),
  reorderProductAttachments: (id: Id, ids: Id[]) =>
    put<ProductAttachment[]>(`${PRODUCT_ROUTES.products}/${id}/attachments/order`, { ids }),
  deleteProductAttachment: (id: Id) => del(`${PRODUCT_ROUTES.products}/attachments/${id}`),
  getProductComments: (id: Id) => get<ProductComment[]>(`${PRODUCT_ROUTES.products}/${id}/comments`),
  addProductComment: (id: Id, text: string) =>
    post<ProductComment>(`${PRODUCT_ROUTES.products}/${id}/comments`, { text }),
  updateProductComment: (id: Id, text: string) =>
    put<ProductComment>(`${PRODUCT_ROUTES.products}/comments/${id}`, { text }),
  deleteProductComment: (id: Id) => del(`${PRODUCT_ROUTES.products}/comments/${id}`),
  // A Produits widget's lists: its categories tree.
  getProductSettings: (ref: ListRef) => get<ProductSettings>(`${PRODUCT_ROUTES.settings}${scopeQuery(ref)}`),
  updateProductSettings: (ref: ListRef, data: ProductSettings) =>
    put<ProductSettings>(`${PRODUCT_ROUTES.settings}${scopeQuery(ref)}`, data),
  // A board's orders and their comments.
  getOrders: (boardId: Id) =>
    get<Order[]>(`${ORDER_ROUTES.orders}${queryString({ board: boardId })}`),
  createOrder: (data: OrderInput & { board_id: Id; list_key: string }) =>
    post<Order>(ORDER_ROUTES.orders, data),
  updateOrder: (id: Id, data: OrderInput) => put<Order>(`${ORDER_ROUTES.orders}/${id}`, data),
  deleteOrder: (id: Id) => del(`${ORDER_ROUTES.orders}/${id}`),
  /** The index a format's count gives next, not taken: a number is drawn with it. */
  getOrderNextIndex: (ref: ListRef, format: OrderNumberFormat) =>
    get<{ index: number }>(
      `${ORDER_ROUTES.orders}/next-index${queryString({ board: ref.board, list: ref.list, format })}`,
    ),
  /** The reply editor's preview: the message in its template, the order as the drawer holds it. */
  previewOrderMail: (data: {
    board_id: Id;
    html: string;
    supplier_id: Id | null;
    due_date: string;
    lines: OrderInput["lines"];
    number: string;
    recipient_id: Id | null;
  }) => post<{ html: string }>(`${ORDER_ROUTES.orders}/mail-preview`, data),
  /** The e-mail to the order's supplier contacts, from the signed-in account. */
  sendOrderMail: (
    id: Id,
    data: {
      kind: OrderMailKind;
      html: string;
      copy: boolean;
      cc?: string[];
      bcc?: string[];
      /** Attached, in base 64: 3 MB at most in all. */
      files?: { name: string; mime: string; content: string }[];
    },
  ) =>
    post<{ sent: number; simulated: boolean }>(`${ORDER_ROUTES.orders}/${id}/mail`, data),
  /** Whoever writes, for the editors' "{{user.…}}". */
  getOrderVariables: () => get<{ user: SupportPerson }>(`${ORDER_ROUTES.orders}/variables`),
  /** Where an order opens: its board, and its widget there. */
  getOrderLocation: (id: Id) =>
    get<{ board_id: Id; widget_id: Id | null }>(`${ORDER_ROUTES.orders}/${id}/location`),
  /** An order's exchanges: the e-mails sent to its supplier contacts. */
  getOrderMessages: (id: Id) => get<OrderMessage[]>(`${ORDER_ROUTES.orders}/${id}/messages`),
  getOrderNumberTemplates: (ref: ListRef) =>
    get<OrderNumberTemplates>(`${ORDER_ROUTES.numbers}${scopeQuery(ref)}`),
  updateOrderNumberTemplates: (ref: ListRef, templates: OrderNumberTemplate[]) =>
    put<OrderNumberTemplates>(`${ORDER_ROUTES.numbers}${scopeQuery(ref)}`, { templates }),
  getOrderAttachments: (id: Id) => get<OrderAttachment[]>(`${ORDER_ROUTES.orders}/${id}/attachments`),
  uploadOrderAttachment: (id: Id, file: File) =>
    upload<OrderAttachment>(`${ORDER_ROUTES.orders}/${id}/attachments`, file),
  uploadOrderInvoice: (id: Id, file: File) =>
    upload<OrderAttachment>(`${ORDER_ROUTES.orders}/${id}/invoices`, file),
  reorderOrderAttachments: (id: Id, ids: Id[]) =>
    put<OrderAttachment[]>(`${ORDER_ROUTES.orders}/${id}/attachments/order`, { ids }),
  deleteOrderAttachment: (id: Id) => del(`${ORDER_ROUTES.orders}/attachments/${id}`),
  getOrderComments: (id: Id) => get<OrderComment[]>(`${ORDER_ROUTES.orders}/${id}/comments`),
  addOrderComment: (id: Id, text: string) =>
    post<OrderComment>(`${ORDER_ROUTES.orders}/${id}/comments`, { text }),
  updateOrderComment: (id: Id, text: string) =>
    put<OrderComment>(`${ORDER_ROUTES.orders}/comments/${id}`, { text }),
  deleteOrderComment: (id: Id) => del(`${ORDER_ROUTES.orders}/comments/${id}`),
  getMiloSettings: () => get<MiloSettings>("/milo-settings"),
  updateMiloSettings: (data: Partial<MiloSettings>) => put<MiloSettings>("/milo-settings", data),
  // Without a list, the Settings' templates; with a Tickets widget, its own.
  getMailTemplates: (ref?: ListRef | null) =>
    get<MailTemplate[]>(`/mail-templates${ref ? scopeQuery(ref) : ""}`),
  // The empty template goes back to Milo's own.
  updateMailTemplate: (key: MailTemplateKey, mjml: string, ref?: ListRef | null) =>
    put<MailTemplate[]>(`/mail-templates/${key}`, { mjml, ...(ref ? listBody(ref) : {}) }),
  // A support content — or an order's — in its reply template, as saved.
  previewReply: (
    key: ReplyTemplateKey,
    reply: {
      content: string;
      ticket: string;
      subject: string;
      name: string;
      status?: string;
      url?: string;
      requester?: Pick<SupportPerson, "first_name" | "last_name" | "full_name" | "email"> | null;
      /** The request whose e-mail it quotes; left out, a sample e-mail. */
      request_id?: Id | null;
    },
    /** The Tickets widget whose template lays it out. */
    ref?: ListRef | null,
  ) =>
    post<{ html: string }>(`/mail-templates/${key}/reply-preview`, {
      ...reply,
      ...(ref ? listBody(ref) : {}),
    }),
  previewMailTemplate: (key: MailTemplateKey, mjml: string) =>
    post<MailTemplatePreview>(`/mail-templates/${key}/preview`, { mjml }),
  getDisplaySettings: () => get<DisplaySettings>("/display-settings"),
  updateDisplaySettings: (data: Partial<DisplaySettings>) =>
    put<DisplaySettings>("/display-settings", data),
  // "Paramétrage" > "API": the secret only comes back on generation.
  getApiTokens: () => get<ApiToken[]>("/api-tokens"),
  createApiToken: (data: ApiTokenInput) => post<CreatedApiToken>("/api-tokens", data),
  updateApiToken: (id: Id, data: ApiTokenInput) => put<ApiToken>(`/api-tokens/${id}`, data),
  deleteApiToken: (id: Id) => del(`/api-tokens/${id}`),

  // "Paramétrage" > "Proxy": the token only comes back on generation.
  getProxies: () => get<MiloProxy[]>("/proxies"),
  createProxy: (data: MiloProxyInput) => post<CreatedMiloProxy>("/proxies", data),
  updateProxy: (id: Id, data: MiloProxyInput) => put<MiloProxy>(`/proxies/${id}`, data),
  regenerateProxyToken: (id: Id) => post<CreatedMiloProxy>(`/proxies/${id}/token`, {}),
  deleteProxy: (id: Id) => del(`/proxies/${id}`),

  getPrinters: () => get<Printer[]>("/printers"),
  // Each printer asked for its model: a few seconds at most.
  getPrinterInfos: () => get<PrinterInfos>("/printers/info"),
  createPrinter: (data: PrinterInput) => post<Printer>("/printers", data),
  updatePrinter: (id: Id, data: PrinterInput) => put<Printer>(`/printers/${id}`, data),
  deletePrinter: (id: Id) => del(`/printers/${id}`),
  /** A ZPL job, sent as is to a Zebra. */
  printZpl: (id: Id, zpl: string) => post<void>(`/printers/${id}/print`, { zpl }),
  getPaperFormats: () => get<PaperFormat[]>("/paper-formats"),
  createPaperFormat: (data: Omit<PaperFormat, "id">) => post<PaperFormat>("/paper-formats", data),
  updatePaperFormat: (id: Id, data: PaperFormatInput) =>
    put<PaperFormat>(`/paper-formats/${id}`, data),
  deletePaperFormat: (id: Id) => del(`/paper-formats/${id}`),
  getThemes: () => get<Theme[]>("/theme-colors"),
  updateThemes: (themes: Theme[]) => put<Theme[]>("/theme-colors", themes),
  getTitleStyles: () => get<TitleStyle[]>("/title-styles"),
  updateTitleStyles: (styles: TitleStyle[]) =>
    put<TitleStyle[]>("/title-styles", styles),
  // "Inventorie-toi maintenant": the server calls the agent on the workstation.
  // Nothing comes back — the inventory arrives later through the agents' door,
  // and the event stream notifies.
  refreshManagedDeviceAsset: (id: Id) =>
    post<ManagedDeviceAssetRefresh>(`/managed-device-assets/${id}/refresh`, {}),
  deleteManagedDeviceAsset: (id: Id) => del(`/managed-device-assets/${id}`),
  // --- Support mode --------------------------------------------------------

  /** A board's requests. */
  getSupportRequests: (boardId: Id) =>
    get<SupportRequest[]>(`/support-requests${queryString({ board: boardId })}`),
  getSupportRequest: (id: Id) =>
    get<SupportRequestDetail>(`/support-requests/${id}`),
  createSupportRequest: (data: SupportRequestInput) =>
    post<SupportRequestDetail>("/support-requests", data),
  updateSupportRequest: (id: Id, data: SupportRequestInput) =>
    put<SupportRequestDetail>(`/support-requests/${id}`, data),
  deleteSupportRequest: (id: Id) => del(`/support-requests/${id}`),
  // Polls the companies' support mailboxes: new e-mails there
  // become requests, which the event stream then has re-read.
  syncSupportMail: () => post<{ created: number }>("/support-requests/sync"),
  // The "Actions" menu actions, on the ticked requests.
  mergeSupportRequests: (ids: Id[]) =>
    post<SupportRequestDetail>("/support-requests/merge", { ids }),
  closeSupportRequests: (ids: Id[]) => post<void>("/support-requests/close", { ids }),
  deleteSupportRequests: (ids: Id[]) => post<void>("/support-requests/delete", { ids }),
  assignSupportRequests: (ids: Id[], actor_ids: Id[]) =>
    post<void>("/support-requests/assign", { ids, actor_ids }),

  // "internal": a team comment ("Commentaires" tab), not
  // an exchange with the sender.
  // A reply can also say where the request stands, and who to copy.
  addSupportComment: (
    id: Id,
    text: string,
    internal = false,
    sending: {
      status?: SupportStatus;
      cc?: string[];
      bcc?: string[];
      files?: SupportFileDeposit[];
    } = {},
  ) => post<SupportComment>(`/support-requests/${id}/comments`, { text, internal, ...sending }),
  // A reply attachment, uploaded before sending the reply that carries it.
  uploadSupportFile: (id: Id, file: File) =>
    upload<SupportFileDeposit>(`/support-requests/${id}/files`, file),
  updateSupportComment: (id: Id, text: string) =>
    put<SupportComment>(`/support-comments/${id}`, { text }),
  deleteSupportComment: (id: Id) => del(`/support-comments/${id}`),

  // Support mode labels: they belong to a "Tickets" widget, like the cards'.
  getSupportLabels: (scope: ListScope) => get<SupportLabel[]>(`/support-labels${scopeQuery(scope)}`),
  createSupportLabel: (ref: ListRef, name: string, color: string, group_id?: Id) =>
    post<SupportLabel>("/support-labels", { ...listBody(ref), name, color, group_id }),
  updateSupportLabel: (id: Id, data: SupportLabelInput) =>
    put<SupportLabel>(`/support-labels/${id}`, data),
  deleteSupportLabel: (id: Id) => del(`/support-labels/${id}`),

  // A "Tâches" widget's labels: a name and a color, placed on its cards. A
  // board's are all of its widgets', each carrying its list key.
  getLabels: (scope: ListScope) => get<Label[]>(`/labels${scopeQuery(scope)}`),
  createLabel: (ref: ListRef, name: string, color: string, group_id?: Id) =>
    post<Label>("/labels", { ...listBody(ref), name, color, group_id }),
  copyLabels: (from: ListRef, to: ListRef, replace = false) =>
    post<CopyResult>("/labels/copy", copyBody(from, to, replace)),

  // The widgets an indicator or a chart can read, on every board one sees.
  getSourceWidgets: (type: string) =>
    get<SourceWidget[]>(`/source-widgets${queryString({ type })}`),
  updateLabel: (id: Id, data: LabelInput) => put<Label>(`/labels/${id}`, data),
  deleteLabel: (id: Id) => del(`/labels/${id}`),
};

/**
 * Sign-in through Microsoft: the browser leaves the application for the
 * Microsoft page, and comes back with its token in the URL fragment.
 */
export const entraLoginUrl = "/api/auth/entra/start";
