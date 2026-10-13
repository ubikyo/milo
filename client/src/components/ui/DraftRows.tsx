import { Group, Input, NumberInput, Select, Stack, Tooltip } from "@mantine/core";
import type { NumberInputProps, SelectProps } from "@mantine/core";
import { useState } from "react";
import type { ComponentType, CSSProperties, DragEvent, ReactNode } from "react";
import AddButton from "./AddButton";
import DeleteConfirmModal from "./DeleteConfirmModal";
import {
  EmptyList,
  Handle,
  ListFooter,
  NAME_INSET,
  ROUNDING,
  ROW_INSET,
  RowCheckbox,
  move,
  nameFieldStyle,
  pluralize,
  rowStyle,
  useRowSelection,
} from "./DrawerRows";

// A drawer's list whose rows go with its record — a product's suppliers
// (ProductDrawer), an order's lines (OrderDrawer) —: the same list as a
// contact's addresses (AddressRows) — a handle to order the rows, a box to
// delete them, "Ajouter…" under it —, each row's fields given by its owner.

/**
 * A row's choice: on the row's gray, the drawer's background only while it
 * has focus, as a list's fields (EditableRows). A choice made validates it:
 * the field is left.
 */
/** "alignRight": the value at the field's end — a rate. */
export function RowSelect({ onChange, alignRight = false, ...props }: SelectProps & { alignRight?: boolean }) {
  const [focus, setFocus] = useState(false);
  return (
    <Select
      size="sm"
      radius={ROUNDING}
      searchable
      data-mantine-stop-propagation
      {...props}
      onChange={(value, option) => {
        onChange?.(value, option);
        (document.activeElement as HTMLElement | null)?.blur();
      }}
      onFocus={() => setFocus(true)}
      onBlur={() => setFocus(false)}
      styles={{ input: { ...nameFieldStyle(focus), ...(alignRight && { textAlign: "right" as const }) } }}
    />
  );
}

/**
 * A row's number, as its choice (RowSelect): Enter validates it. "invalid"
 * shows it white on red — a value missing, or another row's already. "alignRight"
 * aligns it on the right, as amounts are.
 */
export function RowNumber({
  invalid = false,
  alignRight = false,
  ...props
}: NumberInputProps & { invalid?: boolean; alignRight?: boolean }) {
  const [focus, setFocus] = useState(false);
  return (
    <NumberInput
      size="sm"
      radius={ROUNDING}
      hideControls
      decimalSeparator=","
      data-mantine-stop-propagation
      {...props}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          e.currentTarget.blur();
        }
      }}
      onFocus={() => setFocus(true)}
      onBlur={() => setFocus(false)}
      aria-invalid={invalid}
      styles={{
        input: {
          ...nameFieldStyle(focus),
          ...(alignRight && { textAlign: "right" as const }),
          ...(invalid && {
            backgroundColor: "var(--mantine-color-red-filled)",
            color: "var(--mantine-color-white)",
            "--input-placeholder-color": "rgba(255, 255, 255, 0.8)",
          }),
        },
      }}
    />
  );
}

/**
 * The width of a row's last field that lines up with the second of two
 * fields above it, side by side in "share" of the drawer's width with an "md"
 * gap — a product's price under its inventory tracking. The row's content
 * is the drawer's width less its insets (rowStyle): its percentages read on it.
 */
export const alignedEnd = (share: number): CSSProperties => ({
  width: `calc((100% + ${NAME_INSET + ROW_INSET}px - var(--mantine-spacing-md)) * ${share} - ${ROW_INSET}px)`,
  flexShrink: 0,
  // The row's gap is "xs": the field keeps "md" from the one before it, as above.
  marginLeft: "calc(var(--mantine-spacing-md) - var(--mantine-spacing-xs))",
});

/**
 * The "Ajouter" buttons' height when several are stacked: their text line's,
 * as a label group editor's (LabelGroupsEditor) — an "xs" button's would leave
 * a gap between them.
 */
const STACKED_ADD_HEIGHT = 20;

