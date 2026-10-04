import { Button, type ButtonProps } from "@mantine/core";
import { IconPlus } from "@tabler/icons-react";
import { useState } from "react";
import { ADD_ACTION } from "../../themes/colors";
import { PLUS_SIZE } from "../../themes/plus";

// "Add" action placed at the end of a list: a green label without background, a
// darker tone on hover. Used at the bottom of the projects table as well as at the end of
// the Task mode's row of lists.
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
      c={hovered ? ADD_ACTION.hover : ADD_ACTION.color}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      leftSection={<IconPlus size={PLUS_SIZE} />}
      onClick={onClick}
      {...props}
    >
      {label}
    </Button>
  );
}
