import { getToken, setToken } from "../lib/auth";

const BASE_URL = "/api";

// Prévient l'application quand le serveur refuse la session (jeton expiré,
// déconnexion depuis un autre onglet).
let onUnauthorized = () => {};
export const setUnauthorizedHandler = (fn) => {
  onUnauthorized = fn;
};

async function request(path, options = {}) {
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
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Erreur ${res.status}`);
  }
  if (res.status === 204) return null;
  return res.json();
}

export const api = {
  getSetupState: () => request("/auth/setup"),
  setup: (data) => request("/auth/setup", { method: "POST", body: JSON.stringify(data) }),
  login: (email, password) =>
    request("/auth/login", { method: "POST", body: JSON.stringify({ email, password }) }),
  firstLogin: (data) => request("/auth/first-login", { method: "POST", body: JSON.stringify(data) }),
  logout: () => request("/auth/logout", { method: "POST" }),
  me: () => request("/auth/me"),
  updateMe: (data) => request("/auth/me", { method: "PUT", body: JSON.stringify(data) }),

  getVersion: () => request("/version"),

  getUsers: () => request("/users"),
  createUser: (data) => request("/users", { method: "POST", body: JSON.stringify(data) }),
  updateUser: (id, data) => request(`/users/${id}`, { method: "PUT", body: JSON.stringify(data) }),
  deleteUser: (id) => request(`/users/${id}`, { method: "DELETE" }),

  getProjectBoards: () => request("/project-boards"),
  createProjectBoard: (name) =>
    request("/project-boards", { method: "POST", body: JSON.stringify({ name }) }),
  updateProjectBoard: (id, name) =>
    request(`/project-boards/${id}`, { method: "PUT", body: JSON.stringify({ name }) }),
  deleteProjectBoard: (id) => request(`/project-boards/${id}`, { method: "DELETE" }),

  // Les catégories appartiennent à un tableau de projets.
  getCategories: (boardId) =>
    request(`/categories${boardId && boardId !== "all" ? `?board=${boardId}` : ""}`),
  createCategory: (board_id, name) =>
    request("/categories", { method: "POST", body: JSON.stringify({ board_id, name }) }),
  updateCategory: (id, name) =>
    request(`/categories/${id}`, { method: "PUT", body: JSON.stringify({ name }) }),
  deleteCategory: (id) => request(`/categories/${id}`, { method: "DELETE" }),

  getCompanies: () => request("/companies"),
  createCompany: (name) => request("/companies", { method: "POST", body: JSON.stringify({ name }) }),
  updateCompany: (id, name) => request(`/companies/${id}`, { method: "PUT", body: JSON.stringify({ name }) }),
  deleteCompany: (id) => request(`/companies/${id}`, { method: "DELETE" }),

  getBoards: (companyId) => request(`/boards?company=${companyId}`),
  createBoard: (company_id, name) =>
    request("/boards", { method: "POST", body: JSON.stringify({ company_id, name }) }),
  updateBoard: (id, data) =>
    request(`/boards/${id}`, {
      method: "PUT",
      // Un simple nom suffit encore ; le tiroir, lui, envoie ses réglages.
      body: JSON.stringify(typeof data === "string" ? { name: data } : data),
    }),
  deleteBoard: (id) => request(`/boards/${id}`, { method: "DELETE" }),

  getTaskLists: (boardId) => request(`/task-lists?board=${boardId}`),
  createTaskList: (board_id, name) =>
    request("/task-lists", { method: "POST", body: JSON.stringify({ board_id, name }) }),
  updateTaskList: (id, data) =>
    request(`/task-lists/${id}`, { method: "PUT", body: JSON.stringify(data) }),
  deleteTaskList: (id) => request(`/task-lists/${id}`, { method: "DELETE" }),
  reorderTaskLists: (board_id, ids) =>
    request("/task-lists/reorder", { method: "PUT", body: JSON.stringify({ board_id, ids }) }),

  // « kind » vaut « card » ou « separator » ; par défaut, une carte.
  createTaskCard: (list_id, text, kind = "card") =>
    request("/task-cards", { method: "POST", body: JSON.stringify({ list_id, text, kind }) }),
  updateTaskCard: (id, text) =>
    request(`/task-cards/${id}`, { method: "PUT", body: JSON.stringify({ text }) }),
  reorderTaskCards: (list_id, ids) =>
    request("/task-cards/reorder", { method: "PUT", body: JSON.stringify({ list_id, ids }) }),

  // La fiche d'une carte : sa description, ses membres, ses étiquettes et son
  // fil de commentaires.
  getTaskCard: (id) => request(`/task-cards/${id}`),
  updateTaskCardDetails: (id, data) =>
    request(`/task-cards/${id}`, { method: "PUT", body: JSON.stringify(data) }),
  addTaskCardComment: (id, text) =>
    request(`/task-cards/${id}/comments`, { method: "POST", body: JSON.stringify({ text }) }),
  updateTaskCardComment: (id, text) =>
    request(`/card-comments/${id}`, { method: "PUT", body: JSON.stringify({ text }) }),
  deleteTaskCardComment: (id) => request(`/card-comments/${id}`, { method: "DELETE" }),

  // Checklists d'une carte : chacune porte son titre et ses éléments. Tout
  // s'enregistre au fil des gestes, sans attendre « Enregistrer ».
  createChecklist: (cardId, title) =>
    request(`/task-cards/${cardId}/checklists`, {
      method: "POST",
      body: JSON.stringify({ title }),
    }),
  updateChecklist: (id, data) =>
    request(`/checklists/${id}`, { method: "PUT", body: JSON.stringify(data) }),
  deleteChecklist: (id) => request(`/checklists/${id}`, { method: "DELETE" }),
  createChecklistItem: (checklistId, text = "") =>
    request(`/checklists/${checklistId}/items`, {
      method: "POST",
      body: JSON.stringify({ text }),
    }),
  updateChecklistItem: (id, data) =>
    request(`/checklist-items/${id}`, { method: "PUT", body: JSON.stringify(data) }),
  deleteChecklistItem: (id) => request(`/checklist-items/${id}`, { method: "DELETE" }),
  reorderChecklists: (cardId, ids) =>
    request(`/task-cards/${cardId}/checklists/reorder`, {
      method: "PUT",
      body: JSON.stringify({ ids }),
    }),
  reorderChecklistItems: (checklistId, ids) =>
    request(`/checklists/${checklistId}/items/reorder`, {
      method: "PUT",
      body: JSON.stringify({ ids }),
    }),

  // Étiquettes d'un tableau : un nom et une couleur, posés sur ses cartes.
  getLabels: (boardId) => request(`/labels?board=${boardId}`),
  createLabel: (board_id, name, color) =>
    request("/labels", { method: "POST", body: JSON.stringify({ board_id, name, color }) }),
  updateLabel: (id, data) =>
    request(`/labels/${id}`, { method: "PUT", body: JSON.stringify(data) }),
  deleteLabel: (id) => request(`/labels/${id}`, { method: "DELETE" }),

  // Étiquettes d'un tableau de projets : les jumelles de celles des cartes,
  // posées sur les projets.
  getProjectLabels: (boardId) => request(`/project-labels?board=${boardId}`),
  createProjectLabel: (board_id, name, color) =>
    request("/project-labels", {
      method: "POST",
      body: JSON.stringify({ board_id, name, color }),
    }),
  updateProjectLabel: (id, data) =>
    request(`/project-labels/${id}`, { method: "PUT", body: JSON.stringify(data) }),
  deleteProjectLabel: (id) => request(`/project-labels/${id}`, { method: "DELETE" }),

  getBuildings: (companyId) =>
    request(`/buildings${companyId && companyId !== "all" ? `?company=${companyId}` : ""}`),
  createBuilding: (company_id, name) =>
    request("/buildings", { method: "POST", body: JSON.stringify({ name, company_id }) }),
  updateBuilding: (id, name) =>
    request(`/buildings/${id}`, { method: "PUT", body: JSON.stringify({ name }) }),
  deleteBuilding: (id) => request(`/buildings/${id}`, { method: "DELETE" }),

  getProjects: ({ board, category, company, building, status, actor } = {}) => {
    const params = new URLSearchParams();
    if (board && board !== "all") params.set("board", board);
    if (category && category !== "all") params.set("category", category);
    if (company && company !== "all") params.set("company", company);
    if (building && building !== "all") params.set("building", building);
    if (status && status !== "all") params.set("status", status);
    if (actor && actor !== "all") params.set("actor", actor);
    const qs = params.toString();
    return request(`/projects${qs ? `?${qs}` : ""}`);
  },
  getProject: (id) => request(`/projects/${id}`),
  createProject: (data) => request("/projects", { method: "POST", body: JSON.stringify(data) }),
  updateProject: (id, data) => request(`/projects/${id}`, { method: "PUT", body: JSON.stringify(data) }),
  deleteProject: (id) => request(`/projects/${id}`, { method: "DELETE" }),

  addComment: (projectId, text) =>
    request(`/projects/${projectId}/comments`, { method: "POST", body: JSON.stringify({ text }) }),
  updateComment: (id, text) => request(`/comments/${id}`, { method: "PUT", body: JSON.stringify({ text }) }),
  deleteComment: (id) => request(`/comments/${id}`, { method: "DELETE" }),
};
