import { Box, Group, Input, ScrollArea, Select, Stack, TextInput } from "@mantine/core";
import { IconFileImport } from "@tabler/icons-react";
import { useRef, useState } from "react";
import type { ClipboardEvent, ComponentType, ReactNode } from "react";
import scroll from "../../assets/styles/ListScroll.module.css";
import { errorMessage, notifyError } from "../../lib/errors";
import { PLUS_SIZE } from "../../themes/plus";
import AddButton from "./AddButton";
import DeleteConfirmModal from "./DeleteConfirmModal";
import {
  ROUNDING,
  EmptyList,
  NAME_INSET,
  ListFooter,
  RowCheckbox,
  RowCheckboxSpace,
  nameFieldStyle,
  rowStyle,
  useRowSelection,
} from "./DrawerRows";

// The lists of a drawer whose rows carry several fields — a board's asset
// tables: the managed device assets' models and VLANs
// (ManagedDeviceAssetTablesFields), the declared assets' lists
// (DeclaredAssetTablesFields). They are presented like the drawers' lists
// (ColumnFields): one row per entry, its fields right on the row — typed, or
// chosen among options. A row joins the draft when you leave it, complete and
// changed; Escape returns it to what it was. Checked rows are deleted
// together; "Ajouter" adds an empty row at the end.

/**
 * The height of "Ajouter" and "Importer un CSV": their text line, as in the
 * label groups (LabelGroupsEditor) — the two read as one block.
 */
const ACTION_HEIGHT = 20;

/** Beyond that, the list scrolls. */
const VISIBLE_ROWS = 5;

/**
 * The height of a row and of the gap that follows it: an "xs" field (30 px),
 * the row's inset above and below (2 × 4 px), and the 1 px rule.
 */
const ROW_HEIGHT = 30 + 2 * 4 + 1;

/** A list row: its fields, as typed, in column order. */
export type Row = string[];

/**
 * A column: its label, its length, and its width — fixed, or the rest
 * of the row. An "optional" column may stay empty. With "options", the
 * field is a choice among them rather than typed.
 */
export interface Column {
  label: string;
  maxLength: number;
  width?: number;
  digital?: boolean;
  optional?: boolean;
  options?: string[];
}

const empty = (columns: Column[]): Row => columns.map(() => "");

const columnStyle = (column: Column) =>
  column.width ? { width: column.width, flexShrink: 0 } : { flex: 1, minWidth: 0 };

const cleaned = (l: Row): Row => l.map((v) => v.trim());

interface EditableRowProps {
  columns: Column[];
  value: Row;
  rank: number;
  total: number;
  /** True for the added row, not yet saved. */
  newRow?: boolean;
  /** The complete, changed row is sent: true when the server has taken it. */
  onValidate: (row: Row) => Promise<boolean>;
  /** The added row, left empty or abandoned. */
  onAbandon?: () => void;
  /** At the start of the row: its checkbox, or an empty space of its width. */
  lead: ReactNode;
  onPaste?: (e: ClipboardEvent<HTMLInputElement>) => void;
  /** After the checkbox, before the fields: a button of its own. */
  leading?: ReactNode;
  /** At the end of the row, after its fields: a button of its own. */
  trailing?: ReactNode;
}

