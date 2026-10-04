import {
  ActionIcon,
  Anchor,
  Button,
  Center,
  Divider,
  Group,
  Popover,
  Text,
  getDefaultZIndex,
} from "@mantine/core";
import {
  IconCategory,
  IconChevronDown,
  IconGripVertical,
  IconPlus,
  IconTrash,
} from "@tabler/icons-react";
import { useEffect, useRef, useState } from "react";
import type { CSSProperties, DragEvent, MouseEvent } from "react";
import { ADD_ACTION, NEUTRAL_HOVER, RED } from "../../themes/colors";
import { ROW_MENU_OFFSET, TAB_MENU_STYLES } from "../../themes/menus";
import { PLUS_GAP, PLUS_SIZE } from "../../themes/plus";
import classes from "../../assets/styles/ContextsMenu.module.css";
import DeleteConfirmModal from "./DeleteConfirmModal";
import { NO_CONTEXT } from "@milo/shared";
import type { Context, Id } from "@milo/shared";

// The contexts of the open board: the list at the end of the row. At the top,
// "Tous les contextes", which cannot be reordered or deleted but can be
// renamed; then the contexts, which a double click renames, which can be
// dragged to reorder them, and which the trash can deletes — along with
// everything that belongs to them. At the end, "Ajouter un contexte".
//
// A click immediately selects the context being viewed. The list itself waits a
// moment before closing, so that a double click can still rename; without the
// right to rename, it closes right away.

/** The background of the icon badge, with no context: a neutral gray, not bluish. */
const DOT = "light-dark(#ededed, var(--mantine-color-dark-4))";

/** The bounds of the list width. */
const WIDTH_MIN = 240;
const WIDTH_MAX = 320;

/** The value of "Tous les contextes". */
export const ALL = "all";

/** How long a click waits before selecting: a double click beats it. */
const DOUBLE_CLICK_THRESHOLD = 250;

/** The name of a context that was just added, immediately in edit mode. */
const NEW_CONTEXT = "Nouveau contexte";

export interface ContextManagement {
  onAdd: (name: string) => Promise<void>;
  onRename: (id: Id, name: string) => Promise<void>;
  /** Rename "Tous les contextes". */
  onRenameAll: (name: string) => Promise<void>;
  onDelete: (id: Id) => Promise<void>;
  onReorder: (ids: Id[]) => Promise<void>;
}

export interface ContextsMenuProps {
  items: Context[];
  /** The label of "Tous les contextes", as the board carries it. */
  all: string;
  /** The context being viewed, or "all". */
  value: string;
  onChange: (value: string) => void;
  /** Without it — without the right to organize boards —, the list only selects. */
  management?: ContextManagement;
  visibleFrom?: string;
  /**
   * Placed in the board's tab, to the right of its name: the tab is already a
   * button, the target is not another one, and the list starts from its left.
   */
  inTab?: boolean;
}

/** What is being renamed: a context, or "Tous les contextes". */
type Renamed = { id: Id | typeof ALL; name: string };

