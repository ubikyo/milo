import { Box, Button, Checkbox, Text, TextInput, type ButtonProps } from "@mantine/core";
import { useRef, useState } from "react";
import { IconGripVertical, IconTrash } from "@tabler/icons-react";
import type { ComponentType, CSSProperties, DragEvent } from "react";
import AddButton from "./AddButton";
import EmptyPanel from "./EmptyPanel";
import { GREEN, RED } from "../../themes/colors";
import { PLUS_SIZE } from "../../themes/plus";

// The common look of a widget drawer's lists — its columns (ColumnFields), the
// board's categories and labels (BoardListFields): tight rows on a gray
// background, a handle on the left, fields that only show up on focus.

/**
 * A row's background, laid directly on the drawer: a neutral gray on white, and
 * on dark a gray lighter than the drawer.
 */
export const ROW_BACKGROUND = "light-dark(#ededed, var(--mantine-color-dark-6))";

/**
 * A header row's background — a checklist's title, a user above their
 * permissions —: a darker neutral gray on light; on dark, one step further
 * from the drawer background.
 */
export const HEADER_BACKGROUND = "light-dark(#dcdcdc, var(--mantine-color-dark-5))";

/** The padding around a row's content, and to the left of its handle. */
export const ROW_INSET = 4;
export const NAME_INSET = 10;
/** The text's inset inside a row's input, a little tighter than NAME_INSET. */
export const INPUT_INSET = NAME_INSET - 3;

/**
 * The background of a field being edited — a width with focus, a column in a
 * list: that of the drawer.
 */
export const INPUT_BACKGROUND = "var(--mantine-color-body)";

/** The rounding of a row's fields. */
export const ROUNDING = "xs";

/** The rounding of the ends of the row stack. */
const RADIUS = 8;

/**
 * A row's style: only the ends of the stack are rounded, the middle ones stay
 * square; the row being dragged fades. On the right, the last field sits flush
 * with the edge, away from the top and bottom.
 */
export const rowStyle = (rank: number, total: number, held: boolean): CSSProperties => ({
  padding: `${ROW_INSET}px ${ROW_INSET}px ${ROW_INSET}px ${NAME_INSET}px`,
  borderTopLeftRadius: rank === 0 ? RADIUS : 0,
  borderTopRightRadius: rank === 0 ? RADIUS : 0,
  borderBottomLeftRadius: rank === total - 1 ? RADIUS : 0,
  borderBottomRightRadius: rank === total - 1 ? RADIUS : 0,
  backgroundColor: ROW_BACKGROUND,
  opacity: held ? 0.5 : 1,
});

/** The field being edited: the drawer's background, no border. */
export const INPUT_STYLE: CSSProperties = { backgroundColor: INPUT_BACKGROUND };

/**
 * A row's name field, edited in place: no border, the height of an "xs" field,
 * transparent over the row's gray — the drawer's background when it has focus
 * ("entered").
 */
export const nameFieldStyle = (entered: boolean): CSSProperties => ({
  height: "var(--input-height-xs)",
  minHeight: "var(--input-height-xs)",
  paddingLeft: INPUT_INSET,
  borderWidth: 0,
  ...(entered ? INPUT_STYLE : { backgroundColor: "transparent" }),
});

interface HandleProps {
  /** What the handle moves, for screen readers. */
  label: string;
  /** False while the row cannot be dragged — a row not yet filled in. */
  active?: boolean;
  onDragStart: (e: DragEvent<HTMLElement>) => void;
  onDragEnd: () => void;
}

/** A row's handle: only it can be grabbed, the fields remain inputs. */
export function Handle({ label, active = true, onDragStart, onDragEnd }: HandleProps) {
  return (
    <Box
      draggable={active}
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = "move";
        e.dataTransfer.setData("text/plain", label);
        onDragStart(e);
      }}
      onDragEnd={onDragEnd}
      aria-label={label}
      style={{ display: "flex", cursor: "grab" }}
    >
      <Text c="dimmed" component="span" style={{ display: "flex" }}>
        <IconGripVertical size={16} />
      </Text>
    </Box>
  );
}

/**
 * The new order when the held row hovers the one at rank "to": it takes its
 * place. "null" when nothing moves.
 */
