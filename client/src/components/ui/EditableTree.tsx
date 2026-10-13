import {
  ActionIcon,
  Box,
  Checkbox,
  Group,
  Input,
  ScrollArea,
  Select,
  Text,
  TextInput,
  Tree,
  getTreeExpandedState,
  moveTreeNode,
  useTree,
} from "@mantine/core";
import type { TreeDragDropPayload, TreeNodeData } from "@mantine/core";
import { IconChevronRight, IconCopy, IconGripVertical, IconMapPin } from "@tabler/icons-react";
import { useMemo, useRef, useState } from "react";
import type { ComponentType, CSSProperties, DragEvent, ReactNode } from "react";
import classes from "../../assets/styles/EditableTree.module.css";
import scroll from "../../assets/styles/ListScroll.module.css";
import type { DeclaredAssetLocation, Id, Label } from "@milo/shared";
import { useLabelColors } from "./LabelChip";
import AddButton from "./AddButton";
import DeleteConfirmModal from "./DeleteConfirmModal";
import { DeleteSelectedButton, EmptyList, ROW_BACKGROUND, ROW_INSET } from "./DrawerRows";
import { NEUTRAL_TEXT } from "../../themes/colors";

// A board's locations, edited as one tree — "Société > Bâtiment > Baie >
// Position" — with Mantine's Tree, its lines joining each place to its
// parent, in a single sunken frame. Each place, as high as an editable list's
// row, has its drag handle — dropped before, after or inside another, it
// moves with what is under it —, its chevron, its checkbox — Mantine's
// checked state: a parent checks its children, and shows partly checked when
// only some are —, and its name: a double click edits it, Enter keeps what
// is typed, Escape gives it up. Two places of a level may share a name.
//
// A click selects a place, in gray: "Ajouter un élément enfant" adds one under
// it; "Ajouter un élément racine" adds one at the root.
// Checked places are deleted together, with what is under them. A place left
// without a name, and nothing under it, goes. The devices then pick theirs
// (DeclaredAssetDrawer).
//
// The tree is kept flat, a parent always before its children, in the order
// it is shown (shared, DeclaredAssetLocation). A place may carry more — a
// location's type and code (shared, LocationPlace) —: "make" gives a new
// place its fields, "leading" shows some before its name, "trailing" the
// others at the end of its row, and a place keeps them as it moves.

/** Each level steps in by this much. */
const LEVEL_OFFSET = 32;

/**
 * A place's height, as an editable list's row (EditableRows): an "xs" field
 * and the row's inset above and below.
 */
const ROW_HEIGHT = 30 + 2 * ROW_INSET;

/** A Cascader's column: a long name truncates rather than widen it. */
const CASCADER_COLUMN_WIDTH = 200;

/** Ten places at most at a time: beyond that, the tree scrolls in its frame. */
const VISIBLE_ROWS = 10;

/** The chevron, on a place with children; one without has none, nor its room. */
const CHEVRON_SIZE = 20;

/** The frame's inset and rounding, as the drawers' lists. */
const FRAME_PADDING = 8;
const FRAME_RADIUS = 8;

/** Beyond this, a name is no longer one. */
export const TREE_NAME_MAX = 120;

/** Over a place without children, the drop goes inside between this share of its height and its mirror. */
const INSIDE_FROM = 0.25;

/** The space between the buttons under the tree. */
const FOOTER_GAP = 16;

type Node = DeclaredAssetLocation;

/** The flat places, as the nested data Mantine's Tree — or TreeSelect — reads. */
export const locationTreeData = (nodes: Node[]): TreeNodeData[] => {
  const childrenOf = (parent: string | null): TreeNodeData[] =>
    nodes
      .filter((n) => n.parent === parent)
      .map((n) => {
        const children = childrenOf(n.id);
        return { value: n.id, label: n.name, ...(children.length ? { children } : {}) };
      });
  return childrenOf(null);
};

