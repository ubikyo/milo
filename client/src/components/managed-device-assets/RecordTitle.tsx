import { Title } from "@mantine/core";
import type { ReactNode } from "react";

/** The gap between a record title and what it introduces: cards or grid. */
export const SPACE_BELOW_TITLE = 10;

/**
 * A workstation record title — the Summary one, those of the sections of the
 * other tabs —, like a category of the Access mode: white, size 18. A
 * collapsed section has it like the rest of the text: gray, at its size and
 * weight.
 */
export default function RecordTitle({
  children,
  collapsed = false,
}: {
  children: ReactNode;
  collapsed?: boolean;
}) {
  return (
    <Title
      order={1}
      size={collapsed ? "sm" : 18}
      c={collapsed ? "dimmed" : "var(--mantine-color-white)"}
      fw={collapsed ? 400 : undefined}
    >
      {children}
    </Title>
  );
}