export const move = <T,>(list: T[], held: number, to: number): T[] | null => {
  if (held === to || to < 0 || to >= list.length) return null;
  const next = [...list];
  const [moved] = next.splice(held, 1);
  next.splice(to, 0, moved!);
  return next;
};

/**
 * What a drawer list shows when it has nothing yet — no category, no label, no
 * address, no tag: the empty-screen prompt, on the rows' background, in place
 * of the stack. The "Ajouter" button stays below.
 */
export function EmptyList({
  icon,
  message,
  attached = false,
  fill = false,
}: {
  icon: ComponentType<{ size?: number; color?: string }>;
  message: string;
  /** Right under a header row: square at the top, against it. */
  attached?: boolean;
  /** Takes the whole free height, its prompt centered in it. */
  fill?: boolean;
}) {
  return (
    <Box
      py="md"
      style={{
        backgroundColor: ROW_BACKGROUND,
        borderRadius: attached ? `0 0 ${RADIUS}px ${RADIUS}px` : RADIUS,
        ...(fill ? { flex: 1, display: "flex", flexDirection: "column" as const } : null),
      }}
    >
      <EmptyPanel icon={icon} message={message} size="sm" fill={fill} />
    </Box>
  );
}

/**
 * The button at the end of a row that opens what it holds — a type's
 * milestones, a workspace's accesses — stating the count: "3 jalons". The
 * application's green.
 */
export function RowButton({
  icon: Icon,
  children,
  onClick,
  rightMargin = NAME_INSET - ROW_INSET,
}: {
  icon: ComponentType<{ size?: number }>;
  children: string;
  onClick: () => void;
  /** The gap at the end of the row, on top of its inset (ROW_INSET). */
  rightMargin?: number;
}) {
  return (
    <Button
      size="compact-sm"
      radius={3}
      onClick={onClick}
      leftSection={<Icon size={14} />}
      styles={{
        root: {
          flexShrink: 0,
          backgroundColor: GREEN,
          color: "#ffffff",
          fontWeight: 500,
          // The end of the row is only ROW_INSET away: the button moves away
          // from it up to NAME_INSET, the room the text has on the left.
          marginRight: rightMargin,
        },
      }}
    >
      {children}
    </Button>
  );
}

/** The width of an "xs" checkbox. */
const CHECKBOX_SIZE = 16;

/**
 * A checkbox's place in its row: pulled closer to a handle, 2 px of air after
 * it. The pull assumes the row's usual "sm" gap; a row spaced "xs" pulls 2 px
 * less, so the box lands at the same place.
 */
const checkboxStyle = (afterHandle: boolean, gap: "sm" | "xs" = "sm"): CSSProperties => ({
  flexShrink: 0,
  marginLeft: afterHandle ? (gap === "xs" ? -3 : -5) : 0,
  marginRight: 2,
});

/**
 * A row's selection box, at its start — just after the handle when there is
 * one ("afterHandle" pulls it closer). Checked rows are deleted together from
 * the list's footer (ListFooter).
 */
export function RowCheckbox({
  label,
  checked,
  onChange,
  afterHandle = false,
  disabled = false,
  indeterminate = false,
  gap = "sm",
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  afterHandle?: boolean;
  disabled?: boolean;
  /** Some of what it stands for is checked, not all: a group's labels. */
  indeterminate?: boolean;
  /** The row's gap, when it is not the usual "sm". */
  gap?: "sm" | "xs";
}) {
  return (
    <Checkbox
      size="xs"
      aria-label={label}
      checked={checked}
      indeterminate={indeterminate}
      disabled={disabled}
      onChange={(e) => onChange(e.currentTarget.checked)}
      // Pressing the box must not start dragging the row.
      onMouseDown={(e) => e.stopPropagation()}
      style={checkboxStyle(afterHandle, gap)}
    />
  );
}

/**
 * The empty space of a row that cannot be deleted — a row being added, a
 * fixed one —: the width and margins of a RowCheckbox, so names stay aligned.
 */
export function RowCheckboxSpace({ afterHandle = false }: { afterHandle?: boolean }) {
  return <Box w={CHECKBOX_SIZE} style={checkboxStyle(afterHandle)} />;
}

/**
 * The checked rows of a list, by key. Keys that left the list (a row removed
 * another way, a list reloaded) no longer count.
 */
