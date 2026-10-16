import { Autocomplete, Group, Input, Select, Stack } from "@mantine/core";
import { useState } from "react";
import type { ComponentType, ReactNode } from "react";
import { withField } from "../../widgets/types";
import type { IndicatorConfigProps } from "../../widgets/support/types";
import {
  ROUNDING,
  EmptyList,
  ListFooter,
  RowCheckbox,
  editKeys,
  holdEscape,
  useRowSelection,
  NAME_INSET,
  INPUT_INSET,
  INPUT_STYLE,
  ListHeader,
  rowStyle,
} from "./DrawerRows";

// What a list receives from outside: the e-mail addresses its tickets arrive
// from. Each may set a label on what arrives — its context; the server re-reads this configuration (server,
// repositories/inboxes.ts).
//
// They look like a list's columns (ColumnFields): one row per reception, its
// value on the row itself, its label on the right. Its box, at the start,
// selects it: the checked rows are removed together, from the button that takes
// the place of "Ajouter" meanwhile. "Ajouter" adds an empty row at the end,
// which disappears if left without anything written in it: Enter validates the
// value, Escape puts back the previous one (editKeys). With no reception, the
// empty-list prompt (EmptyList).

/** A reception: the received value, and the label it sets. */
type Inbox = Record<string, unknown> & { label_id?: number | null };

/** The width of the label choice. */
const LABEL_WIDTH = 170;

/** The width of the kind choice. */
const TYPE_WIDTH = 140;

interface ReceptionFieldProps extends IndicatorConfigProps {
  /**
   * The configuration key that holds the list: "mailboxes", "calendars". Not
   * "key": React keeps that one for itself and never passes it on.
   */
  configKey: string;
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
  /** The labels a reception may set, by group; none, the choice is not offered. */
  labels?: { group: string; items: { value: string; label: string }[] }[];
  /** The label choice's prompt: "Contexte" by default. */
  labelPlaceholder?: string;
  /**
   * The titles of its columns, above its rows: the kind's, the value's, the
   * label's. None, no header.
   */
  header?: { type?: string; value: string; label?: string };
  /**
   * The kinds a reception may be, chosen at the start of its row and kept
   * under "type": a collector's "Agent GLPI". None, the choice is not offered.
   */
  types?: readonly { value: string; label: string }[];
}

/** The receptions the configuration holds. */
export const inboxesOf = (config: unknown, key: string): Inbox[] => {
  const list = (config as Record<string, unknown> | null)?.[key];
  return Array.isArray(list) ? (list as Inbox[]) : [];
};

/**
 * True when a widget's receptions do not hold up: no reception — the list would
 * receive nothing —, or a single one that is incomplete. Each must have its
 * value, readable ("valid": an e-mail address for a mailbox).
 */
export const inboxesWithProblem = (
  config: unknown,
  key: string,
  field: string,
  isValid: (value: string) => boolean = (value) => value !== "",
): boolean => {
  const rows = inboxesOf(config, key);
  if (rows.length === 0) return true;
  return rows.some((l) => !isValid(typeof l[field] === "string" ? (l[field] as string).trim() : ""));
};

/**
 * A widget's list of receptions: one row per address, with the label it sets.
 * Set when the list is placed, and changed afterwards in its drawer.
 */
