// Le client de l'API. Chaque appel dit ce qu'il rend : les types viennent de
// @milo/shared, les mêmes que ceux que le serveur respecte.

import type {
  DirectoryUser,
  AccessBlock,
  AccessBlockInput,
  AccessBlockReorderInput,
  AccessCategory,
  AccessCategoryInput,
  AccessFeed,
  AccessUptime,
  AccessSection,
  AccessSectionInput,
  ApiError,
  Asset,
  AssetDetail,
  AssetIndicator,
  AssetIndicatorInput,
  ProjectIndicator,
  ProjectIndicatorInput,
  TaskIndicator,
  TaskIndicatorInput,
  IndicatorSection,
  IndicatorSectionInput,
  AssetRefresh,
  Attachment,
  AuthResult,
  BackupInfo,
  Board,
  BoardInput,
  CardLocation,
  CascadeResult,
  Category,
  Milestone,
  Checklist,
  ChecklistItem,
  ChecklistItemInput,
  Comment,
  Company,
  MilestoneType,
  Permissions,
  Role,
  UserCompanyRole,
  CopyResult,
  EntraPrincipal,
  EntraSettings,
  EntraSettingsInput,
  MailboxCheck,
  PrincipalAssignments,
  FollowKind,
  Follows,
  Id,
  Label,
  ListColor,
  MailTestResult,
  Project,
  ProjectBoard,
  ProjectBoardInput,
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
  SupportIndicator,
  SupportIndicatorInput,
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
  TabOrderMode,
  TabOrders,
  DeveloperSettings,
  SupportSettings,
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
    throw new Error(body.error || `Erreur ${res.status}`);
  }
  if (res.status === 204) return null as T;
  return (await res.json()) as T;
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
  const cherches = new URLSearchParams();
  for (const [cle, valeur] of Object.entries(params)) {
    if (valeur && valeur !== "all") cherches.set(cle, String(valeur));
  }
  const qs = cherches.toString();
  return qs ? `?${qs}` : "";
};

/**
 * Les sections d'un panneau des statistiques — Support ou Assets : ses
 * colonnes, comme celles d'une catégorie d'accès.
 */
const sectionsDuPanneau = (base: string) => ({
  all: () => get<IndicatorSection[]>(`${base}/sections`),
  create: (data: IndicatorSectionInput) => post<IndicatorSection>(`${base}/sections`, data),
  update: (id: Id, data: IndicatorSectionInput) =>
    put<IndicatorSection>(`${base}/sections/${id}`, data),
  /** La copie, avec ses indicateurs, se pose juste à droite de l'original. */
  duplicate: (id: Id) => post<IndicatorSection>(`${base}/sections/${id}/duplicate`, {}),
  remove: (id: Id) => del(`${base}/sections/${id}`),
  reorder: (ids: Id[]) => put<IndicatorSection[]>(`${base}/sections/reorder`, { ids }),
});

