import { PASSWORD_RULES } from "@milo/shared";
import RuleList from "./RuleList";
import type { RuleCheck } from "./RuleList";

// List of rules with their state, updated on every keystroke. Given a
// confirmation, a last rule checks that both entries match.
export default function PasswordRules({ password, confirmation }: { password: string; confirmation?: string }) {
  const value = String(password || "");
  const checks: RuleCheck[] = PASSWORD_RULES.map((rule) => ({ id: rule.id, label: rule.label, ok: rule.test(value) }));
  if (confirmation !== undefined) {
    checks.push({
      id: "match",
      label: "deux mots de passe identiques",
      ok: confirmation !== "" && confirmation === value,
    });
  }
  return <RuleList checks={checks} />;
}
