import { ThemeIcon, UnstyledButton } from "@mantine/core";
import { IconPlus } from "@tabler/icons-react";

// La zone d'ajout d'une section : un cadre en pointillé gris, sans fond, qui
// occupe la hauteur restante de la colonne, et le « + » au centre dans une
// pastille verte. Elle se clique en entier — le bouton n'est qu'un repère
// visuel, pas une cible à viser.
interface SectionDropZoneProps {
  onClick: () => void;
}

// Hauteur minimale : une colonne vide doit rester une zone, pas un trait.
const MIN_HEIGHT = 120;

export default function SectionDropZone({ onClick }: SectionDropZoneProps) {
  return (
    <UnstyledButton
      onClick={onClick}
      aria-label="Ajouter un élément"
      style={{
        flex: 1,
        minHeight: MIN_HEIGHT,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        // Le filet de la rangée d'onglets, repris tel quel : ce sont les
        // valeurs que Mantine donne à « --tab-border-color », que les onglets
        // gardent pour eux — une nuance par thème.
        border: "1px dashed light-dark(var(--mantine-color-gray-3), var(--mantine-color-dark-4))",
        borderRadius: "var(--mantine-radius-md)",
        backgroundColor: "transparent",
      }}
    >
      <ThemeIcon radius="xl" size={44} color="teal">
        <IconPlus size={24} />
      </ThemeIcon>
    </UnstyledButton>
  );
}
