import {
  Box,
  Divider,
  Group,
  HoverCard,
  Kbd,
  Stack,
  Text,
  UnstyledButton,
} from "@mantine/core";
import { useState } from "react";
import { useNewShortcutActions } from "../../lib/newShortcut";
import { PAGE_GUTTER } from "../../themes/layout";
import classes from "../../assets/styles/ShortcutsHelp.module.css";
import Logo from "./Logo";
import { HAS_UPDATES, openUpdates } from "./UpdatesModal";

// Action on the left, shortcut on the right. "when" limits a shortcut to the board
// where it acts: no next context without contexts, no switching between views
// or boards with fewer than two, no interface editing without a board. The
// "N" ones come first: those the list widgets shown declare (lib/newShortcut).
type Condition = "contexts" | "views" | "boards" | "board";

const SHORTCUTS: { action: string; key: string; when?: Condition }[] = [
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
 * on it, the line that opens the updates under them. What the open board holds: contexts; whether there are views, boards, to go
 * through — at least two —, and a board at all.
 */
export default function ShortcutsHelp({
  contexts,
  views,
  boards,
  board,
}: {
  contexts: boolean;
  views: boolean;
  boards: boolean;
  board: boolean;
}) {
  const holds: Record<Condition, boolean> = {
    contexts,
    views,
    boards,
    board,
  };
  const news = useNewShortcutActions().map((action) => ({ action, key: "N" }));
  const shown = [...news, ...SHORTCUTS.filter((s) => !s.when || holds[s.when])];
  // "Mises à jour" closes the bubble as it opens the window: the HoverCard,
  // which has no "opened" to set, is remounted closed.
  const [mount, setMount] = useState(0);
  const showUpdates = () => {
    setMount((m) => m + 1);
    openUpdates();
  };
  return (
    // Nothing to show: the logo stays, without its bubble.
    <HoverCard
      key={mount}
      position="top-end"
      withArrow
      shadow="md"
      openDelay={100}
      disabled={shown.length === 0 && !HAS_UPDATES}
    >
      <HoverCard.Target>
        <Box
          aria-label="Raccourcis clavier"
          h={TARGET_SIZE}
          // Its foot on the same line as the boards' bottom, at the bottom left
          // (BoardSwitch).
          style={{ ...CORNER, display: "flex", alignItems: "flex-end" }}
        >
          <Logo variant={2} h={LOGO_HEIGHT} />
        </Box>
      </HoverCard.Target>
      <HoverCard.Dropdown pb="calc(var(--mantine-spacing-md) - var(--mantine-spacing-xs))">
        <Stack gap={6} miw={220}>
          {shown.length > 0 && (
            <Text size="xs" fw={700} tt="uppercase" c="dimmed">
              Raccourcis clavier
            </Text>
          )}
          {shown.map(
            ({ action, key }) => (
              <Group key={action} justify="space-between" gap="xl" wrap="nowrap">
                <Text size="sm">{action}</Text>
                <Kbd>{key}</Kbd>
              </Group>
            ),
          )}
          {HAS_UPDATES && (
            <>
              {shown.length > 0 && <Divider mt={4} />}
              <UnstyledButton className={classes.updates} onClick={showUpdates}>
                <Text size="sm">Mises à jour</Text>
              </UnstyledButton>
            </>
          )}
        </Stack>
      </HoverCard.Dropdown>
    </HoverCard>
  );
}
