import { ActionIcon, Group, Menu, Scroller, SegmentedControl } from "@mantine/core";
import { IconEye, IconEyeOff, IconPencil, IconPlus, IconTrash } from "@tabler/icons-react";
import { useEffect, useRef, useState, type ReactNode, type SyntheticEvent } from "react";
import type { BoardAccess } from "@milo/shared";
import { ADD_ACTION, RED } from "../../themes/colors";
import { MODE_SWITCH_TOP, PAGE_GUTTER } from "../../themes/layout";
import DeleteConfirmModal from "./DeleteConfirmModal";
import AdjustedInput from "./AdjustedInput";
import ContextsMenu, { type ContextsMenuProps } from "./ContextsMenu";
import PointMenu, { menuAnchor, type PointMenuPosition } from "./PointMenu";
import { useTabReorder } from "./useTabReorder";

// The open view's boards, at the bottom left: the counterpart of the logo,
// which shows the shortcuts (ShortcutsHelp), same inset, in the opposite
// corner. A "+" at the end adds one, which goes straight into name entry;
// right-clicking one renames it — in place, like a tab — or deletes it;
// dragging reorders it. A "read" share renames nothing, and only its owner
// deletes it. In interface editing, "Masquer" hides any of them, for
// oneself: greyed at the end of the row, it no longer shows outside editing.
// The last board shown cannot be hidden. The open board's contexts sit in
// its segment, to the right of its name.

/** A board, as the selector needs it. */
interface Item {
  id: number;
  name: string;
  /** What the account may do with it. Without it, everything the props offer. */
  access?: BoardAccess;
  /** Hidden by the account: greyed, only shown in interface editing. */
  is_hidden?: boolean;
}

interface BoardSwitchProps {
  /** The open view's boards, in order. */
  boards: Item[];
  /** The open board, as a string. */
  value: string | null;
  onChange: (id: string) => void;
  /**
   * The new order, once a board is dragged and dropped. Without it — open
   * board locked —, boards cannot be dragged.
   */
  onReorder?: (ids: number[]) => void | Promise<void>;
  /** Without it — without the right to add —, no "+". */
  onCreate?: () => void | Promise<void>;
  /** Without any of them, no menu. */
  onRename?: (id: number, name: string) => void | Promise<void>;
  onDelete?: (id: number) => void | Promise<void>;
  /** "Masquer" or "Afficher": for every board, its own or shared. */
  onToggleHidden?: (id: number, hidden: boolean) => void | Promise<void>;
  /** What the cascading deletion takes with it, told to the user. */
  deleteWarning?: ReactNode;
  /**
   * The board to switch to name entry as soon as it appears — the one just
   * created. "onRenameOpened" says that it is done.
   */
  toRename?: number | null;
  onRenameOpened?: () => void;
  /** Name entry is over: validated — even unchanged —, or abandoned with Escape. */
  onRenameEnded?: (id: number, abandoned: boolean) => void;
  /** The open board's contexts; absent without a board. */
  contexts?: Omit<ContextsMenuProps, "visibleFrom" | "inTab" | "inSegment">;
  /** Shown after the boards and their "+": the "Nouvelle version disponible" banner. */
  trailing?: ReactNode;
}

/** What happens in the contexts list does not bubble up to the segment. */
const keep = (e: SyntheticEvent) => e.stopPropagation();

/** Can the account change this board — rename it? Not under a "read" share. */
const changeable = (item: Item) => item.access !== "read";

/** Is the board the account's own — or does it not say? Deleting it is the owner's. */
const owned = (item: Item) => item.access === undefined || item.access === "owner";

/**
 * The insertion line, placed in the targeted cell: nothing is inserted between
 * cells. It is placed against the cell itself (positioned by Mantine), and
 * not against its label, which has an inner margin: it thus falls on
 * the rule that separates two boards.
 */
