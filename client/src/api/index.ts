// The API client. Each call says what it returns: the types come from
// @milo/shared, the same ones the server honors.

import type {
  DirectoryUser,
  AccessCalendarEvent,
  AccessFeed,
  AccessFeedProbe,
  AccessMailDetail,
  AccessMailPage,
  AccessWeather,
  WeatherPlace,
  ApiError,
  Asset,
  AssetDetail,
  IndicatorSection,
  IndicatorSectionInput,
  ExportedLayout,
  MailboxOptinState,
  ImportResult,
  AssetRefresh,
  Attachment,
  CardCover,
  AuthResult,
  BackupInfo,
  Board,
  BoardInput,
  ContextInput,
  BoardWidget,
  BoardWidgetInput,
  View,
  Workspace,
  ViewInput,
  ViewShares,
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
  EntraStatus,
  MailboxCheck,
  PrincipalAdministration,
  WorkspacePermissions,
  PrincipalAssignments,
  FollowKind,
  Follows,
  Id,
  Label,
  LabelGroup,
  LabelGroupLayout,
  LabelInput,
  LabelsBase,
  ListColor,
  MailTestResult,
  Project,
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
  NotificationSettings,
  SupportContent,
  SupportContentEvent,
  SupportPerson,
  SupportReply,
  SupportReplyEvent,
  SupportSettings,
  AssetSettings,
  UpdateMeInput,
  VersionPayload,
  SearchResult,
  Notification,
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

  if (res.status === 401 && !path.startsWith("/auth/")) {
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
const boardSections = (boardId: Id | string) => ({
  all: () => get<IndicatorSection[]>(`/boards/${boardId}/sections`),
  create: (data: IndicatorSectionInput) =>
    post<IndicatorSection>(`/boards/${boardId}/sections`, data),
  update: (id: Id, data: IndicatorSectionInput) =>
    put<IndicatorSection>(`/board-sections/${id}`, data),
  /** The copy, with its widgets, is placed right after the original. */
  duplicate: (id: Id) => post<IndicatorSection>(`/board-sections/${id}/duplicate`, {}),
  remove: (id: Id) => del(`/board-sections/${id}`),
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

  getVersion: () => get<VersionPayload>("/version"),

  // --- Accounts ------------------------------------------------------------
  getUsers: () => get<PublicUser[]>("/users"),
  // The signed-in person's favorite actors: they come first in
  // the actor lists.
  getFavorites: () => get<Id[]>("/users/favorites"),
  addFavorite: (id: Id) => put<Id[]>(`/users/favorites/${id}`),
  removeFavorite: (id: Id) => request<Id[]>(`/users/favorites/${id}`, { method: "DELETE" }),
  // The people of the Entra directory, and the account of one of them — created
  // if it doesn't exist yet — to make them an actor.
  searchDirectoryUsers: (q: string) =>
    get<DirectoryUser[]>(`/users/directory?q=${encodeURIComponent(q)}`),
  addDirectoryUser: (oid: string) =>
    post<PublicUser>(`/users/directory/${encodeURIComponent(oid)}`),
  // The directory's groups, for actors who only notify.
  searchDirectoryGroups: (q: string) =>
    get<EntraPrincipal[]>(`/users/directory/groups?q=${encodeURIComponent(q)}`),

  // --- Workspaces ----------------------------------------------------------
  // Switching to another of one's workspaces.
  switchWorkspace: (workspace: Id) => put<PublicUser>("/auth/me/workspace", { workspace }),
  // Their management: reserved to those entitled to it.
  getWorkspaces: () => get<Workspace[]>("/workspaces"),
  createWorkspace: (name: string) => post<Workspace>("/workspaces", { name }),
  updateWorkspace: (id: Id, name: string) => put<Workspace>(`/workspaces/${id}`, { name }),
  deleteWorkspace: (id: Id) => del(`/workspaces/${id}`),

  // --- Workspace access (Entra users and groups) --------------------------
  getAssignments: (workspace: Id) =>
    get<PrincipalAssignments[]>(`/assignments?workspace=${workspace}`),
  // The types and notifications sent replace everything; with none, the
  // principal stays listed without any access.
  setAssignments: (principal: EntraPrincipal, permissions: WorkspacePermissions, workspace: Id) =>
    put<PrincipalAssignments[]>(
      `/assignments/${principal.type}/${encodeURIComponent(principal.id)}?workspace=${workspace}`,
      { name: principal.name, email: principal.email, permissions },
    ),
  deleteAssignments: (principal: EntraPrincipal, workspace: Id) =>
    request<PrincipalAssignments[]>(
      `/assignments/${principal.type}/${encodeURIComponent(principal.id)}?workspace=${workspace}`,
      { method: "DELETE" },
    ),

  // --- Administration: Paramétrage and workspace management ----------------
  getAdministration: () => get<PrincipalAdministration[]>("/administration"),
  setAdministration: (principal: EntraPrincipal, permissions: AdminPermissions) =>
    put<PrincipalAdministration[]>(
      `/administration/${principal.type}/${encodeURIComponent(principal.id)}`,
      { name: principal.name, email: principal.email, permissions },
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
  deleteView: (id: Id) => del(`/views/${id}`),
  /** "Masquer" for this account; returns its views. */
  hideView: (id: Id, hidden: boolean) => put<View[]>(`/views/${id}/hidden`, { hidden }),
  /** "Partager": the view's boards, whom they can go to, and to whom they went. */
  getViewShares: (id: Id) => get<ViewShares>(`/views/${id}/shares`),
  /** Replaces the view's sharing as a whole. */
  setViewShares: (id: Id, data: ViewSharesInput) => put<ViewShares>(`/views/${id}/shares`, data),
  reorderViews: (ids: Id[]) => put<View[]>("/views/reorder", { ids }),

  // A view's boards, in the order the account arranged them.
  getBoards: (viewId: Id | string) => get<Board[]>(`/boards${queryString({ view: viewId })}`),
  createBoard: (view_id: Id | string, name: string) => post<Board>("/boards", { view_id, name }),
  /** A single board: enough to know which view it is in. */
  getBoard: (id: Id | string) => get<Board>(`/boards/${id}`),
  updateBoard: (id: Id, data: BoardInput) => put<Board>(`/boards/${id}`, data),
  deleteBoard: (id: Id | string) => del(`/boards/${id}`),
  /** "Masquer" for this account; returns the boards of its view. */
  hideBoard: (id: Id, hidden: boolean) => put<Board[]>(`/boards/${id}/hidden`, { hidden }),

  // A board's contexts: each write returns the updated board.
  addContext: (boardId: Id, name: string) =>
    post<Board>(`/boards/${boardId}/contexts`, { name } satisfies ContextInput),
  renameContext: (id: Id, name: string) =>
    put<Board>(`/contexts/${id}`, { name } satisfies ContextInput),
  deleteContext: (id: Id) => request<Board>(`/contexts/${id}`, { method: "DELETE" }),
  reorderContexts: (boardId: Id, ids: Id[]) =>
    put<Board>(`/boards/${boardId}/contexts/reorder`, { ids }),
  /** The context this account views in this board; null for all. */
  selectContext: (boardId: Id, contextId: Id | null) =>
    put<Board>(`/boards/${boardId}/contexts/selected`, { context_id: contextId }),
  reorderBoards: (view_id: Id | string, ids: Id[]) =>
    put<Board[]>("/boards/reorder", { view_id, ids }),

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
  deleteBoardWidget: (id: Id) => del(`/board-widgets/${id}`),
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
  // An RSS widget's feed, as the database keeps it: the server fetches
  // the source itself, at the interval the widget sets.
  getAccessFeed: (widgetId: Id) => get<AccessFeed>(`/board-widgets/${widgetId}/feed`),
  probeAccessFeed: (url: string) =>
    get<AccessFeedProbe>(`/board-widgets/feed/probe?url=${encodeURIComponent(url)}`),
  // The weather of a Météo widget's location, and the location search to set it.
  getAccessWeather: (widgetId: Id) => get<AccessWeather>(`/board-widgets/${widgetId}/weather`),
  searchWeatherPlaces: (q: string) =>
    get<WeatherPlace[]>(`/board-widgets/weather/places?q=${encodeURIComponent(q)}`),
  // The Outlook appointments of the viewer, between two instants.
  getAccessCalendar: (widgetId: Id, start: Date, end: Date) =>
    get<AccessCalendarEvent[]>(
      `/board-widgets/${widgetId}/calendar?start=${encodeURIComponent(start.toISOString())}&end=${encodeURIComponent(end.toISOString())}`,
    ),
  // The viewer's inbox, page by page, an opened e-mail and its attachments.
  getAccessMails: (widgetId: Id, skip: number, top: number, unread: boolean) =>
    get<AccessMailPage>(
      `/board-widgets/${widgetId}/mails?skip=${skip}&top=${top}${unread ? "&unread=1" : ""}`,
    ),
  getAccessMail: (widgetId: Id, mailId: string) =>
    get<AccessMailDetail>(`/board-widgets/${widgetId}/mails/${encodeURIComponent(mailId)}`),
  downloadAccessMailAttachment: (widgetId: Id, mailId: string, attachmentId: string) =>
    download(
      `/board-widgets/${widgetId}/mails/${encodeURIComponent(mailId)}/attachments/${encodeURIComponent(attachmentId)}`,
    ),
  // An image uploaded for an Image widget: the widget stores its URL.
  uploadWidgetImage: (file: File) => upload<{ url: string }>("/widget-images", file),

  // --- Projects ------------------------------------------------------------
  // Categories belong to a board.
  getCategories: (boardId?: string | null) =>
    get<Category[]>(`/categories${queryString({ board: boardId })}`),
  createCategory: (board_id: Id | string, name: string) =>
    post<Category>("/categories", { board_id, name }),
  // "replace": those of the destination board go first, except
  // those that still hold projects.
  copyCategories: (from_board: Id, to_board: Id, replace = false) =>
    post<CopyResult>("/categories/copy", { from_board, to_board, replace }),
  // The name and the milestones are modified separately: what isn't sent stays.
  updateCategory: (
    id: Id,
    data: string | { name?: string; milestones?: Milestone[] },
  ) =>
    put<Category>(
      `/categories/${id}`,
      typeof data === "string" ? { name: data } : data,
    ),
  deleteCategory: (id: Id) =>
    request<CascadeResult>(`/categories/${id}`, { method: "DELETE" }),
  // The full order of a board's categories.
  reorderCategories: (board_id: Id, ids: Id[]) =>
    put<Category[]>("/categories/reorder", { board_id, ids }),

  getProjectLabels: (boardId: string | Id) =>
    get<ProjectLabel[]>(`/project-labels${queryString({ board: boardId })}`),
  createProjectLabel: (
    board_id: Id | string,
    name: string,
    color: string,
    group_id?: Id,
  ) => post<ProjectLabel>("/project-labels", { board_id, name, color, group_id }),
  // A board's labels placed in another. Those that already carry
  // the same name there are not duplicated: the report counts them.
  // "replace": those of the destination board go first.
  copyProjectLabels: (from_board: Id, to_board: Id, replace = false) =>
    post<CopyResult>("/project-labels/copy", { from_board, to_board, replace }),
  updateProjectLabel: (id: Id, data: LabelInput) =>
    put<ProjectLabel>(`/project-labels/${id}`, data),
  deleteProjectLabel: (id: Id) => del(`/project-labels/${id}`),

  // The groups of a kind of labels: those of a board ("board_id"), or of
  // Support, which belong to none.
  getLabelGroups: (base: LabelsBase, board?: Id | string) =>
    get<LabelGroup[]>(`${base}/groups${queryString({ board })}`),
  createLabelGroup: (base: LabelsBase, name: string, board_id?: Id | string) =>
    post<LabelGroup>(`${base}/groups`, { board_id, name }),
  renameLabelGroup: (base: LabelsBase, id: Id, name: string) =>
    put<LabelGroup>(`${base}/groups/${id}`, { name }),
  deleteLabelGroup: (base: LabelsBase, id: Id) => del(`${base}/groups/${id}`),
  // Every group in order, each with all its labels: labels may change group.
  arrangeLabels: (base: LabelsBase, groups: LabelGroupLayout[], board_id?: Id | string) =>
    put<null>(`${base}/arrange`, { board_id, groups }),

  getProjects: (filters: ProjectFilters = {}) =>
    get<Project[]>(
      `/projects${queryString(filters as Record<string, unknown>)}`,
    ),
  /** The actor accounts of at least one project of the board (and of the company). */
  getProjectActorIds: (filters: Pick<ProjectFilters, "board" | "context">) =>
    get<Id[]>(`/projects/actors${queryString(filters as Record<string, unknown>)}`),
  getProject: (id: Id) => get<ProjectDetail>(`/projects/${id}`),
  createProject: (data: ProjectInput) => post<Project>("/projects", data),
  updateProject: (id: Id, data: ProjectInput) =>
    put<Project>(`/projects/${id}`, data),
  deleteProject: (id: Id) => del(`/projects/${id}`),
  // The copy takes the record, the actors and the labels, but not the
  // thread; without "board_id", it stays in the original board.
  copyProject: (id: Id, data: ProjectCopyInput = {}) =>
    post<Project>(`/projects/${id}/copy`, data),

  addComment: (projectId: Id, text: string) =>
    post<Comment>(`/projects/${projectId}/comments`, { text }),
  updateComment: (id: Id, text: string) =>
    put<Comment>(`/comments/${id}`, { text }),
  deleteComment: (id: Id) => del(`/comments/${id}`),

  // The milestone types, set in the settings. The name and the milestones are
  // modified separately: what isn't sent stays.
  getMilestoneTypes: () => get<MilestoneType[]>("/milestone-types"),
  createMilestoneType: (name: string) =>
    post<MilestoneType>("/milestone-types", { name }),
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
  // Empties the list of its tasks; its separators stay.
  deleteTaskListCards: (id: Id) => del(`/task-lists/${id}/cards`),
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
    /** The card's context; by default, the board's first. */
    context_id?: Id | null,
  ) =>
    post<TaskCardRow>("/task-cards", {
      list_id,
      text,
      kind,
      description,
      context_id: context_id ?? undefined,
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
  /** A board's workstations: of one context, or of all ("all"). */
  getAssets: (boardId: Id, context: string | Id) =>
    get<Asset[]>(`/assets${queryString({ board: boardId, context })}`),
  getAsset: (id: Id) => get<AssetDetail>(`/assets/${id}`),

  // The notifications received, for the "Notifications" drawer.
  getNotifications: () => get<Notification[]>("/notifications"),
  deleteNotification: (id: string) => del(`/notifications/${encodeURIComponent(id)}`),
  clearNotifications: () => del("/notifications"),

  // The tab row search, over everything the person sees.
  search: (q: string) => get<SearchResult[]>(`/search${queryString({ q })}`),


  // The "Développeur" section of the Paramétrage, common to all.
  // The "Support" section of the Paramétrage: the default due date.
  getSupportSettings: () => get<SupportSettings>("/support-settings"),
  updateSupportSettings: (data: Partial<SupportSettings>) =>
    put<SupportSettings>("/support-settings", data),
  // The default replies: the title and the template are modified separately.
  getSupportReplies: () => get<SupportReply[]>("/support-replies"),
  createSupportReply: (name: string, event: SupportReplyEvent | null = null) =>
    post<SupportReply>("/support-replies", { name, event }),
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
  getSupportContents: () => get<SupportContent[]>("/support-contents"),
  createSupportContent: (name: string, event: SupportContentEvent | null = null) =>
    post<SupportContent>("/support-contents", { name, event }),
  updateSupportContent: (
    id: Id,
    data: { name?: string; html?: string; event?: SupportContentEvent | null },
  ) => put<SupportContent>(`/support-contents/${id}`, data),
  deleteSupportContent: (id: Id) => del(`/support-contents/${id}`),
  // The "Assets" section of the Paramétrage: the templates table, the VLAN one.
  getAssetSettings: () => get<AssetSettings>("/asset-settings"),
  updateAssetSettings: (data: Partial<AssetSettings>) =>
    put<AssetSettings>("/asset-settings", data),
  getNotificationSettings: () => get<NotificationSettings>("/notification-settings"),
  updateNotificationSettings: (data: Partial<NotificationSettings>) =>
    put<NotificationSettings>("/notification-settings", data),
  // "Inventorie-toi maintenant": the server calls the agent on the workstation.
  // Nothing comes back — the inventory arrives later through the agents' door,
  // and the event stream notifies.
  refreshAsset: (id: Id) => post<AssetRefresh>(`/assets/${id}/refresh`, {}),
  deleteAsset: (id: Id) => del(`/assets/${id}`),
  // --- Support mode --------------------------------------------------------

  /** A board's requests: of one context, or of all ("all"). */
  getSupportRequests: (boardId: Id, context: string | Id) =>
    get<SupportRequest[]>(`/support-requests${queryString({ board: boardId, context })}`),
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

  // Support mode labels: they belong to the company, just as
  // those of a board belong to it.
  getSupportLabels: () => get<SupportLabel[]>("/support-labels"),
  createSupportLabel: (name: string, color: string, group_id?: Id) =>
    post<SupportLabel>("/support-labels", { name, color, group_id }),
  updateSupportLabel: (id: Id, data: SupportLabelInput) =>
    put<SupportLabel>(`/support-labels/${id}`, data),
  deleteSupportLabel: (id: Id) => del(`/support-labels/${id}`),

  // A board's labels: a name and a color, placed on its cards.
  getLabels: (boardId: string | Id) =>
    get<Label[]>(`/labels${queryString({ board: boardId })}`),
  createLabel: (board_id: Id | string, name: string, color: string, group_id?: Id) =>
    post<Label>("/labels", { board_id, name, color, group_id }),
  // A board's contexts, copied into another: their names only.
  // "replace": those of the destination board go first, with what
  // they contain.
  // "rename_all": the board also takes the label of "Tous les …".
  copyContexts: (from_board: Id, to_board: Id, replace = false, rename_all = false) =>
    post<CopyResult>(`/boards/${from_board}/contexts/copy`, { to_board, replace, rename_all }),
  copyLabels: (from_board: Id, to_board: Id, replace = false) =>
    post<CopyResult>("/labels/copy", { from_board, to_board, replace }),
  updateLabel: (id: Id, data: LabelInput) => put<Label>(`/labels/${id}`, data),
  deleteLabel: (id: Id) => del(`/labels/${id}`),
};

/**
 * Sign-in through Microsoft: the browser leaves the application for the
 * Microsoft page, and comes back with its token in the URL fragment.
 */
export const entraLoginUrl = "/api/auth/entra/start";
