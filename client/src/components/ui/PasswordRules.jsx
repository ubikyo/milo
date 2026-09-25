import { Group, Stack, Text, ThemeIcon } from "@mantine/core";
import { IconCheck, IconX } from "@tabler/icons-react";
import { PASSWORD_RULES } from "../../lib/passwordRules";

// Liste des règles avec leur état, mise à jour à chaque frappe.
export default function PasswordRules({ password }) {
  return (
    <Stack gap={4}>
      {PASSWORD_RULES.map((rule) => {
        const ok = rule.test(String(password || ""));
        return (
          <Group key={rule.id} gap={6} wrap="nowrap">
            <ThemeIcon size={16} radius="xl" variant="light" color={ok ? "teal" : "gray"}>
              {ok ? <IconCheck size={11} /> : <IconX size={11} />}
            </ThemeIcon>
            <Text size="xs" c={ok ? "teal" : "dimmed"}>
              {rule.label}
            </Text>
          </Group>
        );
      })}
    </Stack>
  );
}
