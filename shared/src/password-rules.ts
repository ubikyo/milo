// Complexité exigée d'un mot de passe. Ces règles étaient dupliquées : le
// serveur les appliquait, le client les affichait en direct sous le champ, et
// rien ne garantissait qu'elles restent alignées. Elles n'existent plus qu'ici.

export interface PasswordRule {
  readonly id: string;
  readonly label: string;
  readonly test: (password: string) => boolean;
}

export const PASSWORD_RULES: readonly PasswordRule[] = [
  { id: "length", label: "8 caractères minimum", test: (p) => p.length >= 8 },
  { id: "lower", label: "une lettre minuscule", test: (p) => /[a-z]/.test(p) },
  { id: "upper", label: "une lettre majuscule", test: (p) => /[A-Z]/.test(p) },
  { id: "digit", label: "un chiffre", test: (p) => /[0-9]/.test(p) },
  { id: "symbol", label: "un symbole", test: (p) => /[^A-Za-z0-9]/.test(p) },
];

/** Les règles satisfaites par ce mot de passe, pour l'affichage en direct. */
export const passwordChecks = (password: string): { rule: PasswordRule; ok: boolean }[] =>
  PASSWORD_RULES.map((rule) => ({ rule, ok: rule.test(password) }));

/** Les libellés des règles non satisfaites. Vide = mot de passe accepté. */
export const passwordIssues = (password: unknown): string[] =>
  PASSWORD_RULES.filter((rule) => !rule.test(String(password ?? ""))).map((rule) => rule.label);
