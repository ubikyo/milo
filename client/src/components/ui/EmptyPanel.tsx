import { Button, EmptyState } from "@mantine/core";
import { IconPlus } from "@tabler/icons-react";
import { PLUS_SIZE } from "../../themes/plus";
import type { ComponentType, ReactNode } from "react";

// Prompt screen, when there is nothing to show yet: projects, boards, lists,
// comments.
//
// This is Mantine's EmptyState, with the application's choices: a neutral badge
// behind the icon, filling the whole content area, and the add button when the
// screen has an action to offer. "fill" false for prompts housed in a frame,
// which size themselves to their content.
interface EmptyPanelProps {
  icon: ComponentType<{ size?: number; color?: string }>;
  message?: ReactNode;
  actionLabel?: string;
  onAction?: () => void;
  size?: "sm" | "md" | "lg";
  fill?: boolean;
  /** True when the screen reports a problem: the icon turns yellow. */
  warning?: boolean;
}

export default function EmptyPanel({
  icon: Icon,
  message,
  actionLabel,
  onAction,
  size = "lg",
  fill = true,
  warning = false,
}: EmptyPanelProps) {
  return (
    <EmptyState
      size={size}
      withIndicatorBackground
      icon={
        <Icon
          size={size === "lg" ? 22 : 16}
          color={warning ? "var(--mantine-color-yellow-5)" : undefined}
        />
      }
      // The message goes through "title": that is where Mantine renders it.
      // Without this line, the empty screen showed only an icon — the sentence
      // was received as a prop and thrown away.
      title={message}
      // Mantine's title is semi-bold (600): here the message reads like a
      // sentence, not a title. Its size does not follow "size" (Mantine goes up
      // to xl): same text size on all empty screens.
      styles={{ title: { fontWeight: 400, fontSize: "var(--mantine-font-size-md)" } }}
      // Vertically centered within the height it occupies.
      style={fill ? { flex: 1, minHeight: 0, justifyContent: "center" } : undefined}
    >
      {/* Some screens have nothing to offer here: no action, no button. */}
      {actionLabel && onAction && (
        <EmptyState.Actions>
          <Button color="teal" leftSection={<IconPlus size={PLUS_SIZE} />} onClick={onAction}>
            {actionLabel}
          </Button>
        </EmptyState.Actions>
      )}
    </EmptyState>
  );
}
