import { Group, Input, ScrollArea, Stack, TextInput } from "@mantine/core";
import { IconDeviceLaptop, IconFileImport, IconNetwork } from "@tabler/icons-react";
import { useCallback, useContext, useEffect, useRef, useState } from "react";
import { ASSET_MODEL_MAX, VLAN_NAME_MAX } from "@milo/shared";
import type { AssetSettings } from "@milo/shared";
import { api } from "../../api";
import scroll from "../../assets/styles/ListScroll.module.css";
import { errorMessage, notifyError } from "../../lib/errors";
import { PLUS_SIZE } from "../../themes/plus";
import AddButton from "../ui/AddButton";
import { CopyPasteContext } from "../ui/CopyPasteActions";
import DeleteConfirmModal from "../ui/DeleteConfirmModal";
import { DrawerRegistrationsContext } from "../ui/IndicatorDrawer";
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

// The open board's Asset widget tables, in the drawer of an "Assets" widget:
// - "Modèles": the commercial name of the identifier a workstation reports —
//   Apple only reports "Mac14,6";
// - "VLAN": the VLAN carrying each subnet ("10.1.106.0/24" → 106).
// They are not widget settings but board data, shared by all its Asset
// widgets: they go with "Sauvegarder", like the asset labels
// (LabelGroupFields). They are presented like the drawers' lists
// (ColumnFields): one row per entry, its fields right on the row. A row
// joins the draft when you leave it, complete and changed; Escape returns it
// to what it was. Checked rows are deleted together; "Ajouter" adds an empty
// row at the end.
// VLANs can also be pasted in batches into an added row: one
// "subnet VLAN name" line each, the name optional — or imported from a CSV
// file ("Importer un CSV").


/** The width of the identifier column. */
const IDENTIFIER_WIDTH = 160;

/** The width of the subnet column. */
const SUBNET_WIDTH = 150;

/** Enough for "4094". */
const VLAN_LENGTH = 4;

/** The width of the VLAN number column. */
const VLAN_WIDTH = 50;

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
}: {
  title: string;
  description: string;
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
    // the list.
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

/**
 * The cells of a CSV text: its lines, each cut at the delimiter — ";" if the
 * first line holds one outside quotes, "," otherwise. A cell may be quoted,
 * a quote doubled inside it ("Salle ""A""").
 */
const csvCells = (text: string): string[][] => {
  const firstLine = text.split(/\r?\n/, 1)[0] ?? "";
  const delimiter = firstLine.replace(/"[^"]*"/g, "").includes(";") ? ";" : ",";
  const lines: string[][] = [];
  let line: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c !== '"') cell += c;
      else if (text[i + 1] === '"') {
        cell += '"';
        i++;
      } else quoted = false;
    } else if (c === '"') quoted = true;
    else if (c === delimiter) {
      line.push(cell);
      cell = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      line.push(cell);
      lines.push(line);
      line = [];
      cell = "";
    } else cell += c;
  }
  line.push(cell);
  lines.push(line);
  return lines.map((l) => l.map((v) => v.trim())).filter((l) => l.some(Boolean));
};

/**
 * A VLAN CSV: "VLAN, intitulé, sous-réseau" on each line, the name optional.
 * A first line whose VLAN is not a number is a header, skipped. An
 * unreadable line stops everything: its message comes back instead.
 */
const readVlanCsv = (text: string): Row[] | string => {
  const lines = csvCells(text.replace(/^\uFEFF/, ""));
  const read: Row[] = [];
  for (const [rank, cells] of lines.entries()) {
    const [vlan = "", name = "", subnet = ""] = cells;
    if (!/^\d+$/.test(vlan) || !subnet) {
      if (rank === 0) continue;
      return `Ligne ${rank + 1} illisible : « ${cells.join(" ; ")} »`;
    }
    read.push([vlan, name.slice(0, VLAN_NAME_MAX), subnet]);
  }
  return read.length > 0 ? read : "Aucun VLAN dans ce fichier";
};

/** Nothing recorded yet: the models come from the server, the VLANs are empty. */
const NOTHING: AssetSettings = { models: [], vlans: [] };

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

export default function AssetTablesFields() {
  const board = useContext(CopyPasteContext);
  const register = useContext(DrawerRegistrationsContext);
  const boardId = board?.board?.id ?? null;
  // A paste from the "Actions" menu may change the board: it is re-read.
  const pastes = board?.pastes ?? 0;

  /** What the server holds, and the draft made from it. */
  const [original, setOriginal] = useState<AssetSettings>(NOTHING);
  const [settings, setSettings] = useState<AssetSettings>(NOTHING);

  const reload = useCallback(async () => {
    if (boardId === null) return;
    try {
      const read = await api.getAssetSettings(boardId);
      setOriginal(read);
      setSettings(read);
    } catch (e) {
      notifyError(errorMessage(e));
    }
  }, [boardId]);

  useEffect(() => {
    void reload();
  }, [reload, pastes]);

  // "Sauvegarder": only the changed tables go, each whole. The server checks
  // them; an error stops the drawer's save, the draft kept.
  const state = useRef({ original, settings });
  useEffect(() => {
    state.current = { original, settings };
  }, [original, settings]);
  useEffect(() => {
    if (!register || boardId === null) return;
    return register(async () => {
      const { original: before, settings: after } = state.current;
      const data: Partial<AssetSettings> = {};
      if (!same(before.models, after.models)) data.models = after.models;
      if (!same(before.vlans, after.vlans)) data.vlans = after.vlans;
      if (data.models === undefined && data.vlans === undefined) return;
      const saved = await api.updateAssetSettings(boardId, data);
      setOriginal(saved);
      setSettings(saved);
    });
  }, [register, boardId]);

  if (boardId === null || !register) return null;

  /** A table changes in the draft only: "Sauvegarder" sends it. */
  const save = async (data: Partial<AssetSettings>): Promise<boolean> => {
    setSettings((before) => ({ ...before, ...data }));
    return true;
  };

  return (
    <>
      <ListRows
        title="Modèles"
        description="Les modèles configurés ci-dessous sont communs à l'ensemble des widgets, de type asset, du tableau actuel et uniquement pour ce tableau. Ils donnent le nom commercial de l'identifiant que déclare un poste."
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
        description="Les VLAN configurés ci-dessous sont communs à l'ensemble des widgets, de type asset, du tableau actuel et uniquement pour ce tableau. Chacun nomme le VLAN qui porte un sous-réseau."
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
        readCsv={readVlanCsv}
      />
    </>
  );
}