/**
 * A place's path from the root, as a Cascader reads its value: its ancestors'
 * ids, then its own. Empty for none, or for a place no longer in the tree.
 */
export const treePath = (nodes: Node[], id: string): string[] => {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const path: string[] = [];
  for (let node = byId.get(id); node; node = node.parent ? byId.get(node.parent) : undefined) {
    path.unshift(node.id);
  }
  return path;
};

/**
 * What a tree's Cascader — a device's location, a product's category — shares:
 * the field shows the full path, "Société > Bâtiment > Baie"; the dropdown takes the width of its columns, not the field's, which would cut
 * them, and shows two levels at a time, each with the application's thin
 * scrollbar; any level may be chosen.
 */
export const TREE_CASCADER = {
  comboboxProps: { width: "max-content", position: "bottom-start" },
  columnWidth: CASCADER_COLUMN_WIDTH,
  // Two levels side by side: deeper ones replace the first, which an arrow
  // brings back.
  maxDisplayedLevels: 2,
  // Each column scrolls with the thin bar of the drawers' lists, on its right
  // edge: the column's inset moves inside the scrolled area.
  scrollAreaProps: {
    type: "auto",
    scrollbars: "y",
    classNames: { scrollbar: scroll.scrollbar, thumb: scroll.thumb },
    styles: { viewport: { padding: "var(--combobox-padding)" } },
  },
  styles: { columnScroll: { padding: 0 } },
  separator: " > ",
  changeOnSelect: true,
} as const;

/**
 * Nested data back to flat places: a parent before its children, in their
 * order, each with its own fields. A root's label stays with it; a place
 * moved under another leaves it.
 */
const flatten = <N extends Node>(
  data: TreeNodeData[],
  before: Map<string, N>,
  parent: string | null = null,
): N[] =>
  data.flatMap((d) => {
    const { label, ...own } = before.get(d.value) ?? ({} as Partial<N>);
    const kept = parent === null ? label : undefined;
    return [
      { ...own, id: d.value, parent, name: String(d.label ?? ""), ...(kept ? { label: kept } : {}) } as N,
      ...flatten(d.children ?? [], before, d.value),
    ];
  });

/** A place and everything under it. */
const subtreeOf = (nodes: Node[], id: string): Set<string> => {
  const inside = new Set([id]);
  for (const node of nodes) if (node.parent && inside.has(node.parent)) inside.add(node.id);
  return inside;
};

/** The places with a new one: at the end of what is already under its parent, at the end without one. */
export const withNode = <N extends Node>(nodes: N[], node: N): N[] => {
  let at = nodes.length;
  if (node.parent) {
    const under = subtreeOf(nodes, node.parent);
    nodes.forEach((n, i) => {
      if (under.has(n.id)) at = i + 1;
    });
  }
  return [...nodes.slice(0, at), node, ...nodes.slice(at)];
};

/** What the tree's elements are called: places by default. */
export interface TreeWords {
  icon: ComponentType<{ size?: number }>;
  /** "Aucun emplacement". */
  none: string;
  /** "l'emplacement". */
  the: string;
  /** "emplacements". */
  plural: string;
}

const PLACE_WORDS: TreeWords = {
  icon: IconMapPin,
  none: "Aucun emplacement",
  the: "l'emplacement",
  plural: "emplacements",
};

interface EditableTreeProps<N extends Node> {
  /** Above the tree; none in a window whose title already names it. */
  title?: string;
  /** Under the title: whom the tree is shared by. */
  description?: string;
  nodes: N[];
  onChange: (nodes: N[]) => void;
  /** A new place, from its id, parent and empty name: its own fields added. */
  make?: (base: Node) => N;
  /** Before a place's name: its own fields, as its code, "change" rewriting it. */
  leading?: (node: N, change: (next: N) => void) => ReactNode;
  /**
   * The room "leading" takes at the deepest level: higher up, it widens by
   * the levels it is short of, so that every name starts at the same place.
   */
  leadingWidth?: number;
  /**
   * A duplicated place, the top of the copy: what it must not keep — a
   * location's code, given once per level. What is under it keeps everything.
   */
  copied?: (node: N) => N;
  /** At the end of a place's row: its own fields, "change" rewriting it. */
  trailing?: (node: N, change: (next: N) => void) => ReactNode;
  words?: TreeWords;
  /**
   * The labels a root may be tied to — a declared device's locations —: a
   * choice on each root's row. Without them, none.
   */
  rootLabels?: Label[];
}

