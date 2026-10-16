import { Button, type ButtonProps } from "@mantine/core";
import { IconPlus } from "@tabler/icons-react";
import { useState } from "react";
import { ADD_ACTION, darker } from "../../themes/colors";
import { PLUS_SIZE } from "../../themes/plus";

// "Add" action placed at the end of a list: a green label without background, a
// darker tone on hover. Used at the bottom of the projects table as well as at the end of
// the Task mode's row of lists. A window that has its own look for it — the
// Settings ("Lien +") — sets its color, size and weight (--milo-add-link-*).
interface AddButtonProps extends ButtonProps {
  label: string;
  onClick: () => void;
}

export default function AddButton({ label, onClick, ...props }: AddButtonProps) {
  const [hovered, setHovered] = useState(false);

  return (
    <Button
      variant="transparent"
      size="xs"
      justify="flex-start"
      // No inner margin: the "+" aligns with the content that precedes it.
      px={0}
      c={
        props.disabled
          ? "var(--mantine-color-dimmed)"
          : hovered
            ? // A tone darker than its color — the window's own one included.
              darker(`var(--milo-add-link-color, ${ADD_ACTION.color})`)
            : `var(--milo-add-link-color, ${ADD_ACTION.color})`
      }
      fz="var(--milo-add-link-size, var(--mantine-font-size-xs))"
      fw="var(--milo-add-link-weight, 600)"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      leftSection={<IconPlus size={PLUS_SIZE} />}
      data-add-link
      onClick={onClick}
      {...props}
      // Disabled, it only fades: Mantine would give it a gray background.
      styles={{ root: { backgroundColor: "transparent" } }}
    >
      {label}
    </Button>
  );
}
