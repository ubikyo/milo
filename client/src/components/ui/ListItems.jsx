import { Box, Group, Paper, ScrollArea, TextInput } from "@mantine/core";
import { IconPlus } from "@tabler/icons-react";
import { PLUS_GAP, PLUS_SIZE } from "../../themes/plus";
import { useState } from "react";
import EmptyPanel from "./EmptyPanel.jsx";

// Hauteur d'une ligne : le libellé, son champ d'édition et les icônes s'y
// logent sans cadre ni carte.
export const ROW_HEIGHT = 28;

// Nombre de lignes visibles avant que la liste ne défile dans son cadre,
// plutôt que d'occuper toute la hauteur de l'écran qui l'accueille. Chaque
// liste peut relever ou abaisser ce plafond (« maxRows »). Il vaut un multiple
// exact de la hauteur d'une ligne, et la liste n'a aucun retrait intérieur :
// sans quoi la dernière ligne visible serait coupée par le plafond.

// Fond et filets des champs de saisie de Mantine : la liste se lit comme un
// champ, on y ajoute et on y modifie des valeurs.
const FIELD_BG = "light-dark(var(--mantine-color-white), var(--mantine-color-dark-6))";
const FIELD_LINE = "1px solid var(--mantine-color-default-border)";

// Fond de la ligne survolée : un cran au-dessus du fond du champ, pour situer
// la ligne sur laquelle portent les icônes.
const ROW_HOVER_BG = "light-dark(var(--mantine-color-gray-1), var(--mantine-color-dark-5))";

// Barre de défilement fine, collée au bord droit du cadre.
const SCROLLBAR_SIZE = 2;

/**
 * Une ligne de la liste. Elle suit son propre survol et le passe à son contenu,
 * qui peut alors ne montrer ses icônes que sur la ligne en cours : l'appelant
 * n'a pas à savoir quelle ligne est active.
 *
 * Le contenu est une fonction : `{(active) => …}`.
 */
function Row({ height = ROW_HEIGHT, children }) {
  const [active, setActive] = useState(false);

  return (
    <Group
      gap="xs"
      wrap="nowrap"
      h={height}
      px="xs"
      // Jamais comprimée : dans un cadre trop court, les lignes garderaient
      // leur hauteur plutôt que de s'écraser.
      style={{ flexShrink: 0, backgroundColor: active ? ROW_HOVER_BG : undefined }}
      onMouseEnter={() => setActive(true)}
      onMouseLeave={() => setActive(false)}
      onFocusCapture={() => setActive(true)}
      onBlurCapture={() => setActive(false)}
    >
      {typeof children === "function" ? children(active) : children}
    </Group>
  );
}

/**
 * Liste éditable en ligne, présentée comme un champ de saisie : un cadre autour
 * de l'ensemble, des lignes serrées qui défilent au-delà de quinze, et une
 * ligne d'ajout séparée par un filet, hors de la zone de défilement pour
 * rester visible.
 *
 * Sert aux sociétés, bâtiments et catégories (LookupManager) comme aux
 * utilisateurs (UsersTab).
 *
 * `add` décrit la ligne d'ajout : { placeholder, value, onChange, onSubmit,
 * onCancel, type, disabled, section, withPlus }. « section » se glisse avant le
 * champ : les étiquettes y posent le choix de leur couleur, et coupent alors le
 * « + » (withPlus: false) pour que leur pastille s'aligne sur celles des lignes
 * au-dessus.
 */
export default function ListItems({
  children,
  isEmpty,
  emptyIcon,
  emptyText,
  add,
  maxRows = 15,
  // Les lignes d'une même liste ont toutes la même hauteur : celle des
  // utilisateurs est plus haute, son plafond suit.
  rowHeight = ROW_HEIGHT,
}) {
  return (
    <Paper
      withBorder
      radius="sm"
      style={{ backgroundColor: FIELD_BG, overflow: "hidden", flexShrink: 0 }}
    >
      <ScrollArea mah={maxRows * rowHeight} type="always" scrollbarSize={SCROLLBAR_SIZE}>
        {isEmpty ? (
          // Liste vide : la même invite que les écrans vides de l'application,
          // sans action — l'ajout se fait dans la ligne juste en dessous.
          <Box py="md">
            <EmptyPanel icon={emptyIcon} message={emptyText} size="sm" fill={false} />
          </Box>
        ) : (
          children
        )}
      </ScrollArea>

      {add && (
        <Group
          // Sans le « + », la ligne d'ajout reprend l'écart des autres lignes :
          // ce qu'elle porte se range dans les mêmes colonnes.
          gap={add.withPlus === false ? "xs" : PLUS_GAP}
          wrap="nowrap"
          h={ROW_HEIGHT + 12}
          px="xs"
          style={{ borderTop: FIELD_LINE }}
        >
          {add.withPlus !== false && (
            <IconPlus size={PLUS_SIZE} style={{ flexShrink: 0, opacity: 0.5 }} />
          )}
          {add.section}
          <TextInput
            placeholder={add.placeholder}
            type={add.type}
            value={add.value}
            onChange={(e) => add.onChange(e.currentTarget.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") add.onSubmit();
              if (e.key === "Escape") add.onCancel?.();
            }}
            variant="unstyled"
            size="sm"
            style={{ flex: 1, minWidth: 0 }}
            disabled={add.disabled}
            aria-label={add.placeholder}
          />
        </Group>
      )}
    </Paper>
  );
}

ListItems.Row = Row;
