const BASE_URL = "/api";

async function request(path, options = {}) {
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Erreur ${res.status}`);
  }
  if (res.status === 204) return null;
  return res.json();
}

export const api = {
  getCategories: () => request("/categories"),
  getProjects: ({ category, status } = {}) => {
    const params = new URLSearchParams();
    if (category && category !== "all") params.set("category", category);
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