/** A row: its fields right on the row, and its draft while typing. */
function EditableRow({
  columns,
  value,
  rank,
  total,
  newRow,
  onValidate,
  onAbandon,
  lead,
  onPaste,
  leading,
  trailing,
}: EditableRowProps) {
  const [draft, setDraft] = useState<Row>(value);
  const [focus, setFocus] = useState<number | null>(null);
  const row = useRef<HTMLDivElement | null>(null);
  // Escape leaves the row without sending anything: the exit that follows knows it.
  const cancelled = useRef(false);

  const full = (l: Row) => columns.every((c, i) => c.optional || Boolean(l[i]));

  // Leaving a field for another on the same row does not save.
  const leave = async () => {
    const after = cleaned(draft);
    if (cancelled.current) {
      cancelled.current = false;
      if (newRow) return onAbandon?.();
      return setDraft(value);
    }
    if (newRow) {
      if (after.every((v) => !v)) return onAbandon?.();
      // Incomplete, the added row waits for the rest.
      if (full(after)) await onValidate(after);
      return;
    }
    // Emptied or unchanged: it returns to what it was.
    if (!full(after) || after.every((v, i) => v === value[i])) return setDraft(value);
    if (!(await onValidate(after))) setDraft(value);
  };

  return (
    <Group
      ref={row}
      gap="xs"
      wrap="nowrap"
      onBlur={(e) => {
        if (row.current?.contains(e.relatedTarget as Node | null)) return;
        void leave();
      }}
      style={rowStyle(rank, total, false)}
    >
      {lead}
      {/* The first field tucks against the checkbox (NAME_INSET): the
          button keeps that room on its right. */}
      {leading && <Box style={{ flexShrink: 0, marginRight: NAME_INSET }}>{leading}</Box>}
      {columns.map((column, i) =>
        column.options ? (
          <Select
            key={column.label}
            size="sm"
            radius={ROUNDING}
            placeholder={column.label}
            aria-label={column.label}
            data={column.options}
            value={draft[i] || null}
            onChange={(chosen) =>
              setDraft((before) => before.map((v, j) => (j === i ? (chosen ?? "") : v)))
            }
            allowDeselect={false}
            nothingFoundMessage="Aucun choix"
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                cancelled.current = true;
                e.currentTarget.blur();
              }
            }}
            data-mantine-stop-propagation
            autoFocus={newRow && i === 0}
            onFocus={() => setFocus(i)}
            onBlurCapture={() => setFocus(null)}
            style={{ ...columnStyle(column), ...(i === 0 ? { marginLeft: -NAME_INSET } : null) }}
            styles={{ input: nameFieldStyle(focus === i) }}
          />
        ) : (
          <TextInput
            key={column.label}
            size="sm"
            radius={ROUNDING}
            placeholder={column.label}
            aria-label={column.label}
            value={draft[i] ?? ""}
            onChange={(e) => {
              const text = e.currentTarget.value;
              setDraft((before) =>
                before.map((v, j) => (j === i ? (column.digital ? text.replace(/\D/g, "") : text) : v)),
              );
            }}
            onKeyDown={(e) => {
              // Consumed: the window that holds this field does not also save.
              if (e.key === "Enter") {
                e.preventDefault();
                e.currentTarget.blur();
              }
              if (e.key === "Escape") {
                cancelled.current = true;
                e.currentTarget.blur();
              }
            }}
            // Escape cancels the row alone: the settings window stays open
            // (Mantine closes it from a window listener this attribute holds back).
            data-mantine-stop-propagation
            onPaste={i === 0 ? onPaste : undefined}
            maxLength={column.maxLength}
            inputMode={column.digital ? "numeric" : undefined}
            autoFocus={newRow && i === 0}
            onFocus={() => setFocus(i)}
            onBlurCapture={() => setFocus(null)}
            // The first field aligns with the checkbox, as a drawer column's
            // with its handle.
            style={{ ...columnStyle(column), ...(i === 0 ? { marginLeft: -NAME_INSET } : null) }}
            styles={{ input: nameFieldStyle(focus === i) }}
          />
        ),
      )}
      {trailing}
    </Group>
  );
}

/**
 * A list with several fields per row. It goes whole to the server on each
 * change (`save`), which checks it and returns it as it
 * keeps it.
 *
 * `split`, if given, allows pasting several lines at once into the
 * added row: each clipboard line becomes a row.
 */
