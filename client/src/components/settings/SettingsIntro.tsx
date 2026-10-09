import { Text, type TextProps } from "@mantine/core";
import type { ReactNode } from "react";

// The text that introduces a tab of the Settings, under its title: its
// color, size, weight and the space under it are set in the themes
// ("Paramétrage" > "Description").

export default function SettingsIntro({
  children,
  parentGap,
  ...props
}: TextProps & {
  children: ReactNode;
  /**
   * The gap of the column holding it, taken off its margin: the space under
   * it is the themes' ("Description" > "Marge basse"), whatever the column.
   */
  parentGap?: string;
}) {
  const space = "var(--milo-settings-description-margin-bottom)";
  return (
    <Text
      c="var(--milo-settings-description-text)"
      // Its line height stays "sm"'s: a size given as a variable would
      // also become Mantine's line height.
      size="sm"
      fz="var(--milo-settings-description-size)"
      fw="var(--milo-settings-description-weight)"
      mb={parentGap ? `calc(${space} - ${parentGap})` : space}
      {...props}
    >
      {children}
    </Text>
  );
}
