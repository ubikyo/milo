import {
  ActionIcon,
  Box,
  Group,
  Menu,
  ScrollArea,
  Paper,
  TextInput,
} from "@mantine/core";
import { IconCornerDownLeft } from "@tabler/icons-react";
import { useState } from "react";
import { createPortal } from "react-dom";
import { RED } from "../../themes/colors";
import EmptyPanel from "./EmptyPanel";
import type { ComponentType, MouseEvent, ReactNode } from "react";

// Hauteur d'une ligne : le libellé et son champ d'édition s'y logent sans
// cadre ni carte.
export const ROW_HEIGHT = 34;

// La ligne d'ajout, un peu plus haute que les autres : c'est un champ.
export const ADD_ROW_HEIGHT = ROW_HEIGHT + 6;

// Le retrait des lignes à gauche et à droite : l'espacement « xs » de Mantine.
export const ROW_PADDING = 10;

// Nombre de lignes visibles avant que la liste ne défile dans son cadre,
// plutôt que d'occuper toute la hauteur de l'écran qui l'accueille. Chaque
// liste peut relever ou abaisser ce plafond (« maxRows »). Il vaut un multiple
// exact de la hauteur d'une ligne, et la liste n'a aucun retrait intérieur :
// sans quoi la dernière ligne visible serait coupée par le plafond.

// Fond et filet des champs de saisie de Mantine : la liste se lit comme un
// champ, on y ajoute et on y modifie des valeurs.
const FIELD_BG =
  "light-dark(var(--mantine-color-white), var(--mantine-color-dark-6))";
const FIELD_LINE = "1px solid var(--mantine-color-default-border)";

// Fond de la ligne survolée : un cran au-dessus du fond du champ, pour situer
// la ligne sur laquelle porte le menu.
const ROW_HOVER_BG =
  "light-dark(var(--mantine-color-gray-1), var(--mantine-color-dark-5))";

// Taille du symbole Entrée au bout de la ligne d'ajout : celle du « + » des
// actions d'ajout (themes/plus.ts), qu'il remplace ici.
const ENTER_SIZE = 14;

// Barre de défilement fine, collée au bord droit du cadre.
const SCROLLBAR_SIZE = 2;

/**
 * Un geste du menu d'une ligne. « danger » le range en bas, après un filet,
 * en rouge : la suppression.
 */
export interface RowAction {
  label: string;
  icon: ComponentType<{ size?: number }>;
  onClick: () => void;
  danger?: boolean;
}

/**
 * Une ligne de la liste. Ses gestes (`actions`) ne s'affichent pas : ils
 * s'ouvrent au clic droit, en menu posé sous la souris — comme celui des
 * projets (ProjectTable). La touche « Menu » du clavier l'ouvre aussi, au
 * bout droit de la ligne.
 *
 * La ligne suit son survol et le passe à son contenu (`{(active) => …}`) ;
 * elle reste « active » tant que son menu est ouvert, sinon le menu
 * flotterait sans qu'on sache sur quelle ligne il porte.
 */
interface RowProps {
  height?: number;
  /** Le retrait droit, s'il diffère de celui de gauche : voir LookupManager. */
  paddingRight?: number;
  actions?: RowAction[];
  /** Soit un contenu, soit une fonction qui reçoit le survol de sa ligne. */
  children: ReactNode | ((active: boolean) => ReactNode);
}

function Row({
  height = ROW_HEIGHT,
  paddingRight,
  actions,
  children,
}: RowProps) {
  const [survol, setSurvol] = useState(false);
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  const active = survol || menu !== null;

  const ouvrirMenu = (e: MouseEvent<HTMLDivElement>) => {
    if (!actions?.length) return;
    e.preventDefault();
    // Depuis le clavier, l'événement n'a pas de position : le menu se pose
    // au bout droit de la ligne.
    if (e.clientX === 0 && e.clientY === 0) {
      const r = e.currentTarget.getBoundingClientRect();
      setMenu({ x: r.right - ROW_PADDING, y: r.bottom });
    } else {
      setMenu({ x: e.clientX, y: e.clientY });
    }
  };

  const gestes = actions?.filter((a) => !a.danger) ?? [];
  const dangers = actions?.filter((a) => a.danger) ?? [];
  const item = ({ label, icon: Icon, onClick, danger }: RowAction) => (
    <Menu.Item
      key={label}
      color={danger ? RED : undefined}
      leftSection={<Icon size={16} />}
      onClick={onClick}
    >
      {label}
    </Menu.Item>
  );

  return (
    <Group
      gap="xs"
      wrap="nowrap"
      h={height}
      px="xs"
      pr={paddingRight}
      // Jamais comprimée : dans un cadre trop court, les lignes garderaient
      // leur hauteur plutôt que de s'écraser.
      style={{
        flexShrink: 0,
        backgroundColor: active ? ROW_HOVER_BG : undefined,
      }}
      onMouseEnter={() => setSurvol(true)}
      onMouseLeave={() => setSurvol(false)}
      onFocusCapture={() => setSurvol(true)}
      onBlurCapture={() => setSurvol(false)}
      onContextMenu={ouvrirMenu}
    >
      {typeof children === "function" ? children(active) : children}

      {/* L'ancre, un point invisible au lieu du clic, est portée hors de la
          fenêtre : dans une modale, la transformation de son contenu
          fausserait la position « fixed ». */}
      {menu &&
        createPortal(
          <Menu
            opened
            onChange={(ouvert) => !ouvert && setMenu(null)}
            position="bottom-start"
            withinPortal
            shadow="md"
          >
            <Menu.Target>
              <div
                style={{
                  position: "fixed",
                  left: menu.x,
                  top: menu.y,
                  width: 1,
                  height: 1,
                }}
              />
            </Menu.Target>
            <Menu.Dropdown>
              {gestes.map(item)}
              {gestes.length > 0 && dangers.length > 0 && <Menu.Divider />}
              {dangers.map(item)}
            </Menu.Dropdown>
          </Menu>,
          document.body,
        )}
    </Group>
  );
}

