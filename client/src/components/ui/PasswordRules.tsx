import { Group, Stack, Text, ThemeIcon } from "@mantine/core";
import { IconCheck, IconX } from "@tabler/icons-react";
import { PASSWORD_RULES } from "@milo/shared";
import { GREEN, RED } from "../../themes/colors";

// List of rules with their state, updated on every keystroke. Given a
// confirmation, a last rule checks that both entries match.
export default function PasswordRules({ password, confirmation }: { password: string; confirmation?: string }) {
  const value = String(password || "");
  const checks = PASSWORD_RULES.map((rule) => ({ id: rule.id, label: rule.label, ok: rule.test(value) }));
  if (confirmation !== undefined) {
    checks.push({
      id: "match",
      label: "deux mots de passe identiques",
      ok: confirmation !== "" && confirmation === value,
    });
  }
  return (
    <Stack gap={4}>
      {checks.map(({ id, label, ok }) => (
        <Group key={id} gap={6} wrap="nowrap">
          {/* Met, a white check on green; not met, a white cross on the project's red. */}
          <ThemeIcon size={16} radius="xl" variant="filled" color={ok ? GREEN : RED} c="white">
            {ok ? <IconCheck size={11} /> : <IconX size={11} />}
          </ThemeIcon>
          <Text size="xs" c={ok ? GREEN : RED} fw={600}>
            {label}
          </Text>
        </Group>
      ))}
    </Stack>
  );
}
