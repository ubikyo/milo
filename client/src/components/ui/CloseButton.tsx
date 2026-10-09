import { Button } from "@mantine/core";
import type { ButtonProps } from "@mantine/core";
import type { CSSProperties, ReactNode } from "react";
import { NEUTRAL_HOVER, NEUTRAL_TEXT } from "../../themes/colors";

// The "Fermer" button of every drawer and window: no background, a neutral gray
// at rest and on hover. Mantine's gray leans blue; this one does not, and it is
// the same everywhere.

interface CloseButtonProps extends Omit<ButtonProps, "variant" | "color"> {
  onClick?: () => void;
  /** "Fermer" by default. */
  children?: ReactNode;
}

export default function CloseButton({ children = "Fermer", style, ...props }: CloseButtonProps) {
  return (
    <Button
      variant="subtle"
      color="gray"
      // In a window, the themes' look ("Paramétrage" > "Boutons" > "Fermer").
      data-close-button
      {...props}
      style={
        {
          "--button-color": NEUTRAL_TEXT,
          "--button-hover": NEUTRAL_HOVER,
          ...(style as CSSProperties),
        } as CSSProperties
      }
    >
      {children}
    </Button>
  );
}
