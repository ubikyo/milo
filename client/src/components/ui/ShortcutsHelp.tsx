import { ActionIcon, Group, HoverCard, Kbd, Stack, Text } from "@mantine/core";

// Action à gauche, raccourci à droite. « mode » limite un raccourci au mode
// où il agit : pas de nouveau projet en mode Tâche.
const SHORTCUTS = [
  { action: "Nouveau projet", key: "N", mode: "projects" },
  { action: "Basculer Projet / Tâche", key: "Tab" },
  { action: "Tableau suivant", key: "⌥ Tab" },
  { action: "Société suivante", key: "S" },
];

export default function ShortcutsHelp({ mode }) {
  return (
    <HoverCard position="top-end" withArrow shadow="md" openDelay={100}>
      <HoverCard.Target>
        <ActionIcon
          variant="default"
          radius="xl"
          size="lg"
          aria-label="Raccourcis clavier"
          style={{ position: "fixed", right: 20, bottom: 20, zIndex: 200 }}
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
              <Group key={key} justify="space-between" gap="xl" wrap="nowrap">
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
