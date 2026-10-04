// Le client de l'API. Chaque appel dit ce qu'il rend : les types viennent de
// @milo/shared, les mêmes que ceux que le serveur respecte.

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
  LayoutState,
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
  WidgetRights,
  PrincipalAssignments,
  FollowKind,
  Follows,
  Id,
  Label,
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
  DeveloperSettings,
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

/** Une pièce jointe de réponse déposée : ce que la réponse cite ensuite. */
export interface SupportFileDeposit {
  file: string;
  name: string;
  mime: string;
  size: number;
}

const BASE_URL = "/api";

// Prévient l'application quand le serveur refuse la session (jeton expiré,
// déconnexion depuis un autre onglet).
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

/** Une réponse en erreur : son statut distingue un refus d'une panne. */
export class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

/** Les verbes, pour que chaque appel tienne sur une ligne. */
const get = <T>(path: string) => request<T>(path);
const post = <T>(path: string, body?: unknown) =>
  request<T>(path, { method: "POST", body: JSON.stringify(body ?? {}) });
const put = <T>(path: string, body?: unknown) =>
  request<T>(path, { method: "PUT", body: JSON.stringify(body ?? {}) });
const del = (path: string) => request<null>(path, { method: "DELETE" });

/**
 * Le dépôt d'un fichier : le corps de la requête est le fichier lui-même, son
 * nom et son type voyagent dans l'adresse. Pas de formulaire en plusieurs
 * parties — le serveur n'attend qu'un fichier, et le lit tel quel.
 */
const upload = <T>(path: string, file: File) =>
  request<T>(
    `${path}?name=${encodeURIComponent(file.name)}&type=${encodeURIComponent(file.type)}`,
    {
      method: "POST",
      body: file,
      // Le type réel est dit dans l'adresse : annoncer « octet-stream » tient
      // le corps hors de l'analyseur JSON du serveur, y compris quand on
      // dépose un fichier .json.
      headers: { "Content-Type": "application/octet-stream" },
    },
  );

/**
 * Un fichier envoyé tel quel : la sauvegarde à restaurer. Comme le dépôt d'une
 * pièce jointe, mais sans nom ni type à dire — le serveur n'attend qu'une
 * archive.
 */
const sendFile = <T>(path: string, file: File) =>
  request<T>(path, {
    method: "POST",
    body: file,
    headers: { "Content-Type": "application/octet-stream" },
  });

/**
 * Une réponse qui est un fichier, et non du JSON : le téléchargement de la
 * sauvegarde. Elle ne passe pas par `request`, qui lit toujours du JSON, mais
 * porte le même jeton et lit les erreurs de la même façon.
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

/** « all » et les valeurs vides ne sont pas des filtres : elles ne partent pas. */
const queryString = (params: Record<string, unknown>): string => {
  const searchParams = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value && value !== "all") searchParams.set(key, String(value));
  }
  const qs = searchParams.toString();
  return qs ? `?${qs}` : "";
};

/**
 * Les sections d'un tableau : ses colonnes, et ce qu'en fait « Hérité ». Les
 * sections se lisent et se créent par le tableau ; elles se modifient ensuite
 * par leur identifiant.
 */
const boardSections = (boardId: Id | string) => ({
  all: () => get<IndicatorSection[]>(`/boards/${boardId}/sections`),
  create: (data: IndicatorSectionInput) =>
    post<IndicatorSection>(`/boards/${boardId}/sections`, data),
  update: (id: Id, data: IndicatorSectionInput) =>
    put<IndicatorSection>(`/board-sections/${id}`, data),
  /** La copie, avec ses widgets, se pose juste à droite de l'original. */
  duplicate: (id: Id) => post<IndicatorSection>(`/board-sections/${id}/duplicate`, {}),
  remove: (id: Id) => del(`/board-sections/${id}`),
  reorder: (ids: Id[]) => put<IndicatorSection[]>(`/boards/${boardId}/sections/reorder`, { ids }),
  /** « Hérité » : la structure publique, ou sa propre copie (décoché). */
  getLayout: () => get<LayoutState>(`/boards/${boardId}/layout`),
  setLayout: (inherited: boolean) => put<LayoutState>(`/boards/${boardId}/layout`, { inherited }),
  /** Une disposition exportée remplace la structure regardée. */
  importSections: (layout: ExportedLayout) =>
    post<ImportResult>(`/boards/${boardId}/import`, layout),
});