export default function ReceptionField({
  configKey,
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
  labels = [],
  labelPlaceholder = "Contexte",
  header,
  types = [],
  config,
  onChange,
}: ReceptionFieldProps) {
  const rows = inboxesOf(config, configKey);
  /** The kind a row takes when it states none: the first. */
  const firstType = types[0]?.value;
  const labelValues = new Set(labels.flatMap((g) => g.items.map((l) => l.value)));
  /** The field that has focus: it takes the drawer's background. */
  const [input, setInput] = useState<string | null>(null);
  /** The row that was just added: its value takes focus. */
  const [toFill, setToFill] = useState<number | null>(null);
  /**
   * The row whose suggestions are open. They wait for typing or a click in the
   * field: the added row takes focus without unfolding them.
   */
  const [suggested, setSuggested] = useState<number | null>(null);
  const selection = useRowSelection(rows.map((_, rank) => rank));

  const valueFor = (l: Inbox) => (typeof l[field] === "string" ? (l[field] as string) : "");
  const insertRow = (nextItems: Inbox[]) => onChange(withField(config, configKey, nextItems));
  const change = (rank: number, change: Partial<Inbox>) =>
    insertRow(rows.map((l, i) => (i === rank ? { ...l, ...change } : l)));
  // Rows are known by their rank: those after the removed one move up, their
  // checks with them.
  const remove = (rank: number) => {
    insertRow(rows.filter((_, i) => i !== rank));
    selection.reset(selection.checked.filter((i) => i !== rank).map((i) => (i > rank ? i - 1 : i)));
  };
  const removeChecked = () => {
    insertRow(rows.filter((_, i) => !selection.isChecked(i)));
    selection.reset();
  };

  // The new row sets no label: it is chosen on the row. It takes the first
  // kind.
  const addRow = () => {
    insertRow([
      ...rows,
      { ...(firstType && { type: firstType }), [field]: "", label_id: null },
    ]);
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
          {header && (
            <ListHeader
              columns={[
                ...(types.length > 0
                  ? [{ label: header.type ?? "", style: { width: TYPE_WIDTH, flexShrink: 0 } }]
                  : []),
                {
                  label: header.value,
                  style: { flex: 1, minWidth: 0, marginLeft: types.length > 0 ? 0 : -NAME_INSET },
                  inset: INPUT_INSET,
                },
                ...(labelValues.size > 0
                  ? [{ label: header.label ?? "", style: { width: LABEL_WIDTH, flexShrink: 0 } }]
                  : []),
              ]}
            />
          )}
          {rows.map((row, rank) => {
              const keys = editKeys((value) => change(rank, { [field]: value }));
              return (
              <Group
                key={rank}
                gap="sm"
                wrap="nowrap"
                // The header, when there is one, opens the stack (ListHeader).
                style={header ? rowStyle(rank + 1, rows.length + 1, false) : rowStyle(rank, rows.length, false)}
              >
                <RowCheckbox
                  label={`Sélectionner ${valueFor(row) || placeholder}`}
                  checked={selection.isChecked(rank)}
                  onChange={(on) => selection.toggle(rank, on)}
                />
                {types.length > 0 && (
                  <Select
                    size="xs"
                    radius={ROUNDING}
                    w={TYPE_WIDTH}
                    style={{ flexShrink: 0 }}
                    aria-label="Type"
                    data={[...types]}
                    value={typeof row.type === "string" ? row.type : firstType}
                    onChange={(value) => value && change(rank, { type: value })}
                    allowDeselect={false}
                    comboboxProps={{ withinPortal: true }}
                    onFocus={() => setInput(`${rank}-type`)}
                    onBlur={() => setInput(null)}
                    styles={input === `${rank}-type` ? { input: INPUT_STYLE } : undefined}
                  />
                )}
                {/* The value aligns with the checkbox, as a column's name with
                    its handle — after the kind, it no longer has to. */}
                <Autocomplete
                  size="sm"
                  radius={ROUNDING}
                  style={{ flex: 1, minWidth: 0, marginLeft: types.length > 0 ? 0 : -NAME_INSET }}
                  styles={{
                    input: {
                      height: "var(--input-height-xs)",
                      minHeight: "var(--input-height-xs)",
                      paddingLeft: INPUT_INSET,
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
                  onFocusCapture={keys.onFocusCapture}
                ref={holdEscape}
                  onKeyDown={(e) => {
                    // Enter first lets the suggestions take the highlighted one,
                    // then leaves the field.
                    if (e.key === "Enter") {
                      e.preventDefault();
                      const target = e.currentTarget;
                      setTimeout(() => target.blur());
                    } else keys.onKeyDown(e);
                  }}
                  onFocus={() => setInput(`${rank}-valeur`)}
                  onBlur={() => {
                    setInput(null);
                    setToFill(null);
                    setSuggested(null);
                    // A row left without a value disappears.
                    if (!valueFor(row).trim()) remove(rank);
                  }}
                />
                {/* Without labels, nothing to choose. */}
                {labelValues.size > 0 && (
                  <Select
                    size="xs"
                    radius={ROUNDING}
                    w={LABEL_WIDTH}
                    style={{ flexShrink: 0 }}
                    placeholder={labelPlaceholder}
                    aria-label={labelPlaceholder}
                    data={labels}
                    // A label deleted since then matches no option: none shows.
                    value={
                      row.label_id && labelValues.has(String(row.label_id))
                        ? String(row.label_id)
                        : null
                    }
                    onChange={(value) => change(rank, { label_id: value ? Number(value) : null })}
                    clearable
                    comboboxProps={{ withinPortal: true }}
                    onFocus={() => setInput(`${rank}-label`)}
                    onBlur={() => setInput(null)}
                    styles={input === `${rank}-label` ? { input: INPUT_STYLE } : undefined}
                  />
                )}
                {state?.(valueFor(row))}
              </Group>
              );
          })}
        </Stack>
      )}

      {/* As close as possible to the list it extends. */}
      <ListFooter
        addLabel={add}
        onAdd={addRow}
        checkedCount={selection.checked.length}
        onDeleteChecked={removeChecked}
      />
    </Input.Wrapper>
  );
}
