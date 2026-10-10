import { Box, Group, Stack, TextInput } from "@mantine/core";
import { IconFolder, IconTag } from "@tabler/icons-react";
import { useCallback, useContext, useEffect, useRef, useState } from "react";
import type { Dispatch, DragEvent, SetStateAction } from "react";
import { api } from "../../api";
import { errorMessage, notifyError } from "../../lib/errors";
import { LabelGroupDraftsContext, remapGroups } from "../../lib/label-groups";
import { LABEL_WORDS } from "../../lib/label-words";
import type { LabelWords } from "../../lib/label-words";
import type { Registration } from "./IndicatorDrawer";
import AddButton from "./AddButton";
import LabelColorPicker from "./LabelColorPicker";
import {
  EmptyList,
  HEADER_BACKGROUND,
  Handle,
  ListFooter,
  ROUNDING,
  RowCheckbox,
  move,
  nameFieldStyle,
  rowStyle,
  useRowSelection,
  editKeys,
} from "./DrawerRows";
import { DECLARED_ASSET_KINDS, DECLARED_ASSET_ROUTES, DEFAULT_LABEL_COLOR } from "@milo/shared";
import type {
  DeclaredAssetKind,
  Id,
  Label,
  LabelGroup,
  LabelGroupLayout,
  LabelsBase,
  ProjectLabel,
  SupportLabel,
} from "@milo/shared";

// The labels of a board — or of Support — gathered in their groups, with the
// look of a widget drawer's lists (DrawerRows): each group opens with its
// header row — its handle, its name —, its labels follow, each with its handle,
// name and color. A group is dragged by its
// header's handle, a label by its own, within its group or into another.
// "Ajouter une étiquette" closes each group, "Ajouter un groupe" the list.
//
// Every label belongs to a group: deleting a group takes its labels with it.
// Nothing is sent before the save registered with "register" — the drawer's
// "Sauvegarder", the modal's "Enregistrer". A label still in use cannot be
// deleted: the server refuses, and the notification says so.

type AnyLabel = Label | ProjectLabel | SupportLabel;

/** A label of the draft: "id" absent until it is created. */
export interface LabelDraft {
  key: string;
  id?: Id;
  name: string;
  color: string;
}

/** A group of the draft, with its labels in order. */
export interface GroupDraft {
  key: string;
  id?: Id;
  /** Until it is created: the negative id the drawer's group choices give it. */
  temp?: Id;
  name: string;
  labels: LabelDraft[];
}

/** What is being dragged: a whole group, or a label. */
type Held = { kind: "group"; key: string } | { kind: "label"; key: string } | null;

/** What changes from one kind of labels to another: the label routes. */
interface LabelRoutes {
  create: (boardId: Id | undefined, label: LabelDraft, groupId: Id) => Promise<{ id: Id }>;
  update: (
    id: Id,
    data: { name: string; color: string; group_id?: Id },
  ) => Promise<unknown>;
  remove: (id: Id) => Promise<unknown>;
  read: (boardId: Id | undefined) => Promise<AnyLabel[]>;
}

/** A declared asset kind's label routes (shared, declared-assets.ts). */
const declaredAssetRoutes = (kind: DeclaredAssetKind): LabelRoutes => ({
  create: (boardId, l, groupId) =>
    api.createDeclaredAssetLabel(kind, boardId!, l.name, l.color, groupId),
  update: (id, data) => api.updateDeclaredAssetLabel(kind, id, data),
  remove: (id) => api.deleteDeclaredAssetLabel(kind, id),
  read: (boardId) => api.getDeclaredAssetLabels(kind, boardId!),
});

