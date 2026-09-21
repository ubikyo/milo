import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

// scrypt est fourni par Node : pas de dépendance native supplémentaire.
const KEY_LENGTH = 64;

export const hashPassword = (password) => {
  const salt = randomBytes(16).toString("hex");
  return `${salt}:${scryptSync(password, salt, KEY_LENGTH).toString("hex")}`;
};

export const verifyPassword = (password, stored) => {
  const [salt, hash] = String(stored).split(":");
  if (!salt || !hash) return false;
  const expected = Buffer.from(hash, "hex");
  const candidate = scryptSync(password, salt, KEY_LENGTH);
  // Comparaison à temps constant.
  return expected.length === candidate.length && timingSafeEqual(expected, candidate);
};

export const createToken = () => randomBytes(32).toString("hex");

// Complexité exigée. Ces règles sont dupliquées côté client pour l'affichage
// en direct (client/src/passwordRules.js) : garder les deux fichiers alignés.
export const PASSWORD_RULES = [
  { id: "length", label: "8 caractères minimum", test: (p) => p.length >= 8 },
  { id: "lower", label: "une lettre minuscule", test: (p) => /[a-z]/.test(p) },
  { id: "upper", label: "une lettre majuscule", test: (p) => /[A-Z]/.test(p) },
  { id: "digit", label: "un chiffre", test: (p) => /[0-9]/.test(p) },
  { id: "symbol", label: "un symbole", test: (p) => /[^A-Za-z0-9]/.test(p) },
];

// Renvoie les libellés des règles non satisfaites.
export const passwordIssues = (password) =>
  PASSWORD_RULES.filter((rule) => !rule.test(String(password || ""))).map((rule) => rule.label);