/**
 * Liste éditable en ligne, sur le fond d'un champ de saisie mais sans cadre :
 * des lignes serrées qui défilent au-delà de quinze, et une ligne d'ajout
 * séparée par un filet, hors de la zone de défilement pour rester visible.
 *
 * Sert aux sociétés et aux catégories (LookupManager) comme aux
 * utilisateurs (UsersTab).
 *
 * `add` décrit la ligne d'ajout : { placeholder, value, onChange, onSubmit,
 * onCancel, type, disabled, section }. « section » se glisse avant le champ :
 * les étiquettes y posent le choix de leur couleur, les jalons leur
 * pourcentage. Au bout de la ligne, le symbole de la touche Entrée dit comment
 * on valide.
 */
/** La ligne d'ajout, en bas de la liste. */
export interface AddRow {
  placeholder: string;
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  onCancel?: () => void;
  type?: string;
  disabled?: boolean;
  /** Se glisse avant le champ : les étiquettes y posent leur couleur. */
  section?: ReactNode;
  /**
   * Se glisse après le champ, avant Entrée : l'évènement d'une réponse par
   * défaut, à la place qu'occupe le sien sur les lignes.
   */
  end?: ReactNode;
}

interface ListItemsProps {
  children?: ReactNode;
  isEmpty?: boolean;
  /** Sans elle, la liste n'a pas d'état vide : celle des comptes en a toujours un. */
  emptyIcon?: ComponentType<{ size?: number }>;
  emptyText?: ReactNode;
  /**
   * La ligne d'ajout : un champ de texte validé par Entrée (AddRow), ou un
   * champ fourni tel quel — la recherche dans l'annuaire, par exemple, qui
   * ajoute dès qu'on choisit.
   */
  add?: AddRow | { input: ReactNode };
  maxRows?: number;
  /** Hauteur réservée même quand la liste est plus courte, en lignes. */
  minRows?: number;
  rowHeight?: number;
}

export default function ListItems({
  children,
  isEmpty,
  emptyIcon,
  emptyText,
  add,
  maxRows = 15,
  minRows,
  // Les lignes d'une même liste ont toutes la même hauteur : celle des
  // utilisateurs est plus haute, son plafond suit.
  rowHeight = ROW_HEIGHT,
}: ListItemsProps) {
  return (
    // Le fond d'un champ de saisie, sans cadre : seul un filet sépare la
    // ligne d'ajout des autres.
    <Paper
      radius="sm"
      style={{ backgroundColor: FIELD_BG, overflow: "hidden", flexShrink: 0 }}
    >
      {/* « Autosize » et non une zone simple : bornée par un simple
          « max-height », celle-ci ne défilait pas — sa zone intérieure, haute
          de 100 % d'une hauteur qui n'était pas fixée, s'allongeait avec le
          contenu. La barre court le long des lignes, à droite, dès qu'elles
          dépassent le plafond. */}
      <ScrollArea.Autosize
        mah={maxRows * rowHeight}
        mih={minRows && minRows * rowHeight}
        type="auto"
        scrollbars="y"
        scrollbarSize={SCROLLBAR_SIZE}
      >
        {isEmpty && emptyIcon ? (
          // Liste vide : la même invite que les écrans vides de l'application,
          // sans action — l'ajout se fait dans la ligne juste en dessous.
          <Box
            py="md"
            mih={minRows && minRows * rowHeight}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <EmptyPanel
              icon={emptyIcon}
              message={emptyText}
              size="sm"
              fill={false}
            />
          </Box>
        ) : (
          children
        )}
      </ScrollArea.Autosize>

      {add && (
        <Group
          // La ligne d'ajout reprend l'écart des autres lignes : ce qu'elle
          // porte se range dans les mêmes colonnes.
          gap="xs"
          wrap="nowrap"
          h={ADD_ROW_HEIGHT}
          px={ROW_PADDING}
          style={{ borderTop: FIELD_LINE }}
        >
          {"input" in add ? (
            add.input
          ) : (
            <>
              {add.section}
              <TextInput
                placeholder={add.placeholder}
                type={add.type}
                value={add.value}
                onChange={(e) => add.onChange(e.currentTarget.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    add.onSubmit();
                  }
                  if (e.key === "Escape") add.onCancel?.();
                }}
                variant="unstyled"
                size="sm"
                style={{ flex: 1, minWidth: 0 }}
                disabled={add.disabled}
                aria-label={add.placeholder}
              />
              {add.end}
              {/* Au bout, la touche qui valide : Entrée ajoute. Elle se clique
              aussi, pour qui préfère la souris. */}
              <ActionIcon
                variant="subtle"
                color="gray"
                size="sm"
                onClick={add.onSubmit}
                disabled={add.disabled}
                style={{ flexShrink: 0, opacity: 0.5 }}
                aria-label={`Ajouter (${add.placeholder})`}
              >
                <IconCornerDownLeft size={ENTER_SIZE} />
              </ActionIcon>
            </>
          )}
        </Group>
      )}
    </Paper>
  );
}

ListItems.Row = Row;