const ROUTES: Record<LabelsBase, LabelRoutes> = {
  "/labels": {
    create: (boardId, l, groupId) => api.createLabel(boardId!, l.name, l.color, groupId),
    update: (id, data) => api.updateLabel(id, data),
    remove: (id) => api.deleteLabel(id),
    read: (boardId) => api.getLabels(boardId!),
  },
  "/project-labels": {
    create: (boardId, l, groupId) =>
      api.createProjectLabel(boardId!, l.name, l.color, groupId),
    update: (id, data) => api.updateProjectLabel(id, data),
    remove: (id) => api.deleteProjectLabel(id),
    read: (boardId) => api.getProjectLabels(boardId!),
  },
  "/support-labels": {
    create: (boardId, l, groupId) => api.createSupportLabel(boardId!, l.name, l.color, groupId),
    update: (id, data) => api.updateSupportLabel(id, data),
    remove: (id) => api.deleteSupportLabel(id),
    read: (boardId) => api.getSupportLabels(boardId!),
  },
  "/managed-device-asset-labels": {
    create: (boardId, l, groupId) => api.createManagedDeviceAssetLabel(boardId!, l.name, l.color, groupId),
    update: (id, data) => api.updateManagedDeviceAssetLabel(id, data),
    remove: (id) => api.deleteManagedDeviceAssetLabel(id),
    read: (boardId) => api.getManagedDeviceAssetLabels(boardId!),
  },
  "/contact-labels": {
    create: (boardId, l, groupId) => api.createContactLabel(boardId!, l.name, l.color, groupId),
    update: (id, data) => api.updateContactLabel(id, data),
    remove: (id) => api.deleteContactLabel(id),
    read: (boardId) => api.getContactLabels(boardId!),
  },
  "/product-labels": {
    create: (boardId, l, groupId) => api.createProductLabel(boardId!, l.name, l.color, groupId),
    update: (id, data) => api.updateProductLabel(id, data),
    remove: (id) => api.deleteProductLabel(id),
    read: (boardId) => api.getProductLabels(boardId!),
  },
  ...(Object.fromEntries(
    DECLARED_ASSET_KINDS.map((kind) => [DECLARED_ASSET_ROUTES[kind].labels, declaredAssetRoutes(kind)]),
  ) as Record<(typeof DECLARED_ASSET_ROUTES)[DeclaredAssetKind]["labels"], LabelRoutes>),
};

// Height of the "Ajouter" buttons: that of their text line. An "xs" button's
// would leave a gap between the last group's and "Ajouter un groupe", stacked
// one under the other.
const ADD_HEIGHT = 20;

// The space to the right of a label's color, at the end of its row.
const COLOR_MARGIN = 5;

let counter = 0;
/** A draft row's key, unique on the page. */
export const newKey = () => `new-${++counter}`;
let temps = 0;
const newTemp = (): Id => -++temps;


/** The draft, built from what the server holds. */
const toDraft = (groups: LabelGroup[], labels: AnyLabel[]): GroupDraft[] =>
  groups.map((g) => ({
    key: `g${g.id}`,
    id: g.id,
    name: g.name,
    labels: labels
      .filter((l) => l.group_id === g.id)
      .map((l) => ({
        key: `l${l.id}`,
        id: l.id,
        name: l.name,
        color: l.color,
      })),
  }));

/** The arrangement the server holds, to know whether it changed. */
const layoutOf = (groups: LabelGroup[], labels: AnyLabel[]): LabelGroupLayout[] =>
  groups.map((g) => ({
    id: g.id,
    label_ids: labels.filter((l) => l.group_id === g.id).map((l) => l.id),
  }));

interface LabelGroupsEditorProps {
  /** The kind of labels: those of cards, of projects, of Support. */
  base: LabelsBase;
  /** The board whose labels these are; none for Support. */
  boardId?: Id;
  /** Registers the save; returns how to unregister it. */
  register: (save: Registration) => () => void;
  /** Changing it re-reads the lists: a paste from the "Actions" menu. */
  version?: number;
  /** What the labels and their groups are called: labels and groups by default. */
  words?: LabelWords;
}

