import { getToken, setToken } from "../auth";

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
  logout: () => request("/auth/logout", { method: "POST" }),
  me: () => request("/auth/me"),

  getUsers: () => request("/users"),
  createUser: (data) => request("/users", { method: "POST", body: JSON.stringify(data) }),
  updateUser: (id, data) => request(`/users/${id}`, { method: "PUT", body: JSON.stringify(data) }),
  deleteUser: (id) => request(`/users/${id}`, { method: "DELETE" }),

  getCategories: () => request("/categories"),
  createCategory: (name) => request("/categories", { method: "POST", body: JSON.stringify({ name }) }),
  updateCategory: (id, name) =>
    request(`/categories/${id}`, { method: "PUT", body: JSON.stringify({ name }) }),
  deleteCategory: (id) => request(`/categories/${id}`, { method: "DELETE" }),

  getCompanies: () => request("/companies"),
  createCompany: (name) => request("/companies", { method: "POST", body: JSON.stringify({ name }) }),
  updateCompany: (id, name) => request(`/companies/${id}`, { method: "PUT", body: JSON.stringify({ name }) }),
  deleteCompany: (id) => request(`/companies/${id}`, { method: "DELETE" }),

  getBuildings: (companyId) =>
    request(`/buildings${companyId && companyId !== "all" ? `?company=${companyId}` : ""}`),
  createBuilding: (company_id, name) =>
    request("/buildings", { method: "POST", body: JSON.stringify({ name, company_id }) }),
  updateBuilding: (id, name) =>
    request(`/buildings/${id}`, { method: "PUT", body: JSON.stringify({ name }) }),
  deleteBuilding: (id) => request(`/buildings/${id}`, { method: "DELETE" }),

  getProjects: ({ category, company, building, status } = {}) => {
    const params = new URLSearchParams();
    if (category && category !== "all") params.set("category", category);
    if (company && company !== "all") params.set("company", company);
    if (building && building !== "all") params.set("building", building);
    if (status && status !== "all") params.set("status", status);
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
