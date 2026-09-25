import { Button } from "@mantine/core";
import { IconPlus } from "@tabler/icons-react";
import { useState } from "react";
import { ADD_ACTION } from "../../themes/colors";
import { PLUS_SIZE } from "../../themes/plus";

// Action « ajouter » posée au bout d'une liste : un libellé vert sans fond, un
// ton plus foncé au survol. Sert en bas du tableau de projets comme au bout de
// la rangée de listes du mode Tâche.
export default function AddButton({ label, onClick, ...props }) {
  const [hovered, setHovered] = useState(false);

  return (
    <Button
      variant="transparent"
      size="xs"
      justify="flex-start"
      // Sans marge intérieure : le « + » s'aligne sur le contenu qui précède.
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
