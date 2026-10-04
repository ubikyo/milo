import { Autocomplete, Group, Input, Menu, Select, Stack } from "@mantine/core";
import { IconTrash } from "@tabler/icons-react";
import { useState } from "react";
import type { ComponentType, ReactNode } from "react";
import { useReferences } from "../../lib/references";
import { RED } from "../../themes/colors";
import { withField } from "../../widgets/types";
import type { IndicatorConfigProps } from "../../indicators/types";
import type { Id } from "@milo/shared";
import AddButton from "./AddButton";
import {
  ROUNDING,
  EmptyList,
  ROW_INSET,
  NAME_INSET,
  INPUT_STYLE,
  rowStyle,
} from "./DrawerRows";
import PointMenu, { menuPosition, type PointMenuPosition } from "./PointMenu";

// Ce qu'une liste reçoit du dehors : les adresses e-mail d'où arrivent ses
// tickets, les tags d'agent GLPI d'où arrivent ses postes. Chacun va à l'un
// des contextes du tableau ; le serveur relit cette configuration
// (server, repositories/receptions.ts).
//
// Elles se présentent comme les colonnes d'une liste (ChampsColonnes) : une
// ligne par réception, sa valeur à même la ligne, son contexte à droite. Le
// clic droit la retire ; « Ajouter » pose une ligne vide au bout, qui
// s'efface si on la quitte sans rien y écrire. Sans réception, l'invite des
// listes vides (ListeVide).

/** Une réception : la valeur reçue, et le contexte où elle se range. */
type Inbox = Record<string, unknown> & { context?: number | null };

/** La largeur du choix du contexte. */
const CONTEXT_WIDTH = 170;

interface ReceptionFieldProps extends IndicatorConfigProps {
  /** La clé de la configuration qui garde la liste : « boites », « tags ». */
  key: string;
  /** Le champ de chaque entrée qui porte la valeur reçue : « email », « tag ». */
  field: string;
  label: string;
  /** Ce que le libellé explique, dessous. */
  description?: ReactNode;
  /** L'invite du champ de saisie : « Adresse e-mail », « Tag de l'agent ». */
  placeholder: string;
  /** Le libellé du bouton d'ajout : « Ajouter une adresse e-mail ». */
  add: string;
  /** L'icône et le message de la liste vide. */
  icon: ComponentType<{ size?: number; color?: string }>;
  empty: string;
  /** Les valeurs déjà connues, proposées à la saisie. */
  suggestions?: string[];
  /** Ce que la ligne montre au bout, d'après sa valeur — l'état d'une adresse. */
  state?: (value: string) => ReactNode;
  /** La valeur telle qu'elle se range : une adresse sans espaces, par exemple. */
  normalizeValue?: (value: string) => string;
}

/** Les réceptions que la configuration garde. */
export const inboxesOf = (config: unknown, key: string): Inbox[] => {
  const list = (config as Record<string, unknown> | null)?.[key];
  return Array.isArray(list) ? (list as Inbox[]) : [];
};

/**
 * Vrai quand les réceptions d'un widget ne tiennent pas : aucune réception —
 * la liste ne recevrait rien —, ou une seule qui n'est pas complète. Chacune
 * doit avoir sa valeur, lisible (« valide » : une adresse e-mail pour une
 * boîte), et, dans un tableau qui a des contextes, un contexte qui existe
 * toujours — pas un ajouté depuis, ni un supprimé.
 */
export const inboxesWithProblem = (
  config: unknown,
  key: string,
  field: string,
  contextOptions: Id[],
  isValid: (value: string) => boolean = (value) => value !== "",
): boolean => {
  const rows = inboxesOf(config, key);
  if (rows.length === 0) return true;
  return rows.some((l) => {
    const value = typeof l[field] === "string" ? (l[field] as string).trim() : "";
    if (!isValid(value)) return true;
    return contextOptions.length > 0 && (!l.context || !contextOptions.includes(l.context as Id));
  });
};

/**
 * La liste des réceptions d'un widget : une ligne par adresse, ou par tag,
 * avec le contexte qui la reçoit. Se règle quand on pose la liste, et se
 * change ensuite dans son tiroir.
 */