export default function ContextsMenu({
  items: received,
  all: receivedAll,
  value,
  onChange,
  management,
  visibleFrom,
  inTab = false,
}: ContextsMenuProps) {
  const [isOpen, setOpened] = useState(false);
  // In the tab, the list lands on the row's rule and starts from the tab's left
  // edge. The target is only as tall as its text, to the right of the name:
  // both gaps are measured on opening, from the target to the tab.
  const [tabGap, setTabOffset] = useState({
    mainAxis: ROW_MENU_OFFSET,
    crossAxis: 0,
  });
  // The tab's width, measured as well: the list takes it, and only grows wider
  // if its content requires it.
  const [tabWidth, setTabWidth] = useState(0);
  /** The target, captured on opening: the measurement follows it as long as the list is open. */
  const targetRef = useRef<HTMLElement | null>(null);
  const measure = (target: HTMLElement) => {
    const tab = target.closest('[role="tab"]')?.getBoundingClientRect();
    const button = target.getBoundingClientRect();
    if (!tab) return;
    // Minus one pixel: the top line of the list sits on the rule's line,
    // instead of falling below it.
    setTabOffset({
      mainAxis: tab.bottom - button.bottom - 1,
      crossAxis: tab.left - button.left,
    });
    setTabWidth(tab.width);
  };
  const toggle = (target: HTMLElement) => {
    if (inTab && !isOpen) {
      targetRef.current = target;
      measure(target);
    }
    setOpened((o) => !o);
  };
  // With the list open, the tab can change size — "Tous les …" renamed, the
  // target's label changing: the list follows.
  useEffect(() => {
    const target = targetRef.current;
    const tab = target?.closest('[role="tab"]');
    if (!inTab || !isOpen || !target || !tab) return;
    const following = new ResizeObserver(() => measure(target));
    following.observe(tab);
    // Experimental: the tab takes the background and border of the open list
    // (ContextsMenu.module.css, data-contexts-open). The row too: its rule
    // lightens along with it.
    const band = tab.closest('[role="tablist"]');
    tab.setAttribute("data-contexts-open", "");
    band?.setAttribute("data-contexts-open", "");
    return () => {
      following.disconnect();
      tab.removeAttribute("data-contexts-open");
      band?.removeAttribute("data-contexts-open");
    };
  }, [inTab, isOpen]);
  const [renamed, setRenamed] = useState<Renamed | null>(null);
  // The validated name, shown while the server responds and the board comes
  // back re-read: without it, the old name would briefly reappear.
  const [provisional, setProvisional] = useState<Renamed | null>(null);
  const items = provisional
    ? received.map((c) => (c.id === provisional.id ? { ...c, name: provisional.name } : c))
    : received;
  const all = provisional?.id === ALL ? provisional.name : receivedAll;
  const [toDelete, setToDelete] = useState<Context | null>(null);
  /** The held context, and the rank where it would land. */
  const [dragging, setDragged] = useState<{ id: Id; target: number } | null>(null);
  /** The new order, shown without waiting for the server; cleared as soon as it responds. */
  const [localOrder, setLocalOrder] = useState<Id[] | null>(null);
  /** True between the add and the arrival of the added context: it then goes into edit mode. */
  const [addInProgress, setAddInProgress] = useState<number | null>(null);
  const click = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const finished = useRef(false);

  useEffect(() => setLocalOrder(null), [received]);
  useEffect(() => () => clearTimeout(click.current), []);

  // The context that was just added goes into name edit mode as soon as it
  // appears, at the end of the list.
  useEffect(() => {
    if (addInProgress === null || items.length <= addInProgress) return;
    const last = items[items.length - 1];
    setAddInProgress(null);
    if (last) openRename({ id: last.id, name: last.name });
  }, [items, addInProgress]);

  const ordered = localOrder
    ? localOrder
        .map((id) => items.find((c) => c.id === id))
        .filter((c): c is Context => c !== undefined)
    : items;

  // With no context, the list says so instead of offering "Tous" out of
  // nothing.
  const current =
    items.length === 0
      ? NO_CONTEXT
      : value === ALL
        ? all
        : (items.find((c) => String(c.id) === value)?.name ?? all);

  const select = (picked: string) => {
    clearTimeout(click.current);
    if (picked !== value) onChange(picked);
    if (!management) return setOpened(false);
    click.current = setTimeout(() => setOpened(false), DOUBLE_CLICK_THRESHOLD);
  };

  function openRename(target: Renamed) {
    if (!management) return;
    clearTimeout(click.current);
    finished.current = false;
    setRenamed(target);
  }

  const finishRename = async (validate: boolean) => {
    if (!renamed || finished.current || !management) return;
    finished.current = true;
    const { id, name } = renamed;
    setRenamed(null);
    const trimmedName = name.trim();
    if (!validate || !trimmedName) return;
    if (id === ALL ? trimmedName === all : trimmedName === items.find((c) => c.id === id)?.name) return;
    setProvisional({ id, name: trimmedName });
    try {
      if (id === ALL) await management.onRenameAll(trimmedName);
      else await management.onRename(id, trimmedName);
    } finally {
      setProvisional(null);
    }
  };

  const add = async () => {
    if (!management) return;
    setAddInProgress(items.length);
    await management.onAdd(NEW_CONTEXT);
  };

  // --- Drag and drop: the targeted row is read from the pointer's height.
  const targetRank = (e: DragEvent<HTMLElement>, index: number): number => {
    const rect = e.currentTarget.getBoundingClientRect();
    return e.clientY < rect.top + rect.height / 2 ? index : index + 1;
  };

  const drop = async () => {
    if (!dragging || !management) return;
    const start = ordered.findIndex((c) => c.id === dragging.id);
    setDragged(null);
    const target = dragging.target > start ? dragging.target - 1 : dragging.target;
    if (start < 0 || target === start) return;
    const order = ordered.map((c) => c.id).filter((id) => id !== dragging.id);
    order.splice(target, 0, dragging.id);
    setLocalOrder(order);
    try {
      await management.onReorder(order);
    } catch {
      setLocalOrder(null);
    }
  };

  /** A row: its name — or its input —, and what completes it. */
  const row = (
    key: string,
    trimmedName: string,
    target: Renamed,
    extras: { handle?: boolean; trash?: () => void; style?: CSSProperties } = {},
  ) => {
    const selected = value === key;
    const inInput = renamed?.id === target.id;
    return (
      <Group
        gap={4}
        wrap="nowrap"
        className={classes.row}
        data-editing={inInput || undefined}
        onClick={() => !inInput && select(key)}
        onDoubleClick={() => openRename(target)}
        style={{
          padding: management ? "4px 8px 4px 4px" : "4px 8px",
          minHeight: 32,
          ...extras.style,
        }}
      >
        {/* The handle keeps its place on every row, "Tous" included: the names
            stay aligned. Without management — locked, or without the right —,
            nothing can be dragged: the names take its place. */}
        {management && (
          <div
            className={extras.handle ? classes.reveal : undefined}
            style={{
              width: 16,
              flexShrink: 0,
              display: "flex",
              color: "var(--mantine-color-dimmed)",
              cursor: extras.handle ? "grab" : undefined,
            }}
          >
            {extras.handle && <IconGripVertical size={14} />}
          </div>
        )}
        {inInput ? (
          <input
            value={renamed.name}
            onChange={(e) => {
              const name = e.currentTarget.value;
              setRenamed((r) => (r ? { ...r, name } : r));
            }}
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
            onClick={(e) => e.stopPropagation()}
            onDoubleClick={(e) => e.stopPropagation()}
            onFocus={(e) => e.currentTarget.select()}
            autoFocus
            aria-label={`Renommer ${trimmedName}`}
            // "size" at 1: without it, the field claims room for twenty
            // characters outright, and the list would widen accordingly. It
            // fills the row through "flex".
            size={1}
            style={{
              flex: 1,
              minWidth: 0,
              font: "inherit",
              fontSize: "var(--mantine-font-size-sm)",
              color: "inherit",
              background: "transparent",
              border: "none",
              outline: "none",
              padding: 0,
            }}
          />
        ) : (
          <Text size="sm" fw={selected ? 600 : undefined} style={{ flex: 1, minWidth: 0 }} truncate>
            {trimmedName}
          </Text>
        )}
        {extras.trash && (
          // The trash only appears on hover, but keeps its place: the row does
          // not move when the mouse crosses it.
          <ActionIcon
            variant="subtle"
            color={RED}
            size="sm"
            className={classes.reveal}
            style={{ flexShrink: 0 }}
            onClick={(e) => {
              e.stopPropagation();
              clearTimeout(click.current);
              extras.trash?.();
            }}
            onDoubleClick={(e) => e.stopPropagation()}
            aria-label={`Supprimer ${trimmedName}`}
          >
            <IconTrash size={14} />
          </ActionIcon>
        )}
      </Group>
    );
  };

  /** The line that says where the held context will land. */
  const line = (
    <div style={{ height: 0, position: "relative" }}>
      <div
        style={{
          position: "absolute",
          left: 4,
          right: 4,
          top: -1,
          borderTop: "2px solid var(--mantine-color-teal-5)",
        }}
      />
    </div>
  );

  return (
    <>
      <Popover
        opened={isOpen}
        onChange={setOpened}
        position={inTab ? "bottom-start" : "bottom-end"}
        withinPortal
        shadow="md"
        offset={inTab ? tabGap : ROW_MENU_OFFSET}
        // Outside the tab, the list connects to the rule: no top border and no
        // top corners. In the tab, it keeps its top border — the line that
        // separates it from the tab (classes.tabDropdown) —, without top
        // corners.
        styles={
          inTab
            ? {
                dropdown: {
                  borderTopLeftRadius: 0,
                  borderTopRightRadius: 0,
                  borderTopStyle: "dotted",
                },
              }
            : TAB_MENU_STYLES
        }
        // The confirmation window counts as a click "outside": the list would
        // go away, and you would come back to it as soon as the question is
        // answered.
        closeOnClickOutside={toDelete === null}
      >
        <Popover.Target>
          {/* The same button as the "Actions" menu of the row. */}
          <Button
            component={inTab ? "span" : "button"}
            role={inTab ? "button" : undefined}
            // In the tab, lighter than the board's name; no background or inset
            // — hover changes the text color (tabTarget).
            fw={inTab ? 300 : undefined}
            // The chevron tight against the label.
            styles={inTab ? { section: { marginInlineStart: 2 } } : undefined}
            variant={inTab ? "transparent" : "subtle"}
            color="gray"
            size="xs"
            px={inTab ? 0 : undefined}
            // At the height of the text: the button's 30 px would enlarge the
            // tab as soon as the list appears — in edit mode, for example.
            h={inTab ? "auto" : undefined}
            className={inTab ? classes.tabTarget : undefined}
            rightSection={<IconChevronDown size={14} />}
            aria-label="Contexte"
            visibleFrom={visibleFrom}
            onClick={(e: MouseEvent<HTMLElement>) => toggle(e.currentTarget)}
            style={
              inTab ? undefined : ({ "--button-hover": NEUTRAL_HOVER } as CSSProperties)
            }
          >
            {current}
          </Button>
        </Popover.Target>
        <Popover.Dropdown
          p={4}
          className={inTab ? classes.tabDropdown : undefined}
          // In the tab, at least its width: the list only widens if its content
          // requires it — with no context, it always fits. Elsewhere, its own
          // bounds.
          {...(inTab && tabWidth > 0
            ? { miw: tabWidth, maw: Math.max(WIDTH_MAX, tabWidth) }
            : { miw: WIDTH_MIN, maw: WIDTH_MAX })}
        >
          {/* With no context, only the add remains. */}
          {items.length > 0 && (
            <>
              {row(ALL, all, { id: ALL, name: all })}
              <Divider my={4} />
            </>
          )}
          <div
            onDragOver={(e) => {
              if (dragging) e.preventDefault();
            }}
            onDrop={(e) => {
              e.preventDefault();
              void drop();
            }}
          >
            {ordered.map((context, index) => (
              <div
                key={context.id}
                draggable={Boolean(management) && renamed?.id !== context.id}
                onDragStart={(e) => {
                  e.dataTransfer.effectAllowed = "move";
                  e.dataTransfer.setData("text/plain", String(context.id));
                  setDragged({ id: context.id, target: index });
                }}
                onDragOver={(e) => {
                  if (!dragging) return;
                  e.preventDefault();
                  const target = targetRank(e, index);
                  if (target !== dragging.target) setDragged({ ...dragging, target });
                }}
                onDragEnd={() => setDragged(null)}
              >
                {dragging?.target === index && line}
                {row(
                  String(context.id),
                  context.name,
                  { id: context.id, name: context.name },
                  {
                    handle: Boolean(management),
                    trash: management ? () => setToDelete(context) : undefined,
                    style: dragging?.id === context.id ? { opacity: 0.4 } : undefined,
                  },
                )}
                {index === ordered.length - 1 && dragging?.target === ordered.length && line}
              </div>
            ))}
          </div>
          {/* With no context: a space, the contexts icon in the middle, above
              the add. */}
          {management && items.length === 0 && (
            <Center py="md">
              <Center
                w={40}
                h={40}
                style={{ borderRadius: "50%", background: DOT }}
              >
                <IconCategory size={20} color="var(--mantine-color-dimmed)" />
              </Center>
            </Center>
          )}
          {management && (
            <>
              {items.length > 0 && <Divider my={4} />}
              <Anchor
                component="button"
                type="button"
                size="sm"
                c={ADD_ACTION.color}
                onClick={() => void add()}
                px={8}
                py={6}
              >
                <Group gap={PLUS_GAP} wrap="nowrap">
                  <IconPlus size={PLUS_SIZE} />
                  <span>Ajouter un contexte</span>
                </Group>
              </Anchor>
            </>
          )}
        </Popover.Dropdown>
      </Popover>

      {/* Placed outside the list, which would take it along when closing. */}
      <DeleteConfirmModal
        // The list stays open during the question: the window goes in front.
        zIndex={getDefaultZIndex("popover") + 1}
        opened={toDelete !== null}
        onClose={() => setToDelete(null)}
        onConfirm={() => {
          const context = toDelete;
          setToDelete(null);
          if (context) void management?.onDelete(context.id);
        }}
        title="Supprimer le contexte"
        message={
          <>
            Voulez-vous vraiment supprimer « {toDelete?.name} » ? Ses projets, ses tâches, ses
            tickets et ses assets seront supprimés. Cette action est irréversible.
          </>
        }
      />
    </>
  );
}
