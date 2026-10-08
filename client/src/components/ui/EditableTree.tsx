import {
  ActionIcon,
  Box,
  Checkbox,
  Group,
  Input,
  Text,
  TextInput,
  Tree,
  getTreeExpandedState,
  moveTreeNode,
  useTree,
} from "@mantine/core";
import type { TreeDragDropPayload, TreeNodeData } from "@mantine/core";
import { IconChevronRight, IconGripVertical, IconMapPin } from "@tabler/icons-react";
import { useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";
import classes from "../../assets/styles/EditableTree.module.css";
import type { DeclaredAssetLocation } from "@milo/shared";
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
// it is shown (shared, DeclaredAssetLocation).

/** Each level steps in by this much. */
const LEVEL_OFFSET = 32;

/**
 * A place's height, as an editable list's row (EditableRows): an "xs" field
 * and the row's inset above and below.
 */
const ROW_HEIGHT = 30 + 2 * ROW_INSET;

/** The chevron, on a place with children; one without has none, nor its room. */
const CHEVRON_SIZE = 20;

/** The frame's inset and rounding, as the drawers' lists. */
const FRAME_PADDING = 8;
const FRAME_RADIUS = 8;

/** Beyond this, a name is no longer one. */
const NAME_MAX = 120;

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

/** Nested data back to flat places: a parent before its children, in their order. */
const flatten = (data: TreeNodeData[], parent: string | null = null): Node[] =>
  data.flatMap((d) => [
    { id: d.value, parent, name: String(d.label ?? "") },
    ...flatten(d.children ?? [], d.value),
  ]);

/** A place and everything under it. */
const subtreeOf = (nodes: Node[], id: string): Set<string> => {
  const inside = new Set([id]);
  for (const node of nodes) if (node.parent && inside.has(node.parent)) inside.add(node.id);
  return inside;
};

interface EditableTreeProps {
  title: string;
  /** Under the title: whom the tree is shared by. */
  description?: string;
  nodes: Node[];
  onChange: (nodes: Node[]) => void;
}

export default function EditableTree({ title, description, nodes, onChange }: EditableTreeProps) {
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
    const node: Node = { id: crypto.randomUUID(), parent, name: "" };
    let at = nodes.length;
    if (parent) {
      const under = subtreeOf(nodes, parent);
      nodes.forEach((n, i) => {
        if (under.has(n.id)) at = i + 1;
      });
    }
    if (parent) tree.expand(parent);
    onChange([...nodes.slice(0, at), node, ...nodes.slice(at)]);
    tree.clearSelected();
    tree.select(node.id);
    setEditing(node.id);
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
    onChange(flatten(moveTreeNode(data, payload)));
    if (payload.position === "inside") tree.expand(payload.targetNode);
  };

  return (
    // The board's data, not the widget's: say so under the label, at 20 px
    // from the tree.
    <Input.Wrapper
      label={title}
      description={description}
      styles={{ description: { paddingBottom: 20 } }}
    >
      {nodes.length === 0 ? (
        <EmptyList icon={IconMapPin} message="Aucun emplacement" />
      ) : (
        // One control: the whole tree in a single sunken frame.
        <Box
          p={FRAME_PADDING}
          style={{ backgroundColor: ROW_BACKGROUND, borderRadius: FRAME_RADIUS }}
        >
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
                    aria-label={`Déplacer ${String(node.label) || "l'emplacement"}`}
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
                  {editing === value ? (
                    <TextInput
                      size="xs"
                      placeholder="Nom"
                      aria-label="Nom"
                      defaultValue={String(node.label ?? "")}
                      maxLength={NAME_MAX}
                      autoFocus
                      onClick={(e) => e.stopPropagation()}
                      onBlur={(e) => {
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
                      style={{ flex: 1, minWidth: 0, userSelect: "none" }}
                    >
                      {node.label}
                    </Text>
                  )}
                </Group>
              );
            }}
          />
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
          checked.length > 1 ? `Supprimer ${checked.length} emplacements` : "Supprimer l'emplacement"
        }
        message={
          <>
            Voulez-vous vraiment supprimer{" "}
            {checked.length > 1
              ? `ces ${checked.length} emplacements`
              : `« ${checked[0]?.name ?? ""} »`}{" "}
            et tout ce qui s'y trouve ? Cette action est irréversible.
          </>
        }
      />
    </Input.Wrapper>
  );
}