export default function ReceptionField({
  key,
  field,
  label,
  description,
  placeholder,
  add,
  icon,
  empty,
  suggestions = [],
  state,
  normalizeValue = (value) => value,
  config,
  onChange,
}: ReceptionFieldProps) {
  const { contexts } = useReferences();
  const rows = inboxesOf(config, key);
  const contextOptions = contexts.map((c) => ({ value: String(c.id), label: c.name }));
  /** Le champ qui a le focus : il prend le fond du tiroir. */
  const [input, setInput] = useState<string | null>(null);
  /** La ligne qu'on vient d'ajouter : sa valeur prend le focus. */
  const [toFill, setToFill] = useState<number | null>(null);
  /**
   * La ligne dont les suggestions sont ouvertes. Elles attendent qu'on tape ou
   * qu'on clique dans le champ : la ligne ajoutée prend le focus sans les
   * déplier.
   */
  const [suggested, setSuggested] = useState<number | null>(null);
  const [menu, setMenu] = useState<{ rank: number; position: PointMenuPosition } | null>(null);

  const valueFor = (l: Inbox) => (typeof l[field] === "string" ? (l[field] as string) : "");
  const insertRow = (nextItems: Inbox[]) => onChange(withField(config, key, nextItems));
  const change = (rank: number, change: Partial<Inbox>) =>
    insertRow(rows.map((l, i) => (i === rank ? { ...l, ...change } : l)));
  const remove = (rank: number) => insertRow(rows.filter((_, i) => i !== rank));

  // La ligne neuve va au premier contexte : on le change sur la ligne.
  const addRow = () => {
    insertRow([...rows, { [field]: "", context: contexts[0]?.id ?? null }]);
    setToFill(rows.length);
  };

  return (
    <Input.Wrapper
      label={label}
      description={description}
      styles={description ? { description: { paddingBottom: 10 } } : undefined}
    >
      {rows.length === 0 ? (
        <EmptyList icon={icon} message={empty} />
      ) : (
        <Stack gap={1}>
          {rows.map((row, rank) => (
            <Group
              key={rank}
              gap="sm"
              wrap="nowrap"
              onContextMenu={(e) => setMenu({ rank, position: menuPosition(e) })}
              // Sans poignée, la valeur se cale à gauche comme le contexte à
              // droite : à RETRAIT_LIGNE du bord de la ligne.
              style={{ ...rowStyle(rank, rows.length, false), paddingLeft: ROW_INSET }}
            >
              <Autocomplete
                size="sm"
                radius={ROUNDING}
                style={{ flex: 1, minWidth: 0 }}
                styles={{
                  input: {
                    height: "var(--input-height-xs)",
                    minHeight: "var(--input-height-xs)",
                    paddingLeft: NAME_INSET,
                    borderWidth: 0,
                    ...(input === `${rank}-valeur`
                      ? INPUT_STYLE
                      : { backgroundColor: "transparent" }),
                  },
                }}
                placeholder={placeholder}
                aria-label={placeholder}
                data={suggestions}
                value={valueFor(row)}
                onChange={(value) => {
                  change(rank, { [field]: normalizeValue(value) });
                  setSuggested(rank);
                }}
                dropdownOpened={suggested === rank}
                onClick={() => setSuggested(rank)}
                onOptionSubmit={() => setSuggested(null)}
                onDropdownClose={() => setSuggested(null)}
                autoFocus={toFill === rank}
                onFocus={() => setInput(`${rank}-valeur`)}
                onBlur={() => {
                  setInput(null);
                  setToFill(null);
                  setSuggested(null);
                  // Une ligne quittée sans valeur s'efface.
                  if (!valueFor(row).trim()) remove(rank);
                }}
              />
              {/* Un tableau sans contexte reçoit sans contexte : rien à choisir. */}
              {contextOptions.length > 0 && (
                <Select
                  size="xs"
                  radius={ROUNDING}
                  w={CONTEXT_WIDTH}
                  style={{ flexShrink: 0 }}
                  placeholder="Contexte"
                  aria-label="Contexte"
                  data={contextOptions}
                  value={row.context ? String(row.context) : null}
                  onChange={(value) => change(rank, { context: value ? Number(value) : null })}
                  allowDeselect={false}
                  comboboxProps={{ withinPortal: true }}
                  onFocus={() => setInput(`${rank}-contexte`)}
                  onBlur={() => setInput(null)}
                  styles={input === `${rank}-contexte` ? { input: INPUT_STYLE } : undefined}
                />
              )}
              {state?.(valueFor(row))}
            </Group>
          ))}
        </Stack>
      )}

      {/* Au plus près de la liste qu'il allonge. */}
      <AddButton label={add} onClick={addRow} mt={4} />

      {menu && (
        <PointMenu position={menu.position} onClose={() => setMenu(null)}>
          <Menu.Item
            color={RED}
            leftSection={<IconTrash size={16} />}
            onClick={() => {
              remove(menu.rank);
              setMenu(null);
            }}
          >
            Supprimer
          </Menu.Item>
        </PointMenu>
      )}
    </Input.Wrapper>
  );
}