export default function DraftRows<T>({
  label,
  value,
  onChange,
  emptyIcon,
  emptyText,
  addLabel,
  newRow,
  nameOf,
  word,
  fields,
  readOnly = false,
  footer,
  moreAdds = [],
  rowLook,
  trailing,
  reorderable = true,
  sort,
  ready = () => true,
}: {
  label: string;
  value: T[];
  onChange: (rows: T[]) => void;
  emptyIcon: ComponentType<{ size?: number }>;
  emptyText: string;
  addLabel: string;
  /** The row "Ajouter…" adds. */
  newRow: () => T;
  /** What names a row, to delete it. */
  nameOf: (row: T) => string;
  /** A row, in the plural of the confirmation: "fournisseur". */
  word: string;
  /** A row's fields: "change" merges into it; "autoFocus" for the one just added. */
  fields: (row: T, change: (fields: Partial<T>) => void, autoFocus: boolean, rank: number) => ReactNode;
  readOnly?: boolean;
  /** Under the rows, on the line of "Ajouter…", at its end: a total. */
  footer?: ReactNode;
  /**
   * Under "Ajouter…", one per line: other rows to add — an order's section,
   * its note —, or an action of its own — "Créer un produit", in the column
   * beside —, with why it is disabled.
   */
  moreAdds?: ({ label: string; /** 2: in the column beside "Ajouter…". */ column?: 1 | 2 } & (
    | { newRow: () => T }
    | { onClick: () => void; disabled?: boolean; disabledReason?: string }
  ))[];
  /** A row's own look over the list's: an order's section's background, its note's borders. */
  rowLook?: (row: T) => CSSProperties | undefined;
  /**
   * At the end of the row, out of its fields: a field whose width reads on
   * the row's — a product's price, lined up with the fields above (alignedEnd).
   */
  trailing?: (row: T, change: (fields: Partial<T>) => void, rank: number) => ReactNode;
  /** False: the rows keep no order of their own — no handle. */
  reorderable?: boolean;
  /**
   * The rows' order, when they have one: they are sorted once a row is left —
   * not while it is typed in, which would move it under the pointer —, and
   * only when it is complete ("ready"): a row half entered stays where it is.
   */
  sort?: (a: T, b: T) => number;
  ready?: (row: T) => boolean;
}) {
  const selection = useRowSelection(value.map((_, rank) => rank));
  const [toDelete, setToDelete] = useState<number[]>([]);
  // The row just added takes focus.
  const [added, setAdded] = useState<number | null>(null);
  // While a row is dragged: the rank of the one held.
  const [held, setHeld] = useState<number | null>(null);

  const change = (rank: number, fields: Partial<T>) =>
    onChange(value.map((row, i) => (i === rank ? { ...row, ...fields } : row)));

  const dragHover = (e: DragEvent<HTMLElement>, rank: number) => {
    if (held === null) return;
    e.preventDefault();
    const next = move(value, held, rank);
    if (!next) return;
    setHeld(rank);
    // The row just added no longer is at its rank: the one arriving there
    // would take its focus — a product's choice, which opens.
    setAdded(null);
    selection.reset();
    onChange(next);
  };

  /** The rows in their order, when it moved: the checked ones follow theirs. */
  const sortRows = () => {
    if (!sort) return;
    const sorted = [...value].sort(sort);
    if (sorted.every((row, i) => row === value[i])) return;
    selection.reset();
    setAdded(null);
    onChange(sorted);
  };

  const first = value[toDelete[0] ?? -1];

  // The other additions, by column — shown while no row is checked.
  const adding = !readOnly && selection.checked.length === 0;
  const firstColumn = moreAdds.filter((add) => add.column !== 2);
  const secondColumn = moreAdds.filter((add) => add.column === 2);
  const addButton = (add: (typeof moreAdds)[number]) =>
    "newRow" in add ? (
      <AddButton
        key={add.label}
        label={add.label}
        h={STACKED_ADD_HEIGHT}
        onClick={() => {
          setAdded(value.length);
          onChange([...value, add.newRow()]);
        }}
      />
    ) : (
      <Tooltip key={add.label} label={add.disabledReason} disabled={!add.disabled || !add.disabledReason}>
        {/* A flex box: an inline button in a block would gain a descender's gap. */}
        <div style={{ display: "flex" }}>
          <AddButton label={add.label} onClick={add.onClick} disabled={add.disabled} h={STACKED_ADD_HEIGHT} />
        </div>
      </Tooltip>
    );

  return (
    <Input.Wrapper label={label}>
      {value.length === 0 ? (
        <EmptyList icon={emptyIcon} message={emptyText} />
      ) : (
        <Stack gap={1}>
          {value.map((row, rank) => (
            <Group
              key={rank}
              gap="xs"
              wrap="nowrap"
              onDragOver={reorderable ? (e) => dragHover(e, rank) : undefined}
              onDrop={reorderable ? (e) => e.preventDefault() : undefined}
              onBlur={
                sort &&
                ((e) => {
                  // Leaving a field for another of the same row does not sort.
                  if (e.currentTarget.contains(e.relatedTarget as Node | null)) return;
                  if (ready(row)) sortRows();
                })
              }
              style={{
                ...rowStyle(rank, value.length, held === rank),
                ...rowLook?.(row),
              }}
            >
              {reorderable && (
                <Handle
                  label={`Déplacer ${nameOf(row)}`}
                  active={!readOnly}
                  onDragStart={() => setHeld(rank)}
                  onDragEnd={() => setHeld(null)}
                />
              )}
              <RowCheckbox
                label={`Sélectionner ${nameOf(row)}`}
                checked={selection.isChecked(rank)}
                onChange={(on) => selection.toggle(rank, on)}
                afterHandle={reorderable}
              />
              <Group gap="xs" wrap="nowrap" style={{ flex: 1, minWidth: 0, marginLeft: -NAME_INSET }}>
                {fields(row, (f) => change(rank, f), added === rank, rank)}
              </Group>
              {trailing?.(row, (f) => change(rank, f), rank)}
            </Group>
          ))}
        </Stack>
      )}
      {/* "Ajouter…" — or the checked rows' delete —, the other additions under
          it; a second column beside, for those that create rather than add; the
          footer at the end of the first line. While rows are checked, only
          their delete. */}
      <Group justify="space-between" align="flex-start" wrap="nowrap" mt={4}>
        <Group align="flex-start" gap="xl" wrap="nowrap">
          <Stack gap={0} align="flex-start">
            {!readOnly && (
              <ListFooter
                addLabel={addLabel}
                onAdd={() => {
                  setAdded(value.length);
                  onChange([...value, newRow()]);
                }}
                checkedCount={selection.checked.length}
                onDeleteChecked={() => setToDelete(selection.checked)}
                mt={0}
                h={moreAdds.length ? STACKED_ADD_HEIGHT : undefined}
              />
            )}
            {adding && firstColumn.map(addButton)}
          </Stack>
          {adding && secondColumn.length > 0 && (
            <Stack gap={0} align="flex-start">
              {secondColumn.map(addButton)}
            </Stack>
          )}
        </Group>
        {footer}
      </Group>

      <DeleteConfirmModal
        opened={toDelete.length > 0}
        onClose={() => setToDelete([])}
        onConfirm={() => {
          const ranks = new Set(toDelete);
          setToDelete([]);
          selection.reset();
          onChange(value.filter((_, i) => !ranks.has(i)));
        }}
        title={toDelete.length > 1 ? `Supprimer ${pluralize(toDelete.length, word)}` : `Supprimer`}
        message={
          toDelete.length > 1 ? (
            <>
              Voulez-vous vraiment supprimer ces {pluralize(toDelete.length, word)} ? Cette action est
              irréversible.
            </>
          ) : (
            <>
              Voulez-vous vraiment supprimer « {first === undefined ? "" : nameOf(first)} » ? Cette action
              est irréversible.
            </>
          )
        }
      />
    </Input.Wrapper>
  );
}
