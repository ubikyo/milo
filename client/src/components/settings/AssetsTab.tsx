import { Group, Input, ScrollArea, Stack, TextInput } from "@mantine/core";
import { IconDeviceLaptop, IconNetwork } from "@tabler/icons-react";
import { useEffect, useRef, useState } from "react";
import { ASSET_MODEL_MAX, VLAN_NAME_MAX } from "@milo/shared";
import type { AssetSettings } from "@milo/shared";
import { api } from "../../api";
import scroll from "../../assets/styles/ListScroll.module.css";
import { errorMessage, notifyError } from "../../lib/errors";
import DeleteConfirmModal from "../ui/DeleteConfirmModal";
import {
  ROUNDING,
  EmptyList,
  NAME_INSET,
  ListFooter,
  RowCheckbox,
  RowCheckboxSpace,
  nameFieldStyle,
  pluralize,
  rowStyle,
  useRowSelection,
} from "../ui/DrawerRows";
import type { ClipboardEvent, ComponentType, ReactNode } from "react";

// The "Assets" section of "Paramétrage", and its two lists:
// - "Modèles": the commercial name of the identifier a workstation reports —
//   Apple only reports "Mac14,6";
// - "VLAN": the VLAN carrying each subnet ("10.1.106.0/24" → 106).
// They are presented like the drawers' lists (ColumnFields): one
// row per entry, its fields right on the row. A row is sent to the server
// when you leave it, complete and changed; Escape returns it to what it
// was. Checked rows are deleted together; "Ajouter" adds an empty row at
// the end.
// VLANs can also be pasted in batches into an added row: one
// "subnet VLAN name" line each, the name optional.


/** The width of the identifier column. */
const IDENTIFIER_WIDTH = 160;

/** The width of the subnet column. */
const SUBNET_WIDTH = 150;

/** Enough for "4094". */
const VLAN_LENGTH = 4;

/** The width of the VLAN number column. */
const VLAN_WIDTH = 50;

/** Beyond that, the list scrolls. */
const VISIBLE_ROWS = 5;

/**
 * The height of a row and of the gap that follows it: an "xs" field (30 px),
 * the row's inset above and below (2 × 4 px), and the 1 px rule.
 */
const ROW_HEIGHT = 30 + 2 * 4 + 1;

/** A list row: its fields, as typed, in column order. */
type Row = string[];

/**
 * A column: its label, its length, and its width — fixed, or the rest
 * of the row. An "optional" column may stay empty.
 */
interface Column {
  label: string;
  maxLength: number;
  width?: number;
  digital?: boolean;
  optional?: boolean;
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
      {columns.map((column, i) => (
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
      ))}
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
function ListRows({
  title,
  columns,
  rows,
  save,
  emptyIcon,
  emptyText,
  addLabel,
  deleteTitle,
  several,
  split,
}: {
  title: string;
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

  const total = rows.length + (adding ? 1 : 0);

  return (
    <Input.Wrapper label={title}>
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
                lead={
                  <RowCheckbox
                    label={`Sélectionner ${row[0] ?? ""}`}
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
      />

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
              Voulez-vous vraiment supprimer « {rows[toDelete[0] ?? -1]?.[0]} » ? Cette action
              est irréversible.
            </>
          )
        }
      />
    </Input.Wrapper>
  );
}

const MODEL_COLUMNS: Column[] = [
  {
    label: "Identifiant",
    maxLength: ASSET_MODEL_MAX,
    width: IDENTIFIER_WIDTH,
  },
  { label: "Nom commercial", maxLength: ASSET_MODEL_MAX },
];

// The subnet on the right, after the name.
const VLAN_COLUMNS: Column[] = [
  {
    label: "VLAN",
    maxLength: VLAN_LENGTH,
    width: VLAN_WIDTH,
    digital: true,
  },
  { label: "Nom", maxLength: VLAN_NAME_MAX, optional: true },
  { label: "Sous-réseau", maxLength: 18, width: SUBNET_WIDTH },
];

/**
 * "10.1.106.0/24 106 Wi-Fi invités": the subnet, the VLAN, then the optional
 * name — separated by spaces, a tab, a ";" or a ",".
 */
const VLAN_ROW = /^(\S+\/\d+)[\s;,]+(\d+)(?:[\s;,]+(.*))?$/;

const splitVlan = (row: string): Row | null => {
  const m = VLAN_ROW.exec(row);
  if (!m) return null;
  return [m[2] ?? "", (m[3] ?? "").trim(), m[1] ?? ""];
};

export default function AssetsTab() {
  const [settings, setSettings] = useState<AssetSettings>({
    models: [],
    vlans: [],
  });

  useEffect(() => {
    api
      .getAssetSettings()
      .then(setSettings)
      .catch((e) => notifyError(errorMessage(e)));
  }, []);

  /** A table goes whole: the server replaces it in one go. */
  const save = async (
    data: Partial<AssetSettings>,
  ): Promise<boolean> => {
    setSettings(await api.updateAssetSettings(data));
    return true;
  };

  return (
    <Stack gap="xl">
      <ListRows
        title="Modèles"
        columns={MODEL_COLUMNS}
        rows={settings.models.map((m) => [m.identifier, m.name])}
        save={(list) =>
          save({
            models: list.map(([identifier = "", name = ""]) => ({
              identifier,
              name,
            })),
          })
        }
        emptyIcon={IconDeviceLaptop}
        emptyText="Aucun modèle"
        addLabel="Ajouter un modèle"
        deleteTitle="Supprimer le modèle"
        several={(n) => pluralize(n, "modèle")}
      />
      <ListRows
        title="VLAN"
        columns={VLAN_COLUMNS}
        rows={settings.vlans.map((v) => [String(v.vlan), v.name, v.subnet])}
        save={(list) =>
          save({
            vlans: list.map(([vlan = "", name = "", subnet = ""]) => ({
              subnet,
              vlan: Number(vlan),
              name,
            })),
          })
        }
        emptyIcon={IconNetwork}
        emptyText="Aucun VLAN"
        addLabel="Ajouter un VLAN"
        deleteTitle="Supprimer le VLAN"
        // "VLAN" does not take an "s".
        several={(n) => `${n} VLAN`}
        split={splitVlan}
      />
    </Stack>
  );
}