/** Les écritures et lectures des sections d'un tableau. */
export type PanelSections = ReturnType<typeof boardSections>;

export const api = {
  // --- Session -------------------------------------------------------------
  getSetupState: () => get<SetupState>("/auth/setup"),
  setup: (data: SetupInput) => post<AuthResult>("/auth/setup", data),
  // Le compte « admin » seul se connecte par mot de passe ; les autres
  // passent par Microsoft (entraLoginUrl).
  login: (username: string, password: string) =>
    post<AuthResult>("/auth/login", { username, password }),
  logout: () => post<null>("/auth/logout"),
  me: () => get<PublicUser>("/auth/me"),
  updateMe: (data: UpdateMeInput) => put<PublicUser>("/auth/me", data),

  getVersion: () => get<VersionPayload>("/version"),

  // --- Comptes -------------------------------------------------------------
  getUsers: () => get<PublicUser[]>("/users"),
  // Les acteurs favoris de la personne connectée : ils passent en tête des
  // listes d'acteurs.
  getFavorites: () => get<Id[]>("/users/favorites"),
  addFavorite: (id: Id) => put<Id[]>(`/users/favorites/${id}`),
  removeFavorite: (id: Id) => request<Id[]>(`/users/favorites/${id}`, { method: "DELETE" }),
  // Les personnes de l'annuaire Entra, et le compte d'une d'entre elles — créé
  // s'il n'existe pas encore — pour en faire un acteur.
  searchDirectoryUsers: (q: string) =>
    get<DirectoryUser[]>(`/users/directory?q=${encodeURIComponent(q)}`),
  addDirectoryUser: (oid: string) =>
    post<PublicUser>(`/users/directory/${encodeURIComponent(oid)}`),
  // Les groupes de l'annuaire, pour les acteurs qui ne font que prévenir.
  searchDirectoryGroups: (q: string) =>
    get<EntraPrincipal[]>(`/users/directory/groups?q=${encodeURIComponent(q)}`),

  // --- Workspaces ----------------------------------------------------------
  // Passer dans un autre de ses workspaces.
  switchWorkspace: (workspace: Id) => put<PublicUser>("/auth/me/workspace", { workspace }),
  // Leur gestion : réservée à qui en a le droit.
  getWorkspaces: () => get<Workspace[]>("/workspaces"),
  createWorkspace: (name: string) => post<Workspace>("/workspaces", { name }),
  updateWorkspace: (id: Id, name: string) => put<Workspace>(`/workspaces/${id}`, { name }),
  deleteWorkspace: (id: Id) => del(`/workspaces/${id}`),

  // --- Accès d'un workspace (utilisateurs et groupes Entra) ---------------
  getAssignments: (workspace: Id) =>
    get<PrincipalAssignments[]>(`/assignments?workspace=${workspace}`),
  // Les types envoyés remplacent tout ; sans aucun, l'accès se retire.
  setAssignments: (principal: EntraPrincipal, permissions: WidgetRights, workspace: Id) =>
    put<PrincipalAssignments[]>(
      `/assignments/${principal.type}/${encodeURIComponent(principal.id)}?workspace=${workspace}`,
      { name: principal.name, email: principal.email, permissions },
    ),
  deleteAssignments: (principal: EntraPrincipal, workspace: Id) =>
    request<PrincipalAssignments[]>(
      `/assignments/${principal.type}/${encodeURIComponent(principal.id)}?workspace=${workspace}`,
      { method: "DELETE" },
    ),

  // --- Administration : Paramétrage et gestion des workspaces --------------
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

  // --- Sauvegarde ----------------------------------------------------------
  getBackupInfo: () => get<BackupInfo>("/backup"),
  // L'archive n'est pas ouverte par le client : elle passe du serveur au
  // disque, et revient telle quelle le jour d'une restauration.
  downloadBackup: () => download("/backup/archive"),
  restoreBackup: (file: File) =>
    sendFile<RestoreResult>("/backup/restore", file),

  // --- Entra --------------------------------------------------------------
  getEntraSettings: () => get<EntraSettings>("/entra"),
  updateEntraSettings: (data: EntraSettingsInput) =>
    put<EntraSettings>("/entra", data),
  // Le message d'essai part de la boîte de support de la société choisie.
  testMail: (to: string) => post<MailTestResult>("/entra/test", { to }),
  checkMailboxes: () => get<MailboxCheck[]>("/entra/mailboxes"),
  getEntraStatus: () => get<EntraStatus>("/entra/status"),
  connectEntra: () => post<EntraStatus>("/entra/connect"),
  disconnectEntra: () => post<EntraStatus>("/entra/disconnect"),

  // --- Suivi ---------------------------------------------------------------
  // Le client garde la liste de ce qu'il suit : chaque écriture la rend
  // entière, il n'y a donc jamais à la relire après un clic.
  getFollows: () => get<Follows>("/follows"),
  follow: (kind: FollowKind, id: Id) => put<Follows>(`/follows/${kind}/${id}`),
  unfollow: (kind: FollowKind, id: Id) =>
    request<Follows>(`/follows/${kind}/${id}`, { method: "DELETE" }),

  // --- Vues et tableaux ---------------------------------------------------
  // Les vues, dans l'ordre que le compte a rangé. Une vue naît avec son
  // premier tableau.
  getViews: () => get<View[]>("/views"),
  createView: (name: string) => post<{ view: View; board: Board }>("/views", { name }),
  updateView: (id: Id, data: ViewInput) => put<View>(`/views/${id}`, data),
  deleteView: (id: Id) => del(`/views/${id}`),
  reorderViews: (ids: Id[]) => put<View[]>("/views/reorder", { ids }),

  // Les tableaux d'une vue, dans l'ordre que le compte a rangé.
  getBoards: (viewId: Id | string) => get<Board[]>(`/boards${queryString({ view: viewId })}`),
  createBoard: (view_id: Id | string, name: string) => post<Board>("/boards", { view_id, name }),
  /** Un tableau seul : de quoi savoir dans quelle vue il se trouve. */
  getBoard: (id: Id | string) => get<Board>(`/boards/${id}`),
  updateBoard: (id: Id, data: BoardInput) => put<Board>(`/boards/${id}`, data),
  deleteBoard: (id: Id | string) => del(`/boards/${id}`),

  // Les contextes d'un tableau : chaque écriture rend le tableau à jour.
  addContext: (boardId: Id, name: string) =>
    post<Board>(`/boards/${boardId}/contexts`, { name } satisfies ContextInput),
  renameContext: (id: Id, name: string) =>
    put<Board>(`/contexts/${id}`, { name } satisfies ContextInput),
  deleteContext: (id: Id) => request<Board>(`/contexts/${id}`, { method: "DELETE" }),
  reorderContexts: (boardId: Id, ids: Id[]) =>
    put<Board>(`/boards/${boardId}/contexts/reorder`, { ids }),
  /** Le contexte que ce compte regarde dans ce tableau ; nul pour tous. */
  selectContext: (boardId: Id, contextId: Id | null) =>
    put<Board>(`/boards/${boardId}/contexts/selected`, { context_id: contextId }),
  reorderBoards: (view_id: Id | string, ids: Id[]) =>
    put<Board[]>("/boards/reorder", { view_id, ids }),

  // Ce qu'un tableau porte : ses sections et ses widgets.
  boardSections: boardSections,
  getBoardWidgets: (boardId: Id | string) => get<BoardWidget[]>(`/boards/${boardId}/widgets`),
  createBoardWidget: (data: BoardWidgetInput) => post<BoardWidget>("/board-widgets", data),
  // Seule la configuration bouge — sauf la catégorie et la sous-catégorie,
  // qui se convertissent l'une en l'autre.
  updateBoardWidget: (id: Id, data: BoardWidgetInput) =>
    put<BoardWidget>(`/board-widgets/${id}`, data),
  /** La copie se pose juste sous l'original. */
  duplicateBoardWidget: (id: Id) => post<BoardWidget>(`/board-widgets/${id}/duplicate`, {}),
  deleteBoardWidget: (id: Id) => del(`/board-widgets/${id}`),
  /** Ce que la section porte désormais : un widget venu d'une autre y passe. */
  reorderBoardWidgets: (sectionId: Id, ids: Id[]) =>
    put<BoardWidget[]>("/board-widgets/reorder", { section_id: sectionId, ids }),
  // La confirmation des boîtes de support : leur état, et la relance du lien
  // à celles qui attendent.
  // Chaque liste — par sa clé de liste — confirme ses propres adresses.
  getMailboxOptins: (list: string, emails: string[]) =>
    get<MailboxOptinState[]>(
      `/mailbox-optins?list_key=${encodeURIComponent(list)}&emails=${encodeURIComponent(emails.join(","))}`,
    ),
  resendMailboxOptins: (list: string, emails: string[]) =>
    post<{ sent: number }>("/mailbox-optins/resend", { list_key: list, emails }),
  /** Le code à quatre chiffres de l'e-mail, à la place du lien. */
  confirmMailboxOptin: (list: string, email: string, code: string) =>
    post<MailboxOptinState>("/mailbox-optins/confirm", { list_key: list, email, code }),
  // Le flux d'un widget RSS, tel que la base le garde : le serveur relève
  // la source lui-même, à l'intervalle que le widget règle.
  getAccessFeed: (widgetId: Id) => get<AccessFeed>(`/board-widgets/${widgetId}/feed`),
  probeAccessFeed: (url: string) =>
    get<AccessFeedProbe>(`/board-widgets/feed/probe?url=${encodeURIComponent(url)}`),
  // La météo du lieu d'un widget Météo, et la recherche d'un lieu pour le régler.
  getAccessWeather: (widgetId: Id) => get<AccessWeather>(`/board-widgets/${widgetId}/weather`),
  searchWeatherPlaces: (q: string) =>
    get<WeatherPlace[]>(`/board-widgets/weather/places?q=${encodeURIComponent(q)}`),
  // Les rendez-vous Outlook de qui regarde, entre deux instants.
  getAccessCalendar: (widgetId: Id, start: Date, end: Date) =>
    get<AccessCalendarEvent[]>(
      `/board-widgets/${widgetId}/calendar?start=${encodeURIComponent(start.toISOString())}&end=${encodeURIComponent(end.toISOString())}`,
    ),
  // La boîte de réception de qui regarde, page par page, un e-mail ouvert et ses pièces jointes.
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
  // Une image déposée pour un widget Image : c'est son adresse que le widget range.
  uploadWidgetImage: (file: File) => upload<{ url: string }>("/widget-images", file),

  // --- Projets -------------------------------------------------------------
  // Les catégories appartiennent à un tableau.
  getCategories: (boardId?: string | null) =>
    get<Category[]>(`/categories${queryString({ board: boardId })}`),
  createCategory: (board_id: Id | string, name: string) =>
    post<Category>("/categories", { board_id, name }),
  // « replace » : celles du tableau d'accueil s'en vont d'abord, hormis
  // celles qui rangent encore des projets.
  copyCategories: (from_board: Id, to_board: Id, replace = false) =>
    post<CopyResult>("/categories/copy", { from_board, to_board, replace }),
  // Le nom et les jalons se modifient séparément : ce qui n'est pas envoyé reste.
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
  // L'ordre complet des catégories d'un tableau.
  reorderCategories: (board_id: Id, ids: Id[]) =>
    put<Category[]>("/categories/reorder", { board_id, ids }),

  getProjectLabels: (boardId: string | Id) =>
    get<ProjectLabel[]>(`/project-labels${queryString({ board: boardId })}`),
  createProjectLabel: (board_id: Id | string, name: string, color: string, weight = 0) =>
    post<ProjectLabel>("/project-labels", { board_id, name, color, weight }),
  // Les étiquettes d'un tableau posées dans un autre. Celles qui y portent
  // déjà le même nom ne sont pas redoublées : le compte rendu les compte.
  // « replace » : celles du tableau d'accueil s'en vont d'abord.
  copyProjectLabels: (from_board: Id, to_board: Id, replace = false) =>
    post<CopyResult>("/project-labels/copy", { from_board, to_board, replace }),
  updateProjectLabel: (id: Id, data: { name?: string; color?: string; weight?: number }) =>
    put<ProjectLabel>(`/project-labels/${id}`, data),
  deleteProjectLabel: (id: Id) => del(`/project-labels/${id}`),
  reorderProjectLabels: (board_id: Id, ids: Id[]) =>
    put<ProjectLabel[]>("/project-labels/reorder", { board_id, ids }),

  getProjects: (filters: ProjectFilters = {}) =>
    get<Project[]>(
      `/projects${queryString(filters as Record<string, unknown>)}`,
    ),
  /** Les comptes acteurs d'au moins un projet du tableau (et de la société). */
  getProjectActorIds: (filters: Pick<ProjectFilters, "board" | "context">) =>
    get<Id[]>(`/projects/actors${queryString(filters as Record<string, unknown>)}`),
  getProject: (id: Id) => get<ProjectDetail>(`/projects/${id}`),
  createProject: (data: ProjectInput) => post<Project>("/projects", data),
  updateProject: (id: Id, data: ProjectInput) =>
    put<Project>(`/projects/${id}`, data),
  deleteProject: (id: Id) => del(`/projects/${id}`),
  // La copie emporte la fiche, les acteurs et les étiquettes, mais pas le
  // fil ; sans « board_id », elle reste dans le tableau d'origine.
  copyProject: (id: Id, data: ProjectCopyInput = {}) =>
    post<Project>(`/projects/${id}/copy`, data),

  addComment: (projectId: Id, text: string) =>
    post<Comment>(`/projects/${projectId}/comments`, { text }),
  updateComment: (id: Id, text: string) =>
    put<Comment>(`/comments/${id}`, { text }),
  deleteComment: (id: Id) => del(`/comments/${id}`),

  // Les types de jalons, réglés dans les réglages. Le nom et les jalons se
  // modifient séparément : ce qui n'est pas envoyé reste.
  getMilestoneTypes: () => get<MilestoneType[]>("/milestone-types"),
  createMilestoneType: (name: string) =>
    post<MilestoneType>("/milestone-types", { name }),
  updateMilestoneType: (
    id: Id,
    data: { name?: string; milestones?: Milestone[] },
  ) => put<MilestoneType>(`/milestone-types/${id}`, data),
  deleteMilestoneType: (id: Id) => del(`/milestone-types/${id}`),


  // --- Tâches --------------------------------------------------------------
  getTaskLists: (boardId: string | Id) =>
    get<TaskList[]>(`/task-lists${queryString({ board: boardId })}`),
  // Sans « index », la liste va au bout du tableau.
  /** « list_key » : le widget « Tâches » d'où elle est créée. */
  createTaskList: (board_id: Id | string, name: string, index?: number, list_key?: string) =>
    post<TaskList>("/task-lists", { board_id, name, index, list_key }),
  updateTaskList: (
    id: Id,
    data: { name?: string; color?: ListColor; board_id?: Id },
  ) => put<TaskList>(`/task-lists/${id}`, data),
  deleteTaskList: (id: Id) => del(`/task-lists/${id}`),
  // Vide la liste de ses tâches ; ses séparateurs restent.
  deleteTaskListCards: (id: Id) => del(`/task-lists/${id}/cards`),
  // La copie emporte les cartes de la liste ; sans « board_id », elle reste
  // dans le tableau d'origine.
  copyTaskList: (id: Id, data: TaskListCopyInput = {}) =>
    post<TaskList>(`/task-lists/${id}/copy`, data),
  reorderTaskLists: (board_id: Id | string, ids: Id[]) =>
    put<TaskList[]>("/task-lists/reorder", { board_id, ids }),

  // « kind » vaut « card » ou « separator » ; par défaut, une carte.
  // Une description peut suivre dès la création : celle d'une tâche créée
  // depuis un autre mode porte le lien vers l'élément d'où elle vient.
  createTaskCard: (
    list_id: Id,
    text: string,
    kind: "card" | "separator" = "card",
    description?: string,
    /** Le contexte de la carte ; à défaut, le premier du tableau. */
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
  /** La copie se pose juste sous l'original, avec tout ce qu'il porte. */
  duplicateTaskCard: (id: Id) => post<TaskCardRow>(`/task-cards/${id}/duplicate`),
  deleteTaskCard: (id: Id) => del(`/task-cards/${id}`),
  reorderTaskCards: (list_id: Id, ids: Id[]) =>
    put<TaskList[]>("/task-cards/reorder", { list_id, ids }),

  // La fiche d'une carte : sa description, ses membres, ses étiquettes et son
  // fil de commentaires.
  getTaskCard: (id: Id) => get<TaskCardDetail>(`/task-cards/${id}`),
  // Où vit cette carte : de quoi se placer dessus avant de l'ouvrir, quand on
  // arrive par un lien plutôt que par le tableau.
  getCardLocation: (id: Id) =>
    get<CardLocation>(`/task-cards/${id}/location`),
  updateTaskCardDetails: (id: Id, data: TaskCardInput) =>
    put<TaskCardDetail>(`/task-cards/${id}`, data),
  addTaskCardComment: (id: Id, text: string) =>
    post<Comment>(`/task-cards/${id}/comments`, { text }),
  updateTaskCardComment: (id: Id, text: string) =>
    put<Comment>(`/card-comments/${id}`, { text }),
  deleteTaskCardComment: (id: Id) => del(`/card-comments/${id}`),

  // Checklists d'une carte : chacune porte son titre et ses éléments. Tout
  // s'enregistre au fil des gestes, sans attendre « Enregistrer ».
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

  // Dépendances d'une carte : chacune se lit depuis la carte qui la regarde —
  // « bloque » ici, « est bloqué par » sur l'autre. Enregistrées aussitôt.
  createCardLink: (cardId: Id, data: CardLinkInput) =>
    post<CardLink>(`/task-cards/${cardId}/links`, data),
  updateCardLink: (id: Id, cardId: Id, data: CardLinkInput) =>
    put<CardLink>(`/card-links/${id}`, { ...data, card_id: cardId }),
  deleteCardLink: (id: Id, cardId: Id) =>
    del(`/card-links/${id}${queryString({ card: cardId })}`),
  // Les cartes qu'une dépendance peut relier, page par page : celles du
  // tableau d'abord, puis celles des autres tableaux.
  getLinkCandidates: (cardId: Id, q: string, offset: number) =>
    get<LinkCandidates>(`/task-cards/${cardId}/links/candidates${queryString({ q, offset })}`),

  // Pièces jointes d'une carte : les fichiers déposés dessus. Le dépôt et le
  // retrait partent aussitôt, sans attendre la fermeture du tiroir.
  uploadAttachment: (cardId: Id, file: File) =>
    upload<Attachment>(`/task-cards/${cardId}/attachments`, file),
  deleteAttachment: (id: Id) => del(`/attachments/${id}`),
  reorderAttachments: (cardId: Id, ids: Id[]) =>
    put<Attachment[]>(`/task-cards/${cardId}/attachments/order`, { ids }),

  // Images de couverture d'une carte : déposées, rangées et retirées aussitôt.
  // La première est celle que la carte montre sur le tableau.
  uploadCover: (cardId: Id, file: File) =>
    upload<CardCover>(`/task-cards/${cardId}/covers`, file),
  reorderCovers: (cardId: Id, ids: Id[]) =>
    put<CardCover[]>(`/task-cards/${cardId}/covers/order`, { ids }),
  deleteCover: (id: Id) => del(`/covers/${id}`),

  // Une image collée dans la description d'une carte : elle est déposée tout
  // de suite, et c'est son adresse que l'éditeur insère.
  uploadCardImage: (cardId: Id, file: File) =>
    upload<{ url: string }>(`/task-cards/${cardId}/images`, file),

  // --- Mode Assets ---------------------------------------------------------
  // Les postes remontés par les agents d'inventaire. La liste ne porte que le
  // nom : tout le reste attend l'ouverture du poste, et ne voyage donc que
  // pour celui qu'on regarde.
  /** Les postes d'un tableau : d'un contexte, ou de tous (« all »). */
  getAssets: (boardId: Id, context: string | Id) =>
    get<Asset[]>(`/assets${queryString({ board: boardId, context })}`),
  getAsset: (id: Id) => get<AssetDetail>(`/assets/${id}`),

  // Les notifications reçues, pour le tiroir « Notifications ».
  getNotifications: () => get<Notification[]>("/notifications"),
  deleteNotification: (id: string) => del(`/notifications/${encodeURIComponent(id)}`),
  clearNotifications: () => del("/notifications"),

  // La recherche de la rangée d'onglets, sur tout ce que la personne voit.
  search: (q: string) => get<SearchResult[]>(`/search${queryString({ q })}`),


  // La section « Développeur » du Paramétrage, commune à tous.
  // La section « Support » du Paramétrage : l'échéance par défaut.
  getSupportSettings: () => get<SupportSettings>("/support-settings"),
  updateSupportSettings: (data: Partial<SupportSettings>) =>
    put<SupportSettings>("/support-settings", data),
  // Les réponses par défaut : l'intitulé et le modèle se modifient séparément.
  getSupportReplies: () => get<SupportReply[]>("/support-replies"),
  createSupportReply: (name: string, event: SupportReplyEvent | null = null) =>
    post<SupportReply>("/support-replies", { name, event }),
  updateSupportReply: (
    id: Id,
    data: { name?: string; html?: string; event?: SupportReplyEvent | null },
  ) => put<SupportReply>(`/support-replies/${id}`, data),
  deleteSupportReply: (id: Id) => del(`/support-replies/${id}`),
  // Les fiches Entra que citent les modèles : le compte connecté, et
  // l'expéditeur de la demande quand on en donne une.
  getSupportVariables: (requestId?: Id) =>
    get<{ user: SupportPerson; sender: SupportPerson | null }>(
      `/support-requests/variables${requestId ? `?request=${requestId}` : ""}`,
    ),
  // Ce qui se pose d'office dans l'éditeur d'une réponse : une signature…
  getSupportContents: () => get<SupportContent[]>("/support-contents"),
  createSupportContent: (name: string, event: SupportContentEvent | null = null) =>
    post<SupportContent>("/support-contents", { name, event }),
  updateSupportContent: (
    id: Id,
    data: { name?: string; html?: string; event?: SupportContentEvent | null },
  ) => put<SupportContent>(`/support-contents/${id}`, data),
  deleteSupportContent: (id: Id) => del(`/support-contents/${id}`),
  // La section « Assets » du Paramétrage : la table des modèles, celle des VLAN.
  getAssetSettings: () => get<AssetSettings>("/asset-settings"),
  updateAssetSettings: (data: Partial<AssetSettings>) =>
    put<AssetSettings>("/asset-settings", data),
  getDeveloperSettings: () => get<DeveloperSettings>("/developer"),
  updateDeveloperSettings: (data: DeveloperSettings) =>
    put<DeveloperSettings>("/developer", data),
  getNotificationSettings: () => get<NotificationSettings>("/notification-settings"),
  updateNotificationSettings: (data: Partial<NotificationSettings>) =>
    put<NotificationSettings>("/notification-settings", data),
  // « Inventorie-toi maintenant » : le serveur appelle l'agent sur le poste.
  // Rien n'en revient — l'inventaire arrive ensuite par la porte des agents,
  // et c'est le flux d'événements qui prévient.
  refreshAsset: (id: Id) => post<AssetRefresh>(`/assets/${id}/refresh`, {}),
  deleteAsset: (id: Id) => del(`/assets/${id}`),
  // --- Mode Support --------------------------------------------------------

  /** Les demandes d'un tableau : d'un contexte, ou de tous (« all »). */
  getSupportRequests: (boardId: Id, context: string | Id) =>
    get<SupportRequest[]>(`/support-requests${queryString({ board: boardId, context })}`),
  getSupportRequest: (id: Id) =>
    get<SupportRequestDetail>(`/support-requests/${id}`),
  createSupportRequest: (data: SupportRequestInput) =>
    post<SupportRequestDetail>("/support-requests", data),
  updateSupportRequest: (id: Id, data: SupportRequestInput) =>
    put<SupportRequestDetail>(`/support-requests/${id}`, data),
  deleteSupportRequest: (id: Id) => del(`/support-requests/${id}`),
  // Relève les boîtes de support des sociétés : les e-mails nouveaux y
  // deviennent des demandes, que le flux d'événements fait ensuite relire.
  syncSupportMail: () => post<{ created: number }>("/support-requests/sync"),
  // Les actions du menu « Actions », sur les demandes cochées.
  mergeSupportRequests: (ids: Id[]) =>
    post<SupportRequestDetail>("/support-requests/merge", { ids }),
  closeSupportRequests: (ids: Id[]) => post<void>("/support-requests/close", { ids }),
  deleteSupportRequests: (ids: Id[]) => post<void>("/support-requests/delete", { ids }),
  assignSupportRequests: (ids: Id[], actor_ids: Id[]) =>
    post<void>("/support-requests/assign", { ids, actor_ids }),

  // « internal » : un commentaire de l'équipe (onglet « Commentaires »), pas
  // un échange avec l'expéditeur.
  // Une réponse peut dire aussi où en est la demande, et qui mettre en copie.
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
  // Une pièce jointe de réponse, déposée avant l'envoi de la réponse qui la porte.
  uploadSupportFile: (id: Id, file: File) =>
    upload<SupportFileDeposit>(`/support-requests/${id}/files`, file),
  updateSupportComment: (id: Id, text: string) =>
    put<SupportComment>(`/support-comments/${id}`, { text }),
  deleteSupportComment: (id: Id) => del(`/support-comments/${id}`),

  // Étiquettes du mode Support : elles appartiennent à la société, comme
  // celles d'un tableau lui appartiennent.
  getSupportLabels: () => get<SupportLabel[]>("/support-labels"),
  createSupportLabel: (name: string, color: string, weight = 0) =>
    post<SupportLabel>("/support-labels", { name, color, weight }),
  updateSupportLabel: (id: Id, data: SupportLabelInput) =>
    put<SupportLabel>(`/support-labels/${id}`, data),
  deleteSupportLabel: (id: Id) => del(`/support-labels/${id}`),
  // L'ordre complet, toutes les étiquettes nommées une fois.
  reorderSupportLabels: (ids: Id[]) =>
    put<SupportLabel[]>("/support-labels/reorder", { ids }),

  // Étiquettes d'un tableau : un nom et une couleur, posés sur ses cartes.
  getLabels: (boardId: string | Id) =>
    get<Label[]>(`/labels${queryString({ board: boardId })}`),
  createLabel: (board_id: Id | string, name: string, color: string) =>
    post<Label>("/labels", { board_id, name, color }),
  // Les contextes d'un tableau, recopiés dans un autre : leurs noms seuls.
  // « replace » : ceux du tableau d'accueil s'en vont d'abord, avec ce
  // qu'ils contiennent.
  // « rename_all » : le tableau reprend aussi le libellé de « Tous les … ».
  copyContexts: (from_board: Id, to_board: Id, replace = false, rename_all = false) =>
    post<CopyResult>(`/boards/${from_board}/contexts/copy`, { to_board, replace, rename_all }),
  copyLabels: (from_board: Id, to_board: Id, replace = false) =>
    post<CopyResult>("/labels/copy", { from_board, to_board, replace }),
  updateLabel: (id: Id, data: { name?: string; color?: string }) =>
    put<Label>(`/labels/${id}`, data),
  deleteLabel: (id: Id) => del(`/labels/${id}`),
  // L'ordre complet des étiquettes d'un tableau.
  reorderLabels: (board_id: Id, ids: Id[]) => put<Label[]>("/labels/reorder", { board_id, ids }),
};

/**
 * La connexion par Microsoft : le navigateur quitte l'application pour la
 * page de Microsoft, et revient avec son jeton dans le fragment de l'adresse.
 */
export const entraLoginUrl = "/api/auth/entra/start";
