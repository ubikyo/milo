import { ColorSwatch, Popover, SimpleGrid } from "@mantine/core";
import { useState } from "react";
import { LABEL_COLORS, LABEL_HUES } from "@milo/shared";
import { useLabelColors } from "./LabelChip";

// La pastille qui ouvre le choix des couleurs d'une étiquette. Les couleurs se
// passent d'intitulé : une couleur se reconnaît.
// « withinPortal » est à couper lorsque la pastille vit déjà dans un autre
// panneau flottant : sorti en portail, son choix de couleurs compterait comme
// un clic au dehors et refermerait le panneau qui la porte.
interface LabelColorPickerProps {
  color: string;
  onChange: (color: string) => void;
  label: string;
  withinPortal?: boolean;
}

export default function LabelColorPicker({
  color,
  onChange,
  label,
  withinPortal = true,
}: LabelColorPickerProps) {
  const [opened, setOpened] = useState(false);
  const couleurs = useLabelColors();

  return (
    <Popover
      opened={opened}
      onChange={setOpened}
      position="bottom-start"
      withinPortal={withinPortal}
      // Restée sur place, la palette se ferait rogner par le défilement de la
      // liste qui la porte : « fixed » la sort de ce découpage sans la sortir
      // du panneau, dont elle doit rester un morceau.
      floatingStrategy={withinPortal ? undefined : "fixed"}
      shadow="md"
    >
      <Popover.Target>
        <ColorSwatch
          component="button"
          type="button"
          color={couleurs(color).backgroundColor}
          size={18}
          // Le clic ouvre la palette et rien d'autre : la ligne qui porte la
          // pastille a son propre rôle au clic.
          onClick={(e) => {
            e.stopPropagation();
            setOpened((o) => !o);
          }}
          style={{ cursor: "pointer", flexShrink: 0, alignSelf: "center" }}
          aria-label={`Couleur de ${label}`}
        />
      </Popover.Target>
      <Popover.Dropdown p="xs">
        {/* Une matrice : chaque colonne une teinte, chaque ligne une nuance. */}
        <SimpleGrid cols={LABEL_HUES.length} spacing={4}>
          {LABEL_COLORS.map((c) => (
            <ColorSwatch
              key={c}
              component="button"
              type="button"
              color={couleurs(c).backgroundColor}
              size={20}
              onClick={() => {
                setOpened(false);
                onChange(c);
              }}
              style={{ cursor: "pointer" }}
              aria-label={c}
            />
          ))}
        </SimpleGrid>
      </Popover.Dropdown>
    </Popover>
  );
}
