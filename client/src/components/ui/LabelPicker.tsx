import { ActionIcon, Anchor, Box, Checkbox, Group, Text, TextInput } from "@mantine/core";
import { IconFolder, IconPlus, IconTrash } from "@tabler/icons-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../../api";
import { errorMessage, notifyError } from "../../lib/errors";
import { ADD_ACTION, RED } from "../../themes/colors";
import { PLUS_GAP, PLUS_SIZE } from "../../themes/plus";
import ChipPicker from "./ChipPicker";
import DeleteConfirmModal from "./DeleteConfirmModal";
import { DragHandle, InsertLine, useDraggableStack } from "./DraggableStack";
import EmptyPanel from "./EmptyPanel";
import LabelChip from "./LabelChip";
import { DEFAULT_LABEL_COLOR } from "@milo/shared";
import type {
  Id,
  Label,
  LabelGroup,
  LabelGroupLayout,
  LabelsBase,
  ProjectLabel,
  SupportLabel,
} from "@milo/shared";
import type { ReactNode } from "react";

/** Labels of the three modes have the same shape here. */
type AnyLabel = Label | ProjectLabel | SupportLabel;

/**
 * What it takes to manage a set of labels. The routes change from one mode to
 * another, the actions do not.
 *
 * `parentId` is what the labels hang from: their board.
 */
export interface LabelsApi {
  /** Without a group, the label goes into the first one. */
  create: (
    parentId: number,
    name: string,
    color: string,
    groupId?: number,
  ) => Promise<AnyLabel>;
  update: (
    id: number,
    data: { name?: string; color?: string },
  ) => Promise<AnyLabel>;
  remove: (id: number) => Promise<unknown>;
  /** What deletion takes along, stated in the mode's own words. */
  carriers: string;
  /** Their routes, for the groups and the arrangement. */
  base: LabelsBase;
}

/** A label being edited: its name and color, before validation. */
interface Draft {
  id?: number;
  name: string;
  color: string;
  /** The group a label being added goes into. */
  groupId?: number;
}

/** The groups, each with its labels in their order. */
const layoutOf = (groups: LabelGroup[], labels: AnyLabel[]): LabelGroupLayout[] =>
  groups.map((g) => ({
    id: g.id,
    label_ids: labels.filter((l) => l.group_id === g.id).map((l) => l.id),
  }));

/**
 * The arrangement read back from the dragged rows: a group's header — its id
 * negated — opens it, the labels that follow belong to it. Null when a label
 * lands above the first group.
 */
const layoutFromRows = (rows: Id[]): LabelGroupLayout[] | null => {
  const layout: LabelGroupLayout[] = [];
  for (const id of rows) {
    if (id < 0) layout.push({ id: -id, label_ids: [] });
    else if (layout.length === 0) return null;
    else layout.at(-1)!.label_ids.push(id);
  }
  return layout;
};

// The list's height, past which it scrolls.
const LIST_MAX_HEIGHT = 350;
// The time left for the second click of a double click before the first one
// checks the label (as in ChipPicker).
const DOUBLE_CLICK_DELAY = 250;
import LabelColorPicker from "./LabelColorPicker";

// The label's offset in the list: it breathes two pixels after its checkbox.
const LABEL_INDENT = 2;
// The rows' left offset: the grip overhangs the list's padding by a pixel.
const ROW_OFFSET_LEFT = -1;
// The widths of a label row's first two columns: the grip, the checkbox (xs).
const GRIP_WIDTH = 16;
const CHECKBOX_WIDTH = 16;
// The room under each group, the last one excepted.
const GROUP_GAP = 20;

// Card labels and project labels are chosen, renamed, recolored and deleted in
// the same way: only the routes change. They are named here rather than calling
// "api" directly, so that the same component serves both modes.
export const CARD_LABELS_API: LabelsApi = {
  create: (boardId, name, color, groupId) => api.createLabel(boardId, name, color, groupId),
  update: api.updateLabel,
  remove: api.deleteLabel,
  // What deletion takes along, stated in the mode's own words.
  carriers: "des cartes qui la portent",
  base: "/labels",
};

export const PROJECT_LABELS_API: LabelsApi = {
  create: api.createProjectLabel,
  update: api.updateProjectLabel,
  remove: api.deleteProjectLabel,
  carriers: "des projets qui la portent",
  base: "/project-labels",
};

export const SUPPORT_LABELS_API: LabelsApi = {
  create: api.createSupportLabel,
  update: api.updateSupportLabel,
  remove: api.deleteSupportLabel,
  carriers: "des demandes qui la portent",
  base: "/support-labels",
};

