import {
  ActionIcon,
  Checkbox,
  Group,
  Input,
  Popover,
  ScrollArea,
  Stack,
  Text,
  UnstyledButton,
} from "@mantine/core";
import { IconPlus } from "@tabler/icons-react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { PLUS_SIZE } from "../../themes/plus";
import type { FloatingPosition } from "@mantine/core";
import type { ReactNode } from "react";

// Le temps laissé au second clic d'un double clic avant que le premier ne
// coche l'option.
const DELAI_DOUBLE_CLIC = 250;

/** Le minimum qu'une option doit porter : de quoi l'identifier et la nommer. */
export interface ChipOption {
  id: number | string;
  name: string;
}

// Au-delà de ce nombre de lignes, la liste défile plutôt que de courir jusqu'en
// bas de l'écran. Les lignes n'ont pas toutes la même hauteur — un nom seul, un
// nom et son adresse : la hauteur se mesure sur la dixième, marquée comme les
// autres de « data-ligne ».
const LIGNES_VISIBLES = 10;

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
interface ChipPickerProps<T extends ChipOption> {
  label: string;
  options: T[];
  /** Les identifiants retenus, en chaînes. */
  value: string[];
  onChange: (value: string[]) => void;
  render: (option: T) => ReactNode;
  renderChip?: (option: T) => ReactNode;
  emptyText?: string;
  chipHeight?: number;
  chipGap?: number;
  footer?: ReactNode;
  /**
   * Des lignes ajoutées sous les options, dans leur défilement : les personnes
   * trouvées dans l'annuaire. Chacune porte « data-ligne » pour compter.
   */
  listFooter?: ReactNode;
  onOptionClick?: (option: T) => void;
  fullWidthOptions?: boolean;
  plusRadius?: string | number;
  onClose?: () => void;
  closeBlocked?: boolean;
  /**
   * Des vignettes posées devant les autres, qui ne se choisissent pas : un
   * fait plutôt qu'un choix — l'expéditeur d'une demande reçue par e-mail.
   */
  leadingChips?: ReactNode;
  /**
   * Ce que la liste montre, quand ce n'est pas toutes les options : une liste
   * filtrée par une recherche, ou réordonnée. Les vignettes, elles, se lisent
   * toujours dans `options` — une option retenue ne disparaît pas parce que la
   * recherche l'écarte.
   */
  listOptions?: T[];
  /** Posé au-dessus de la liste, hors de son défilement : un champ de recherche. */
  header?: ReactNode;
  /** La largeur de la liste, en pixels. */
  dropdownWidth?: number;
  /** Un filet sous chaque option : des lignes sur deux niveaux s'y lisent mieux. */
  separated?: boolean;
  /**
   * Remplace le titre, les vignettes et le « + » : un déclencheur compact, pour
   * une ligne déjà remplie — les membres d'un élément de checklist. Le titre
   * ne sert plus alors qu'à le nommer.
   */
  target?: ReactNode;
  /** Où s'ouvre la liste ; sous le bord gauche du titre par défaut. */
  position?: FloatingPosition;
}