/** Les écritures et lectures des sections d'un panneau. */
export type SectionsDuPanneau = ReturnType<typeof sectionsDuPanneau>;

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

  // --- Accès (utilisateurs et groupes Entra) -------------------------------
  getAssignments: () => get<PrincipalAssignments[]>("/assignments"),
  // La liste des rôles envoyée remplace tout ; vide, elle retire l'accès.
  setAssignments: (principal: EntraPrincipal, roles: UserCompanyRole[]) =>
    put<PrincipalAssignments[]>(
      `/assignments/${principal.type}/${encodeURIComponent(principal.id)}`,
      { name: principal.name, email: principal.email, roles },
    ),
  deleteAssignments: (principal: EntraPrincipal) =>
    request<PrincipalAssignments[]>(
      `/assignments/${principal.type}/${encodeURIComponent(principal.id)}`,
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
  testMail: (to: string, company_id: Id) =>
    post<MailTestResult>("/entra/test", { to, company_id }),
  checkMailboxes: () => get<MailboxCheck[]>("/entra/mailboxes"),

  // --- Suivi ---------------------------------------------------------------
  // Le client garde la liste de ce qu'il suit : chaque écriture la rend
  // entière, il n'y a donc jamais à la relire après un clic.
  getFollows: () => get<Follows>("/follows"),
  follow: (kind: FollowKind, id: Id) => put<Follows>(`/follows/${kind}/${id}`),
  unfollow: (kind: FollowKind, id: Id) =>
    request<Follows>(`/follows/${kind}/${id}`, { method: "DELETE" }),

  // --- Mode Accès ----------------------------------------------------------
  // Les catégories ne pendent à rien : elles se lisent toutes, moins celles
  // que d'autres ont fermées.
  getAccessCategories: () => get<AccessCategory[]>("/access-categories"),
  createAccessCategory: (data: AccessCategoryInput) =>
    post<AccessCategory>("/access-categories", data),
  updateAccessCategory: (id: Id, data: AccessCategoryInput) =>
    put<AccessCategory>(`/access-categories/${id}`, data),
  deleteAccessCategory: (id: Id) =>
    request<null>(`/access-categories/${id}`, { method: "DELETE" }),
  // L'ordre des onglets est celui de tout le monde, comme celui des listes
  // d'un tableau : il se range dans la base, pas dans le navigateur.
  reorderAccessCategories: (ids: Id[]) =>
    put<AccessCategory[]>("/access-categories/reorder", { ids }),

  // Les sections sont les colonnes d'une catégorie : elles ne se lisent que
  // pour l'une d'elles.
  getAccessSections: (categoryId: Id | string) =>
    get<AccessSection[]>(
      `/access-sections${queryString({ category: categoryId })}`,
    ),
  createAccessSection: (data: AccessSectionInput) =>
    post<AccessSection>("/access-sections", data),
  updateAccessSection: (id: Id, data: AccessSectionInput) =>
    put<AccessSection>(`/access-sections/${id}`, data),
  /** La copie se pose juste à droite de l'original, avec ses éléments. */
  duplicateAccessSection: (id: Id) =>
    post<AccessSection>(`/access-sections/${id}/duplicate`),
  reorderAccessSections: (category_id: Id, ids: Id[]) =>
    put<AccessSection[]>("/access-sections/reorder", { category_id, ids }),
  deleteAccessSection: (id: Id) =>
    request<null>(`/access-sections/${id}`, { method: "DELETE" }),

  // Ce que les sections portent. La page les lit par catégorie entière : une
  // requête, et non une par colonne.
  getAccessBlocks: (categoryId: Id | string) =>
    get<AccessBlock[]>(
      `/access-blocks${queryString({ category: categoryId })}`,
    ),
  // Le flux d'un élément RSS, tel que la base le garde : le serveur relève
  // la source lui-même, à l'intervalle que l'élément règle.
  getAccessFeed: (blockId: Id) =>
    get<AccessFeed>(`/access-blocks/${blockId}/feed`),
  // L'état des machines d'un élément Uptime : le serveur les vérifie
  // lui-même, à l'intervalle que l'élément règle.
  getAccessUptime: (blockId: Id) =>
    get<AccessUptime>(`/access-blocks/${blockId}/uptime`),
  createAccessBlock: (data: AccessBlockInput) =>
    post<AccessBlock>("/access-blocks", data),
  // Seule la configuration bouge : changer de type ferait un autre élément.
  updateAccessBlock: (id: Id, data: AccessBlockInput) =>
    put<AccessBlock>(`/access-blocks/${id}`, data),
  /** La copie se pose juste sous l'original. */
  duplicateAccessBlock: (id: Id) =>
    post<AccessBlock>(`/access-blocks/${id}/duplicate`),
  deleteAccessBlock: (id: Id) =>
    request<null>(`/access-blocks/${id}`, { method: "DELETE" }),
  // Le rangement d'une colonne : ce qu'elle porte désormais, dans l'ordre. Un
  // élément venu d'une autre colonne de la même catégorie y est admis.
  reorderAccessBlocks: (data: AccessBlockReorderInput) =>
    put<AccessBlock[]>("/access-blocks/reorder", data),

  // --- Mode Projet ---------------------------------------------------------
  getProjectBoards: () => get<ProjectBoard[]>("/project-boards"),
  createProjectBoard: (name: string) =>
    post<ProjectBoard>("/project-boards", { name }),
  // Un simple nom suffit encore ; le tiroir, lui, envoie ses réglages.
  updateProjectBoard: (id: Id, data: string | ProjectBoardInput) =>
    put<ProjectBoard>(
      `/project-boards/${id}`,
      typeof data === "string" ? { name: data } : data,
    ),
  deleteProjectBoard: (id: Id) =>
    request<CascadeResult>(`/project-boards/${id}`, {
      method: "DELETE",
    }),
  reorderProjectBoards: (ids: Id[]) =>
    put<ProjectBoard[]>("/project-boards/reorder", { ids }),

  // Les catégories appartiennent à un tableau de projets.
  getCategories: (boardId?: string | null) =>
    get<Category[]>(`/categories${queryString({ board: boardId })}`),
  createCategory: (board_id: Id | string, name: string) =>
    post<Category>("/categories", { board_id, name }),
  copyCategories: (from_board: Id, to_board: Id) =>
    post<CopyResult>("/categories/copy", { from_board, to_board }),
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

  getProjectLabels: (boardId: string | Id) =>
    get<ProjectLabel[]>(`/project-labels${queryString({ board: boardId })}`),
  createProjectLabel: (board_id: Id | string, name: string, color: string, weight = 0) =>
    post<ProjectLabel>("/project-labels", { board_id, name, color, weight }),
  // Les étiquettes d'un tableau posées dans un autre. Celles qui y portent
  // déjà le même nom ne sont pas redoublées : le compte rendu les compte.
  copyProjectLabels: (from_board: Id, to_board: Id) =>
    post<CopyResult>("/project-labels/copy", { from_board, to_board }),
  updateProjectLabel: (id: Id, data: { name?: string; color?: string; weight?: number }) =>
    put<ProjectLabel>(`/project-labels/${id}`, data),
  deleteProjectLabel: (id: Id) => del(`/project-labels/${id}`),

  getProjects: (filters: ProjectFilters = {}) =>
    get<Project[]>(
      `/projects${queryString(filters as Record<string, unknown>)}`,
    ),
  /** Les comptes acteurs d'au moins un projet du tableau (et de la société). */
  getProjectActorIds: (filters: Pick<ProjectFilters, "board" | "company">) =>
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

  // --- Sociétés -----------------------------------------------------------
  getCompanies: () => get<Company[]>("/companies"),
  createCompany: (name: string) => post<Company>("/companies", { name }),
  // Un nom seul (la liste renomme), ou les champs à changer.
  updateCompany: (
    id: Id,
    data:
      string | Partial<Pick<Company, "name" | "support_email" | "support_url">>,
  ) =>
    put<Company>(
      `/companies/${id}`,
      typeof data === "string" ? { name: data } : data,
    ),
  deleteCompany: (id: Id) =>
    request<CascadeResult>(`/companies/${id}`, { method: "DELETE" }),

  // --- Rôles ---------------------------------------------------------------
  // Le nom et les droits se modifient séparément.
  getRoles: () => get<Role[]>("/roles"),
  createRole: (name: string) => post<Role>("/roles", { name }),
  updateRole: (id: Id, data: { name?: string; permissions?: Permissions }) =>
    put<Role>(`/roles/${id}`, data),
  deleteRole: (id: Id) => del(`/roles/${id}`),

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

  // --- Mode Tâche ----------------------------------------------------------
  getBoards: (companyId: string | Id) =>
    get<Board[]>(`/boards${queryString({ company: companyId })}`),
  createBoard: (company_id: Id | string, name: string) =>
    post<Board>("/boards", { company_id, name }),
  // Un simple nom suffit encore ; le tiroir, lui, envoie ses réglages.
  updateBoard: (id: Id, data: string | BoardInput) =>
    put<Board>(
      `/boards/${id}`,
      typeof data === "string" ? { name: data } : data,
    ),
  deleteBoard: (id: Id | string) => del(`/boards/${id}`),
  // Les tableaux du mode Tâche se rangent société par société.
  reorderBoards: (company_id: Id | string, ids: Id[]) =>
    put<Board[]>("/boards/reorder", { company_id, ids }),

  getTaskLists: (boardId: string | Id) =>
    get<TaskList[]>(`/task-lists${queryString({ board: boardId })}`),
  // Sans « index », la liste va au bout du tableau.
  createTaskList: (board_id: Id | string, name: string, index?: number) =>
    post<TaskList>("/task-lists", { board_id, name, index }),
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
  ) => post<TaskCardRow>("/task-cards", { list_id, text, kind, description }),
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
    get<CardLocation>(`/task-cards/${id}/emplacement`),
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

  // Pièces jointes d'une carte : les fichiers déposés dessus. Le dépôt et le
  // retrait partent aussitôt, sans attendre la fermeture du tiroir.
  uploadAttachment: (cardId: Id, file: File) =>
    upload<Attachment>(`/task-cards/${cardId}/attachments`, file),
  deleteAttachment: (id: Id) => del(`/attachments/${id}`),

  // Une image collée dans la description d'une carte : elle est déposée tout
  // de suite, et c'est son adresse que l'éditeur insère.
  uploadCardImage: (cardId: Id, file: File) =>
    upload<{ url: string }>(`/task-cards/${cardId}/images`, file),

  // --- Mode Assets ---------------------------------------------------------
  // Les postes remontés par les agents d'inventaire. La liste ne porte que le
  // nom : tout le reste attend l'ouverture du poste, et ne voyage donc que
  // pour celui qu'on regarde.
  getAssets: (companyId: string | Id) =>
    get<Asset[]>(`/assets${queryString({ company: companyId })}`),
  getAsset: (id: Id) => get<AssetDetail>(`/assets/${id}`),

  // Les notifications reçues, pour le tiroir « Notifications ».
  getNotifications: () => get<Notification[]>("/notifications"),
  deleteNotification: (id: string) => del(`/notifications/${encodeURIComponent(id)}`),
  clearNotifications: () => del("/notifications"),

  // La recherche de la rangée d'onglets, sur tout ce que la personne voit.
  search: (q: string) => get<SearchResult[]>(`/search${queryString({ q })}`),

  // L'ordre des onglets fixes des modes Support et Assets, commun à tous.
  getTabOrders: () => get<TabOrders>("/tab-orders"),
  reorderTabs: (mode: TabOrderMode, values: string[]) =>
    put<TabOrders>(`/tab-orders/${mode}`, { values }),

  // La section « Développeur » du Paramétrage, commune à tous.
  // La section « Support » du Paramétrage : l'échéance par défaut.
  getSupportSettings: () => get<SupportSettings>("/support-settings"),
  updateSupportSettings: (data: SupportSettings) =>
    put<SupportSettings>("/support-settings", data),
  getDeveloperSettings: () => get<DeveloperSettings>("/developer"),
  updateDeveloperSettings: (data: DeveloperSettings) =>
    put<DeveloperSettings>("/developer", data),
  // « Inventorie-toi maintenant » : le serveur appelle l'agent sur le poste.
  // Rien n'en revient — l'inventaire arrive ensuite par la porte des agents,
  // et c'est le flux d'événements qui prévient.
  refreshAsset: (id: Id) => post<AssetRefresh>(`/assets/${id}/refresh`, {}),
  deleteAsset: (id: Id) => del(`/assets/${id}`),
  // Les indicateurs du panneau des statistiques des Assets : comme ceux du
  // Support, communs à toutes les sociétés et calculés ici sur les postes de
  // celle qu'on regarde.
  getAssetIndicators: () => get<AssetIndicator[]>("/asset-indicators"),
  createAssetIndicator: (data: AssetIndicatorInput) =>
    post<AssetIndicator>("/asset-indicators", data),
  updateAssetIndicator: (id: Id, data: AssetIndicatorInput) =>
    put<AssetIndicator>(`/asset-indicators/${id}`, data),
  deleteAssetIndicator: (id: Id) => del(`/asset-indicators/${id}`),
  /** Ce que la section porte désormais : un indicateur venu d'une autre y passe. */
  reorderAssetIndicators: (sectionId: Id, ids: Id[]) =>
    put<AssetIndicator[]>("/asset-indicators/reorder", { section_id: sectionId, ids }),
  assetIndicatorSections: sectionsDuPanneau("/asset-indicators"),
  getAssetIndicatorsLock: () => get<{ locked: boolean }>("/asset-indicators/lock"),
  setAssetIndicatorsLock: (locked: boolean) =>
    put<{ locked: boolean }>("/asset-indicators/lock", { locked }),

  // --- Sections des modes Projet et Tâche -----------------------------------
  // Communes à tous les tableaux : leurs widgets se calculent ici sur celui
  // qu'on regarde.
  getProjectIndicators: () => get<ProjectIndicator[]>("/project-indicators"),
  createProjectIndicator: (data: ProjectIndicatorInput) =>
    post<ProjectIndicator>("/project-indicators", data),
  updateProjectIndicator: (id: Id, data: ProjectIndicatorInput) =>
    put<ProjectIndicator>(`/project-indicators/${id}`, data),
  deleteProjectIndicator: (id: Id) => del(`/project-indicators/${id}`),
  reorderProjectIndicators: (sectionId: Id, ids: Id[]) =>
    put<ProjectIndicator[]>("/project-indicators/reorder", { section_id: sectionId, ids }),
  projectIndicatorSections: sectionsDuPanneau("/project-indicators"),
  getProjectIndicatorsLock: () => get<{ locked: boolean }>("/project-indicators/lock"),
  setProjectIndicatorsLock: (locked: boolean) =>
    put<{ locked: boolean }>("/project-indicators/lock", { locked }),

  getTaskIndicators: () => get<TaskIndicator[]>("/task-indicators"),
  createTaskIndicator: (data: TaskIndicatorInput) => post<TaskIndicator>("/task-indicators", data),
  updateTaskIndicator: (id: Id, data: TaskIndicatorInput) =>
    put<TaskIndicator>(`/task-indicators/${id}`, data),
  deleteTaskIndicator: (id: Id) => del(`/task-indicators/${id}`),
  reorderTaskIndicators: (sectionId: Id, ids: Id[]) =>
    put<TaskIndicator[]>("/task-indicators/reorder", { section_id: sectionId, ids }),
  taskIndicatorSections: sectionsDuPanneau("/task-indicators"),
  getTaskIndicatorsLock: () => get<{ locked: boolean }>("/task-indicators/lock"),
  setTaskIndicatorsLock: (locked: boolean) =>
    put<{ locked: boolean }>("/task-indicators/lock", { locked }),

  // --- Mode Support --------------------------------------------------------
  // Les indicateurs du panneau des statistiques : communs à toutes les
  // sociétés, ils se calculent ici sur les demandes de celle qu'on regarde.
  getSupportIndicators: () => get<SupportIndicator[]>("/support-indicators"),
  createSupportIndicator: (data: SupportIndicatorInput) =>
    post<SupportIndicator>("/support-indicators", data),
  // Seule la configuration bouge : changer de type ferait un autre indicateur.
  updateSupportIndicator: (id: Id, data: SupportIndicatorInput) =>
    put<SupportIndicator>(`/support-indicators/${id}`, data),
  deleteSupportIndicator: (id: Id) => del(`/support-indicators/${id}`),
  /** Ce que la section porte désormais : un indicateur venu d'une autre y passe. */
  reorderSupportIndicators: (sectionId: Id, ids: Id[]) =>
    put<SupportIndicator[]>("/support-indicators/reorder", { section_id: sectionId, ids }),
  supportIndicatorSections: sectionsDuPanneau("/support-indicators"),
  // Le verrou du panneau, un seul pour tout le monde : verrouillé, on n'y
  // ajoute ni ne déplace plus d'indicateur.
  getSupportIndicatorsLock: () => get<{ locked: boolean }>("/support-indicators/lock"),
  setSupportIndicatorsLock: (locked: boolean) =>
    put<{ locked: boolean }>("/support-indicators/lock", { locked }),

  // Les demandes pendent à une société : elles se lisent toutes pour celle qui
  // est choisie, et ce sont les onglets qui les rangent par statut.
  getSupportRequests: (companyId: string | Id) =>
    get<SupportRequest[]>(
      `/support-requests${queryString({ company: companyId })}`,
    ),
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
    envoi: {
      status?: SupportStatus;
      cc?: string[];
      bcc?: string[];
      files?: SupportFileDeposit[];
    } = {},
  ) => post<SupportComment>(`/support-requests/${id}/comments`, { text, internal, ...envoi }),
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
  copyLabels: (from_board: Id, to_board: Id) =>
    post<CopyResult>("/labels/copy", { from_board, to_board }),
  updateLabel: (id: Id, data: { name?: string; color?: string }) =>
    put<Label>(`/labels/${id}`, data),
  deleteLabel: (id: Id) => del(`/labels/${id}`),
};

/**
 * La connexion par Microsoft : le navigateur quitte l'application pour la
 * page de Microsoft, et revient avec son jeton dans le fragment de l'adresse.
 */
export const entraLoginUrl = "/api/auth/entra/start";