export function ListRows({
  title,
  description,
  columns,
  rows,
  save,
  emptyIcon,
  emptyText,
  addLabel,
  deleteTitle,
  several,
  split,
  readCsv,
  nameOf = (row) => row[0] ?? "",
  leading,
  trailing,
}: {
  title: string;
  /** Under the title: whom the list is shared by, when it is a board's. */
  description?: string;
  columns: Column[];
  rows: Row[];
  save: (list: Row[]) => Promise<boolean>;
  emptyIcon: ComponentType<{ size?: number }>;
  emptyText: string;
  addLabel: string;
  deleteTitle: string;
  /** Several rows, to delete: "3 modèles". */
  several: (n: number) => string;
  split?: (row: string) => Row | null;
  /**
   * Shows "Importer un CSV" under the list: the file's rows, or why it is
   * unreadable. They replace the rows with the same last field (the VLAN's
   * subnet), the others are added at the end.
   */
  readCsv?: (text: string) => Row[] | string;
  /** What names a row, to delete it: its first field by default. */
  nameOf?: (row: Row) => string;
  /**
   * At the start of each row, after its checkbox: a button of its own (the
   * label templates' reset) — for the added row, not yet saved, "null".
   */
  leading?: (row: Row | null, rank: number) => ReactNode;
  /** At the end of each saved row: a button of its own (the label templates' "Modèle"). */
  trailing?: (row: Row, rank: number) => ReactNode;
}) {
  // The added row, waiting for its fields.
  const [adding, setAdding] = useState(false);
  // The checked rows, by rank, and those awaiting confirmation of their
  // deletion.
  const selection = useRowSelection(rows.map((_, rank) => rank));
  const [toDelete, setToDelete] = useState<number[]>([]);

  const send = async (list: Row[]): Promise<boolean> => {
    try {
      return await save(list);
    } catch (e) {
      notifyError(errorMessage(e));
      return false;
    }
  };

  /**
   * Pasting several lines — or a single one that already carries its
   * fields — adds them all at once. An unreadable line stops everything:
   * nothing is added, and we say which one.
   */
  const paste = (e: ClipboardEvent<HTMLInputElement>) => {
    if (!split) return;
    const raw = e.clipboardData
      .getData("text")
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean);
    if (raw.length === 0) return;
    if (raw.length === 1 && !split(raw[0] ?? "")) return; // un collage ordinaire
    e.preventDefault();
    const readRows: Row[] = [];
    for (const line of raw) {
      const readValue = split(line);
      if (!readValue) {
        notifyError(`Ligne illisible : « ${line} »`);
        return;
      }
      readRows.push(readValue);
    }
    void send([...rows, ...readRows]).then((ok) => ok && setAdding(false));
  };

  const csvInput = useRef<HTMLInputElement | null>(null);

  const importCsv = async (file: File) => {
    if (!readCsv) return;
    const read = readCsv(await file.text());
    if (typeof read === "string") return notifyError(read, `Import de « ${file.name} »`);
    const key = (row: Row) => row[row.length - 1];
    const replaced = new Set(read.map(key));
    if (await send([...rows.filter((row) => !replaced.has(key(row))), ...read])) {
      setAdding(false);
      selection.reset();
    }
  };

  const total = rows.length + (adding ? 1 : 0);

  return (
    // Board data, not the widget's: say so under the label, at 20 px from
    // the list — when there is something to say.
    <Input.Wrapper
      label={title}
      description={description}
      styles={{ description: { paddingBottom: 20 } }}
    >
      {total === 0 ? (
        <EmptyList icon={emptyIcon} message={emptyText} />
      ) : (
        // Five rows at most at a time: beyond that, the list scrolls. An added
        // row, which takes focus, shows itself there.
        <ScrollArea.Autosize
          mah={VISIBLE_ROWS * ROW_HEIGHT}
          type="auto"
          scrollbars="y"
          classNames={{ scrollbar: scroll.scrollbar, thumb: scroll.thumb }}
        >
          <Stack gap={1}>
            {rows.map((row, rank) => (
              <EditableRow
                // A row reread from the server restarts from its new value.
                key={`${rank}-${row.join("|")}`}
                columns={columns}
                value={row}
                rank={rank}
                total={total}
                onValidate={(after) => send(rows.map((l, i) => (i === rank ? after : l)))}
                leading={leading?.(row, rank)}
                trailing={trailing?.(row, rank)}
                lead={
                  <RowCheckbox
                    label={`Sélectionner ${nameOf(row)}`}
                    checked={selection.isChecked(rank)}
                    onChange={(on) => selection.toggle(rank, on)}
                  />
                }
              />
            ))}
            {adding && (
              <EditableRow
                columns={columns}
                value={empty(columns)}
                rank={total - 1}
                total={total}
                newRow
                onValidate={async (after) => {
                  const ok = await send([...rows, after]);
                  if (ok) setAdding(false);
                  return ok;
                }}
                onAbandon={() => setAdding(false)}
                // Not saved yet: nothing to delete.
                lead={<RowCheckboxSpace />}
                leading={leading?.(null, total - 1)}
                onPaste={split ? paste : undefined}
              />
            )}
          </Stack>
        </ScrollArea.Autosize>
      )}
      {/* As close as possible to the list it extends. */}
      <ListFooter
        addLabel={addLabel}
        onAdd={() => setAdding(true)}
        checkedCount={selection.checked.length}
        onDeleteChecked={() => setToDelete(selection.checked)}
        h={readCsv ? ACTION_HEIGHT : undefined}
      />
      {readCsv && (
        // On its own line, right under "Ajouter un VLAN", with the same gap as
        // between "Ajouter une étiquette" and "Ajouter un groupe".
        <div>
          <AddButton
            label="Importer un CSV"
            leftSection={<IconFileImport size={PLUS_SIZE} />}
            onClick={() => csvInput.current?.click()}
            h={ACTION_HEIGHT}
          />
          <input
            ref={csvInput}
            type="file"
            accept=".csv,text/csv,text/plain"
            hidden
            onChange={(e) => {
              const file = e.currentTarget.files?.[0];
              // The same file chosen again still triggers a change.
              e.currentTarget.value = "";
              if (file) void importCsv(file);
            }}
          />
        </div>
      )}

      {/* The whole list goes to the server without the deleted rows, in one
          call. */}
      <DeleteConfirmModal
        opened={toDelete.length > 0}
        onClose={() => setToDelete([])}
        onConfirm={async () => {
          const ranks = new Set(toDelete);
          setToDelete([]);
          if (await send(rows.filter((_, i) => !ranks.has(i)))) selection.reset();
        }}
        title={toDelete.length > 1 ? `Supprimer ${several(toDelete.length)}` : deleteTitle}
        message={
          toDelete.length > 1 ? (
            <>
              Voulez-vous vraiment supprimer ces {several(toDelete.length)} ? Cette action est
              irréversible.
            </>
          ) : (
            <>
              Voulez-vous vraiment supprimer « {nameOf(rows[toDelete[0] ?? -1] ?? [])} » ? Cette action
              est irréversible.
            </>
          )
        }
      />
    </Input.Wrapper>
  );
}
