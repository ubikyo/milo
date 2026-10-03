import { Stack, Text, ThemeIcon, UnstyledButton } from "@mantine/core";
import { STRONG_TEXT } from "../../themes/colors";
import { IconPlus } from "@tabler/icons-react";
import { useLayoutEffect, useRef, useState } from "react";

// La zone d'ajout d'une section — du mode Accès ou d'un panneau des
// statistiques (SectionsBoard) : un cadre en pointillé, sans fond, qui occupe
// la hauteur restante, et le « + » au centre dans une pastille verte, avec
// « Ajouter un widget » dessous pour dire ce qu'il fait. Elle se
// clique en entier — le bouton n'est qu'un repère visuel, pas une cible à
// viser. Elle ouvre le tiroir des widgets.
//
// Elle ne se montre pas toujours. Une colonne qui porte déjà quelque chose n'a
// plus besoin d'invite : la zone s'efface, et ne revient que si la colonne se
// vide, ou le temps qu'on tienne un widget au-dessus — c'est alors elle qui
// le reçoit. Verrouillée, elle garde sa place mais ne se voit plus : la
// colonne ne change pas de hauteur pour autant.
interface SectionDropZoneProps {
  onClick: () => void;
  /** Vrai pendant qu'un widget est tenu au-dessus : la zone accueille. */
  accueille?: boolean;
  /** Vrai quand la catégorie est verrouillée : la zone occupe, mais ne se voit plus. */
  invisible?: boolean;
  /**
   * La colonne porte déjà son cadre en pointillé : la zone ne double pas le
   * trait, elle ne le montre que pour accueillir.
   */
  sansCadre?: boolean;
  onDragOver?: (event: React.DragEvent) => void;
  onDragLeave?: () => void;
  onDrop?: (event: React.DragEvent) => void;
}

/** Le gris du pointillé : le filet de la rangée d'onglets. Le cadre des colonnes le reprend. */
export const POINTILLE =
  "light-dark(var(--mantine-color-gray-3), var(--mantine-color-dark-4))";

// Hauteur minimale : une colonne vide doit rester une zone, pas un trait.
const MIN_HEIGHT = 120;

// L'air que le libellé laisse de chaque côté avant de céder la place.
const MARGE_LIBELLE = 8;

export default function SectionDropZone({
  onClick,
  accueille = false,
  invisible = false,
  sansCadre = false,
  onDragOver,
  onDragLeave,
  onDrop,
}: SectionDropZoneProps) {
  // Le libellé tient sur une ligne, ou ne se montre pas : une colonne
  // étroite ne garde que le « + ». Il reste posé, mais hors du flux, pour
  // qu'on mesure toujours sa largeur.
  const zone = useRef<HTMLButtonElement>(null);
  const libelle = useRef<HTMLParagraphElement>(null);
  const [tient, setTient] = useState(true);
  useLayoutEffect(() => {
    const element = zone.current;
    if (!element) return;
    const mesurer = () =>
      setTient((libelle.current?.scrollWidth ?? 0) <= element.clientWidth - 2 * MARGE_LIBELLE);
    mesurer();
    const observateur = new ResizeObserver(mesurer);
    observateur.observe(element);
    return () => observateur.disconnect();
  }, []);

  return (
    <UnstyledButton
      ref={zone}
      onClick={onClick}
      aria-label="Ajouter un widget"
      disabled={invisible}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      style={{
        flex: 1,
        minHeight: MIN_HEIGHT,
        // Le libellé mis de côté ne déborde pas de la zone.
        position: "relative",
        overflow: "hidden",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        // Le filet de la rangée d'onglets, sauf pendant qu'on tient un élément
        // au-dessus : il passe alors au blanc, pour dire que c'est ici que ça
        // se pose.
        border: accueille
          ? "1px dashed var(--mantine-color-white)"
          : sansCadre
            ? "1px dashed transparent"
            : `1px dashed ${POINTILLE}`,
        borderRadius: "var(--mantine-radius-md)",
        backgroundColor: "transparent",
        // Verrouillée : plus rien ne se voit, mais la place reste tenue.
        visibility: invisible ? "hidden" : "visible",
      }}
    >
      <Stack gap="xs" align="center">
        <ThemeIcon radius="xl" size={44} color="teal">
          <IconPlus size={24} />
        </ThemeIcon>
        <Text
          ref={libelle}
          size="sm"
          c={STRONG_TEXT}
          style={{
            whiteSpace: "nowrap",
            ...(tient ? {} : { position: "absolute", left: 0, top: 0, visibility: "hidden" }),
          }}
        >
          Ajouter un widget
        </Text>
      </Stack>
    </UnstyledButton>
  );
}
