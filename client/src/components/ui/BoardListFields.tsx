import { Group, Input, Menu, NumberInput, Stack, TextInput } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { IconCategory, IconFlag, IconTag, IconTrash } from "@tabler/icons-react";
import { useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { ComponentType, DragEvent } from "react";
import { api } from "../../api";
import { errorMessage, notifyError } from "../../lib/errors";
import { RED } from "../../themes/colors";
import MilestonesModal from "../project/MilestonesModal";
import { DEFAULT_LABEL_COLOR } from "@milo/shared";
import type { Id, Milestone, MilestoneType } from "@milo/shared";
import { CopyPasteContext } from "./CopyPasteActions";
import AddButton from "./AddButton";
import { DrawerRegistrationsContext } from "./IndicatorDrawer";
import LabelColorPicker from "./LabelColorPicker";
import {
  ROUNDING,
  RowButton,
  EmptyList,
  Handle,
  ROW_INSET,
  NAME_INSET,
  INPUT_STYLE,
  move,
  pluralize,
  rowStyle,
} from "./DrawerRows";
import PointMenu, { menuPosition, type PointMenuPosition } from "./PointMenu";

// The categories or labels of the open board, in the drawer of a
// "Projets" or "Tâches" widget, with the same look as its columns
// (ColumnFields): one row per item, its handle for dragging, its
// name inline, its color and its weight for a label. Right-click
// removes it; "Ajouter" adds an empty row at the end.
//
// These are not widget settings but board data: nothing is
// sent before "Sauvegarder" (DrawerRegistrationsContext), and "Fermer"
// leaves everything as before. What is still in use — a category that files
// projects, a label in place — cannot be removed: the server refuses, and
// the notification says so.
//
// Milestone types are set here too, under the categories, although they
// are shared by all boards: sorted by name, they have no
// handle, and their milestones open from their row's menu.

/** What the list manages: a category, a card or project label. */
export type ListKind = "categories" | "task-labels" | "project-labels" | "milestone-types";

interface Element {
  id: Id;
  name: string;
  color?: string;
  weight?: number;
  milestones?: Milestone[];
}

/** A row of the draft: "id" absent until it is created. */
interface Row {
  key: string;
  id?: Id;
  name: string;
  color: string;
  weight: number;
}

interface ListKindInfo {
  title: string;
  add: string;
  /** What the list shares, stated under it. */
  scope: string;
  /** "la catégorie", for the messages. */
  nounPhrase: string;
  /** The icon and message of the empty list (EmptyList). */
  icon: ComponentType<{ size?: number; color?: string }>;
  empty: string;
  withColor: boolean;
  withWeight: boolean;
  /** False when the server orders the list itself: no handle. */
  orderable: boolean;
  read: (boardId: Id) => Promise<Element[]>;
  create: (boardId: Id, row: Row) => Promise<{ id: Id }>;
  updateStatement: (id: Id, row: Row) => Promise<unknown>;
  remove: (id: Id) => Promise<unknown>;
  store: (boardId: Id, ids: Id[]) => Promise<unknown>;
}

const NO_REORDER = async () => undefined;

const KINDS: Record<ListKind, ListKindInfo> = {
  categories: {
    title: "Catégories",
    add: "Ajouter une catégorie",
    scope: "Les catégories configurées ci-dessous sont communes à l'ensemble des widgets, de type projet, du tableau actuel et uniquement pour ce tableau.",
    nounPhrase: "la catégorie",
    icon: IconCategory,
    empty: "Aucune catégorie",
    withColor: false,
    withWeight: false,
    orderable: true,
    read: (boardId) => api.getCategories(String(boardId)),
    create: (boardId, l) => api.createCategory(boardId, l.name),
    updateStatement: (id, l) => api.updateCategory(id, { name: l.name }),
    remove: (id) => api.deleteCategory(id),
    store: (boardId, ids) => api.reorderCategories(boardId, ids),
  },
  "task-labels": {
    title: "Étiquettes",
    add: "Ajouter une étiquette",
    scope: "Les étiquettes configurées ci-dessous sont communes à l'ensemble des widgets, de type tâche, du tableau actuel et uniquement pour ce tableau.",
    nounPhrase: "l'étiquette",
    icon: IconTag,
    empty: "Aucune étiquette",
    withColor: true,
    withWeight: false,
    orderable: true,
    read: (boardId) => api.getLabels(boardId),
    create: (boardId, l) => api.createLabel(boardId, l.name, l.color),
    updateStatement: (id, l) => api.updateLabel(id, { name: l.name, color: l.color }),
    remove: (id) => api.deleteLabel(id),
    store: (boardId, ids) => api.reorderLabels(boardId, ids),
  },
  "project-labels": {
    title: "Étiquettes",
    add: "Ajouter une étiquette",
    scope: "Les étiquettes configurées ci-dessous sont communes à l'ensemble des widgets, de type projet, du tableau actuel et uniquement pour ce tableau.",
    nounPhrase: "l'étiquette",
    icon: IconTag,
    empty: "Aucune étiquette",
    withColor: true,
    withWeight: true,
    orderable: true,
    read: (boardId) => api.getProjectLabels(boardId),
    create: (boardId, l) => api.createProjectLabel(boardId, l.name, l.color, l.weight),
    updateStatement: (id, l) =>
      api.updateProjectLabel(id, { name: l.name, color: l.color, weight: l.weight }),
    remove: (id) => api.deleteProjectLabel(id),
    store: (boardId, ids) => api.reorderProjectLabels(boardId, ids),
  },
  "milestone-types": {
    title: "Types de jalons",
    add: "Ajouter un type de jalons",
    scope: "Les types de jalons configurés ci-dessous sont communs à l'ensemble des tableaux de projets.",
    nounPhrase: "le type de jalons",
    icon: IconFlag,
    empty: "Aucun type de jalons",
    withColor: false,
    withWeight: false,
    orderable: false,
    read: () => api.getMilestoneTypes(),
    create: (_boardId, l) => api.createMilestoneType(l.name),
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
  weight: e.weight ?? 0,
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
  const boardId = board?.board?.id ?? null;
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
  const [menu, setMenu] = useState<{ rank: number; position: PointMenuPosition } | null>(null);
  /** The type whose milestones modal is open. */
  const [milestonesOf, setMilestonesOf] = useState<Id | null>(null);

  const reload = useCallback(async () => {
    if (boardId === null) return;
    try {
      const readItems = await s.read(boardId);
      setOriginals(readItems);
      setRows(readItems.map(inline));
    } catch (e) {
      notifyError(errorMessage(e));
    }
  }, [boardId, s]);

  useEffect(() => {
    void reload();
  }, [reload, pastes]);

  // "Sauvegarder": what was removed, what changed, what is new,
  // then the order. An empty name stops everything before the first send.
  const state = useRef({ originals, rows });
  state.current = { originals, rows };
  useEffect(() => {
    if (!register || boardId === null) return;
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
            ids.push((await s.create(boardId, row)).id);
            continue;
          }
          const o = before.find((x) => x.id === l.id);
          const change =
            !o ||
            o.name !== row.name ||
            (s.withColor && (o.color ?? DEFAULT_LABEL_COLOR) !== row.color) ||
            (s.withWeight && (o.weight ?? 0) !== row.weight);
          if (change) await s.updateStatement(l.id, row);
          ids.push(l.id);
        }
        const orderBefore = before.filter((o) => ids.includes(o.id)).map((o) => o.id);
        const sameOrder =
          ids.length === orderBefore.length && ids.every((id, i) => id === orderBefore[i]);
        if (!sameOrder && s.orderable) await s.store(boardId, ids);
      } finally {
        // What was removed is gone: the list restarts from the server, even after an
        // error.
        await reload();
      }
    });
  }, [register, boardId, s, reload]);

  const change = (rank: number, change: Partial<Row>) =>
    setRows((before) => before.map((l, i) => (i === rank ? { ...l, ...change } : l)));

  const add = () => {
    const key = newKey();
    setRows((before) => [...before, { key, name: "", color: DEFAULT_LABEL_COLOR, weight: 0 }]);
    setToName(key);
  };

  const remove = (rank: number) => setRows((before) => before.filter((_, i) => i !== rank));

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
    return original ? { id: original.id, name: original.name, milestones: original.milestones ?? [] } : null;
  }, [originals, milestonesOf]);

  if (boardId === null) return null;

  return (
    // These are not widget settings: say so under the label, at
    // 20 px from the list.
    <Input.Wrapper
      label={s.title}
      description={s.scope}
      styles={{ description: { paddingBottom: 20 } }}
    >
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
              onContextMenu={(e) => setMenu({ rank, position: menuPosition(e) })}
              // Without a handle, the field aligns left as it aligns
              // right: at ROW_INSET from the row's edge.
              style={{
                ...rowStyle(rank, rows.length, held === rank),
                ...(s.orderable ? null : { paddingLeft: ROW_INSET }),
              }}
            >
              {s.orderable && (
                <Handle
                  label={`Déplacer ${row.name || s.nounPhrase}`}
                  onDragStart={() => setHeld(rank)}
                  onDragEnd={() => setHeld(null)}
                />
              )}
              <TextInput
                size="sm"
                radius={ROUNDING}
                // The name aligns with the handle, like a column's.
                style={{ flex: 1, marginLeft: s.orderable ? -NAME_INSET : 0 }}
                styles={{
                  input: {
                    height: "var(--input-height-xs)",
                    minHeight: "var(--input-height-xs)",
                    paddingLeft: NAME_INSET,
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
                />
              )}
              {s.withWeight && (
                <NumberInput
                  size="xs"
                  radius={ROUNDING}
                  w={100}
                  placeholder="Poids"
                  allowDecimal={false}
                  aria-label={`Poids de ${row.name || s.nounPhrase}`}
                  value={row.weight}
                  onChange={(value) => change(rank, { weight: Number(value) || 0 })}
                  onFocus={() => setInput(`${row.key}-poids`)}
                  onBlur={() => setInput(null)}
                  styles={
                    input === `${row.key}-poids` ? { input: INPUT_STYLE } : undefined
                  }
                />
              )}
              {/* The milestones of an already created type: their count, and their modal
                  on click. They are saved from it, without waiting for
                  "Sauvegarder". */}
              {kind === "milestone-types" && row.id !== undefined && (
                <RowButton icon={IconFlag} onClick={() => setMilestonesOf(row.id!)}>
                  {pluralize(milestoneCount(originals.find((o) => o.id === row.id)), "jalon")}
                </RowButton>
              )}
            </Group>
          ))}
        </Stack>
      )}

      {/* As close as possible to the list it extends. */}
      <AddButton label={s.add} onClick={add} mt={4} />

      {menu && (
        <PointMenu position={menu.position} onClose={() => setMenu(null)}>
          {/* The milestones of an already created type: they are saved from their
              modal, without waiting for "Sauvegarder". */}
          {kind === "milestone-types" && rows[menu.rank]?.id !== undefined && (
            <Menu.Item
              leftSection={<IconFlag size={16} />}
              onClick={() => setMilestonesOf(rows[menu.rank]!.id!)}
            >
              Jalons
            </Menu.Item>
          )}
          <Menu.Item
            color={RED}
            leftSection={<IconTrash size={16} />}
            onClick={() => {
              const row = rows[menu.rank];
              // A category that files projects cannot be removed: the
              // server would refuse it on save.
              const original = originals.find((o) => o.id === row?.id) as
                | (Element & { project_count?: number })
                | undefined;
              if (original?.project_count) {
                notifications.show({
                  color: "orange",
                  title: "Suppression impossible",
                  message: `« ${original.name} » range encore ${original.project_count} projet${
                    original.project_count > 1 ? "s" : ""
                  }.`,
                });
                return;
              }
              remove(menu.rank);
            }}
          >
            Supprimer
          </Menu.Item>
        </PointMenu>
      )}

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
