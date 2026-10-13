import { Group, Input, Stack, TextInput } from "@mantine/core";
import { IconFlag } from "@tabler/icons-react";
import { useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { ComponentType, DragEvent } from "react";
import { api } from "../../api";
import { errorMessage, notifyError } from "../../lib/errors";
import MilestonesModal from "../project/MilestonesModal";
import { DEFAULT_LABEL_COLOR } from "@milo/shared";
import type { Id, ListRef, Milestone, MilestoneType } from "@milo/shared";
import { CopyPasteContext } from "./CopyPasteActions";
import { useListRef } from "../../lib/list-ref";
import { DrawerRegistrationsContext } from "./IndicatorDrawer";
import LabelColorPicker from "./LabelColorPicker";
import {
  ROUNDING,
  RowButton,
  RowCheckbox,
  ListFooter,
  useRowSelection,
  EmptyList,
  Handle,
  NAME_INSET,
  INPUT_INSET,
  INPUT_STYLE,
  move,
  pluralize,
  rowStyle,
  editKeys,
} from "./DrawerRows";

// The milestone types, in the drawer of a "Projets" widget, with the same look
// as its columns (ColumnFields): one row per item, its name inline. Its box
// selects it for deletion; "Ajouter" adds an empty row at the end. The
// labels, gathered in groups, have their own list (LabelGroupFields), the
// board's categories their tree (ProjectCategoriesFields).
//
// They are not the widget's configuration but its own data
// (lib/list-ref.tsx): nothing is sent before "Sauvegarder"
// (DrawerRegistrationsContext), and "Fermer" leaves everything as before.
// The types are sorted by name: they have no handle, and their milestones
// open from their row's menu.

/**
 * What the list manages: a milestone type. Labels have their groups
 * (LabelGroupFields), categories their tree (ProjectCategoriesFields).
 */
export type ListKind = "milestone-types";

interface Element {
  id: Id;
  name: string;
  color?: string;
  milestones?: Milestone[];
}

/** A row of the draft: "id" absent until it is created. */
interface Row {
  key: string;
  id?: Id;
  name: string;
  color: string;
}

interface ListKindInfo {
  title: string;
  add: string;
  /** "la catégorie", for the messages. */
  nounPhrase: string;
  /** The icon and message of the empty list (EmptyList). */
  icon: ComponentType<{ size?: number; color?: string }>;
  empty: string;
  withColor: boolean;
  /** False when the server orders the list itself: no handle. */
  orderable: boolean;
  read: (list: ListRef) => Promise<Element[]>;
  create: (list: ListRef, row: Row) => Promise<{ id: Id }>;
  updateStatement: (id: Id, row: Row) => Promise<unknown>;
  remove: (id: Id) => Promise<unknown>;
  store: (list: ListRef, ids: Id[]) => Promise<unknown>;
}

const NO_REORDER = async () => undefined;

const KINDS: Record<ListKind, ListKindInfo> = {
  "milestone-types": {
    title: "Types de jalons",
    add: "Ajouter un type de jalons",
    nounPhrase: "le type de jalons",
    icon: IconFlag,
    empty: "Aucun type de jalons",
    withColor: false,
    orderable: false,
    read: (list) => api.getMilestoneTypes(list),
    create: (list, l) => api.createMilestoneType(list, l.name),
    updateStatement: (id, l) => api.updateMilestoneType(id, { name: l.name }),
    remove: (id) => api.deleteMilestoneType(id),
    store: NO_REORDER,
  },
};

let counter = 0;
const newKey = () => `new-${++counter}`;

const inline = (e: Element): Row => ({
  key: String(e.id),
  id: e.id,
  name: e.name,
  color: e.color ?? DEFAULT_LABEL_COLOR,
});

/**
 * The milestones a type shows in its modal (MilestonesModal): its own,
 * and always the final one, at 100%.
 */
const milestoneCount = (type: Element | undefined): number =>
  (type?.milestones ?? []).filter((m) => m.value !== 100).length + 1;

export default function BoardListFields({ kind }: { kind: ListKind }) {
  const s = KINDS[kind];
  const board = useContext(CopyPasteContext);
  const register = useContext(DrawerRegistrationsContext);
  const list = useListRef();
  // A paste from the "Actions" menu changes the list: it is re-read.
  const pastes = board?.pastes ?? 0;

  /** What the server holds, and the draft made from it. */
  const [originals, setOriginals] = useState<Element[]>([]);
  const [rows, setRows] = useState<Row[]>([]);
  const [held, setHeld] = useState<number | null>(null);
  /** The row whose field has focus: it takes the drawer's background. */
  const [input, setInput] = useState<string | null>(null);
  /** The row just added: its name takes focus. */
  const [toName, setToName] = useState<string | null>(null);
  /** The type whose milestones modal is open. */
  const [milestonesOf, setMilestonesOf] = useState<Id | null>(null);

  const reload = useCallback(async () => {
    if (list === null) return;
    try {
      const readItems = await s.read(list);
      setOriginals(readItems);
      setRows(readItems.map(inline));
    } catch (e) {
      notifyError(errorMessage(e));
    }
  }, [list, s]);

  useEffect(() => {
    void reload();
  }, [reload, pastes]);

  // "Sauvegarder": what was removed, what changed, what is new,
  // then the order. An empty name stops everything before the first send.
  const state = useRef({ originals, rows });
  state.current = { originals, rows };
  useEffect(() => {
    if (!register || list === null) return;
    return register(async () => {
      const { originals: before, rows: after } = state.current;
      const keptKeys = after.filter((l) => l.id !== undefined || l.name.trim());
      if (keptKeys.some((l) => !l.name.trim())) {
        throw new Error(`${s.title} : chaque ligne demande un nom.`);
      }
      try {
        for (const o of before) {
          if (!keptKeys.some((l) => l.id === o.id)) await s.remove(o.id);
        }
        const ids: Id[] = [];
        for (const l of keptKeys) {
          const row = { ...l, name: l.name.trim() };
          if (l.id === undefined) {
            ids.push((await s.create(list, row)).id);
            continue;
          }
          const o = before.find((x) => x.id === l.id);
          const change =
            !o ||
            o.name !== row.name ||
            (s.withColor && (o.color ?? DEFAULT_LABEL_COLOR) !== row.color);
          if (change) await s.updateStatement(l.id, row);
          ids.push(l.id);
        }
        const orderBefore = before.filter((o) => ids.includes(o.id)).map((o) => o.id);
        const sameOrder =
          ids.length === orderBefore.length && ids.every((id, i) => id === orderBefore[i]);
        if (!sameOrder && s.orderable) await s.store(list, ids);
      } finally {
        // What was removed is gone: the list restarts from the server, even after an
        // error.
        await reload();
      }
    });
  }, [register, list, s, reload]);

  const change = (rank: number, change: Partial<Row>) =>
    setRows((before) => before.map((l, i) => (i === rank ? { ...l, ...change } : l)));

  const add = () => {
    const key = newKey();
    setRows((before) => [...before, { key, name: "", color: DEFAULT_LABEL_COLOR }]);
    setToName(key);
  };

  const selection = useRowSelection(rows.map((r) => r.key));

  const removeChecked = () => {
    const checked = new Set(selection.checked);
    setRows((before) => before.filter((r) => !checked.has(r.key)));
    selection.reset([]);
  };

  const dragHover = (e: DragEvent<HTMLElement>, rank: number) => {
    if (held === null) return;
    e.preventDefault();
    const next = move(rows, held, rank);
    if (!next) return;
    setHeld(rank);
    setRows(next);
  };

  // The open type, kept as long as it does not change: the modal restarts from it
  // on each new object, and would lose what is entered in it.
  const openType = useMemo<MilestoneType | null>(() => {
    const original = originals.find((o) => o.id === milestonesOf);
    return original && list
      ? {
          id: original.id,
          board_id: list.board,
          list_key: list.list,
          name: original.name,
          milestones: original.milestones ?? [],
        }
      : null;
  }, [originals, milestonesOf, list]);

  if (list === null) return null;

  return (
    <Input.Wrapper label={s.title}>
      {rows.length === 0 && <EmptyList icon={s.icon} message={s.empty} />}
      {rows.length > 0 && (
        <Stack gap={1}>
          {rows.map((row, rank) => (
            <Group
              key={row.key}
              gap="sm"
              wrap="nowrap"
              onDragOver={(e) => dragHover(e, rank)}
              onDrop={(e) => e.preventDefault()}
              style={rowStyle(rank, rows.length, held === rank)}
            >
              {s.orderable && (
                <Handle
                  label={`Déplacer ${row.name || s.nounPhrase}`}
                  onDragStart={() => setHeld(rank)}
                  onDragEnd={() => setHeld(null)}
                />
              )}
              <RowCheckbox
                label={`Sélectionner ${row.name || s.nounPhrase}`}
                checked={selection.isChecked(row.key)}
                onChange={(on) => selection.toggle(row.key, on)}
                afterHandle={s.orderable}
              />
              <TextInput
                size="sm"
                radius={ROUNDING}
                // The name aligns with the checkbox, as a column's with its
                // handle.
                style={{ flex: 1, marginLeft: -NAME_INSET }}
                styles={{
                  input: {
                    height: "var(--input-height-xs)",
                    minHeight: "var(--input-height-xs)",
                    paddingLeft: INPUT_INSET,
                    // Without a border, the text lands under a column's name;
                    // the focus outline sits at the field's very edge.
                    borderWidth: 0,
                    ...(input === `${row.key}-nom`
                      ? INPUT_STYLE
                      : { backgroundColor: "transparent" }),
                  },
                }}
                placeholder="Nom"
                value={row.name}
                onChange={(e) => change(rank, { name: e.currentTarget.value })}
                {...editKeys((name) => change(rank, { name }))}
                autoFocus={toName === row.key}
                onFocus={() => setInput(`${row.key}-nom`)}
                onBlur={() => {
                  setInput(null);
                  setToName(null);
                  // An added row, left without a name, disappears.
                  if (row.id === undefined && !row.name.trim()) {
                    setRows((before) => before.filter((l) => l.key !== row.key));
                  }
                }}
                aria-label={`Nom de ${row.name || s.nounPhrase}`}
              />
              {s.withColor && (
                <LabelColorPicker
                  color={row.color}
                  onChange={(color) => change(rank, { color })}
                  label={row.name || s.nounPhrase}
                  palettePadding={0}
                />
              )}
              {/* The milestones of an already created type: their count, and their modal
                  on click. They are saved from it, without waiting for
                  "Sauvegarder". */}
              {kind === "milestone-types" && row.id !== undefined && (
                <RowButton icon={IconFlag} onClick={() => setMilestonesOf(row.id!)} rightMargin={2}>
                  {pluralize(milestoneCount(originals.find((o) => o.id === row.id)), "jalon")}
                </RowButton>
              )}
            </Group>
          ))}
        </Stack>
      )}

      {/* As close as possible to the list it extends. */}
      <ListFooter
        addLabel={s.add}
        onAdd={add}
        checkedCount={selection.checked.length}
        onDeleteChecked={removeChecked}
      />

      {kind === "milestone-types" && (
        <MilestonesModal
          type={openType}
          onClose={() => setMilestonesOf(null)}
          onSave={async (milestones) => {
            if (milestonesOf === null) return;
            await api.updateMilestoneType(milestonesOf, { milestones });
            // The names draft stays as is: only the milestones change.
            setOriginals((before) =>
              before.map((o) => (o.id === milestonesOf ? { ...o, milestones } : o)),
            );
          }}
        />
      )}
    </Input.Wrapper>
  );
}