export function useRowSelection<K>(keys: readonly K[]) {
  const [selected, setSelected] = useState<ReadonlySet<K>>(new Set());
  const checked = keys.filter((k) => selected.has(k));
  return {
    /** The checked keys still in the list, in list order. */
    checked,
    isChecked: (key: K) => selected.has(key),
    toggle: (key: K, on: boolean) =>
      setSelected((before) => {
        const next = new Set(before);
        if (on) next.add(key);
        else next.delete(key);
        return next;
      }),
    /** Keeps only these keys checked — none by default. */
    reset: (keep: Iterable<K> = []) => setSelected(new Set(keep)),
  };
}

/**
 * Deletes the checked rows: in place of the "Ajouter" button while rows are
 * checked. The same discreet look as AddButton, in red.
 */
export function DeleteSelectedButton({
  count,
  onClick,
  ...props
}: {
  /** How many rows are checked: one names "l'élément", several "les éléments". */
  count: number;
  onClick: () => void;
} & Omit<ButtonProps, "onClick">) {
  const [hovered, setHovered] = useState(false);
  return (
    <Button
      variant="transparent"
      size="xs"
      justify="flex-start"
      px={0}
      c={hovered ? "var(--mantine-color-red-9)" : RED}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      leftSection={<IconTrash size={PLUS_SIZE} />}
      onClick={onClick}
      {...props}
    >
      {count > 1 ? "Supprimer les éléments sélectionnés" : "Supprimer l'élément sélectionné"}
    </Button>
  );
}

/**
 * Under a list: "Ajouter …", or — while rows are checked — the button that
 * deletes them. Without "addLabel" (a read-only list, nothing left to add),
 * only the delete button can show.
 */
export function ListFooter({
  addLabel,
  onAdd,
  checkedCount,
  onDeleteChecked,
  mt = 4,
  h,
}: {
  addLabel?: string;
  onAdd?: () => void;
  checkedCount: number;
  onDeleteChecked: () => void;
  mt?: number;
  /** The button's height, tighter than an "xs" button's when stacked under another. */
  h?: number;
}) {
  if (checkedCount > 0) {
    return <DeleteSelectedButton count={checkedCount} onClick={onDeleteChecked} mt={mt} h={h} />;
  }
  if (!addLabel || !onAdd) return null;
  return <AddButton label={addLabel} onClick={onAdd} mt={mt} h={h} />;
}

/** « 1 jalon », « 3 jalons ». */
export const pluralize = (n: number, word: string) => `${n} ${word}${n > 1 ? "s" : ""}`;

/**
 * A row's name, edited in place (nameFieldStyle). It is sent when the field is
 * left or on validate ("onValidate", the name without its spaces); Escape goes
 * back to the previous name.
 */
export function RowField({
  name,
  onValidate,
  placeholder,
  label,
  autoFocus,
  readOnly = false,
}: {
  name: string;
  onValidate: (name: string) => void;
  placeholder: string;
  label: string;
  autoFocus?: boolean;
  /** Shown, not edited. */
  readOnly?: boolean;
}) {
  const [input, setInput] = useState(name);
  const [focus, setFocus] = useState(false);
  // Escape leaves the field without sending anything: the exit that follows
  // knows it.
  const cancelled = useRef(false);
  return (
    <TextInput
      size="sm"
      radius={ROUNDING}
      style={{ flex: 1, minWidth: 0 }}
      styles={{ input: nameFieldStyle(focus && !readOnly) }}
      placeholder={placeholder}
      aria-label={label}
      readOnly={readOnly}
      value={input}
      onChange={(e) => setInput(e.currentTarget.value)}
      onKeyDown={(e) => {
        if (e.key === "Enter") e.currentTarget.blur();
        if (e.key === "Escape") {
          cancelled.current = true;
          e.currentTarget.blur();
        }
      }}
      autoFocus={autoFocus}
      onFocus={() => setFocus(true)}
      onBlur={() => {
        setFocus(false);
        if (cancelled.current) {
          cancelled.current = false;
          setInput(name);
          // A new row that is abandoned disappears: it has no name.
          if (!name) onValidate("");
          return;
        }
        onValidate(input.trim());
      }}
    />
  );
}
