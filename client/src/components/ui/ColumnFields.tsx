import { Group, Input, Menu, NumberInput, Select, Stack } from "@mantine/core";
import { IconChevronDown, IconTrash } from "@tabler/icons-react";
import { useState } from "react";
import type { DragEvent } from "react";
import classes from "../../assets/styles/ColumnFields.module.css";
import { RED } from "../../themes/colors";
import { withField } from "../../widgets/types";
import type { IndicatorConfigProps } from "../../indicators/types";
import AddButton from "./AddButton";
import {
  ROUNDING,
  INPUT_BACKGROUND,
  Handle,
  NAME_INSET,
  INPUT_STYLE,
  move,
  rowStyle,
} from "./DrawerRows";
import PointMenu, { menuPosition, type PointMenuPosition } from "./PointMenu";

// Les colonnes d'un widget liste — les projets, les demandes du Support, les
// postes des Assets : lesquelles il montre, dans quel ordre, et à quelle
// largeur par défaut.
//
// Chaque colonne montrée est une ligne : sa poignée pour la glisser à une
// autre place, son nom, sa largeur. Le nom est un select : un clic ouvre la
// liste des colonnes, pour la remplacer par une autre. Le clic droit la retire
// (« Supprimer »). « Ajouter une colonne » pose une ligne vide au bout, où
// l'on choisit laquelle. Une colonne peut revenir autant de fois qu'on
// veut ; la liste en garde au moins une : la dernière ne se retire pas.
//
// La largeur est celle que la grille prend tant que personne n'a tiré ses
// colonnes : chacun peut encore les ajuster pour soi, et le double-clic sur
// une poignée de la grille y ramène. Vide, la colonne prend la largeur de son
// contenu.

export interface ListColumn {
  key: string;
  label: string;
}

/** Une colonne montrée : « id » la distingue de ses doubles, dans la grille. */
export type ShownColumn<C extends ListColumn> = C & { id: string; width?: number };

/** Les colonnes montrées, dans l'ordre : une entrée par ligne de la liste. */
export const LIST_COLUMNS = "columns";

// Les réglages d'avant la liste : un booléen par colonne, leur ordre, leurs
// largeurs. Relus tant que la liste n'a pas été enregistrée.
const COLUMNS = "column_visibility";
const COLUMNS_ORDER = "column_order";
const COLUMN_WIDTHS = "column_widths";

interface Entry {
  key: string;
  width?: number;
}

/**
 * La liste des colonnes ne montre que cinq options à la fois, puis défile :
 * une option de taille « sm » mesure 33,6875 px.
 */
const VISIBLE_OPTIONS = 5;
const OPTION_HEIGHT = 33.6875;

/** En deçà, la colonne ne montrerait plus qu'une ellipse — comme dans la grille. */
const WIDTH_MIN = 40;

const field = (config: unknown, key: string): unknown =>
  (config as Record<string, unknown> | null)?.[key];

const subject = (config: unknown, key: string): Record<string, unknown> => {
  const value = field(config, key);
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
};

const readWidth = (value: unknown): number | undefined =>
  typeof value === "number" && value >= WIDTH_MIN ? value : undefined;

/** Les entrées d'avant la liste : les colonnes non masquées, dans l'ordre réglé. */
const legacyEntries = (columns: ListColumn[], config: unknown): Entry[] => {
  const raw = field(config, COLUMNS_ORDER);
  const order = Array.isArray(raw) ? raw.filter((k): k is string => typeof k === "string") : [];
  const rank = (c: ListColumn) => {
    const i = order.indexOf(c.key);
    return i === -1 ? order.length + columns.indexOf(c) : i;
  };
  const hiddenItems = subject(config, COLUMNS);
  const widths = subject(config, COLUMN_WIDTHS);
  return [...columns]
    .sort((a, b) => rank(a) - rank(b))
    .filter((c) => hiddenItems[c.key] !== false)
    .map((c) => ({ key: c.key, width: readWidth(widths[c.key]) }));
};

/**
 * Les entrées de la configuration, connues seulement. Sans liste — ou sans
 * aucune colonne connue —, toutes les colonnes.
 */
