import { Group, Input, Menu, ScrollArea, Stack, TextInput } from "@mantine/core";
import { IconDeviceLaptop, IconNetwork, IconTrash } from "@tabler/icons-react";
import { useEffect, useRef, useState } from "react";
import { ASSET_MODEL_MAX, VLAN_NAME_MAX } from "@milo/shared";
import type { AssetSettings } from "@milo/shared";
import { api } from "../../api";
import scroll from "../../assets/styles/ListScroll.module.css";
import { errorMessage, notifyError } from "../../lib/errors";
import { RED } from "../../themes/colors";
import AddButton from "../ui/AddButton";
import DeleteConfirmModal from "../ui/DeleteConfirmModal";
import {
  ROUNDING,
  EmptyList,
  ROW_INSET,
  nameFieldStyle,
  rowStyle,
} from "../ui/DrawerRows";
import PointMenu, { menuPosition, type PointMenuPosition } from "../ui/PointMenu";
import type { ClipboardEvent, ComponentType } from "react";

// The "Assets" section of "Paramétrage", and its two lists:
// - "Modèles": the commercial name of the identifier a workstation reports —
//   Apple only reports "Mac14,6";
// - "VLAN": the VLAN carrying each subnet ("10.1.106.0/24" → 106).
// They are presented like the drawers' lists (ColumnFields): one
// row per entry, its fields right on the row. A row is sent to the server
// when you leave it, complete and changed; Escape returns it to what it
// was. Right-click deletes it; "Ajouter" adds an empty row at the end.
// VLANs can also be pasted in batches into an added row: one
// "subnet VLAN name" line each, the name optional.

/** The width of the first column: identifier or subnet. */
const FIRST_WIDTH = 200;

/** Enough for "4094". */
const VLAN_LENGTH = 4;

/** The width of the VLAN number column. */
const VLAN_WIDTH = 60;

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
  onContextMenu?: (e: React.MouseEvent<HTMLElement>) => void;
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
  onContextMenu,
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
      onContextMenu={onContextMenu}
      onBlur={(e) => {
        if (row.current?.contains(e.relatedTarget as Node | null)) return;
        void leave();
      }}
      style={{ ...rowStyle(rank, total, false), paddingLeft: ROW_INSET }}
    >
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
          style={columnStyle(column)}
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
  split?: (row: string) => Row | null;
}) {
  // The added row, waiting for its fields.
  const [adding, setAdding] = useState(false);
  const [menu, setMenu] = useState<{ rank: number; position: PointMenuPosition } | null>(null);
  const [toDelete, setToDelete] = useState<number | null>(null);

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
                onContextMenu={(e) => setMenu({ rank, position: menuPosition(e) })}
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
                onPaste={split ? paste : undefined}
              />
            )}
          </Stack>
        </ScrollArea.Autosize>
      )}
      {/* As close as possible to the list it extends. */}
      <AddButton label={addLabel} onClick={() => setAdding(true)} mt={4} />

      {menu && (
        <PointMenu position={menu.position} onClose={() => setMenu(null)}>
          <Menu.Item
            color={RED}
            leftSection={<IconTrash size={16} />}
            onClick={() => {
              setToDelete(menu.rank);
              setMenu(null);
            }}
          >
            Supprimer
          </Menu.Item>
        </PointMenu>
      )}

      <DeleteConfirmModal
        opened={toDelete !== null}
        onClose={() => setToDelete(null)}
        onConfirm={async () => {
          const rank = toDelete;
          setToDelete(null);
          if (rank !== null) await send(rows.filter((_, i) => i !== rank));
        }}
        title={deleteTitle}
        message={
          <>
            Voulez-vous vraiment supprimer « {rows[toDelete ?? -1]?.[0]} » ? Cette action est
            irréversible.
          </>
        }
      />
    </Input.Wrapper>
  );
}

const MODEL_COLUMNS: Column[] = [
  {
    label: "Identifiant",
    maxLength: ASSET_MODEL_MAX,
    // Shorter than a subnet: "Mac14,6".
    width: FIRST_WIDTH - 40,
  },
  { label: "Nom commercial", maxLength: ASSET_MODEL_MAX },
];

const VLAN_COLUMNS: Column[] = [
  { label: "Sous-réseau", maxLength: 18, width: FIRST_WIDTH },
  {
    label: "VLAN",
    maxLength: VLAN_LENGTH,
    width: VLAN_WIDTH,
    digital: true,
  },
  { label: "Nom", maxLength: VLAN_NAME_MAX, optional: true },
];

/**
 * "10.1.106.0/24 106 Wi-Fi invités": the subnet, the VLAN, then the optional
 * name — separated by spaces, a tab, a ";" or a ",".
 */
const VLAN_ROW = /^(\S+\/\d+)[\s;,]+(\d+)(?:[\s;,]+(.*))?$/;

const splitVlan = (row: string): Row | null => {
  const m = VLAN_ROW.exec(row);
  if (!m) return null;
  return [m[1] ?? "", m[2] ?? "", (m[3] ?? "").trim()];
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
      />
      <ListRows
        title="VLAN"
        columns={VLAN_COLUMNS}
        rows={settings.vlans.map((v) => [v.subnet, String(v.vlan), v.name])}
        save={(list) =>
          save({
            vlans: list.map(([subnet = "", vlan = "", name = ""]) => ({
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
        split={splitVlan}
      />
    </Stack>
  );
}