export default function LabelGroupsEditor({
  base,
  boardId,
  register,
  version = 0,
  words = LABEL_WORDS,
}: LabelGroupsEditorProps) {
  const routes = ROUTES[base];

  /** What the server holds, and the draft made from it. */
  const [originals, setOriginals] = useState<{ groups: LabelGroup[]; labels: AnyLabel[] }>({
    groups: [],
    labels: [],
  });
  const [groups, setGroups] = useState<GroupDraft[]>([]);

  const reload = useCallback(async () => {
    try {
      const [readGroups, readLabels] = await Promise.all([
        api.getLabelGroups(base, boardId),
        routes.read(boardId),
      ]);
      setOriginals({ groups: readGroups, labels: readLabels });
      setGroups(toDraft(readGroups, readLabels));
    } catch (e) {
      notifyError(errorMessage(e));
    }
  }, [base, boardId, routes]);

  useEffect(() => {
    void reload();
  }, [reload, version]);

  // In a widget drawer, its group choices follow the draft: the named groups,
  // in their order.
  const publish = useContext(LabelGroupDraftsContext)?.publish;
  useEffect(() => {
    publish?.(
      base,
      groups
        .filter((g) => g.name.trim())
        .map((g, position) => ({
          id: g.id ?? g.temp!,
          name: g.name.trim(),
          position,
          created_at: "",
        })),
    );
  }, [publish, base, groups]);
  useEffect(() => () => publish?.(base, null), [publish, base]);

  // The save: what was removed, the groups, then the labels, then the order.
  // An empty name stops everything before the first send.
  const state = useRef({ originals, groups });
  state.current = { originals, groups };
  useEffect(
    () =>
      register(async () => {
        const { originals: before, groups: drafts } = state.current;
        // Rows added and left without a name are forgotten.
        const after = drafts
          .map((g) => ({ ...g, labels: g.labels.filter((l) => l.id !== undefined || l.name.trim()) }))
          .filter((g) => g.id !== undefined || g.name.trim() || g.labels.length > 0);
        if (after.some((g) => !g.name.trim() || g.labels.some((l) => !l.name.trim()))) {
          throw new Error(words.missingName);
        }
        const created = new Map<Id, Id>();
        try {
          // Labels first: a group only goes once emptied.
          const keptLabels = new Set(after.flatMap((g) => g.labels.map((l) => l.id)));
          for (const o of before.labels) {
            if (!keptLabels.has(o.id)) await routes.remove(o.id);
          }

          const layout: LabelGroupLayout[] = [];
          for (const g of after) {
            const name = g.name.trim();
            let groupId = g.id;
            if (groupId === undefined) {
              groupId = (await api.createLabelGroup(base, name, boardId)).id;
              if (g.temp !== undefined) created.set(g.temp, groupId);
            } else if (before.groups.find((o) => o.id === groupId)?.name !== name) {
              await api.renameLabelGroup(base, groupId, name);
            }

            const ids: Id[] = [];
            for (const l of g.labels) {
              const row = { ...l, name: l.name.trim() };
              if (l.id === undefined) {
                ids.push((await routes.create(boardId, row, groupId)).id);
                continue;
              }
              const o = before.labels.find((x) => x.id === l.id);
              const moved = o?.group_id !== groupId;
              const changed =
                !o ||
                moved ||
                o.name !== row.name ||
                o.color !== row.color;
              if (changed) {
                await routes.update(l.id, {
                  name: row.name,
                  color: row.color,
                  ...(moved ? { group_id: groupId } : {}),
                });
              }
              ids.push(l.id);
            }
            layout.push({ id: groupId, label_ids: ids });
          }

          const keptGroups = new Set(layout.map((g) => g.id));
          for (const o of before.groups) {
            if (!keptGroups.has(o.id)) await api.deleteLabelGroup(base, o.id);
          }

          const same =
            JSON.stringify(layout) === JSON.stringify(layoutOf(before.groups, before.labels));
          if (!same) await api.arrangeLabels(base, layout, boardId);
          // The groups chosen before they existed take their real ids.
          return (config: Record<string, unknown>) => remapGroups(config, created);
        } finally {
          // What was removed is gone: the list restarts from the server, even
          // after an error.
          await reload();
        }
      }),
    [register, base, boardId, routes, reload, words.missingName],
  );

  return <LabelGroupsDraft groups={groups} onChange={setGroups} words={words} />;
}

interface LabelGroupsDraftProps {
  /** The groups and their labels, in their order. */
  groups: GroupDraft[];
  onChange: Dispatch<SetStateAction<GroupDraft[]>>;
  /** What the labels and their groups are called: labels and groups by default. */
  words?: LabelWords;
}

/**
 * The list itself, on a draft held by its owner: the board's labels above,
 * which saves it with the drawer; a product's variants (ProductDrawer), which
 * saves them with the product.
 */
