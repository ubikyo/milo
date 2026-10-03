import { ActionIcon, Group, HoverCard, Kbd, Stack, Text } from "@mantine/core";
import { PAGE_GUTTER } from "../../themes/layout";

// Action à gauche, raccourci à droite. « si » limite un raccourci au tableau
// où il agit : pas de nouveau projet sans liste de projets.
type Condition = "projets" | "demandes";

const SHORTCUTS: { action: string; key: string; si?: Condition }[] = [
  { action: "Nouveau projet", key: "N", si: "projets" },
  { action: "Nouvelle demande", key: "N", si: "demandes" },
  { action: "Changer de vue", key: "Tab" },
  { action: "Tableau suivant", key: "⌥ Tab" },
  { action: "Contexte suivant", key: "S" },
  { action: "Modifier l’interface / terminer", key: "I" },
];

/** Ce que le tableau ouvert porte : une liste de projets, une liste de demandes. */
export default function ShortcutsHelp({ projets, demandes }: { projets: boolean; demandes: boolean }) {
  const vrai: Record<Condition, boolean> = { projets, demandes };
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
          {SHORTCUTS.filter((s) => !s.si || vrai[s.si]).map(
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
