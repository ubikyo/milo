import {
  ActionIcon,
  Checkbox,
  Group,
  Popover,
  ScrollArea,
  Stack,
  Text,
  UnstyledButton,
} from "@mantine/core";
import { IconPlus } from "@tabler/icons-react";
import { useState } from "react";
import { PLUS_SIZE } from "../../themes/plus";

// Au-delà de cette hauteur, la liste défile plutôt que de courir jusqu'en bas
// de l'écran.
const LIST_MAX_HEIGHT = 260;

/**
 * Choix multiple montré en vignettes : un titre, sous lui ce qui est retenu,
 * puis un « + ». Le « + » comme n'importe quelle vignette déjà posée ouvrent la
 * même liste, où l'on coche et décoche. La liste s'aligne sur le bord gauche du
 * titre, et non sur le bouton qui l'ouvre : elle part toujours du même point,
 * quel que soit le nombre de vignettes.
 *
 * `options` : [{ id, ... }], `value` : les identifiants retenus, en chaînes.
 * `render` dessine une option dans la liste. `renderChip` la dessine une fois
 * retenue, lorsqu'elle s'y montre autrement : un membre n'y garde que sa
 * bulle, quand la liste, elle, doit nommer les personnes.
 */
export default function ChipPicker({
  label,
  options,
  value,
  onChange,
  render,
  renderChip = render,
  emptyText,
  // Hauteur des vignettes : le « + » s'y aligne, pour que la ligne soit d'un
  // seul tenant.
  chipHeight = 22,
  // Écart entre deux vignettes voisines, en pixels. Les bulles des membres se
  // serrent ; les étiquettes, qui portent du texte, respirent davantage.
  chipGap = 6,
  // Posé sous la liste, en dehors de son défilement : les étiquettes y mettent
  // de quoi en ajouter une.
  footer,
  // Si fourni, cliquer une option fait ceci au lieu de la cocher ; la case,
  // elle, continue de sélectionner. Les étiquettes s'y modifient.
  onOptionClick,
  // L'option occupe alors toute la largeur de la liste.
  fullWidthOptions = false,
  // Le « + » prend la forme de ce qu'il ajoute : rond pour des bulles, aux
  // angles à peine cassés pour des étiquettes.
  plusRadius = "xl",
  // Appelé quand la liste se referme. Ce qu'elle contenait disparaît avec
  // elle : une saisie en cours n'a plus d'occasion de se conclure, c'est ici
  // qu'elle se valide.
  onClose,
  // Tant que ceci est vrai, la liste refuse de se refermer. Une fenêtre de
  // confirmation ouverte par-dessus est un clic « au dehors » : sans cela, la
  // liste s'en irait, et l'on reviendrait à la carte une fois la fenêtre
  // fermée.
  closeBlocked = false,
}) {
  const [opened, setOpened] = useState(false);

  const ouvrirFermer = (ouvert) => {
    if (!ouvert && closeBlocked) return;
    setOpened(ouvert);
    if (!ouvert) onClose?.();
  };

  const retenues = value
    .map((id) => options.find((o) => String(o.id) === String(id)))
    .filter(Boolean);

  const bascule = (id) => {
    const cle = String(id);
    onChange(
      value.includes(cle) ? value.filter((v) => v !== cle) : [...value, cle],
    );
  };

  return (
    <Popover
      opened={opened}
      onChange={ouvrirFermer}
      position="bottom-start"
      // Pas de portail : ce choix s'ouvre dans un tiroir, dont le piège à focus
      // ne laisse pas la main à ce qui est sorti hors de lui — un champ de
      // saisie posé dans la liste n'aurait jamais pu être rempli. Resté sur
      // place, il est bien dans le tiroir ; « fixed » le tient hors d'atteinte
      // du défilement qui l'entoure.
      withinPortal={false}
      floatingStrategy="fixed"
      shadow="md"
      // L'ancre est le bloc entier : la liste tombe donc sous le titre.
      width={260}
    >
      <Popover.Target>
        {/* La colonne borne la largeur : les vignettes s'y rangent, et
            reprennent à la ligne quand la place manque. */}
        <div style={{ minWidth: 0 }}>
          <Text size="sm" fw={500} mb={6}>
            {label}
          </Text>
          <Group gap={chipGap} align="center" wrap="wrap">
            {retenues.map((option) => (
              // Cliquer une vignette rouvre la même liste : on ajoute et on
              // retire au même endroit.
              <UnstyledButton
                key={option.id}
                onClick={() => ouvrirFermer(!opened)}
                // Jamais comprimée : trop à l'étroit, la vignette descend à la
                // ligne suivante plutôt que de s'écraser.
                style={{
                  display: "inline-flex",
                  maxWidth: "100%",
                  flexShrink: 0,
                }}
              >
                {renderChip(option)}
              </UnstyledButton>
            ))}
            <ActionIcon
              variant="default"
              size={chipHeight}
              radius={plusRadius}
              style={{ flexShrink: 0 }}
              onClick={() => ouvrirFermer(!opened)}
              aria-label={`Choisir : ${label}`}
            >
              <IconPlus size={PLUS_SIZE} />
            </ActionIcon>
          </Group>
        </div>
      </Popover.Target>

      <Popover.Dropdown p={6}>
        {options.length === 0 ? (
          <Text size="sm" c="dimmed" p="xs">
            {emptyText}
          </Text>
        ) : (
          <ScrollArea.Autosize mah={LIST_MAX_HEIGHT} type="auto">
            <Stack gap={2}>
              {options.map((option) =>
                // Deux mises en page. Sans rôle propre au clic, l'élément est
                // le libellé de la case : cliquer l'un ou l'autre coche. Avec
                // un rôle propre (les étiquettes se modifient), l'élément vit à
                // côté de la case et garde ses propres clics — un champ de
                // saisie logé dans un libellé de case ne se laisserait ni
                // remplir ni sélectionner.
                onOptionClick ? (
                  <Group
                    key={option.id}
                    gap={8}
                    wrap="nowrap"
                    align="center"
                    p={4}
                  >
                    <Checkbox
                      checked={value.includes(String(option.id))}
                      onChange={() => bascule(option.id)}
                      size="xs"
                      styles={{ input: { cursor: "pointer" } }}
                      aria-label={option.name}
                    />
                    <div
                      onClick={() => onOptionClick(option)}
                      style={{
                        flex: fullWidthOptions ? 1 : undefined,
                        minWidth: 0,
                      }}
                    >
                      {render(option)}
                    </div>
                  </Group>
                ) : (
                  <Checkbox
                    key={option.id}
                    checked={value.includes(String(option.id))}
                    onChange={() => bascule(option.id)}
                    label={render(option)}
                    size="xs"
                    styles={{
                      body: { alignItems: "center" },
                      labelWrapper: { minWidth: 0 },
                      label: { cursor: "pointer", paddingLeft: 8, minWidth: 0 },
                      input: { cursor: "pointer" },
                    }}
                    p={4}
                  />
                ),
              )}
            </Stack>
          </ScrollArea.Autosize>
        )}

        {footer}
      </Popover.Dropdown>
    </Popover>
  );
}