export function LabelGroupsDraft({ groups, onChange: setGroups, words = LABEL_WORDS }: LabelGroupsDraftProps) {
  const [held, setHeld] = useState<Held>(null);
  /** The field with focus: it takes the drawer's background. */
  const [input, setInput] = useState<string | null>(null);
  /** The row just added: its name takes focus. */
  const [toName, setToName] = useState<string | null>(null);

  // --- Editing the draft ----------------------------------------------------

  const changeGroup = (key: string, change: Partial<GroupDraft>) =>
    setGroups((before) => before.map((g) => (g.key === key ? { ...g, ...change } : g)));

  const changeLabel = (key: string, change: Partial<LabelDraft>) =>
    setGroups((before) =>
      before.map((g) => ({
        ...g,
        labels: g.labels.map((l) => (l.key === key ? { ...l, ...change } : l)),
      })),
    );

  const addGroup = () => {
    const key = newKey();
    setGroups((before) => [...before, { key, temp: newTemp(), name: "", labels: [] }]);
    setToName(key);
  };

  const addLabel = (groupKey: string) => {
    const key = newKey();
    setGroups((before) =>
      before.map((g) =>
        g.key === groupKey
          ? {
              ...g,
              labels: [...g.labels, { key, name: "", color: DEFAULT_LABEL_COLOR }],
            }
          : g,
      ),
    );
    setToName(key);
  };

  /** A label taken from its place and put in a group, at this rank. */
  const placeLabel = (key: string, groupKey: string, rank: number) =>
    setGroups((before) => {
      const from = before.findIndex((g) => g.labels.some((l) => l.key === key));
      const to = before.findIndex((g) => g.key === groupKey);
      if (from < 0 || to < 0) return before;
      const index = before[from]!.labels.findIndex((l) => l.key === key);
      if (from === to) {
        const labels = move(before[from]!.labels, index, rank);
        return labels ? before.map((g, i) => (i === from ? { ...g, labels } : g)) : before;
      }
      const label = before[from]!.labels[index]!;
      return before.map((g, i) => {
        if (i === from) return { ...g, labels: g.labels.filter((l) => l.key !== key) };
        if (i !== to) return g;
        const labels = [...g.labels];
        labels.splice(Math.min(rank, labels.length), 0, label);
        return { ...g, labels };
      });
    });

  // --- Dragging --------------------------------------------------------------

  // A group hovering another takes its place once past its middle: groups do
  // not all have the same height, and a shorter one would otherwise swing back.
  const dragOverGroup = (e: DragEvent<HTMLElement>, rank: number) => {
    if (held?.kind !== "group") return;
    e.preventDefault();
    const from = groups.findIndex((g) => g.key === held.key);
    if (from === rank) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const middle = rect.top + rect.height / 2;
    if (from < rank ? e.clientY < middle : e.clientY > middle) return;
    const next = move(groups, from, rank);
    if (next) setGroups(next);
  };

  // A label hovering a row takes its place; hovering a header, it goes to the
  // top of that group.
  const dragOverLabel = (e: DragEvent<HTMLElement>, groupKey: string, rank: number) => {
    if (held?.kind !== "label") return;
    e.preventDefault();
    placeLabel(held.key, groupKey, rank);
  };

  // --- Deleting ---------------------------------------------------------------

  const keys = groups.flatMap((g) => [g.key, ...g.labels.map((l) => l.key)]);
  const selection = useRowSelection(keys);

  // A group's box checks all its labels, as a checklist's does its items: it
  // reads checked once they all are, and an empty group is checked on its own.
  const groupChecked = (g: GroupDraft) =>
    g.labels.length > 0
      ? g.labels.every((l) => selection.isChecked(l.key))
      : selection.isChecked(g.key);
  const groupPartlyChecked = (g: GroupDraft) =>
    !groupChecked(g) && g.labels.some((l) => selection.isChecked(l.key));
  const checkGroup = (g: GroupDraft, on: boolean) => {
    selection.toggle(g.key, on);
    for (const l of g.labels) selection.toggle(l.key, on);
  };

  /** Removes the checked labels, and the fully checked groups with them. */
  const removeChecked = () => {
    const checked = new Set(selection.checked);
    setGroups((before) =>
      before
        .filter((g) => !groupChecked(g))
        .map((g) => ({ ...g, labels: g.labels.filter((l) => !checked.has(l.key)) })),
    );
    selection.reset();
  };

  // --- Rows ------------------------------------------------------------------

  const nameField = (
    key: string,
    value: string,
    onChange: (name: string) => void,
    onLeave: () => void,
    label: string,
    bold = false,
  ) => (
    <TextInput
      size="sm"
      radius={ROUNDING}
      style={{ flex: 1, minWidth: 0 }}
      styles={{
        input: { ...nameFieldStyle(input === key), ...(bold ? { fontWeight: 600 } : {}) },
      }}
      placeholder={bold ? words.groupName : "Nom"}
      value={value}
      onChange={(e) => onChange(e.currentTarget.value)}
      {...editKeys(onChange)}
      autoFocus={toName === key}
      onFocus={() => setInput(key)}
      onBlur={() => {
        setInput(null);
        setToName(null);
        onLeave();
      }}
      aria-label={label}
    />
  );

  return (
    <div>
      <Stack gap={30}>
        {groups.length === 0 && <EmptyList icon={IconFolder} message={words.noGroup} />}

        {groups.map((group, groupRank) => {
          // A group just added shows no empty screen while it is being named:
          // only once its name is entered.
          const naming = group.id === undefined && (input === group.key || toName === group.key);
          const showsEmpty = group.labels.length === 0 && !naming;
          const total = group.labels.length + 1 + (showsEmpty ? 1 : 0);
          return (
            <Box
              key={group.key}
              onDragOver={(e) => dragOverGroup(e, groupRank)}
              onDrop={(e) => e.preventDefault()}
              style={{ opacity: held?.kind === "group" && held.key === group.key ? 0.5 : 1 }}
            >
              <Stack gap={1}>
                {/* The header: the group's handle, its box, its name. */}
                <Group
                  gap="sm"
                  wrap="nowrap"
                  onDragOver={(e) => dragOverLabel(e, group.key, 0)}
                  style={{ ...rowStyle(0, total, false), backgroundColor: HEADER_BACKGROUND }}
                >
                  <Handle
                    label={`Déplacer ${words.theGroup}${group.name || ""}`.trim()}
                    onDragStart={() => setHeld({ kind: "group", key: group.key })}
                    onDragEnd={() => setHeld(null)}
                  />
                  <RowCheckbox
                    label={`Sélectionner ${words.theGroup}${group.name}`.trim()}
                    checked={groupChecked(group)}
                    indeterminate={groupPartlyChecked(group)}
                    onChange={(on) => checkGroup(group, on)}
                    afterHandle
                  />
                  {nameField(
                    group.key,
                    group.name,
                    (name) => changeGroup(group.key, { name }),
                    () => {
                      // A group just added, left without a name nor labels,
                      // disappears.
                      if (group.id === undefined && !group.name.trim() && group.labels.length === 0) {
                        setGroups((before) => before.filter((g) => g.key !== group.key));
                      }
                    },
                    `${words.groupName} ${group.name}`.trim(),
                    true,
                  )}
                </Group>

                {showsEmpty && (
                  <Box
                    onDragOver={(e) => dragOverLabel(e, group.key, 0)}
                  >
                    {/* The empty screen, against the header: it is also where a
                        label is dropped into the group. */}
                    <EmptyList icon={IconTag} message={words.noLabelInGroup} attached />
                  </Box>
                )}

                {group.labels.map((label, rank) => (
                  <Group
                    key={label.key}
                    gap="sm"
                    wrap="nowrap"
                    onDragOver={(e) => dragOverLabel(e, group.key, rank)}
                    onDrop={(e) => e.preventDefault()}
                    style={rowStyle(
                      rank + 1,
                      total,
                      held?.kind === "label" && held.key === label.key,
                    )}
                  >
                    <Handle
                      label={`Déplacer ${label.name || words.theLabel}`}
                      onDragStart={() => setHeld({ kind: "label", key: label.key })}
                      onDragEnd={() => setHeld(null)}
                    />
                    <RowCheckbox
                      label={`Sélectionner ${label.name || words.theLabel}`}
                      checked={selection.isChecked(label.key)}
                      onChange={(on) => selection.toggle(label.key, on)}
                      afterHandle
                    />
                    {nameField(
                      label.key,
                      label.name,
                      (name) => changeLabel(label.key, { name }),
                      () => {
                        // A label just added, left without a name, disappears.
                        if (label.id === undefined && !label.name.trim()) {
                          setGroups((before) =>
                            before.map((g) => ({
                              ...g,
                              labels: g.labels.filter((l) => l.key !== label.key),
                            })),
                          );
                        }
                      },
                      `Nom de ${label.name || words.theLabel}`,
                    )}
                    <LabelColorPicker
                      color={label.color}
                      onChange={(color) => changeLabel(label.key, { color })}
                      label={label.name || words.theLabel}
                      palettePadding={0}
                      // Off the row's edge, rather than flush against it.
                      marginRight={COLOR_MARGIN}
                    />
                  </Group>
                ))}
              </Stack>
              <AddButton
                label={words.addLabel}
                onClick={() => addLabel(group.key)}
                mt={4}
                h={ADD_HEIGHT}
              />
            </Box>
          );
        })}
      </Stack>

      {/* Right under the last group's "Ajouter une étiquette": the two
          additions read as one block. */}
      <ListFooter
        addLabel={words.addGroup}
        onAdd={addGroup}
        checkedCount={
          groups.filter(groupChecked).length +
          groups.flatMap((g) => g.labels).filter((l) => selection.isChecked(l.key)).length
        }
        onDeleteChecked={removeChecked}
        mt={groups.length === 0 ? 4 : 0}
        h={ADD_HEIGHT}
      />
    </div>
  );
}
