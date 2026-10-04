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

// What a list receives from outside: the e-mail addresses its tickets arrive
// from, the GLPI agent tags its positions arrive from. Each goes to one of the
// board's contexts; the server re-reads this configuration (server,
// repositories/inboxes.ts).
//
// They look like a list's columns (ColumnFields): one row per reception, its
// value on the row itself, its context on the right. A right click removes it;
// "Ajouter" adds an empty row at the end, which disappears if left without
// anything written in it. With no reception, the empty-list prompt (EmptyList).

/** A reception: the received value, and the context where it is filed. */
type Inbox = Record<string, unknown> & { context_id?: number | null };

/** The width of the context choice. */
const CONTEXT_WIDTH = 170;

interface ReceptionFieldProps extends IndicatorConfigProps {
  /** The configuration key that holds the list: "mailboxes", "tags". */
  key: string;
  /** The field of each entry that carries the received value: "email", "tag". */
  field: string;
  label: string;
  /** What the label explains, below. */
  description?: ReactNode;
  /** The input field's prompt: "Adresse e-mail", "Tag de l'agent". */
  placeholder: string;
  /** The add button's label: "Ajouter une adresse e-mail". */
  add: string;
  /** The empty list's icon and message. */
  icon: ComponentType<{ size?: number; color?: string }>;
  empty: string;
  /** The values already known, offered while typing. */
  suggestions?: string[];
  /** What the row shows at its end, based on its value — an address's status. */
  state?: (value: string) => ReactNode;
  /** The value as it is stored: an address without spaces, for example. */
  normalizeValue?: (value: string) => string;
}

/** The receptions the configuration holds. */
export const inboxesOf = (config: unknown, key: string): Inbox[] => {
  const list = (config as Record<string, unknown> | null)?.[key];
  return Array.isArray(list) ? (list as Inbox[]) : [];
};

/**
 * True when a widget's receptions do not hold up: no reception — the list would
 * receive nothing —, or a single one that is incomplete. Each must have its
 * value, readable ("valid": an e-mail address for a mailbox), and, in a board
 * that has contexts, a context that still exists — not one added since, nor a
 * deleted one.
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
    return contextOptions.length > 0 && (!l.context_id || !contextOptions.includes(l.context_id as Id));
  });
};

/**
 * A widget's list of receptions: one row per address, or per tag, with the
 * context that receives it. Set when the list is placed, and changed afterwards
 * in its drawer.
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
  /** The field that has focus: it takes the drawer's background. */
  const [input, setInput] = useState<string | null>(null);
  /** The row that was just added: its value takes focus. */
  const [toFill, setToFill] = useState<number | null>(null);
  /**
   * The row whose suggestions are open. They wait for typing or a click in the
   * field: the added row takes focus without unfolding them.
   */
  const [suggested, setSuggested] = useState<number | null>(null);
  const [menu, setMenu] = useState<{ rank: number; position: PointMenuPosition } | null>(null);

  const valueFor = (l: Inbox) => (typeof l[field] === "string" ? (l[field] as string) : "");
  const insertRow = (nextItems: Inbox[]) => onChange(withField(config, key, nextItems));
  const change = (rank: number, change: Partial<Inbox>) =>
    insertRow(rows.map((l, i) => (i === rank ? { ...l, ...change } : l)));
  const remove = (rank: number) => insertRow(rows.filter((_, i) => i !== rank));

  // The new row goes to the first context: it is changed on the row.
  const addRow = () => {
    insertRow([...rows, { [field]: "", context_id: contexts[0]?.id ?? null }]);
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
              // Without a handle, the value sits to the left like the context
              // to the right: at ROW_INSET from the row's edge.
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
                  // A row left without a value disappears.
                  if (!valueFor(row).trim()) remove(rank);
                }}
              />
              {/* A board without contexts receives without context: nothing to choose. */}
              {contextOptions.length > 0 && (
                <Select
                  size="xs"
                  radius={ROUNDING}
                  w={CONTEXT_WIDTH}
                  style={{ flexShrink: 0 }}
                  placeholder="Contexte"
                  aria-label="Contexte"
                  data={contextOptions}
                  value={row.context_id ? String(row.context_id) : null}
                  onChange={(value) => change(rank, { context_id: value ? Number(value) : null })}
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

      {/* As close as possible to the list it extends. */}
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