/**
 * A place dragged over another: Mantine only drops inside a place that
 * already has children. Over the middle of one that has none, the place
 * dropped becomes its child: the drop zone says "inside", which the drop reads.
 */
const dropOver = (
  e: DragEvent<HTMLElement>,
  hasChildren: boolean,
  mantine?: (e: DragEvent<HTMLElement>) => void,
) => {
  mantine?.(e);
  const target = e.currentTarget;
  // Refused — onto itself, under itself —: nothing to change.
  if (hasChildren || !target.hasAttribute("data-drag-over")) return;
  const rect = target.getBoundingClientRect();
  const y = (e.clientY - rect.top) / rect.height;
  if (y > INSIDE_FROM && y < 1 - INSIDE_FROM) target.setAttribute("data-drag-over", "inside");
};

/** The width of a root's label choice. */
const ROOT_LABEL_WIDTH = 160;

/** A root's label: chosen among the widget's, or none. */
function RootLabel({
  data,
  labels,
  value,
  colorOf,
  onChange,
}: {
  data: { group: string; items: { value: string; label: string }[] }[];
  labels: Label[];
  value: Id | null;
  colorOf: (color: string) => string;
  onChange: (label: Id | null) => void;
}) {
  const chosen = labels.find((l) => l.id === value);
  return (
    <Select
      size="xs"
      placeholder="Étiquette"
      aria-label="Étiquette"
      data={data}
      value={chosen ? String(chosen.id) : null}
      onChange={(v) => onChange(v ? Number(v) : null)}
      clearable
      nothingFoundMessage="Aucune étiquette"
      leftSection={
        chosen ? (
          <Box w={10} h={10} style={{ borderRadius: "50%", backgroundColor: colorOf(chosen.color) }} />
        ) : undefined
      }
      // The keys are the field's: the Tree would take Space and the arrows.
      onKeyDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
      data-mantine-stop-propagation
      w={ROOT_LABEL_WIDTH}
      style={{ flexShrink: 0 }}
    />
  );
}

