import { ActionIcon, Group, HoverCard, Kbd, Stack, Text } from "@mantine/core";
import { PAGE_GUTTER } from "../../themes/layout";
import type { Mode } from "@milo/shared";

// Action à gauche, raccourci à droite. « mode » limite un raccourci au mode
// où il agit : pas de nouveau projet en mode Tâche.
const SHORTCUTS: { action: string; key: string; mode?: Mode }[] = [
  { action: "Nouveau projet", key: "N", mode: "projects" },
  { action: "Nouvelle demande", key: "N", mode: "support" },
  { action: "Changer de mode", key: "Tab" },
  { action: "Tableau suivant", key: "⌥ Tab" },
  { action: "Société suivante", key: "S" },
];

export default function ShortcutsHelp({ mode }: { mode: Mode }) {
  return (
    <HoverCard position="top-end" withArrow shadow="md" openDelay={100}>
      <HoverCard.Target>
        <ActionIcon
          variant="default"
          radius="xl"
          size="lg"
          aria-label="Raccourcis clavier"
          style={{ position: "fixed", right: PAGE_GUTTER, bottom: PAGE_GUTTER, zIndex: 200 }}
        >
          <Text fw={700}>?</Text>
        </ActionIcon>
      </HoverCard.Target>
      <HoverCard.Dropdown>
        <Stack gap={6} miw={220}>
          <Text size="xs" fw={700} tt="uppercase" c="dimmed">
            Raccourcis clavier
          </Text>
          {SHORTCUTS.filter((s) => !s.mode || s.mode === mode).map(
            ({ action, key }) => (
              <Group key={action} justify="space-between" gap="xl" wrap="nowrap">
                <Text size="sm">{action}</Text>
                <Kbd>{key}</Kbd>
              </Group>
            ),
          )}
        </Stack>
      </HoverCard.Dropdown>
    </HoverCard>
  );
}
