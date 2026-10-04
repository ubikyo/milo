const KEY = "milo-token";

// The token lives in the browser's localStorage.
export const getToken = (): string | null => {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
};

export const setToken = (token: string | null): void => {
  try {
    if (token) localStorage.setItem(KEY, token);
    else localStorage.removeItem(KEY);
  } catch {
    /* private browsing, blocked storage: the session stays in memory */
  }
};