function Line({ side }: { side: "left" | "right" }) {
  return (
    <span
      style={{
        position: "absolute",
        top: 0,
        bottom: 0,
        [side]: -1,
        borderLeft: "2px solid var(--mantine-color-teal-5)",
      }}
    />
  );
}

// The whole selector: it is what the drag traverses to find the
// target rank.
const sonSelecteur = (element: HTMLElement) =>
  element.closest<HTMLElement>(".mantine-SegmentedControl-root");

/** A hidden board, in interface editing: greyed. */
const HIDDEN_OPACITY = 0.4;

/**
 * What the bottom right corner holds — the logo, the widgets' "+" and, while a
 * widget is held, its trash —: the boards stop before it, and scroll beyond.
 */
const BOTTOM_RIGHT_RESERVE = 300;

/** The Scroller's chevrons, and their fade: Mantine's 50 pixels exceed the row. */
const CHEVRON_SIZE = 20;

/** The frame's radius, which the indicator and the cells take over as is. */
const RADIUS = "var(--sc-radius, var(--mantine-radius-default))";

export default function BoardSwitch({
  boards,
  value,
  onChange,
  onReorder,
  onCreate,
  onRename,
  onDelete,
  onToggleHidden,
  deleteWarning,
  toRename,
  onRenameOpened,
  onRenameEnded,
  contexts,
  trailing,
}: BoardSwitchProps) {
  // Boards are dragged like the tabs of a row (useTabReorder).
  const { ordered, tabProps, guardChange, insertAt } = useTabReorder(
    boards,
    (b) => b.id,
    onReorder,
    sonSelecteur,
  );
  // Mantine positions the open board's indicator from the position of its
  // cell, and does not recompute it when cells change order: the
  // selector is rebuilt at each new order.
  const order = ordered.map((v) => v.id).join(",");

  const [plusHovered, setMoreHovered] = useState(false);
  const [menu, setMenu] = useState<{ board: Item; position: PointMenuPosition } | null>(null);
  // The board being renamed and the name typed into it.
  const [renamed, setRenamed] = useState<{ id: number; name: string } | null>(null);
  // The validated name, shown while the server responds and the boards
  // come back re-read: without it, the old name would reappear for a moment.
  const [provisional, setProvisional] = useState<{ id: number; name: string } | null>(null);
  // True once the entry is concluded: Enter followed by loss of focus must not
  // save twice.
  const finished = useRef(false);
  const [toDelete, setToDelete] = useState<Item | null>(null);

  // The page content stops just above: it needs to know where
  // this control begins, and only the selector knows. Tracked, because its
  // height changes with the text size as with the number of boards.
  const command = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const element = command.current;
    if (!element) return;
    const publish = () =>
      document.documentElement.style.setProperty(
        MODE_SWITCH_TOP,
        `${Math.round(window.innerHeight - element.getBoundingClientRect().top)}px`,
      );
    publish();
    const observer = new ResizeObserver(publish);
    observer.observe(element);
    window.addEventListener("resize", publish);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", publish);
    };
  }, [order]);

  const renamable = (board: Item) => Boolean(onRename) && changeable(board);
  const deletable = (board: Item) => Boolean(onDelete) && owned(board);
  const withMenu = (board: Item) =>
    Boolean(onToggleHidden) || renamable(board) || deletable(board);
  // The last board shown stays: it cannot be hidden.
  const lastShown = (board: Item) =>
    !board.is_hidden && boards.filter((b) => !b.is_hidden).length <= 1;

  const openRename = (board: Item) => {
    if (!renamable(board)) return;
    finished.current = false;
    setRenamed({ id: board.id, name: board.name });
  };

  // The board just created switches to name entry as soon as it appears.
  useEffect(() => {
    if (toRename == null) return;
    const board = boards.find((b) => b.id === toRename);
    if (!board) return;
    openRename(board);
    onRenameOpened?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [toRename, boards]);

  const finishRename = async (validate: boolean) => {
    if (!renamed || finished.current) return;
    finished.current = true;
    const { id, name } = renamed;
    setRenamed(null);
    onRenameEnded?.(id, !validate);
    const trimmedName = name.trim();
    const board = boards.find((b) => b.id === id);
    if (!validate || !trimmedName || !board || trimmedName === board.name || !onRename) return;
    setProvisional({ id, name: trimmedName });
    try {
      await onRename(id, trimmedName);
    } finally {
      setProvisional(null);
    }
  };

  return (
    <>
      <Group
        ref={command}
        gap={4}
        wrap="nowrap"
        // Aligned with the content's inset, like the "?" of the opposite corner.
        style={{
          position: "fixed",
          left: PAGE_GUTTER,
          bottom: PAGE_GUTTER,
          zIndex: 200,
          maxWidth: `calc(100vw - ${2 * PAGE_GUTTER + BOTTOM_RIGHT_RESERVE}px)`,
        }}
      >
        {/* Too many boards for the width: they scroll sideways, with a chevron
            at each end that has more to show. Dragging does not scroll them:
            pressing a board drags the board itself (useTabReorder). The "+"
            stays outside, always in sight. */}
        {ordered.length > 0 && (
          <Scroller
            draggable={false}
            controlSize={CHEVRON_SIZE}
            style={{ flex: "0 1 auto", minWidth: 0 }}
          >
            <SegmentedControl
              key={order}
              value={value ?? ""}
              onChange={guardChange((id: string) => onChange(id))}
              data={ordered.map((board, index) => ({
                value: String(board.id),
                label: (
                  <span
                    // No own position: the line sits against the cell.
                    {...tabProps(board.id, index, {
                      display: "inline-block",
                      // Hidden: greyed, only shown in interface editing.
                      ...(board.is_hidden ? { opacity: HIDDEN_OPACITY } : null),
                    })}
                    // A double-click renames, as on a tab.
                    onDoubleClick={() => openRename(board)}
                    onContextMenu={(e) => {
                      if (!withMenu(board)) return;
                      // The board's menu sits above its segment.
                      const segment =
                        e.currentTarget.closest(".mantine-SegmentedControl-control") ??
                        e.currentTarget;
                      setMenu({ board, position: menuAnchor(e, segment) });
                    }}
                  >
                    {insertAt(index) && <Line side="left" />}
                    {index === ordered.length - 1 && insertAt(ordered.length) && (
                      <Line side="right" />
                    )}
                    {renamed?.id === board.id ? (
                      <AdjustedInput
                        value={renamed.name}
                        onChange={(e) => {
                          const name = e.currentTarget.value;
                          setRenamed((r) => (r ? { ...r, name } : r));
                        }}
                        // Keys stay with the field: otherwise, Tab
                        // would switch board and Enter would save twice.
                        onKeyDown={(e) => {
                          e.stopPropagation();
                          if (e.key === "Enter") {
                            e.preventDefault();
                            void finishRename(true);
                          }
                          if (e.key === "Escape") {
                            e.preventDefault();
                            void finishRename(false);
                          }
                        }}
                        onBlur={() => void finishRename(true)}
                        // Pressing in the field places the cursor: it does not
                        // start dragging the board, and does not reopen it.
                        onPointerDown={(e) => e.stopPropagation()}
                        onClick={(e) => {
                          e.stopPropagation();
                          e.preventDefault();
                        }}
                        onFocus={(e) => e.currentTarget.select()}
                        autoFocus
                        aria-label={`Renommer ${board.name}`}
                      />
                    ) : provisional?.id === board.id ? (
                      provisional.name
                    ) : (
                      board.name
                    )}
                    {/* The open board's contexts, to the right of its name —
                        without contexts, and outside the choice of its group,
                        the list has nothing to offer. What happens in it stays
                        with the list: otherwise, the segment would drag, rename
                        on double click, or open its menu; and the click, inside
                        the segment's label, would not reach the list. */}
                    {value === String(board.id) &&
                      contexts &&
                      (contexts.items.length > 0 || contexts.onChangeGroup) && (
                        <span
                          style={{ display: "inline-flex", marginLeft: 12 }}
                          // Stopped here, the press does not reach what closes
                          // the segment's menu either: we close it ourselves.
                          onPointerDown={(e) => {
                            setMenu(null);
                            keep(e);
                          }}
                          onMouseDown={keep}
                          onClick={(e) => {
                            e.preventDefault();
                            keep(e);
                          }}
                          onDoubleClick={keep}
                          // Stopped here, the right-click no longer reaches what
                          // silences the browser menu (App): it silences it itself.
                          onContextMenu={(e) => {
                            e.preventDefault();
                            keep(e);
                          }}
                          onKeyDown={keep}
                          onDragStart={keep}
                          onDragOver={keep}
                          onDrop={keep}
                        >
                          <ContextsMenu {...contexts} inSegment />
                        </span>
                      )}
                  </span>
                ),
              }))}
              size="sm"
              // Without separator lines between boards, without background and without inner
              // margin: only the open board's indicator shows, laid directly
              // on the page.
              withItemsBorders={false}
              styles={{
                root: { backgroundColor: "transparent", padding: 0 },
                // Mantine trims 4px off the radius of the indicator and cells, so
                // they fit in the frame's inner margin, removed
                // here: all take the frame's radius.
                // Without shadow: the open board lies flat on the page.
                indicator: { borderRadius: RADIUS, boxShadow: "none" },
                label: { borderRadius: RADIUS },
                control: { borderRadius: RADIUS },
                // Mantine positions the label's wrapper: the insertion
                // line would stick to it. Without it, it sits against the
                // cell, between two boards; the cell keeps the label above
                // the indicator.
                innerLabel: { position: "static" },
              }}
            />
          </Scroller>
        )}
        {/* At the end of the last board: add one. The green of the other
            "add" gestures, a shade darker on hover. */}
        {onCreate && (
          <ActionIcon
            variant="transparent"
            size="sm"
            aria-label="Ajouter"
            onClick={() => void onCreate()}
            onMouseEnter={() => setMoreHovered(true)}
            onMouseLeave={() => setMoreHovered(false)}
            style={{ color: plusHovered ? ADD_ACTION.hover : ADD_ACTION.color }}
          >
            <IconPlus size={16} />
          </ActionIcon>
        )}
        {trailing}
      </Group>

      {menu && (
        <PointMenu position={menu.position} placement="top-start" onClose={() => setMenu(null)}>
          {renamable(menu.board) && (
            <Menu.Item
              leftSection={<IconPencil size={16} />}
              onClick={() => openRename(menu.board)}
            >
              Renommer
            </Menu.Item>
          )}
          {onToggleHidden && (
            <Menu.Item
              leftSection={menu.board.is_hidden ? <IconEye size={16} /> : <IconEyeOff size={16} />}
              disabled={lastShown(menu.board)}
              onClick={() => void onToggleHidden(menu.board.id, !menu.board.is_hidden)}
            >
              {menu.board.is_hidden ? "Afficher" : "Masquer"}
            </Menu.Item>
          )}
          {deletable(menu.board) && (
            <>
              <Menu.Divider />
              <Menu.Item
                color={RED}
                leftSection={<IconTrash size={16} />}
                onClick={() => setToDelete(menu.board)}
              >
                Supprimer
              </Menu.Item>
            </>
          )}
        </PointMenu>
      )}

      <DeleteConfirmModal
        opened={toDelete !== null}
        onClose={() => setToDelete(null)}
        onConfirm={() => {
          const board = toDelete;
          setToDelete(null);
          if (board && onDelete) void onDelete(board.id);
        }}
        title="Supprimer le tableau"
        message={
          <>
            Voulez-vous vraiment supprimer « {toDelete?.name} » ? {deleteWarning} Cette action est
            irréversible.
          </>
        }
      />
    </>
  );
}
