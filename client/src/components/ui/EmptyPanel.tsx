import { Button, Stack, Text } from "@mantine/core";
import { IconPlus } from "@tabler/icons-react";
import { PLUS_SIZE } from "../../themes/plus";
import type { ComponentType, ReactNode } from "react";
import classes from "../../assets/styles/EmptyPanel.module.css";

// Prompt screen, when there is nothing to show yet: projects, boards, lists,
// comments.
//
// The look of a drop zone's content (FileDropzone), without its border: a bare
// thin icon over a dimmed sentence, filling the whole content area, and the add
// button when the screen has an action to offer. On a page, outside a drawer or
// a modal, both are 20% larger (EmptyPanel.module.css). "fill" false for prompts
// housed in a frame, which size themselves to their content.
interface EmptyPanelProps {
  icon: ComponentType<{ size?: number; stroke?: number; color?: string; className?: string }>;
  message?: ReactNode;
  actionLabel?: string;
  onAction?: () => void;
  /** The action button's icon: "+" by default, the screens adding something. */
  actionIcon?: ComponentType<{ size?: number }>;
  fill?: boolean;
  /** True when the screen reports a problem: the icon turns yellow. */
  warning?: boolean;
}

export default function EmptyPanel({
  icon: Icon,
  message,
  actionLabel,
  onAction,
  actionIcon: ActionIcon = IconPlus,
  fill = true,
  warning = false,
}: EmptyPanelProps) {
  return (
    <Stack
      align="center"
      gap={6}
      py="md"
      // Vertically centered within the height it occupies.
      justify="center"
      style={fill ? { flex: 1, minHeight: 0 } : undefined}
    >
      <Icon
        className={classes.icon}
        size={22}
        stroke={1.5}
        color={warning ? "var(--mantine-color-yellow-5)" : undefined}
      />
      {message && (
        <Text className={classes.message} c="dimmed" ta="center">
          {message}
        </Text>
      )}
      {/* Some screens have nothing to offer here: no action, no button. */}
      {actionLabel && onAction && (
        <Button
          mt="sm"
          color="teal"
          leftSection={<ActionIcon size={PLUS_SIZE} />}
          onClick={onAction}
        >
          {actionLabel}
        </Button>
      )}
    </Stack>
  );
}
