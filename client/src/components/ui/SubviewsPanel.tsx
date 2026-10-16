import {
  ActionIcon,
  Box,
  Group,
  SegmentedControl,
  Switch,
  Text,
  TextInput,
} from "@mantine/core";
import {
  IconAppWindow,
  IconFile,
  IconFolder,
  IconTrash,
} from "@tabler/icons-react";
import { useEffect, useRef, useState } from "react";
import type { CSSProperties, FocusEvent, ReactNode } from "react";
import { api } from "../../api";
import { errorMessage, notifyError } from "../../lib/errors";
import { RED, SEGMENTS_BG } from "../../themes/colors";
import classes from "../../assets/styles/SubviewsPanel.module.css";
import contextsClasses from "../../assets/styles/ContextsMenu.module.css";
import { INPUT_INSET, nameFieldStyle } from "./DrawerRows";
import AddButton from "./AddButton";
import DeleteConfirmModal from "./DeleteConfirmModal";
import EmptyPanel from "./EmptyPanel";
import { DragHandle, InsertLine, useDraggableStack } from "./DraggableStack";
import type {
  Id,
  Subview,
  SubviewGroup,
  SubviewInput,
  SubviewKind,
  SubviewsInput,
} from "@milo/shared";

// The inset under the open view's tab, opened by its menu icon in interface
// editing, over the view (BoardTabs): its sub-views — those without a group
// first, as the account menu's rows (AccountControls), then each group under
// its title, as a search result kind's (SearchBox), a line between them.
//
// A sub-view being added or edited — a double click — becomes a widget
// drawer's label row (LabelGroupsEditor): its handle, its name, what it opens
// — "menu" or "modale", chosen once, on its creation — and the room of its
// trash. A group's title, the same without the choice. A
// group without sub-views says so under its title. Rows and groups are
// dragged by their handles. Everything applies right away; a click elsewhere
// in the interface closes the inset.

/** What a sub-view opens, as its choice shows it. */
const KINDS: { value: SubviewKind; name: string; icon: typeof IconFile }[] = [
  { value: "page", name: "menu", icon: IconFile },
  { value: "modal", name: "modale", icon: IconAppWindow },
];

/** The choice of a kind: an icon alone, its name for screen readers. */
const KIND_CHOICES = KINDS.map(({ value, name, icon: Icon }) => ({
  value,
  label: <Icon size={14} aria-label={name} style={{ display: "block" }} />,
}));

/** Each icon's square, with no padding around it. */
const KIND_SIZE = 26;
/** Between the choice and the field's edges: above, below and on the right. */
const KIND_INSET = 2;
/** The choice's corners: slightly rounded. */
const KIND_RADIUS = 3;

// The "Ajouter" links, as in a widget drawer's labels (LabelGroupsEditor):
// as tall as their line, the first 4 pixels under the rows, the next one
// right under it.
const ADD_HEIGHT = 20;
const ADD_MARGIN_TOP = 4;
/** The handle's column. */
const GRIP_WIDTH = 16;
/**
 * A row's height, shown or being typed — the account menu's rows' — : a
 * double click does not move it.
 */
const ROW_HEIGHT = 32;
/** A group's title, as the contexts' groups' (ContextsMenu): its line and inset. */
const TITLE_HEIGHT = 24;
/** The inset's lines: the page's background (themes/menus.ts, SEPARATOR_COLOR). */
const LINE = "1px solid var(--mantine-color-body)";

/** The confirmations, above the inset — a popover, which Mantine sets above its windows. */
const CONFIRM_Z_INDEX = 400;

/**
 * The inset's side padding (BoardTabs): as little on the left as on the
 * right — the handles, names and fields go nearly to the edges.
 */
export const PANEL_PADDING_LEFT = 4;
export const PANEL_PADDING_RIGHT = 4;

/** Marks the inset: a click inside it does not close it. */
export const SUBVIEWS_PANEL_ATTRIBUTE = "data-subviews-panel";
/** Marks what opens and closes it — the "+": its own click does that. */
export const SUBVIEWS_TOGGLE_ATTRIBUTE = "data-subviews-toggle";