const entries = (columns: ListColumn[], config: unknown): Entry[] => {
  const raw = field(config, LIST_COLUMNS);
  const readItems: Entry[] = Array.isArray(raw)
    ? raw
        .filter(
          (e): e is Entry =>
            Boolean(e) && typeof e === "object" && columns.some((c) => c.key === e.key),
        )
        .map((e) => ({ key: e.key, width: readWidth(e.width) }))
    : legacyEntries(columns, config);
  return readItems.length > 0 ? readItems : columns.map((c) => ({ key: c.key }));
};

/** L'identifiant de chaque entrée : sa clé, suivie de son rang pour un double. */
const identifiers = (list: Entry[]): string[] => {
  const views = new Map<string, number>();
  return list.map(({ key }) => {
    const n = (views.get(key) ?? 0) + 1;
    views.set(key, n);
    return n === 1 ? key : `${key}~${n}`;
  });
};

/** Les colonnes que la configuration montre, dans son ordre ; sans réglage, toutes. */
export const keptColumns = <C extends ListColumn>(
  columns: C[],
  config: unknown,
): ShownColumn<C>[] => {
  const list = entries(columns, config);
  const ids = identifiers(list);
  return list.map((e, i) => ({
    ...columns.find((c) => c.key === e.key)!,
    id: ids[i]!,
    width: e.width,
  }));
};

/**
 * Les largeurs par défaut que la configuration donne, par identifiant, pour
 * la grille (useResizableColumns) ; « undefined » quand elle n'en
 * donne aucune — la grille garde alors sa mise en page naturelle.
 */
export const defaultWidths = (
  columns: ListColumn[],
  config: unknown,
): Record<string, number> | undefined => {
  const widths = Object.fromEntries(
    keptColumns(columns, config)
      .filter((c) => c.width !== undefined)
      .map((c) => [c.id, c.width!]),
  );
  return Object.keys(widths).length > 0 ? widths : undefined;
};

