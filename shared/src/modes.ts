// The application modes, in the order of the selector at the bottom left.
// Tab cycles from one to the next, in this order.
//
// This list used to be written twice — once by the client for its
// selector, once by the server to validate an account's opening mode.
// Both now read it from here.

export const MODES = [
  { value: "access", label: "Accès" },
  { value: "projects", label: "Projets" },
  { value: "tasks", label: "Tâches" },
  { value: "support", label: "Support" },
  { value: "assets", label: "Assets" },
] as const;

export type Mode = (typeof MODES)[number]["value"];

/** Mode a session opens in, until the account has chosen another. */
export const DEFAULT_MODE: Mode = "projects";

export const isMode = (value: unknown): value is Mode =>
  MODES.some((m) => m.value === value);
