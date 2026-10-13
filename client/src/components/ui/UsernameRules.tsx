import { USERNAME_RULES, normalizeUsername } from "@milo/shared";
import RuleList from "./RuleList";

// The identifier's rules with their state, updated on every keystroke.
export default function UsernameRules({ username }: { username: string }) {
  const value = normalizeUsername(username);
  return <RuleList checks={USERNAME_RULES.map((rule) => ({ id: rule.id, label: rule.label, ok: rule.test(value) }))} />;
}
