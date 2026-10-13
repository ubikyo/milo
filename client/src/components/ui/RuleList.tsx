import { Group, Stack, Text, ThemeIcon } from "@mantine/core";
import { IconCheck, IconX } from "@tabler/icons-react";
import { GREEN, RED } from "../../themes/colors";

export interface RuleCheck {
  id: string;
  label: string;
  ok: boolean;
}

// A list of rules with their state, the shared look of the password and
// identifier rules.
export default function RuleList({ checks }: { checks: RuleCheck[] }) {
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