/** A sub-view as it is edited: "id" absent until it is created. */
type Item = Omit<Subview, "id" | "board_id"> & { id?: Id };
/** A group as it is edited: "id" null for the sub-views without one. */
interface Block {
  id: Id | null;
  /** Until it is created: the key its id comes back under. */
  key?: string;
  name: string;
  subviews: Item[];
}

const itemsInput = (items: Item[]): SubviewInput[] =>
  items.map((s, rank) => ({
    key: s.id === undefined ? `new-${rank}` : `s${s.id}`,
    ...(s.id === undefined ? {} : { id: s.id }),
    name: s.name,
    kind: s.kind,
  }));

/** What is sent: the whole arrangement. */
const toInput = (blocks: Block[]): SubviewsInput => ({
  subviews: itemsInput(
    blocks.find((b) => b.id === null && !b.key)?.subviews ?? [],
  ),
  groups: blocks
    .filter((b) => b.id !== null || b.key)
    .map((b) => ({
      key: b.key ?? `g${b.id}`,
      ...(b.id === null ? {} : { id: b.id }),
      name: b.name,
      subviews: itemsInput(b.subviews),
    })),
});

/** Ids for what is shown before the server gives it its own. */
let provisional = 0;

/** The arrangement as shown while it is being saved. */
const shown = (blocks: Block[]): SubviewGroup[] =>
  blocks.map((b) => ({
    id: b.id ?? (b.key ? -++provisional : null),
    name: b.name,
    subviews: b.subviews.map((s) => ({
      id: s.id ?? -++provisional,
      name: s.name,
      kind: s.kind,
      board_id: null,
    })),
  }));

/** The key a group just added comes back under. */
const NEW_GROUP = "new-group";

interface SubviewsPanelProps {
  viewId: Id | string;
  /** The sub-views once saved: the list under the tab follows them. */
  onSaved: (groups: SubviewGroup[]) => void;
  /**
   * "Désactiver vue parente": the view's tab leads nowhere, only its
   * sub-views do. Without "onParentDisabledChange", no switch.
   */
  parentDisabled: boolean;
  onParentDisabledChange?: (disabled: boolean) => void;
  /** A click elsewhere in the interface. */
  onClose: () => void;
}

