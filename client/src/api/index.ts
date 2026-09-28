// Le client de l'API. Chaque appel dit ce qu'il rend : les types viennent de
// @milo/shared, les mêmes que ceux que le serveur respecte.

import type {
  AccessBlock,
  AccessBlockInput,
  AccessCategory,
  AccessCategoryInput,
  AccessSection,
  AccessSectionInput,
  ApiError,
  Attachment,
  AuthResult,
  BackupInfo,
  Board,
  BoardInput,
  CardLocation,
  CascadeResult,
  Category,
  Checklist,
  ChecklistItem,
  ChecklistItemInput,
  Comment,
  Company,
  CopyResult,
  FirstLoginInput,
  FollowKind,
  Follows,
  Id,
  Label,
  ListColor,
  MailSettings,
  MailSettingsInput,
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
  SupportLabel,
  SupportLabelInput,
  SupportRequest,
  SupportRequestDetail,
  SupportRequestInput,
  TaskCardDetail,
  TaskCardInput,
  TaskCardRow,
  TaskList,
  TaskListCopyInput,
  UpdateMeInput,
  VersionPayload,
} from "@milo/shared";
import { getToken, setToken } from "../lib/auth";

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

export const api = {
  // --- Session -------------------------------------------------------------
  getSetupState: () => get<SetupState>("/auth/setup"),
  setup: (data: SetupInput) => post<AuthResult>("/auth/setup", data),
  login: (email: string, password: string) => post<AuthResult>("/auth/login", { email, password }),
  firstLogin: (data: FirstLoginInput) => post<AuthResult>("/auth/first-login", data),
  logout: () => post<null>("/auth/logout"),
  me: () => get<PublicUser>("/auth/me"),
  updateMe: (data: UpdateMeInput) => put<PublicUser>("/auth/me", data),

  getVersion: () => get<VersionPayload>("/version"),

  // --- Comptes -------------------------------------------------------------
  getUsers: () => get<PublicUser[]>("/users"),
  createUser: (data: { email: string }) => post<PublicUser>("/users", data),
  updateUser: (id: Id, data: Partial<PublicUser>) => put<PublicUser>(`/users/${id}`, data),
  deleteUser: (id: Id) => del(`/users/${id}`),

  // --- Sauvegarde ----------------------------------------------------------
  getBackupInfo: () => get<BackupInfo>("/backup"),
  // L'archive n'est pas ouverte par le client : elle passe du serveur au
  // disque, et revient telle quelle le jour d'une restauration.
  downloadBackup: () => download("/backup/archive"),
  restoreBackup: (file: File) => sendFile<RestoreResult>("/backup/restore", file),

  // --- Messagerie ----------------------------------------------------------
  getMailSettings: () => get<MailSettings>("/mail"),
  updateMailSettings: (data: MailSettingsInput) => put<MailSettings>("/mail", data),
  // L'adresse du consentement Microsoft, à ouvrir dans une fenêtre à part.
  startMailOAuth: () => post<{ url: string }>("/mail/oauth/start"),
  disconnectMailOAuth: () => post<MailSettings>("/mail/oauth/disconnect"),
  testMail: (to: string) => post<MailTestResult>("/mail/test", { to }),

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

  // Les sections sont les colonnes d'une catégorie : elles ne se lisent que
  // pour l'une d'elles.
  getAccessSections: (categoryId: Id | string) =>
    get<AccessSection[]>(`/access-sections${queryString({ category: categoryId })}`),
  createAccessSection: (data: AccessSectionInput) =>
    post<AccessSection>("/access-sections", data),
  updateAccessSection: (id: Id, data: AccessSectionInput) =>
    put<AccessSection>(`/access-sections/${id}`, data),
  deleteAccessSection: (id: Id) =>
    request<null>(`/access-sections/${id}`, { method: "DELETE" }),

  // Ce que les sections portent. La page les lit par catégorie entière : une
  // requête, et non une par colonne.
  getAccessBlocks: (categoryId: Id | string) =>
    get<AccessBlock[]>(`/access-blocks${queryString({ category: categoryId })}`),
  createAccessBlock: (data: AccessBlockInput) => post<AccessBlock>("/access-blocks", data),
  // Seule la configuration bouge : changer de type ferait un autre élément.
  updateAccessBlock: (id: Id, data: AccessBlockInput) =>
    put<AccessBlock>(`/access-blocks/${id}`, data),
  deleteAccessBlock: (id: Id) =>
    request<null>(`/access-blocks/${id}`, { method: "DELETE" }),

  // --- Mode Projet ---------------------------------------------------------
  getProjectBoards: () => get<ProjectBoard[]>("/project-boards"),
  createProjectBoard: (name: string) => post<ProjectBoard>("/project-boards", { name }),
  // Un simple nom suffit encore ; le tiroir, lui, envoie ses réglages.
  updateProjectBoard: (id: Id, data: string | ProjectBoardInput) =>
    put<ProjectBoard>(`/project-boards/${id}`, typeof data === "string" ? { name: data } : data),
  deleteProjectBoard: (id: Id) => request<CascadeResult>(`/project-boards/${id}`, {
    method: "DELETE",
  }),

  // Les catégories appartiennent à un tableau de projets.
  getCategories: (boardId?: string | null) =>
    get<Category[]>(`/categories${queryString({ board: boardId })}`),
  createCategory: (board_id: Id | string, name: string) =>
    post<Category>("/categories", { board_id, name }),
  copyCategories: (from_board: Id, to_board: Id) =>
    post<CopyResult>("/categories/copy", { from_board, to_board }),
  updateCategory: (id: Id, name: string) => put<Category>(`/categories/${id}`, { name }),
  deleteCategory: (id: Id) => request<CascadeResult>(`/categories/${id}`, { method: "DELETE" }),

  getProjectLabels: (boardId: string | Id) =>
    get<ProjectLabel[]>(`/project-labels${queryString({ board: boardId })}`),
  createProjectLabel: (board_id: Id | string, name: string, color: string) =>
    post<ProjectLabel>("/project-labels", { board_id, name, color }),
  // Les étiquettes d'un tableau posées dans un autre. Celles qui y portent
  // déjà le même nom ne sont pas redoublées : le compte rendu les compte.
  copyProjectLabels: (from_board: Id, to_board: Id) =>
    post<CopyResult>("/project-labels/copy", { from_board, to_board }),
  updateProjectLabel: (id: Id, data: { name?: string; color?: string }) =>
    put<ProjectLabel>(`/project-labels/${id}`, data),
  deleteProjectLabel: (id: Id) => del(`/project-labels/${id}`),

  getProjects: (filters: ProjectFilters = {}) =>
    get<Project[]>(`/projects${queryString(filters as Record<string, unknown>)}`),
  getProject: (id: Id) => get<ProjectDetail>(`/projects/${id}`),
  createProject: (data: ProjectInput) => post<Project>("/projects", data),
  updateProject: (id: Id, data: ProjectInput) => put<Project>(`/projects/${id}`, data),
  deleteProject: (id: Id) => del(`/projects/${id}`),
  // La copie emporte la fiche, les acteurs et les étiquettes, mais pas le
  // fil ; sans « board_id », elle reste dans le tableau d'origine.
  copyProject: (id: Id, data: ProjectCopyInput = {}) => post<Project>(`/projects/${id}/copy`, data),

  addComment: (projectId: Id, text: string) =>
    post<Comment>(`/projects/${projectId}/comments`, { text }),
  updateComment: (id: Id, text: string) => put<Comment>(`/comments/${id}`, { text }),
  deleteComment: (id: Id) => del(`/comments/${id}`),

  // --- Sociétés -----------------------------------------------------------
  getCompanies: () => get<Company[]>("/companies"),
  createCompany: (name: string) => post<Company>("/companies", { name }),
  updateCompany: (id: Id, name: string) => put<Company>(`/companies/${id}`, { name }),
  deleteCompany: (id: Id) => request<CascadeResult>(`/companies/${id}`, { method: "DELETE" }),

  // --- Mode Tâche ----------------------------------------------------------
  getBoards: (companyId: string | Id) => get<Board[]>(`/boards${queryString({ company: companyId })}`),
  createBoard: (company_id: Id | string, name: string) =>
    post<Board>("/boards", { company_id, name }),
  // Un simple nom suffit encore ; le tiroir, lui, envoie ses réglages.
  updateBoard: (id: Id, data: string | BoardInput) =>
    put<Board>(`/boards/${id}`, typeof data === "string" ? { name: data } : data),
  deleteBoard: (id: Id | string) => del(`/boards/${id}`),

  getTaskLists: (boardId: string | Id) =>
    get<TaskList[]>(`/task-lists${queryString({ board: boardId })}`),
  createTaskList: (board_id: Id | string, name: string) =>
    post<TaskList>("/task-lists", { board_id, name }),
  updateTaskList: (id: Id, data: { name?: string; color?: ListColor; board_id?: Id }) =>
    put<TaskList>(`/task-lists/${id}`, data),
  deleteTaskList: (id: Id) => del(`/task-lists/${id}`),
  // La copie emporte les cartes de la liste ; sans « board_id », elle reste
  // dans le tableau d'origine.
  copyTaskList: (id: Id, data: TaskListCopyInput = {}) =>
    post<TaskList>(`/task-lists/${id}/copy`, data),
  reorderTaskLists: (board_id: Id | string, ids: Id[]) =>
    put<TaskList[]>("/task-lists/reorder", { board_id, ids }),

  // « kind » vaut « card » ou « separator » ; par défaut, une carte.
  createTaskCard: (list_id: Id, text: string, kind: "card" | "separator" = "card") =>
    post<TaskCardRow>("/task-cards", { list_id, text, kind }),
  updateTaskCard: (id: Id, text: string) => put<TaskCardDetail>(`/task-cards/${id}`, { text }),
  reorderTaskCards: (list_id: Id, ids: Id[]) =>
    put<TaskList[]>("/task-cards/reorder", { list_id, ids }),

  // La fiche d'une carte : sa description, ses membres, ses étiquettes et son
  // fil de commentaires.
  getTaskCard: (id: Id) => get<TaskCardDetail>(`/task-cards/${id}`),
  // Où vit cette carte : de quoi se placer dessus avant de l'ouvrir, quand on
  // arrive par un lien plutôt que par le tableau.
  getCardLocation: (id: Id) => get<CardLocation>(`/task-cards/${id}/emplacement`),
  updateTaskCardDetails: (id: Id, data: TaskCardInput) =>
    put<TaskCardDetail>(`/task-cards/${id}`, data),
  addTaskCardComment: (id: Id, text: string) => post<Comment>(`/task-cards/${id}/comments`, { text }),
  updateTaskCardComment: (id: Id, text: string) => put<Comment>(`/card-comments/${id}`, { text }),
  deleteTaskCardComment: (id: Id) => del(`/card-comments/${id}`),

  // Checklists d'une carte : chacune porte son titre et ses éléments. Tout
  // s'enregistre au fil des gestes, sans attendre « Enregistrer ».
  createChecklist: (cardId: Id, title: string) =>
    post<Checklist>(`/task-cards/${cardId}/checklists`, { title }),
  updateChecklist: (id: Id, data: { title?: string }) => put<Checklist>(`/checklists/${id}`, data),
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

  // --- Mode Support --------------------------------------------------------
  // Les demandes pendent à une société : elles se lisent toutes pour celle qui
  // est choisie, et ce sont les onglets qui les rangent par statut.
  getSupportRequests: (companyId: string | Id) =>
    get<SupportRequest[]>(`/support-requests${queryString({ company: companyId })}`),
  getSupportRequest: (id: Id) => get<SupportRequestDetail>(`/support-requests/${id}`),
  createSupportRequest: (data: SupportRequestInput) =>
    post<SupportRequestDetail>("/support-requests", data),
  updateSupportRequest: (id: Id, data: SupportRequestInput) =>
    put<SupportRequestDetail>(`/support-requests/${id}`, data),
  deleteSupportRequest: (id: Id) => del(`/support-requests/${id}`),

  addSupportComment: (id: Id, text: string) =>
    post<SupportComment>(`/support-requests/${id}/comments`, { text }),
  updateSupportComment: (id: Id, text: string) =>
    put<SupportComment>(`/support-comments/${id}`, { text }),
  deleteSupportComment: (id: Id) => del(`/support-comments/${id}`),

  // Étiquettes du mode Support : elles appartiennent à la société, comme
  // celles d'un tableau lui appartiennent.
  getSupportLabels: (companyId: string | Id) =>
    get<SupportLabel[]>(`/support-labels${queryString({ company: companyId })}`),
  createSupportLabel: (company_id: Id | string, name: string, color: string) =>
    post<SupportLabel>("/support-labels", { company_id, name, color }),
  updateSupportLabel: (id: Id, data: SupportLabelInput) =>
    put<SupportLabel>(`/support-labels/${id}`, data),
  deleteSupportLabel: (id: Id) => del(`/support-labels/${id}`),

  // Étiquettes d'un tableau : un nom et une couleur, posés sur ses cartes.
  getLabels: (boardId: string | Id) => get<Label[]>(`/labels${queryString({ board: boardId })}`),
  createLabel: (board_id: Id | string, name: string, color: string) =>
    post<Label>("/labels", { board_id, name, color }),
  copyLabels: (from_board: Id, to_board: Id) =>
    post<CopyResult>("/labels/copy", { from_board, to_board }),
  updateLabel: (id: Id, data: { name?: string; color?: string }) =>
    put<Label>(`/labels/${id}`, data),
  deleteLabel: (id: Id) => del(`/labels/${id}`),
};
