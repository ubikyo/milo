const KEY = "milo-token";

// Le jeton vit dans le localStorage du navigateur.
export const getToken = () => {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
};

export const setToken = (token) => {
  try {
    if (token) localStorage.setItem(KEY, token);
    else localStorage.removeItem(KEY);
  } catch {
    /* navigation privée, stockage bloqué : la session reste en mémoire */
  }
};