/**
 * A card's labels, gathered in their groups: a click checks them to apply them,
 * a double click opens one to rename or recolor it, the trash at the end of the
 * row deletes it. Each group ends with the link that adds a label to it, and the
 * list with the one that adds a group. A label is dragged by its handle, within
 * its group or into another; a group by the handle of its title. Everything
 * applies right away, and affects the board's labels, hence all the cards that
 * carry them.
 */
interface LabelPickerProps {
  labels: AnyLabel[];
  /** The selected identifiers, as strings. */
  value: string[];
  onChange: (value: string[]) => void;
  /** The board these labels hang from. */
  boardId: string | number;
  /** Without argument: re-read. With a patch: apply it in place. */
  onLabelsChanged: (patch?: { id: number; data: Partial<AnyLabel> }) => void | Promise<void>;
  chipHeight?: number;
  /** The mode these labels belong to: cards by default. */
  labelsApi?: LabelsApi;
  /** What the list says when there is no label yet to choose from. */
  emptyText?: string;
  /** The field's title: "Étiquettes" by default. */
  label?: string;
}

export default function LabelPicker({
  labels,
  value,
  onChange,
  boardId,
  onLabelsChanged,
  chipHeight,
  // The mode these labels belong to: cards by default.
  labelsApi = CARD_LABELS_API,
  emptyText = "Aucune étiquette sur ce tableau",
  label = "Étiquettes",
}: LabelPickerProps) {
  // Label being modified — its name and color live there until validated — and
  // the one being added, in its group.
  const [edited, setEdited] = useState<Draft | null>(null);
  const [adding, setAdding] = useState<Draft | null>(null);
  // The name of the group being added; null when none is.
  const [addingGroup, setAddingGroup] = useState<string | null>(null);
  // Hovered label — only its trash and handle show — and the one awaiting
  // deletion confirmation.
  const [hovering, setHovered] = useState<number | null>(null);
  const [toDelete, setToDelete] = useState<AnyLabel | null>(null);
  // The group being renamed — its name lives there until validated —, the
  // hovered one — only its trash shows — and the one awaiting confirmation.
  const [renamingGroup, setRenamingGroup] = useState<{ id: number; name: string } | null>(null);
  const [hoveredGroup, setHoveredGroup] = useState<number | null>(null);
  const [groupToDelete, setGroupToDelete] = useState<LabelGroup | null>(null);

  // The groups: read here, since the labels alone do not name the empty ones.
  const [groups, setGroups] = useState<LabelGroup[]>([]);
  const readGroups = useCallback(async () => {
    try {
      setGroups(await api.getLabelGroups(labelsApi.base, boardId));
    } catch (e) {
      notifyError(errorMessage(e));
    }
  }, [labelsApi.base, boardId]);
  // Re-read whenever the labels change: a group may have come with them.
  useEffect(() => {
    void readGroups();
  }, [readGroups, labels]);

  // The arrangement just dropped, until the re-read labels report it: without
  // it, the dropped row would briefly go back to its place.
  const [placed, setPlaced] = useState<LabelGroupLayout[] | null>(null);
  useEffect(() => setPlaced(null), [labels, groups]);
  const layout = placed ?? layoutOf(groups, labels);

  const arrange = async (next: LabelGroupLayout[]) => {
    setPlaced(next);
    try {
      await api.arrangeLabels(labelsApi.base, next, boardId);
      await onLabelsChanged();
      await readGroups();
    } catch (e) {
      notifyError(errorMessage(e));
      setPlaced(null);
    }
  };

  // Two drags over the same rows: a label among the rows — the groups' titles
  // included, which tell where it lands —, a group among the groups.
  const rows = layout.flatMap((g) => [-g.id, ...g.label_ids]);
  const labelDrag = useDraggableStack({
    ids: rows,
    selector: "[data-label-row]",
    onReorder: (order) => {
      const next = layoutFromRows(order);
      if (next) return arrange(next);
    },
  });
  const groupDrag = useDraggableStack({
    ids: layout.map((g) => g.id),
    selector: "[data-group-block]",
    onReorder: (order) =>
      arrange(order.map((id) => layout.find((g) => g.id === id)!)),
  });
  const zone = (element: HTMLDivElement | null) => {
    labelDrag.zoneRef.current = element;
    groupDrag.zoneRef.current = element;
  };

  // A click checks, a double click opens the label without checking it.
  const pendingClick = useRef<ReturnType<typeof setTimeout> | null>(null);
  const forgetClick = () => {
    if (pendingClick.current) clearTimeout(pendingClick.current);
    pendingClick.current = null;
  };
  useEffect(() => forgetClick, []);
  const toggle = (id: Id) => {
    const key = String(id);
    onChange(value.includes(key) ? value.filter((v) => v !== key) : [...value, key]);
  };

  const openEdit = (label: AnyLabel) => {
    setAdding(null);
    setEdited({ id: label.id, name: label.name, color: label.color });
  };

  const closeEdit = () => setEdited(null);

  // Choosing a color is a self-sufficient action: it applies immediately,
  // everywhere the label shows. The name, on the other hand, waits to be
  // validated — we do not want to see it change with every letter typed.
  const applyColor = async (label: AnyLabel, color: string) => {
    setEdited((e) => (e ? { ...e, color } : e));
    if (color === label.color) return;
    // The color is first applied on screen, then sent to the server: otherwise
    // the cards would wait for the round trip to change hue.
    onLabelsChanged({ id: label.id, data: { color } });
    await labelsApi.update(label.id, { color });
    await onLabelsChanged();
  };

  // The name only goes to the server on validation: elsewhere — the list, the
  // card's thumbnails, the board's cards — the label keeps it until it has
  // really changed.
  const save = async (label: AnyLabel) => {
    const current = edited;
    closeEdit();
    if (!current) return;
    const name = current.name.trim();
    if (!name) return;
    if (name === label.name && current.color === label.color) return;
    await labelsApi.update(label.id, { name: name, color: current.color });
    await onLabelsChanged();
  };

  const openAdd = (groupId: number) => {
    closeEdit();
    setAddingGroup(null);
    setAdding({ name: "", color: DEFAULT_LABEL_COLOR, groupId });
  };

  // The list closes: what was being typed is concluded, otherwise the field
  // would disappear with it and the chosen color would be lost — the unmounted
  // field has no chance to hand control back.
  const finish = () => {
    if (edited) {
      const label = labels.find((l) => l.id === edited.id);
      if (label) save(label);
      return;
    }
    if (adding) create();
    if (addingGroup !== null) createGroup();
    if (renamingGroup) renameGroup();
  };

  // The created label is applied to the card right away: it was just requested.
  const create = async () => {
    const newValue = (adding?.name ?? "").trim();
    if (!newValue || !adding) {
      setAdding(null);
      return;
    }
    const created = await labelsApi.create(
      Number(boardId),
      newValue,
      adding.color,
      adding.groupId,
    );
    setAdding(null);
    await onLabelsChanged();
    onChange([...value, String(created.id)]);
  };

  // A new group, after the others: its first label is asked for right away.
  const createGroup = async () => {
    const name = (addingGroup ?? "").trim();
    setAddingGroup(null);
    if (!name) return;
    try {
      const created = await api.createLabelGroup(labelsApi.base, name, boardId);
      await readGroups();
      openAdd(created.id);
    } catch (e) {
      notifyError(errorMessage(e));
    }
  };

  // The group's name goes to the server on validation only, like a label's.
  const renameGroup = async () => {
    const current = renamingGroup;
    setRenamingGroup(null);
    if (!current) return;
    const name = current.name.trim();
    if (!name || name === groups.find((g) => g.id === current.id)?.name) return;
    try {
      await api.renameLabelGroup(labelsApi.base, current.id, name);
      await readGroups();
    } catch (e) {
      notifyError(errorMessage(e));
    }
  };

  // A group goes once emptied: the server refuses otherwise, and says why.
  const removeGroup = async () => {
    const group = groupToDelete;
    setGroupToDelete(null);
    if (!group) return;
    try {
      await api.deleteLabelGroup(labelsApi.base, group.id);
      await readGroups();
    } catch (e) {
      notifyError(errorMessage(e), "Suppression impossible");
    }
  };

  // Deleting asks before doing it: the label leaves the board, and so
  // everything that carries it, not just the open card.
  const requestDeletion = (label: AnyLabel) => {
    closeEdit();
    setAdding(null);
    setToDelete(label);
  };

  const remove = async () => {
    const label = toDelete;
    setToDelete(null);
    if (!label) return;
    try {
      await labelsApi.remove(label.id);
    } catch (e) {
      // A label that is still in use cannot be deleted: the server says by how
      // many resources.
      notifyError(errorMessage(e), "Suppression impossible");
      return;
    }
    // The open card loses it right away: otherwise saving would put it back,
    // even though the server no longer knows it.
    onChange(value.filter((v) => v !== String(label.id)));
    await onLabelsChanged();
  };

  // An input row: the color swatch, then the name. Used for editing as well as
  // for adding.
  interface InputProps {
    color: string;
    name: string;
    onColor: (color: string) => void;
    onName: (name: string) => void;
    onSubmit: () => void;
    onCancel: () => void;
    aria: string;
    /**
     * Laid out in the columns of a label's row: the swatch under the
     * checkboxes, the name under the labels. For a label being added.
     */
    aligned?: boolean;
  }

  const input = ({
    color,
    name,
    onColor,
    onName,
    onSubmit,
    onCancel,
    aria,
    aligned = false,
  }: InputProps): ReactNode => (
    <Group
      data-label-editor="true"
      gap={6}
      wrap="nowrap"
      style={{ flex: 1, minWidth: 0 }}
      // The input's clicks stay with it: placing the cursor or choosing a color
      // must not check or uncheck the label.
      onClick={(e) => e.stopPropagation()}
      onDoubleClick={(e) => e.stopPropagation()}
    >
      {/* The grip's column, empty: a label being added is not moved yet. */}
      {aligned && <span style={{ width: GRIP_WIDTH, flexShrink: 0 }} />}
      <Box
        style={
          aligned
            ? { width: CHECKBOX_WIDTH, flexShrink: 0, display: "flex", justifyContent: "center" }
            : undefined
        }
      >
        <LabelColorPicker
          color={color}
          onChange={onColor}
          label={name || "l'étiquette"}
          withinPortal={false}
        />
      </Box>
      <TextInput
        // Mantine's drawers and modals close on Escape from a window listener,
        // which only this attribute holds back: Escape cancels the input alone.
        data-mantine-stop-propagation
        value={name}
        onChange={(e) => onName(e.currentTarget.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            onSubmit();
          }
          if (e.key === "Escape") {
            // Neither the list nor the drawer around it close with it.
            e.stopPropagation();
            onCancel();
          }
        }}
        // Focus moving to the swatch or its palette stays within the input:
        // otherwise, going to choose a color would close it.
        onBlur={(e) => {
          if (e.relatedTarget?.closest("[data-label-editor]")) return;
          onSubmit();
        }}
        variant="unstyled"
        size="xs"
        autoFocus
        style={{ flex: 1, minWidth: 0, paddingLeft: aligned ? LABEL_INDENT : 0 }}
        aria-label={aria}
      />
    </Group>
  );

  /** A green "+" link: a label at the end of a group, a group at the end. */
  const addLink = (text: string, onClick: () => void) => (
    <Anchor component="button" type="button" size="sm" c={ADD_ACTION.color} onClick={onClick} px={4}>
      <Group gap={PLUS_GAP} wrap="nowrap">
        <IconPlus size={PLUS_SIZE} />
        <span>{text}</span>
      </Group>
    </Anchor>
  );

  /** A label's row: its handle, its box, the label — or its input —, its trash. */
  const labelRow = (l: AnyLabel, rank: number) => (
    <div key={l.id} data-label-row style={{ opacity: labelDrag.drag?.id === l.id ? 0.4 : 1 }}>
      {labelDrag.drag?.target === rank && <InsertLine />}
      <Group
        gap={6}
        wrap="nowrap"
        align="center"
        pl={0}
        ml={ROW_OFFSET_LEFT}
        pr={4}
        py={4}
        onMouseEnter={() => setHovered(l.id)}
        onMouseLeave={() => setHovered((id) => (id === l.id ? null : id))}
      >
        <DragHandle
          onPointerDown={labelDrag.onPointerDown(l.id, rank)}
          visible={hovering === l.id}
          label={`Déplacer ${l.name}`}
        />
        <Checkbox
          checked={value.includes(String(l.id))}
          onChange={() => toggle(l.id)}
          size="xs"
          styles={{ input: { cursor: "pointer" } }}
          aria-label={l.name}
        />
        {edited?.id === l.id ? (
          // In edit mode only: the color swatch joins the name. At rest, the
          // label stands on its own.
          input({
            color: edited.color,
            name: edited.name,
            onColor: (color) => applyColor(l, color),
            onName: (name) => setEdited((e) => (e ? { ...e, name } : e)),
            onSubmit: () => save(l),
            onCancel: closeEdit,
            aria: `Renommer ${l.name}`,
          })
        ) : (
          // The label takes the whole width of the list, like a banner.
          <div
            style={{ flex: 1, minWidth: 0, paddingLeft: LABEL_INDENT, cursor: "pointer" }}
            onClick={(e) => {
              forgetClick();
              if (e.detail > 1) return;
              pendingClick.current = setTimeout(() => {
                pendingClick.current = null;
                toggle(l.id);
              }, DOUBLE_CLICK_DELAY);
            }}
            onDoubleClick={() => {
              forgetClick();
              openEdit(l);
            }}
          >
            <LabelChip label={l} height={chipHeight} fullWidth />
          </div>
        )}

        {/* The trash only appears on hover or during edit, but always keeps its
            place: the row does not move when the mouse crosses it. */}
        <ActionIcon
          variant="subtle"
          color={RED}
          size="sm"
          style={{ flexShrink: 0, opacity: hovering === l.id || edited?.id === l.id ? 1 : 0 }}
          onClick={(e) => {
            e.stopPropagation();
            requestDeletion(l);
          }}
          onDoubleClick={(e) => e.stopPropagation()}
          aria-label={`Supprimer ${l.name}`}
        >
          <IconTrash size={14} />
        </ActionIcon>
      </Group>
    </div>
  );

  // The rank of each row among all of them — titles and labels —, which the
  // label drag counts in.
  let rank = 0;
  const list = (
    <div ref={zone}>
      {layout.length === 0 && (
        <Box py="sm">
          <EmptyPanel icon={IconFolder} message="Aucun groupe" size="sm" fill={false} />
        </Box>
      )}
      {layout.map((group, groupRank) => {
        const name = groups.find((g) => g.id === group.id)?.name ?? "";
        const titleRank = rank++;
        const renaming = renamingGroup?.id === group.id;
        return (
          <div
            key={group.id}
            data-group-block
            style={{
              opacity: groupDrag.drag?.id === group.id ? 0.4 : 1,
              marginBottom: groupRank < layout.length - 1 ? GROUP_GAP : 0,
            }}
          >
            {groupDrag.drag?.target === groupRank && <InsertLine />}
            {/* The group's title: also a row for the label drag, which tells
                where a dropped label lands. */}
            <div data-label-row>
              {labelDrag.drag?.target === titleRank && <InsertLine />}
              <Group
                gap={6}
                wrap="nowrap"
                align="center"
                pl={0}
                ml={ROW_OFFSET_LEFT}
                pr={4}
                pt={4}
                pb={2}
                onMouseEnter={() => setHoveredGroup(group.id)}
                onMouseLeave={() => setHoveredGroup((id) => (id === group.id ? null : id))}
              >
                <DragHandle
                  onPointerDown={groupDrag.onPointerDown(group.id, groupRank)}
                  label={`Déplacer le groupe ${name}`}
                />
                {renaming ? (
                  <TextInput
                    // Mantine's drawers and modals close on Escape from a window listener,
                    // which only this attribute holds back: Escape cancels the input alone.
                    data-mantine-stop-propagation
                    value={renamingGroup.name}
                    onChange={(e) => {
                      const next = e.currentTarget.value;
                      setRenamingGroup((r) => (r ? { ...r, name: next } : r));
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        void renameGroup();
                      }
                      if (e.key === "Escape") {
                        e.stopPropagation();
                        setRenamingGroup(null);
                      }
                    }}
                    onBlur={() => void renameGroup()}
                    variant="unstyled"
                    size="xs"
                    autoFocus
                    style={{ flex: 1, minWidth: 0 }}
                    // The field takes the title's exact measures: the row
                    // does not move when it opens.
                    styles={{
                      input: {
                        height: "auto",
                        minHeight: 0,
                        padding: 0,
                        fontSize: "var(--mantine-font-size-xs)",
                        lineHeight: "var(--mantine-line-height-xs)",
                        fontWeight: 600,
                        color: "var(--mantine-color-bright)",
                      },
                    }}
                    aria-label={`Renommer le groupe ${name}`}
                  />
                ) : (
                  // A double click opens the name for renaming.
                  <Text
                    size="xs"
                    fw={600}
                    c="bright"
                    truncate
                    style={{ flex: 1, minWidth: 0, cursor: "default" }}
                    onDoubleClick={() => {
                      closeEdit();
                      setAdding(null);
                      setRenamingGroup({ id: group.id, name });
                    }}
                  >
                    {name}
                  </Text>
                )}
                {/* Like a label's, the trash keeps its place when hidden. */}
                <ActionIcon
                  variant="subtle"
                  color={RED}
                  size="sm"
                  style={{
                    flexShrink: 0,
                    opacity: hoveredGroup === group.id || renaming ? 1 : 0,
                  }}
                  onClick={() => {
                    const g = groups.find((x) => x.id === group.id);
                    if (!g) return;
                    closeEdit();
                    setAdding(null);
                    setRenamingGroup(null);
                    setGroupToDelete(g);
                  }}
                  aria-label={`Supprimer le groupe ${name}`}
                >
                  <IconTrash size={14} />
                </ActionIcon>
              </Group>
            </div>
            {group.label_ids.map((id) => {
              const l = labels.find((x) => x.id === id);
              const row = rank++;
              return l ? labelRow(l, row) : null;
            })}
            <div style={{ padding: "2px 0 4px" }}>
              {adding?.groupId === group.id ? (
                <Box pl={0} ml={ROW_OFFSET_LEFT} pr={4} py={4}>
                  {input({
                    color: adding.color,
                    name: adding.name,
                    onColor: (color) => setAdding((a) => (a ? { ...a, color } : a)),
                    onName: (name) => setAdding((a) => (a ? { ...a, name } : a)),
                    onSubmit: create,
                    onCancel: () => setAdding(null),
                    aria: "Nom de la nouvelle étiquette",
                    aligned: true,
                  })}
                </Box>
              ) : (
                addLink("Ajouter une étiquette", () => openAdd(group.id))
              )}
            </div>
          </div>
        );
      })}
      {groupDrag.drag && groupDrag.drag.target >= layout.length && <InsertLine />}
      {labelDrag.drag && labelDrag.drag.target >= rows.length && <InsertLine />}
    </div>
  );

  return (
    <>
      <ChipPicker
        chipHeight={chipHeight}
        // A label's "+" is rectangular, like it: same radius.
        plusRadius={4}
        onClose={finish}
        // The confirmation window counts as a click "outside": the list would
        // go away, and we would be back at the card as soon as the question is
        // answered.
        closeBlocked={toDelete !== null || groupToDelete !== null}
        // Escape cancels the input in progress, and only it.
        escapeBlocked={
          edited !== null || adding !== null || addingGroup !== null || renamingGroup !== null
        }
        label={label}
        options={labels}
        value={value}
        onChange={onChange}
        emptyText={emptyText}
        listMaxHeight={LIST_MAX_HEIGHT}
        list={list}
        // The card's thumbnail does not follow the edit: it shows the label as
        // it is saved, and will only change once the input is validated.
        renderChip={(l) => <LabelChip label={l} height={chipHeight} />}
        render={(l) => <LabelChip label={l} height={chipHeight} fullWidth />}
        footer={
          <div
            style={{
              paddingTop: 6,
              marginTop: 4,
              borderTop: "1px solid var(--mantine-color-default-border)",
            }}
          >
            {addingGroup !== null ? (
              <TextInput
                // Mantine's drawers and modals close on Escape from a window listener,
                // which only this attribute holds back: Escape cancels the input alone.
                data-mantine-stop-propagation
                value={addingGroup}
                onChange={(e) => setAddingGroup(e.currentTarget.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    void createGroup();
                  }
                  if (e.key === "Escape") {
                    e.stopPropagation();
                    setAddingGroup(null);
                  }
                }}
                onBlur={() => void createGroup()}
                placeholder="Nom du groupe"
                variant="unstyled"
                size="xs"
                px={4}
                autoFocus
                aria-label="Nom du nouveau groupe"
              />
            ) : (
              addLink("Ajouter un groupe", () => {
                closeEdit();
                setAdding(null);
                setAddingGroup("");
              })
            )}
          </div>
        }
      />

      {/* Placed outside the list, which would take it along when closing: the
          question thus survives, and the list stays open behind it. */}
      <DeleteConfirmModal
        opened={toDelete !== null}
        onClose={() => setToDelete(null)}
        onConfirm={remove}
        title="Supprimer l'étiquette"
        message={
          <>
            Voulez-vous vraiment supprimer « {toDelete?.name} » ? Elle sera
            retirée {labelsApi.carriers}. Cette action est irréversible.
          </>
        }
      />
      <DeleteConfirmModal
        opened={groupToDelete !== null}
        onClose={() => setGroupToDelete(null)}
        onConfirm={removeGroup}
        title="Supprimer le groupe"
        message={
          <>
            Voulez-vous vraiment supprimer le groupe « {groupToDelete?.name} » ?
            Cette action est irréversible.
          </>
        }
      />
    </>
  );
}