export default function ChipPicker<T extends ChipOption>({
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
  listFooter,
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
  leadingChips,
  listOptions = options,
  header,
  dropdownWidth = 260,
  separated = false,
  target,
  position = "bottom-start",
}: ChipPickerProps<T>) {
  // Séparées, les options courent d'un bord à l'autre de la liste, et leur
  // filet aussi ; la dernière n'en a pas — il n'y a rien à séparer dessous.
  const filet = (rang: number) =>
    separated && rang < listOptions.length - 1
      ? { borderBottom: "1px solid var(--mantine-color-default-border)" }
      : undefined;
  const RETRAIT_SEPARE = 10;
  const [opened, setOpened] = useState(false);
  const contenuRef = useRef<HTMLDivElement>(null);
  const [hauteurMax, setHauteurMax] = useState<number | undefined>(undefined);

  // Mesurée à chaque rendu, la liste ouverte : une recherche, une réponse de
  // l'annuaire changent ses lignes. Avant d'être peinte, pour qu'elle ne
  // paraisse jamais toute déroulée. Sans dépendances, à dessein : la mesure ne
  // bouge pas avec la hauteur posée, la comparaison arrête donc la boucle au
  // second passage.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useLayoutEffect(() => {
    const contenu = contenuRef.current;
    if (!contenu) return;
    const lignes = contenu.querySelectorAll("[data-ligne]");
    const hauteur =
      lignes.length > LIGNES_VISIBLES
        ? Math.ceil(
            lignes[LIGNES_VISIBLES - 1]!.getBoundingClientRect().bottom -
              contenu.getBoundingClientRect().top,
          )
        : undefined;
    if (hauteur !== hauteurMax) setHauteurMax(hauteur);
  });

  const ouvrirFermer = (ouvert: boolean) => {
    if (!ouvert && closeBlocked) return;
    setOpened(ouvert);
    if (!ouvert) onClose?.();
  };

  const retenues = value
    .map((id) => options.find((o) => String(o.id) === String(id)))
    .filter((o): o is T => Boolean(o));

  // Le clic sur une option à rôle propre attend de savoir s'il est le premier
  // d'un double clic : sinon, ouvrir l'option la cocherait au passage.
  const clicEnAttente = useRef<ReturnType<typeof setTimeout> | null>(null);
  const oublierClic = () => {
    if (clicEnAttente.current) clearTimeout(clicEnAttente.current);
    clicEnAttente.current = null;
  };
  useEffect(() => oublierClic, []);

  const bascule = (id: number | string) => {
    const cle = String(id);
    onChange(
      value.includes(cle) ? value.filter((v) => v !== cle) : [...value, cle],
    );
  };

  return (
    <Popover
      opened={opened}
      onChange={ouvrirFermer}
      position={position}
      // Pas de portail : ce choix s'ouvre dans un tiroir, dont le piège à focus
      // ne laisse pas la main à ce qui est sorti hors de lui — un champ de
      // saisie posé dans la liste n'aurait jamais pu être rempli. Resté sur
      // place, il est bien dans le tiroir ; « fixed » le tient hors d'atteinte
      // du défilement qui l'entoure.
      withinPortal={false}
      floatingStrategy="fixed"
      shadow="md"
      // L'ancre est le bloc entier : la liste tombe donc sous le titre.
      width={dropdownWidth}
    >
      <Popover.Target>
        {target ? (
          <UnstyledButton
            onClick={() => ouvrirFermer(!opened)}
            style={{
              display: "inline-flex",
              alignItems: "center",
              flexShrink: 0,
            }}
            aria-label={label}
          >
            {target}
          </UnstyledButton>
        ) : (
          // La colonne borne la largeur : les vignettes s'y rangent, et
          // reprennent à la ligne quand la place manque. Elle ne s'étend pas
          // au-delà d'elles : un clic sur le vide à leur droite est un clic au
          // dehors, qui referme la liste — l'ancre, elle, n'en est jamais un.
          // Le titre et l'espace entre les vignettes la referment aussi.
          <div
            style={{ minWidth: 0, width: "fit-content", maxWidth: "100%" }}
            onClick={(e) => {
              if (opened && !(e.target as Element).closest("button"))
                ouvrirFermer(false);
            }}
          >
            <Input.Label>{label}</Input.Label>
            <Group gap={chipGap} align="center" wrap="wrap">
              {leadingChips}
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
        )}
      </Popover.Target>

      <Popover.Dropdown p={separated ? 0 : 6}>
        {/* Séparées, les lignes le sont aussi de la recherche : un filet d'un
            bord à l'autre sous l'en-tête. */}
        {separated
          ? header && (
              <div
                style={{
                  padding: 6,
                  borderBottom: "1px solid var(--mantine-color-default-border)",
                }}
              >
                {header}
              </div>
            )
          : header}
        {/* Un texte vide ne dit rien : la place reste à ce qui suit la liste. */}
        {listOptions.length === 0 && emptyText && (
          <Text size="sm" c="dimmed" p="xs">
            {emptyText}
          </Text>
        )}
        {/* La barre fine des autres listes de l'application (ListItems). */}
        <ScrollArea.Autosize
          mah={hauteurMax}
          type="auto"
          scrollbars="y"
          scrollbarSize={2}
          // Le contenu d'une zone de défilement s'élargit d'ordinaire à son
          // texte (« min-width: min-content ») : une adresse longue repoussait
          // le bout de la ligne — l'origine de l'annuaire — hors de la liste.
          // Tenu à sa largeur, il tronque.
          styles={{ content: { display: "block", minWidth: 0 } }}
        >
          <div ref={contenuRef}>
            {listOptions.length > 0 && (
              <Stack gap={separated ? 0 : 2}>
                {listOptions.map((option, rang) =>
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
                      px={separated ? RETRAIT_SEPARE : 4}
                      py={separated ? 8 : 4}
                      style={filet(rang)}
                      data-ligne
                    >
                      <Checkbox
                        checked={value.includes(String(option.id))}
                        onChange={() => bascule(option.id)}
                        size="xs"
                        styles={{ input: { cursor: "pointer" } }}
                        aria-label={option.name}
                      />
                      {/* Un clic coche, comme sur la case ; un double clic
                          ouvre le rôle propre sans rien cocher. */}
                      <div
                        onClick={(e) => {
                          oublierClic();
                          if (e.detail > 1) return;
                          clicEnAttente.current = setTimeout(() => {
                            clicEnAttente.current = null;
                            bascule(option.id);
                          }, DELAI_DOUBLE_CLIC);
                        }}
                        onDoubleClick={() => {
                          oublierClic();
                          onOptionClick(option);
                        }}
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
                        body: { alignItems: "center", width: "100%" },
                        labelWrapper: {
                          minWidth: 0,
                          flex: fullWidthOptions ? 1 : undefined,
                        },
                        label: {
                          cursor: "pointer",
                          paddingLeft: 8,
                          minWidth: 0,
                        },
                        input: { cursor: "pointer" },
                      }}
                      px={separated ? RETRAIT_SEPARE : 4}
                      py={separated ? 8 : 4}
                      style={filet(rang)}
                      // Le reste des attributs va à la case elle-même : la
                      // marque de ligne se pose sur son conteneur.
                      wrapperProps={{ "data-ligne": true }}
                    />
                  ),
                )}
              </Stack>
            )}
            {listFooter}
          </div>
        </ScrollArea.Autosize>

        {footer}
      </Popover.Dropdown>
    </Popover>
  );
}
