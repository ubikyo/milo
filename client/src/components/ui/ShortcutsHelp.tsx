import { Box, Divider, Group, HoverCard, Kbd, Stack, Text } from "@mantine/core";
import { PAGE_GUTTER } from "../../themes/layout";
import Logo from "./Logo";

// Action on the left, shortcut on the right. "when" limits a shortcut to the board
// where it acts: no new project without a projects list, no next context
// without contexts, no switching between views or boards with fewer than two,
// no interface editing without a board.
type Condition = "projects" | "requests" | "contexts" | "views" | "boards" | "board";

const SHORTCUTS: { action: string; key: string; when?: Condition }[] = [
  { action: "Nouveau projet", key: "N", when: "projects" },
  { action: "Nouvelle demande", key: "N", when: "requests" },
  { action: "Changer de vue", key: "Tab", when: "views" },
  { action: "Tableau suivant", key: "⌥ Tab", when: "boards" },
  { action: "Contexte suivant", key: "C", when: "contexts" },
  { action: "Modifier l’interface / terminer", key: "I", when: "board" },
];

// The logo stands in the bottom right corner, at the height of a "lg"
// ActionIcon — "Ajouter un widget" sits beside it (SectionsBoard).
const TARGET_SIZE = 34;
const LOGO_HEIGHT = 26;

const CORNER = {
  position: "fixed",
  right: PAGE_GUTTER,
  bottom: PAGE_GUTTER,
  zIndex: 200,
} as const;

/**
 * The logo in the bottom right corner: the shortcuts show when the mouse is
 * on it, the version under them. What the open board holds: a projects list,
 * a requests list, contexts; whether there are views, boards, to go
 * through — at least two —, and a board at all.
 */
export default function ShortcutsHelp({
  projects,
  requests,
  contexts,
  views,
  boards,
  board,
}: {
  projects: boolean;
  requests: boolean;
  contexts: boolean;
  views: boolean;
  boards: boolean;
  board: boolean;
}) {
  const holds: Record<Condition, boolean> = {
    projects,
    requests,
    contexts,
    views,
    boards,
    board,
  };
  const shown = SHORTCUTS.filter((s) => !s.when || holds[s.when]);
  return (
    // No shortcut to show: the logo stays, without its bubble.
    <HoverCard
      position="top-end"
      withArrow
      shadow="md"
      openDelay={100}
      disabled={shown.length === 0}
    >
      <HoverCard.Target>
        <Box
          aria-label="Raccourcis clavier"
          h={TARGET_SIZE}
          // Its foot on the same line as the views' bottom, at the bottom left
          // (ViewSwitch).
          style={{ ...CORNER, display: "flex", alignItems: "flex-end" }}
        >
          <Logo variant={2} h={LOGO_HEIGHT} />
        </Box>
      </HoverCard.Target>
      <HoverCard.Dropdown>
        <Stack gap={6} miw={220}>
          <Text size="xs" fw={700} tt="uppercase" c="dimmed">
            Raccourcis clavier
          </Text>
          {shown.map(
            ({ action, key }) => (
              <Group key={action} justify="space-between" gap="xl" wrap="nowrap">
                <Text size="sm">{action}</Text>
                <Kbd>{key}</Kbd>
              </Group>
            ),
          )}
          <Divider mt={4} />
          <Text size="xs" c="dimmed">
            Version {__APP_VERSION__}
          </Text>
        </Stack>
      </HoverCard.Dropdown>
    </HoverCard>
  );
}
