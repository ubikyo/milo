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

// La section « Assets » du Paramétrage, et ses deux listes :
// - « Modèles » : le nom commercial de l'identifiant qu'un poste déclare —
//   Apple ne remonte que « Mac14,6 » ;
// - « VLAN » : le VLAN qui porte chaque sous-réseau (« 10.1.106.0/24 » → 106).
// Elles se présentent comme les listes des tiroirs (ChampsColonnes) : une
// ligne par entrée, ses champs à même la ligne. Une ligne part au serveur
// quand on la quitte, complète et changée ; Échap la ramène à ce qu'elle
// était. Le clic droit la supprime ; « Ajouter » pose une ligne vide au bout.
// Les VLAN se collent aussi par lots dans une ligne ajoutée : une ligne
// « sous-réseau VLAN nom » chacun, le nom facultatif.

/** La largeur de la première colonne : identifiant ou sous-réseau. */
const FIRST_WIDTH = 200;

/** Assez pour « 4094 ». */
const VLAN_LENGTH = 4;

/** La largeur de la colonne des numéros de VLAN. */
const VLAN_WIDTH = 60;

/** Au-delà, la liste défile. */
const VISIBLE_ROWS = 5;

/**
 * La hauteur d'une ligne et de l'écart qui la suit : un champ « xs » (30 px),
 * le retrait de la ligne en haut et en bas (2 × 4 px), et le filet de 1 px.
 */
const ROW_HEIGHT = 30 + 2 * 4 + 1;

/** Une ligne d'une liste : ses champs, tels qu'on les saisit, dans l'ordre des colonnes. */
type Row = string[];

/**
 * Une colonne : son libellé, sa longueur, et sa largeur — fixe, ou le reste
 * de la ligne. Une colonne « facultative » peut rester vide.
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
  /** Vrai pour la ligne ajoutée, pas encore enregistrée. */
  newRow?: boolean;
  /** La ligne complète et changée part : vrai quand le serveur l'a prise. */
  onValidate: (row: Row) => Promise<boolean>;
  /** La ligne ajoutée, quittée vide ou abandonnée. */
  onAbandon?: () => void;
  onContextMenu?: (e: React.MouseEvent<HTMLElement>) => void;
  onPaste?: (e: ClipboardEvent<HTMLInputElement>) => void;
}

/** Une ligne : ses champs à même la ligne, et son brouillon le temps de la saisie. */
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
  // Échap quitte la ligne sans rien envoyer : la sortie qui suit le sait.
  const cancelled = useRef(false);

  const full = (l: Row) => columns.every((c, i) => c.optional || Boolean(l[i]));

  // Quitter un champ pour un autre de la même ligne n'enregistre pas.
  const leave = async () => {
    const after = cleaned(draft);
    if (cancelled.current) {
      cancelled.current = false;
      if (newRow) return onAbandon?.();
      return setDraft(value);
    }
    if (newRow) {
      if (after.every((v) => !v)) return onAbandon?.();
      // Incomplète, la ligne ajoutée attend la suite.
      if (full(after)) await onValidate(after);
      return;
    }
    // Vidée ou inchangée : elle revient à ce qu'elle était.
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
            // Consommée : la fenêtre qui porte ce champ n'enregistre pas en plus.
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
 * Une liste à plusieurs champs par ligne. Elle part entière au serveur à chaque
 * changement (`enregistrer`), qui la vérifie et la renvoie telle qu'il la
 * garde.
 *
 * `decouper`, s'il est donné, permet de coller plusieurs lignes d'un coup dans
 * la ligne ajoutée : chaque ligne du presse-papiers devient une ligne.
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
  // La ligne ajoutée, en attente de ses champs.
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
   * Un collage de plusieurs lignes — ou d'une seule qui porte déjà ses
   * champs — les ajoute toutes d'un coup. Une ligne illisible arrête tout :
   * rien n'est ajouté, et on dit laquelle.
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
        // Cinq lignes au plus à la fois : au-delà, la liste défile. Une ligne
        // ajoutée, qui prend le focus, s'y montre d'elle-même.
        <ScrollArea.Autosize
          mah={VISIBLE_ROWS * ROW_HEIGHT}
          type="auto"
          scrollbars="y"
          classNames={{ scrollbar: scroll.scrollbar, thumb: scroll.thumb }}
        >
          <Stack gap={1}>
            {rows.map((row, rank) => (
              <EditableRow
                // Une ligne relue du serveur repart de sa nouvelle valeur.
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
      {/* Au plus près de la liste qu'il allonge. */}
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
    // Plus court qu'un sous-réseau : « Mac14,6 ».
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
 * « 10.1.106.0/24 106 Wi-Fi invités » : le sous-réseau, le VLAN, puis le nom
 * facultatif — séparés d'espaces, d'une tabulation, d'un « ; » ou d'une « , ».
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

  /** Une table part entière : le serveur la remplace d'un coup. */
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
