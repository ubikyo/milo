// Miroir de PASSWORD_RULES dans server/auth.js, pour le retour visuel immédiat.
// Le serveur reste l'autorité : il revalide à chaque envoi.
export const PASSWORD_RULES = [
  { id: "length", label: "8 caractères minimum", test: (p) => p.length >= 8 },
  { id: "lower", label: "une lettre minuscule", test: (p) => /[a-z]/.test(p) },
  { id: "upper", label: "une lettre majuscule", test: (p) => /[A-Z]/.test(p) },
  { id: "digit", label: "un chiffre", test: (p) => /[0-9]/.test(p) },
  { id: "symbol", label: "un symbole", test: (p) => /[^A-Za-z0-9]/.test(p) },
];

export const passwordIsValid = (password) =>
  PASSWORD_RULES.every((rule) => rule.test(String(password || "")));
