import { Group, type GroupProps } from "@mantine/core";

// The bottom of every window and drawer ("Bas de page"): its actions —
// "Fermer", "Enregistrer"… — on the right, and what goes with them. The space
// above it is the themes' ("Paramétrage" > "Sections" > "Bas de page").

/** The space above the actions, set in the themes. */
const SPACE = "var(--milo-settings-footer-margin-top)";

export default function Footer({
  pinned = false,
  parentGap,
  ...props
}: GroupProps & {
  /** Pinned to the bottom of a drawer, whatever precedes: the space is then its padding. */
  pinned?: boolean;
  /**
   * The gap of the column holding it, taken off its margin: the space above
   * it is the themes', whatever the column.
   */
  parentGap?: string;
}) {
  const space = parentGap ? `calc(${SPACE} - ${parentGap})` : SPACE;
  return (
    <Group
      justify="flex-end"
      // The space between its buttons is the themes' ("Stack horizontal").
      gap="var(--milo-settings-hstack-gap)"
      data-footer
      {...(pinned ? { mt: "auto", pt: space } : { mt: space })}
      {...props}
    />
  );
}
