import { Button } from "@mantine/core";
import type { ButtonProps } from "@mantine/core";
import type { CSSProperties, ReactNode } from "react";
import { NEUTRAL_HOVER, NEUTRAL_TEXT } from "../../themes/colors";

// Le bouton « Fermer » de tous les tiroirs et de toutes les fenêtres : sans
// fond, d'un gris neutre au repos comme au survol. Le gris de Mantine tire sur
// le bleu ; celui-ci non, et il est le même partout.

interface BoutonFermerProps extends Omit<ButtonProps, "variant" | "color"> {
  onClick?: () => void;
  /** « Fermer » par défaut. */
  children?: ReactNode;
}

export default function BoutonFermer({ children = "Fermer", style, ...props }: BoutonFermerProps) {
  return (
    <Button
      variant="subtle"
      color="gray"
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
