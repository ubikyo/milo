// Required password complexity. These rules used to be duplicated: the
// server applied them, the client displayed them live under the field, and
// nothing guaranteed they stayed aligned. They now exist only here.

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

/** The rules satisfied by this password, for the live display. */
export const passwordChecks = (password: string): { rule: PasswordRule; ok: boolean }[] =>
  PASSWORD_RULES.map((rule) => ({ rule, ok: rule.test(password) }));

/** The labels of the unsatisfied rules. Empty = password accepted. */
export const passwordIssues = (password: unknown): string[] =>
  PASSWORD_RULES.filter((rule) => !rule.test(String(password ?? ""))).map((rule) => rule.label);