export default function ColumnFields({
  columns,
  config,
  onChange,
}: IndicatorConfigProps & { columns: ListColumn[] }) {
  const list = entries(columns, config);
  const ids = identifiers(list);
  /** Le rang de la ligne qu'on glisse. */
  const [held, setHeld] = useState<number | null>(null);
  /** Vrai pendant qu'une ligne ajoutée attend sa colonne, au bout de la liste. */
  const [adding, setAdding] = useState(false);
  /** Le rang de la ligne dont la liste des colonnes est ouverte. */
  const [isOpen, setOpened] = useState<number | null>(null);
  /** Le rang de la ligne dont la largeur a le focus : son champ prend le fond du tiroir. */
  const [input, setInput] = useState<number | null>(null);
  /** Le menu du clic droit, et le rang de la ligne qu'il vise. */
  const [menu, setMenu] = useState<{ rank: number; position: PointMenuPosition } | null>(null);

  /** Les lignes affichées : la liste, et au bout celle qu'on ajoute. */
  const rows = adding ? [...list, { key: "" }] : list;
  const columnOf = (key: string) => columns.find((c) => c.key === key);
  const store = (next: Entry[]) => onChange(withField(config, LIST_COLUMNS, next));

  // La dernière colonne qui reste ne se retire pas : la liste en montre au
  // moins une.
  const last = list.length === 1;

  const remove = (rank: number) => store(list.filter((_, i) => i !== rank));

  // La nouvelle ligne se pose au bout, vide : c'est là qu'on dit quelle
  // colonne on voulait. Elle n'entre dans la configuration qu'une colonne
  // choisie ; quittée sans choix, elle s'efface.
  const add = () => setAdding(true);

  // Une autre colonne à la même place : sa largeur repart de zéro. Sur la
  // ligne ajoutée, la colonne choisie rejoint la liste.
  const replaceExisting = (rank: number, key: string | null) => {
    setAdding(false);
    if (!key) return;
    if (rank === list.length) return store([...list, { key }]);
    if (key === list[rank]?.key) return;
    store(list.map((e, i) => (i === rank ? { key } : e)));
  };

  const changeWidth = (rank: number, value: string | number) =>
    store(list.map((e, i) => (i === rank ? { key: e.key, width: readWidth(value) } : e)));

  // La ligne tenue prend la place de celle qu'elle survole : la liste se
  // range sous le pointeur, et la configuration suit.
  const dragHover = (e: DragEvent<HTMLElement>, rank: number) => {
    if (held === null) return;
    e.preventDefault();
    const next = move(list, held, rank);
    if (!next) return;
    setHeld(rank);
    store(next);
  };

  const options = columns.map((c) => ({ value: c.key, label: c.label }));

  return (
    <Input.Wrapper label="Colonnes">
      {/* Le même écart sous le libellé que celui des autres champs. */}
      <Stack gap={1}>
        {rows.map((entry, rank) => {
          // La ligne ajoutée n'a pas encore de colonne.
          const column = columnOf(entry.key) ?? { key: "", label: "" };
          const newRow = rank === list.length;
          return (
            <Group
              key={newRow ? "new" : ids[rank]}
              gap="sm"
              wrap="nowrap"
              onDragOver={(e) => dragHover(e, rank)}
              onDrop={(e) => e.preventDefault()}
              onContextMenu={(e) => {
                if (newRow || last) return;
                setMenu({ rank, position: menuPosition(e) });
              }}
              style={rowStyle(rank, rows.length, held === rank)}
            >
              <Handle
                label={`Déplacer la colonne ${column.label}`}
                // La ligne ajoutée ne bouge ni ne se règle tant qu'elle n'a
                // pas de colonne.
                active={!newRow}
                onDragStart={() => setHeld(rank)}
                onDragEnd={() => setHeld(null)}
              />
              <Select
                // Le texte a la taille des noms.
                size="sm"
                radius={ROUNDING}
                // Le champ garde le même retrait que celui de la largeur, en
                // haut et en bas, et s'avance sur son retrait de gauche : le
                // nom reste aligné sur la poignée.
                style={{ flex: 1, marginLeft: -NAME_INSET }}
                data={options}
                value={entry.key || null}
                placeholder="Choisir une colonne"
                onChange={(value) => replaceExisting(rank, value)}
                // La ligne ajoutée, quittée sans colonne, s'efface.
                onBlur={() => newRow && setAdding(false)}
                onDropdownOpen={() => setOpened(rank)}
                onDropdownClose={() => setOpened(null)}
                allowDeselect={false}
                autoFocus={newRow}
                // Un select classique : le chevron toujours là, la liste
                // ouverte au clic.
                rightSection={<IconChevronDown size={14} />}
                rightSectionPointerEvents="none"
                // La liste se présente comme la palette des couleurs d'une
                // étiquette : un panneau flottant de Mantine, cerné et ombré.
                comboboxProps={{ shadow: "md" }}
                maxDropdownHeight={VISIBLE_OPTIONS * OPTION_HEIGHT}
                styles={{
                  // Le champ se présente comme celui de la largeur : son fond,
                  // et celui du tiroir tant que la liste est ouverte.
                  input: {
                    height: "var(--input-height-xs)",
                    minHeight: "var(--input-height-xs)",
                    // Sans bordure, le texte s'aligne sur les autres noms.
                    borderWidth: 0,
                    paddingLeft: NAME_INSET,
                    cursor: "pointer",
                    ...(isOpen === rank ? { backgroundColor: INPUT_BACKGROUND } : {}),
                  },
                }}
                classNames={{ option: classes.option }}
                aria-label={newRow ? "Colonne à ajouter" : `Colonne ${column.label}`}
              />
              <NumberInput
                size="xs"
                radius={ROUNDING}
                disabled={newRow}
                w={100}
                placeholder="Auto"
                suffix=" px"
                min={WIDTH_MIN}
                max={1200}
                allowDecimal={false}
                allowNegative={false}
                aria-label={`Largeur de la colonne ${column.label}`}
                value={entry.width ?? ""}
                onChange={(value) => changeWidth(rank, value)}
                onFocus={() => setInput(rank)}
                onBlur={() => setInput(null)}
                styles={input === rank ? { input: INPUT_STYLE } : undefined}
              />
            </Group>
          );
        })}
      </Stack>

      {/* Au plus près de la liste qu'il allonge. */}
      <AddButton label="Ajouter une colonne" onClick={add} mt={4} />

      {menu && (
        <PointMenu position={menu.position} onClose={() => setMenu(null)}>
          <Menu.Item
            color={RED}
            leftSection={<IconTrash size={16} />}
            onClick={() => remove(menu.rank)}
          >
            Supprimer
          </Menu.Item>
        </PointMenu>
      )}
    </Input.Wrapper>
  );
}