export default function EditableTree<N extends Node = Node>({
  title,
  description,
  nodes,
  onChange,
  make = (base) => base as N,
  leading,
  leadingWidth = 0,
  copied = (node) => node,
  trailing,
  words = PLACE_WORDS,
  rootLabels,
}: EditableTreeProps<N>) {
  const labelColors = useLabelColors();
  // The labels by group, as the root's choice offers them.
  const labelData = useMemo(() => {
    const groups = new Map<string, { value: string; label: string }[]>();
    for (const l of rootLabels ?? []) {
      const group = l.group_name ?? "";
      groups.set(group, [...(groups.get(group) ?? []), { value: String(l.id), label: l.name }]);
    }
    return [...groups].map(([group, items]) => ({ group, items }));
  }, [rootLabels]);
  const roots = new Set(nodes.filter((n) => n.parent === null).map((n) => n.id));
  // The deepest level, 1 at the root: "leading" widens up to it.
  const deepest = useMemo(() => {
    const levels = new Map<string, number>();
    for (const n of nodes) levels.set(n.id, n.parent === null ? 1 : (levels.get(n.parent) ?? 0) + 1);
    return Math.max(1, ...levels.values());
  }, [nodes]);
  // The same data while the places do not change: Mantine's Tree starts over
  // from each new one.
  const data = useMemo(() => locationTreeData(nodes), [nodes]);
  // Every place shows unfolded on opening; the chevrons fold them.
  const tree = useTree({ initialExpandedState: getTreeExpandedState(data, "*") });
  /** The place whose name is being typed: one just added, or double-clicked. */
  const [editing, setEditing] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  // Escape leaves the name without keeping what was typed: the exit that
  // follows knows it.
  const cancelled = useRef(false);

  const selected = nodes.find((n) => tree.selectedState.includes(n.id));
  // Mantine keeps the checked leaves: a parent counts as checked once all its
  // children are — it goes with them.
  const checked = nodes.filter((n) => tree.isNodeChecked(n.id));

  /** A new place, its name typed: at the end of what is already under "parent". */
  const add = (parent: string | null) => {
    const node = make({ id: crypto.randomUUID(), parent, name: "" });
    if (parent) tree.expand(parent);
    onChange(withNode(nodes, node));
    tree.clearSelected();
    tree.select(node.id);
    setEditing(node.id);
  };

  /**
   * The selected place and everything under it, copied just after it, under
   * the same parent: the copy is selected, unfolded as the original.
   */
  const duplicate = () => {
    if (!selected) return;
    const inside = subtreeOf(nodes, selected.id);
    const ids = new Map([...inside].map((id) => [id, crypto.randomUUID()]));
    const copies = nodes
      .filter((n) => inside.has(n.id))
      .map((n): N => {
        const copy = { ...n, id: ids.get(n.id)!, parent: n.id === selected.id ? n.parent : ids.get(n.parent!)! };
        return n.id === selected.id
          ? copied({ ...copy, name: `${n.name} (copie)`.slice(0, TREE_NAME_MAX) })
          : copy;
      });
    const after = nodes.reduce((at, n, i) => (inside.has(n.id) ? i + 1 : at), 0);
    onChange([...nodes.slice(0, after), ...copies, ...nodes.slice(after)]);
    for (const id of inside) if (tree.expandedState[id]) tree.expand(ids.get(id)!);
    tree.clearSelected();
    tree.select(ids.get(selected.id)!);
  };

  /** The name typed: kept; left empty on a place with nothing under it, the place goes. */
  const rename = (id: string, typed: string) => {
    setEditing(null);
    const name = typed.trim();
    if (!name && !nodes.some((n) => n.parent === id)) {
      onChange(nodes.filter((n) => n.id !== id));
      return;
    }
    if (name) onChange(nodes.map((n) => (n.id === id ? { ...n, name } : n)));
  };

  /** A place dropped before, after or inside another: it moves with what is under it. */
  const move = (payload: TreeDragDropPayload) => {
    onChange(flatten(moveTreeNode(data, payload), new Map(nodes.map((n) => [n.id, n]))));
    if (payload.position === "inside") tree.expand(payload.targetNode);
  };

  return (
    // The board's data, not the widget's: say so under the label, at 20 px
    // from the tree.
    <Input.Wrapper
      label={title}
      description={description}
      styles={{ description: { paddingBottom: description ? 20 : 0 } }}
    >
      {nodes.length === 0 ? (
        <EmptyList icon={words.icon} message={words.none} />
      ) : (
        // One control: the whole tree in a single sunken frame, which scrolls
        // with the thin bar of the drawers' lists (EditableRows), on the
        // frame's right edge: the frame's inset is inside the scrolled area.
        <Box
          style={{ backgroundColor: ROW_BACKGROUND, borderRadius: FRAME_RADIUS, overflow: "hidden" }}
        >
          <ScrollArea.Autosize
            mah={VISIBLE_ROWS * ROW_HEIGHT + 2 * FRAME_PADDING}
            type="auto"
            scrollbars="y"
            classNames={{ scrollbar: scroll.scrollbar, thumb: scroll.thumb }}
          >
            <Box p={FRAME_PADDING}>
              <Tree
                className={classes.root}
                style={{ "--editable-tree-row": `${ROW_HEIGHT}px` } as CSSProperties}
                data={data}
                tree={tree}
                levelOffset={LEVEL_OFFSET}
                withLines
                withDragHandle
                onDragDrop={move}
                expandOnClick={false}
                // A click selects the place — never unselects it: "Ajouter un
                // élément enfant" adds under it.
                selectOnClick={false}
                renderNode={({
                  node,
                  level,
                  expanded,
                  hasChildren,
                  elementProps,
                  dragHandleProps,
                  selected: isSelected,
                }) => {
                  const value = node.value;
                  const isChecked = tree.isNodeChecked(value);
                  const isPartly = tree.isNodeIndeterminate(value);
                  return (
                    <Group
                      gap={6}
                      wrap="nowrap"
                      {...elementProps}
                      onDragOver={(e) => dropOver(e, hasChildren, elementProps.onDragOver)}
                      onClick={() => {
                        tree.clearSelected();
                        tree.select(value);
                      }}
                      style={{
                        ...elementProps.style,
                        height: ROW_HEIGHT,
                        // The start is Mantine's: each level's offset.
                        paddingInlineEnd: ROW_INSET,
                        borderRadius: "var(--mantine-radius-sm)",
                        // A neutral gray, a step darker than the frame.
                        backgroundColor: isSelected ? "var(--milo-menu-hover)" : undefined,
                      }}
                    >
                      <Box
                        {...dragHandleProps}
                        c="dimmed"
                        style={{ display: "flex", cursor: "grab", flexShrink: 0 }}
                        aria-label={`Déplacer ${String(node.label) || words.the}`}
                      >
                        <IconGripVertical size={14} />
                      </Box>
                      {hasChildren ? (
                        <ActionIcon
                          // Mantine's gray leans blue: a neutral one, and a
                          // neutral hover (EditableTree.module.css).
                          variant="transparent"
                          c={NEUTRAL_TEXT}
                          className={classes.chevron}
                          size={CHEVRON_SIZE}
                          aria-label={expanded ? "Replier" : "Déplier"}
                          onClick={(e) => {
                            e.stopPropagation();
                            tree.toggleExpanded(value);
                          }}
                        >
                          <IconChevronRight
                            size={14}
                            style={{
                              transform: expanded ? "rotate(90deg)" : undefined,
                              transition: "transform 150ms",
                            }}
                          />
                        </ActionIcon>
                      ) : leading ? (
                        // Without its chevron, the place keeps its room: the names line up.
                        <Box w={CHEVRON_SIZE} style={{ flexShrink: 0 }} />
                      ) : null}
                      <Checkbox.Indicator
                        size="xs"
                        checked={isChecked}
                        indeterminate={isPartly}
                        onClick={(e) => {
                          e.stopPropagation();
                          if (isChecked) tree.uncheckNode(value);
                          else tree.checkNode(value);
                        }}
                        style={{ cursor: "pointer", flexShrink: 0 }}
                      />
                      {leading && (
                        <Box
                          w={leadingWidth + (deepest - level) * LEVEL_OFFSET}
                          style={{ flexShrink: 0, display: "flex" }}
                        >
                          {(() => {
                            const own = nodes.find((n) => n.id === value);
                            return own
                              ? leading(own, (next) => onChange(nodes.map((n) => (n.id === value ? next : n))))
                              : null;
                          })()}
                        </Box>
                      )}
                      {editing === value ? (
                        <TextInput
                          size="xs"
                          placeholder="Nom"
                          aria-label="Nom"
                          defaultValue={String(node.label ?? "")}
                          maxLength={TREE_NAME_MAX}
                          autoFocus
                          onClick={(e) => e.stopPropagation()}
                          onBlur={(e) => {
                            // Gone to another field of its row — its code —
                            // before a name: the place stays, its name to type.
                            const row = e.currentTarget.closest("[data-value]");
                            const inRow = e.relatedTarget instanceof Node && row?.contains(e.relatedTarget);
                            if (inRow && !e.currentTarget.value.trim() && !cancelled.current) return;
                            // Escape gives up the typing: the name stays as it was.
                            const typed = cancelled.current
                              ? String(node.label ?? "")
                              : e.currentTarget.value;
                            cancelled.current = false;
                            rename(value, typed);
                          }}
                          onKeyDown={(e) => {
                            // The keys are the field's: the Tree would take Space
                            // to fold or check, the arrows to move.
                            e.stopPropagation();
                            // Consumed: the window that holds this field does not also save.
                            if (e.key === "Enter") {
                              e.preventDefault();
                              e.currentTarget.blur();
                            }
                            if (e.key === "Escape") {
                              e.preventDefault();
                              cancelled.current = true;
                              e.currentTarget.blur();
                            }
                          }}
                          // Escape cancels the typing alone: the window stays open
                          // (Mantine closes it from a window listener this
                          // attribute holds back).
                          data-mantine-stop-propagation
                          style={{ flex: 1, minWidth: 0 }}
                        />
                      ) : (
                        <Text
                          size="sm"
                          truncate
                          onDoubleClick={() => setEditing(value)}
                          title="Double-cliquer pour renommer"
                          // Without a name, a dimmed one to double-click.
                          c={node.label ? undefined : "dimmed"}
                          style={{ flex: 1, minWidth: 0, userSelect: "none" }}
                        >
                          {node.label || "Sans nom"}
                        </Text>
                      )}
                      {trailing &&
                        (() => {
                          const own = nodes.find((n) => n.id === value);
                          return own
                            ? trailing(own, (next) =>
                                onChange(nodes.map((n) => (n.id === value ? next : n))),
                              )
                            : null;
                        })()}
                      {rootLabels && roots.has(value) && (
                        <RootLabel
                          data={labelData}
                          labels={rootLabels}
                          value={nodes.find((n) => n.id === value)?.label ?? null}
                          colorOf={(color) => labelColors(color).backgroundColor}
                          onChange={(label) =>
                            onChange(
                              nodes.map((n) => {
                                if (n.id !== value) return n;
                                const { label: _old, ...rest } = n;
                                return (label ? { ...rest, label } : rest) as N;
                              }),
                            )
                          }
                        />
                      )}
                    </Group>
                  );
                }}
              />
            </Box>
          </ScrollArea.Autosize>
        </Box>
      )}

      {/* Checked places are deleted together; otherwise, the two ways to add. */}
      {checked.length > 0 ? (
        <DeleteSelectedButton count={checked.length} onClick={() => setConfirming(true)} mt={4} />
      ) : (
        <Group gap={FOOTER_GAP} mt={4}>
          <AddButton label="Ajouter un élément racine" onClick={() => add(null)} />
          <AddButton
            label="Ajouter un élément enfant"
            onClick={() => selected && add(selected.id)}
            disabled={!selected}
          />
        </Group>
      )}
      {/* A place selected: under the two ways to add, its copy. */}
      {checked.length === 0 && selected && (
        <AddButton label="Dupliquer" leftSection={<IconCopy size={14} />} onClick={duplicate} />
      )}

      {/* A place goes with everything under it. */}
      <DeleteConfirmModal
        opened={confirming && checked.length > 0}
        onClose={() => setConfirming(false)}
        onConfirm={() => {
          const gone = new Set<string>();
          for (const { id } of checked) for (const inside of subtreeOf(nodes, id)) gone.add(inside);
          setConfirming(false);
          tree.uncheckAllNodes();
          onChange(nodes.filter((n) => !gone.has(n.id)));
        }}
        title={
          checked.length > 1 ? `Supprimer ${checked.length} ${words.plural}` : `Supprimer ${words.the}`
        }
        message={
          <>
            Voulez-vous vraiment supprimer{" "}
            {checked.length > 1
              ? `ces ${checked.length} ${words.plural}`
              : `« ${checked[0]?.name ?? ""} »`}{" "}
            et tout ce qui s'y trouve ? Cette action est irréversible.
          </>
        }
      />
    </Input.Wrapper>
  );
}
