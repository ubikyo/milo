import { ActionIcon, Group, HoverCard, Kbd, Stack, Text } from "@mantine/core";
import { PAGE_GUTTER } from "../../themes/layout";

// Action on the left, shortcut on the right. "when" limits a shortcut to the board
// where it acts: no new project without a projects list, no next context
// without contexts.
type Condition = "projects" | "requests" | "contexts";

const SHORTCUTS: { action: string; key: string; when?: Condition }[] = [
  { action: "Nouveau projet", key: "N", when: "projects" },
  { action: "Nouvelle demande", key: "N", when: "requests" },
  { action: "Changer de vue", key: "Tab" },
  { action: "Tableau suivant", key: "⌥ Tab" },
  { action: "Contexte suivant", key: "C", when: "contexts" },
  { action: "Modifier l’interface / terminer", key: "I" },
];

/** What the open board holds: a projects list, a requests list, contexts. */
export default function ShortcutsHelp({
  projects,
  requests,
  contexts,
}: {
  projects: boolean;
  requests: boolean;
  contexts: boolean;
}) {
  const holds: Record<Condition, boolean> = { projects, requests, contexts };
  return (
    <HoverCard position="top-end" withArrow shadow="md" openDelay={100}>
      <HoverCard.Target>
        <ActionIcon
          variant="default"
          radius="xl"
          size="lg"
          aria-label="Raccourcis clavier"
          style={{ position: "fixed", right: PAGE_GUTTER, bottom: PAGE_GUTTER, zIndex: 200, border: "none" }}
        >
          <Text fw={700}>?</Text>
        </ActionIcon>
      </HoverCard.Target>
      <HoverCard.Dropdown>
        <Stack gap={6} miw={220}>
          <Text size="xs" fw={700} tt="uppercase" c="dimmed">
            Raccourcis clavier
          </Text>
          {SHORTCUTS.filter((s) => !s.when || holds[s.when]).map(
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