export default function SubviewsPanel({
  viewId,
  onSaved,
  parentDisabled,
  onParentDisabledChange,
  onClose,
}: SubviewsPanelProps) {
  // The switch follows the click at once, then what the view says once saved.
  const [noParent, setNoParent] = useState(parentDisabled);
  useEffect(() => setNoParent(parentDisabled), [parentDisabled]);
  // What the server holds — those without a group first.
  const [groups, setGroups] = useState<SubviewGroup[] | null>(null);
  // The sub-view being renamed, the one being added — in its group, or in
  // none —, the group being renamed, the one being added.
  const [edited, setEdited] = useState<{
    id: Id;
    name: string;
    kind: SubviewKind;
  } | null>(null);
  const [adding, setAdding] = useState<{
    group: Id | null;
    name: string;
    kind: SubviewKind;
  } | null>(null);
  const [renamingGroup, setRenamingGroup] = useState<{
    id: Id;
    name: string;
  } | null>(null);
  const [addingGroup, setAddingGroup] = useState<string | null>(null);
  // The hovered sub-view: its handle shows fully, as a label's (LabelPicker).
  const [hovering, setHovered] = useState<Id | null>(null);
  // What awaits the deletion's confirmation.
  const [toDelete, setToDelete] = useState<Subview | null>(null);
  const [groupToDelete, setGroupToDelete] = useState<SubviewGroup | null>(null);

  // What the server holds, which each change starts from — what is shown
  // may be ahead of it, a change on its way.
  const current = useRef<SubviewGroup[] | null>(null);

  useEffect(() => {
    let live = true;
    api
      .getSubviews(viewId)
      .then((read) => {
        if (!live) return;
        current.current = read;
        setGroups(read);
      })
      .catch((e) => notifyError(errorMessage(e)));
    return () => {
      live = false;
    };
  }, [viewId]);

  // Each change is shown at once, then sent in turn, from the arrangement
  // the previous one left; what the server answers replaces it.
  const queue = useRef<Promise<unknown>>(Promise.resolve());
  const onSavedRef = useRef(onSaved);
  onSavedRef.current = onSaved;
  const change = (
    edit: (blocks: Block[]) => Block[],
  ): Promise<Record<string, Id> | null> => {
    if (current.current) setGroups(shown(edit(current.current)));
    const next = queue.current.then(async () => {
      const before = current.current;
      if (!before) return null;
      try {
        const result = await api.saveSubviews(viewId, toInput(edit(before)));
        current.current = result.groups;
        setGroups(result.groups);
        onSavedRef.current(result.groups);
        return result.ids;
      } catch (e) {
        notifyError(errorMessage(e));
        setGroups(current.current);
        return null;
      }
    });
    queue.current = next;
    return next;
  };

  /** One sub-view changed, wherever it is. */
  const changeSubview = (id: Id, patch: Partial<Item>) =>
    change((blocks) =>
      blocks.map((b) => ({
        ...b,
        subviews: b.subviews.map((s) => (s.id === id ? { ...s, ...patch } : s)),
      })),
    );

  // --- Inputs ------------------------------------------------------------------

  const saveEdit = () => {
    const current = edited;
    setEdited(null);
    const name = current?.name.trim();
    if (!current || !name) return;
    void changeSubview(current.id, { name, kind: current.kind });
  };

  const create = () => {
    const current = adding;
    setAdding(null);
    const name = current?.name.trim();
    if (!current || !name) return;
    void change((blocks) =>
      blocks.map((b) =>
        b.id === current.group && !b.key
          ? { ...b, subviews: [...b.subviews, { name, kind: current.kind }] }
          : b,
      ),
    );
  };

  const renameGroup = () => {
    const current = renamingGroup;
    setRenamingGroup(null);
    const name = current?.name.trim();
    if (!current || !name) return;
    void change((blocks) =>
      blocks.map((b) => (b.id === current.id ? { ...b, name } : b)),
    );
  };

  // A new group, after the others.
  const createGroup = async () => {
    const name = (addingGroup ?? "").trim();
    setAddingGroup(null);
    if (!name) return;
    await change((blocks) => [
      ...blocks,
      { id: null, key: NEW_GROUP, name, subviews: [] },
    ]);
  };

  // A click elsewhere: what was being typed is concluded, then the inset
  // closes. Not while a confirmation is asked: a click in it is not elsewhere.
  const finish = () => {
    if (edited) saveEdit();
    if (adding) create();
    if (renamingGroup) renameGroup();
    if (addingGroup !== null) void createGroup();
  };
  const finishRef = useRef(finish);
  finishRef.current = finish;
  const blocked = toDelete !== null || groupToDelete !== null;
  useEffect(() => {
    if (blocked) return;
    const onDown = (e: PointerEvent) => {
      const target = e.target as Element | null;
      if (
        target?.closest(
          `[${SUBVIEWS_PANEL_ATTRIBUTE}], [${SUBVIEWS_TOGGLE_ATTRIBUTE}]`,
        )
      )
        return;
      finishRef.current();
      onClose();
    };
    document.addEventListener("pointerdown", onDown, true);
    return () => document.removeEventListener("pointerdown", onDown, true);
  }, [blocked, onClose]);

  const closeInputs = () => {
    setEdited(null);
    setAdding(null);
    setRenamingGroup(null);
    setAddingGroup(null);
  };

  // --- Dragging ----------------------------------------------------------------

  const named = (groups ?? []).filter((g) => g.id !== null);
  const ungrouped = groups?.find((g) => g.id === null)?.subviews ?? [];
  // The rows, in order: those without a group, then each group's title — its
  // id negated —, followed by its sub-views.
  const rows = [
    ...ungrouped.map((s) => s.id),
    ...named.flatMap((g) => [-g.id!, ...g.subviews.map((s) => s.id)]),
  ];
  const byId = new Map(
    (groups ?? []).flatMap((g) => g.subviews).map((s) => [s.id, s]),
  );
  const subviewDrag = useDraggableStack({
    ids: rows,
    selector: "[data-subview-row]",
    onReorder: async (order) => {
      await change((blocks) => {
        const rebuilt: Block[] = [{ id: null, name: "", subviews: [] }];
        for (const id of order) {
          if (id < 0) {
            const group = blocks.find((b) => b.id === -id);
            if (group) rebuilt.push({ ...group, subviews: [] });
          } else {
            const subview = byId.get(id);
            if (subview) rebuilt.at(-1)!.subviews.push(subview);
          }
        }
        return rebuilt;
      });
    },
  });
  const groupDrag = useDraggableStack({
    ids: named.map((g) => g.id!),
    selector: "[data-group-block]",
    onReorder: async (order) => {
      await change((blocks) => [
        ...blocks.filter((b) => b.id === null),
        ...order.flatMap((id) => blocks.filter((b) => b.id === id)),
      ]);
    },
  });
  const zone = (element: HTMLDivElement | null) => {
    subviewDrag.zoneRef.current = element;
    groupDrag.zoneRef.current = element;
  };

  if (!groups) return null;

  // --- Rows --------------------------------------------------------------------

  /** The handle, or its room for a row not yet created. */
  const grip = (
    onPointerDown: ReturnType<typeof subviewDrag.onPointerDown> | null,
    label: string,
  ) =>
    onPointerDown ? (
      <DragHandle onPointerDown={onPointerDown} label={label} />
    ) : (
      <span style={{ width: GRIP_WIDTH, flexShrink: 0 }} />
    );

  /** The trash at the end of a row, or its room. */
  const trash = (
    onClick: (() => void) | null,
    aria: string,
    className?: string,
  ) =>
    onClick ? (
      <ActionIcon
        variant="subtle"
        color={RED}
        size="sm"
        className={className}
        style={{ flexShrink: 0 }}
        onClick={onClick}
        aria-label={aria}
      >
        <IconTrash size={14} />
      </ActionIcon>
    ) : null;

  /**
   * A row being typed — a sub-view, with what it opens, or a group's title —:
   * Enter or leaving it keeps it, Escape gives it up. Moving from its name to
   * its choice stays within it.
   */
  const editRow = ({
    name,
    onName,
    kind,
    onKind,
    onSubmit,
    onCancel,
    handle,
    onDelete,
    aria,
    title = false,
  }: {
    name: string;
    onName: (name: string) => void;
    kind?: SubviewKind;
    onKind?: (kind: SubviewKind) => void;
    onSubmit: () => void;
    onCancel: () => void;
    handle: ReturnType<typeof subviewDrag.onPointerDown> | null;
    onDelete: (() => void) | null;
    aria: string;
    /** A group's title: its font. */
    title?: boolean;
  }) => (
    <Group
      data-subview-editor
      gap={6}
      wrap="nowrap"
      align="center"
      h={title ? TITLE_HEIGHT : ROW_HEIGHT}
      onBlur={(e: FocusEvent<HTMLDivElement>) => {
        if (e.relatedTarget && e.currentTarget.contains(e.relatedTarget))
          return;
        onSubmit();
      }}
    >
      {grip(handle, `Déplacer ${name}`)}
      <TextInput
        // Escape cancels the input alone (LabelPicker).
        data-mantine-stop-propagation
        size="xs"
        radius="xs"
        value={name}
        onChange={(e) => onName(e.currentTarget.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            onSubmit();
          }
          if (e.key === "Escape") {
            e.stopPropagation();
            onCancel();
          }
        }}
        autoFocus
        style={{ flex: 1, minWidth: 0 }}
        // The text where it was shown, in its font.
        styles={{
          input: {
            ...nameFieldStyle(true),
            ...(title ? { height: TITLE_HEIGHT, minHeight: TITLE_HEIGHT } : {}),
            fontSize: title
              ? "var(--mantine-font-size-xs)"
              : "var(--mantine-font-size-sm)",
            ...(title
              ? { fontWeight: 600, color: "var(--mantine-color-bright)" }
              : {}),
          },
          // The choice's room: the field's full height, against its right
          // edge — Mantine sets it a pixel inside —, the choice
          // KIND_INSET from each edge.
          section: {
            top: 0,
            bottom: 0,
            insetInlineEnd: 0,
            justifyContent: "flex-end",
            paddingInlineEnd: KIND_INSET,
          },
        }}
        aria-label={aria}
        // What it opens, chosen inside the field, at its end.
        {...(kind && onKind
          ? {
              rightSection: (
                <SegmentedControl
                  // A press on it keeps the focus in the name: leaving the row would
                  // conclude it before the choice is made.
                  onMouseDown={(e) => e.preventDefault()}
                  size="xs"
                  // Square, as the field's end.
                  radius={KIND_RADIUS}
                  // The chosen one in green, the other in the neutral light
                  // gray of gray buttons' text, on the segmented choices'
                  // background (SettingRows).
                  color="teal"
                  data={KIND_CHOICES}
                  value={kind}
                  styles={{
                    root: { padding: 0, backgroundColor: SEGMENTS_BG },
                    label: {
                      padding: 0,
                      width: KIND_SIZE,
                      height: KIND_SIZE,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                    },
                  }}
                  classNames={{ label: classes.kindLabel }}
                  onChange={(value) => onKind(value as SubviewKind)}
                  aria-label={aria}
                />
              ),
              // Against the field's right edge.
              rightSectionWidth: 2 * KIND_SIZE + KIND_INSET,
              rightSectionPointerEvents: "all" as const,
            }
          : {})}
      />
      {trash(onDelete, `Supprimer ${name}`)}
    </Group>
  );

  // The account menu's rows (ContextsMenu.module.css): their inset, height,
  // corners and hover; the handle and the trash at their ends.
  const ROW_STYLE: CSSProperties = {
    display: "flex",
    alignItems: "center",
    gap: 6,
    paddingBlock: 0,
    paddingInline: 0,
    height: ROW_HEIGHT,
    minHeight: ROW_HEIGHT,
  };
  /** The shown name, where the field puts it. */
  const NAME_STYLE: CSSProperties = {
    flex: 1,
    minWidth: 0,
    paddingLeft: INPUT_INSET,
  };

  const subviewRow = (s: Subview, rank: number) => (
    <div
      key={s.id}
      data-subview-row
      style={{ opacity: subviewDrag.drag?.id === s.id ? 0.4 : 1 }}
    >
      {subviewDrag.drag?.target === rank && <InsertLine />}
      {edited?.id === s.id ? (
        editRow({
          name: edited.name,
          onName: (name) => setEdited((e) => (e ? { ...e, name } : e)),
          onSubmit: saveEdit,
          onCancel: () => setEdited(null),
          handle: subviewDrag.onPointerDown(s.id, rank),
          onDelete: () => {
            closeInputs();
            setToDelete(s);
          },
          aria: `Renommer ${s.name}`,
        })
      ) : (
        <div
          className={`${contextsClasses.menuItem} ${classes.row}`}
          style={ROW_STYLE}
          onMouseEnter={() => setHovered(s.id)}
          onMouseLeave={() => setHovered((id) => (id === s.id ? null : id))}
          onDoubleClick={() => {
            closeInputs();
            setEdited({ id: s.id, name: s.name, kind: s.kind });
          }}
        >
          <DragHandle
            onPointerDown={subviewDrag.onPointerDown(s.id, rank)}
            visible={hovering === s.id}
            label={`Déplacer ${s.name}`}
          />
          <Text size="sm" truncate style={NAME_STYLE}>
            {s.name}
          </Text>
          {trash(
            () => {
              closeInputs();
              setToDelete(s);
            },
            `Supprimer ${s.name}`,
            classes.reveal,
          )}
        </div>
      )}
    </div>
  );

  /** The row adding a sub-view to a group — or to none —, at its end. */
  const addingRow = (group: Id | null): ReactNode =>
    adding?.group === group &&
    editRow({
      name: adding.name,
      onName: (name) => setAdding((a) => (a ? { ...a, name } : a)),
      kind: adding.kind,
      onKind: (kind) => setAdding((a) => (a ? { ...a, kind } : a)),
      onSubmit: create,
      onCancel: () => setAdding(null),
      handle: null,
      onDelete: null,
      aria: "Nom du nouveau lien",
    });

  /** "Ajouter un lien": without a group, or under a group's. */
  const addLink = (group: Id | null) => (
    // On its own line, whatever follows it.
    <div>
      <AddButton
        label="Ajouter un lien"
        onClick={() => {
          closeInputs();
          setAdding({ group, name: "", kind: "page" });
        }}
        mt={ADD_MARGIN_TOP}
        h={ADD_HEIGHT}
      />
    </div>
  );

  /** A group without sub-views says so under its title. */
  const emptyGroup = (
    <Box py="sm">
      <EmptyPanel icon={IconFolder} message="Aucun lien" fill={false} />
    </Box>
  );

  // The rank of each row among all of them — titles included —, which the
  // sub-view drag counts in.
  let rank = 0;
  // A group being typed changes nothing yet: only once it is created.
  const hasGroups = named.length > 0;
  const nothing =
    ungrouped.length === 0 &&
    named.length === 0 &&
    adding === null &&
    addingGroup === null;

  return (
    <div
      ref={zone}
      style={
        {
          "--subviews-padding-left": `${PANEL_PADDING_LEFT}px`,
          "--subviews-padding-right": `${PANEL_PADDING_RIGHT}px`,
        } as CSSProperties
      }
    >
      {/* Nothing yet: the empty screen of a card's labels' list (LabelPicker). */}
      {nothing && emptyGroup}

      {/* Those without a group, then — once there are groups — their
          "Ajouter un lien", before the first group and its line. */}
      <div className={hasGroups ? classes.ungrouped : undefined}>
        {ungrouped.map((s) => subviewRow(s, rank++))}
        {addingRow(null)}
        {hasGroups && addLink(null)}
      </div>

      {named.map((group, groupRank) => {
        const titleRank = rank++;
        const renaming = renamingGroup?.id === group.id;
        const empty = group.subviews.length === 0 && adding?.group !== group.id;
        return (
          <div
            key={group.id}
            data-group-block
            className={classes.groupBlock}
            style={{ opacity: groupDrag.drag?.id === group.id ? 0.4 : 1 }}
          >
            {groupDrag.drag?.target === groupRank && <InsertLine />}
            {/* The group's title: also a row for the sub-view drag, which
                tells where a dropped sub-view lands. */}
            <div data-subview-row>
              {subviewDrag.drag?.target === titleRank && <InsertLine />}
              {renaming ? (
                editRow({
                  name: renamingGroup.name,
                  onName: (name) =>
                    setRenamingGroup((r) => (r ? { ...r, name } : r)),
                  onSubmit: renameGroup,
                  onCancel: () => setRenamingGroup(null),
                  handle: groupDrag.onPointerDown(group.id!, groupRank),
                  onDelete: () => {
                    closeInputs();
                    setGroupToDelete(group);
                  },
                  aria: `Renommer le groupe ${group.name}`,
                  title: true,
                })
              ) : (
                <Group
                  gap={6}
                  wrap="nowrap"
                  align="center"
                  h={TITLE_HEIGHT}
                  className={classes.row}
                  onDoubleClick={() => {
                    closeInputs();
                    setRenamingGroup({ id: group.id!, name: group.name });
                  }}
                >
                  <DragHandle
                    onPointerDown={groupDrag.onPointerDown(
                      group.id!,
                      groupRank,
                    )}
                    label={`Déplacer le groupe ${group.name}`}
                  />
                  <Text
                    truncate
                    className={classes.groupTitle}
                    style={NAME_STYLE}
                  >
                    {group.name}
                  </Text>
                  {trash(
                    () => {
                      closeInputs();
                      setGroupToDelete(group);
                    },
                    `Supprimer le groupe ${group.name}`,
                    classes.reveal,
                  )}
                </Group>
              )}
            </div>
            {empty && emptyGroup}
            {group.subviews.map((s) => subviewRow(s, rank++))}
            {/* Its own addition, under its sub-views. */}
            {addingRow(group.id)}
            {addLink(group.id)}
          </div>
        );
      })}
      {groupDrag.drag && groupDrag.drag.target >= named.length && (
        <InsertLine />
      )}
      {subviewDrag.drag && subviewDrag.drag.target >= rows.length && (
        <InsertLine />
      )}

      {/* The group being added: its title being typed, a line above it
          whatever precedes. Its empty screen waits for it to be created. */}
      {addingGroup !== null && (
        <div className={`${classes.groupBlock} ${classes.separated}`}>
          {editRow({
            name: addingGroup,
            onName: setAddingGroup,
            onSubmit: () => void createGroup(),
            onCancel: () => setAddingGroup(null),
            handle: null,
            onDelete: null,
            aria: "Nom du nouveau groupe",
            title: true,
          })}
        </div>
      )}

      {/* The additions at the end: a line above them, across the whole
          inset, as the list's others; without groups, "Ajouter un groupe"
          right under "Ajouter un lien", as in a widget drawer's labels
          (LabelGroupsEditor). */}
      <div
        style={{
          marginLeft: -PANEL_PADDING_LEFT,
          marginRight: -PANEL_PADDING_RIGHT,
          marginTop: ADD_MARGIN_TOP,
          borderTop: LINE,
        }}
      />
      {!hasGroups && addLink(null)}
      {/* On its own line: a button sits beside the one before otherwise. */}
      <div>
        <AddButton
          label="Ajouter un groupe"
          onClick={() => {
            closeInputs();
            setAddingGroup("");
          }}
          mt={hasGroups ? ADD_MARGIN_TOP : 0}
          h={ADD_HEIGHT}
        />
      </div>

      {/* Under the additions, a line, then the view's own setting. */}
      {onParentDisabledChange && (
        <>
          <div
            style={{
              marginLeft: -PANEL_PADDING_LEFT,
              marginRight: -PANEL_PADDING_RIGHT,
              marginTop: ADD_MARGIN_TOP,
              borderTop: LINE,
            }}
          />
          <Switch
            size="xs"
            color="teal"
            label="Désactiver vue parente"
            // The text on the left, the switch at the inset's right edge.
            labelPosition="left"
            styles={{ body: { justifyContent: "space-between" }, label: { paddingInlineEnd: 0 } }}
            checked={noParent}
            onChange={(e) => {
              const disabled = e.currentTarget.checked;
              setNoParent(disabled);
              onParentDisabledChange(disabled);
            }}
            py={10}
            px={6}
          />
        </>
      )}

      {/* The confirmations hold the inset open: a click in them is not one
          elsewhere. */}
      <DeleteConfirmModal
        zIndex={CONFIRM_Z_INDEX}
        opened={toDelete !== null}
        onClose={() => setToDelete(null)}
        onConfirm={() => {
          const subview = toDelete;
          setToDelete(null);
          if (subview)
            void change((blocks) =>
              blocks.map((b) => ({
                ...b,
                subviews: b.subviews.filter((s) => s.id !== subview.id),
              })),
            );
        }}
        title="Supprimer"
        message={
          <>
            Voulez-vous vraiment supprimer « {toDelete?.name} » ? Cette action
            est irréversible.
          </>
        }
      />
      <DeleteConfirmModal
        zIndex={CONFIRM_Z_INDEX}
        opened={groupToDelete !== null}
        onClose={() => setGroupToDelete(null)}
        onConfirm={() => {
          const group = groupToDelete;
          setGroupToDelete(null);
          if (group)
            void change((blocks) => blocks.filter((b) => b.id !== group.id));
        }}
        title="Supprimer le groupe"
        message={
          <>
            Voulez-vous vraiment supprimer le groupe « {groupToDelete?.name} » ?
            Cette action est irréversible.
          </>
        }
      />
    </div>
  );
}
