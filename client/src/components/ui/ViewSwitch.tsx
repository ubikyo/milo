import { ActionIcon, Group, Menu, SegmentedControl } from "@mantine/core";
import { IconEye, IconEyeOff, IconPencil, IconPlus, IconShare, IconTrash } from "@tabler/icons-react";
import { useEffect, useRef, useState } from "react";
import type { View } from "@milo/shared";
import { ADD_ACTION, RED } from "../../themes/colors";
import { MODE_SWITCH_TOP, PAGE_GUTTER } from "../../themes/layout";
import DeleteConfirmModal from "./DeleteConfirmModal";
import AdjustedInput from "./AdjustedInput";
import PointMenu, { menuAnchor, type PointMenuPosition } from "./PointMenu";
import { useTabReorder } from "./useTabReorder";

// The views, at the bottom left: the counterpart of the shortcuts "?", same
// inset, in the opposite corner. A "+" at the end creates one, which goes
// straight into name entry; right-clicking one of one's own renames it — in
// place, like a tab —, shares its boards or deletes it; dragging reorders
// it — for oneself only. Views shared by others offer none of that. In
// interface editing, "Masquer" hides any of them, for oneself: greyed at the
// end of the row, it no longer shows outside editing. The last view shown
// cannot be hidden.

interface ViewSwitchProps {
  /** The views the account sees, in the order it arranged them. */
  views: View[];
  /** The open view, as a string. */
  value: string | null;
  onChange: (id: string) => void;
  /**
   * The new order, once a view is dragged and dropped. Without it — open
   * board locked —, views cannot be dragged.
   */
  onReorder?: (ids: number[]) => void | Promise<void>;
  /** Without it — without the right to organize views —, no "+". */
  onCreate?: () => void | Promise<void>;
  /** Each for one's own views only: without any of them, no menu. */
  onRename?: (id: number, name: string) => void | Promise<void>;
  onShare?: (view: View) => void;
  onDelete?: (id: number) => void | Promise<void>;
  /** "Masquer" or "Afficher": for every view, its own or shared. */
  onToggleHidden?: (view: View) => void | Promise<void>;
  /**
   * The view to switch to name entry as soon as it appears — the one just
   * created. "onRenameOpened" says that it is done.
   */
  toRename?: number | null;
  onRenameOpened?: () => void;
  /** Name entry is over: validated — even unchanged —, or abandoned with Escape. */
  onRenameEnded?: (id: number, abandoned: boolean) => void;
}

/**
 * The insertion line, placed in the targeted cell: nothing is inserted between
 * cells. It is placed against the cell itself (positioned by Mantine), and
 * not against its label, which has an inner margin: it thus falls on
 * the rule that separates two views.
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

/** A hidden view, in interface editing: greyed. */
const HIDDEN_OPACITY = 0.4;

/** The frame's radius, which the indicator and the cells take over as is. */
const RADIUS = "var(--sc-radius, var(--mantine-radius-default))";

export default function ViewSwitch({
  views,
  value,
  onChange,
  onReorder,
  onCreate,
  onRename,
  onShare,
  onDelete,
  onToggleHidden,
  toRename,
  onRenameOpened,
  onRenameEnded,
}: ViewSwitchProps) {
  // Views are dragged like the tabs of a row (useTabReorder).
  const { ordered, tabProps, guardChange, insertAt } = useTabReorder(
    views,
    (v) => v.id,
    onReorder,
    sonSelecteur,
  );
  // Mantine positions the open view's indicator from the position of its
  // cell, and does not recompute it when cells change order: the
  // selector is rebuilt at each new order.
  const order = ordered.map((v) => v.id).join(",");

  const [plusHovered, setMoreHovered] = useState(false);
  const [menu, setMenu] = useState<{ view: View; position: PointMenuPosition } | null>(null);
  // The view being renamed and the name typed into it.
  const [renamed, setRenamed] = useState<{ id: number; name: string } | null>(null);
  // The validated name, shown while the server responds and the views
  // come back re-read: without it, the old name would reappear for a moment.
  const [provisional, setProvisional] = useState<{ id: number; name: string } | null>(null);
  // True once the entry is concluded: Enter followed by loss of focus must not
  // save twice.
  const finished = useRef(false);
  const [toDelete, setToDelete] = useState<View | null>(null);

  // The page content stops just above: it needs to know where
  // this control begins, and only the selector knows. Tracked, because its
  // height changes with the text size as with the number of views.
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

  const owned = (view: View) => view.is_owner;
  const withMenu = (view: View) =>
    Boolean(onToggleHidden) || (owned(view) && Boolean(onRename || onShare || onDelete));
  // The last view shown stays: it cannot be hidden.
  const lastShown = (view: View) => !view.is_hidden && views.filter((v) => !v.is_hidden).length <= 1;

  const openRename = (view: View) => {
    if (!onRename || !view.is_owner) return;
    finished.current = false;
    setRenamed({ id: view.id, name: view.name });
  };

  // The view just created switches to name entry as soon as it appears.
  useEffect(() => {
    if (toRename == null) return;
    const view = views.find((v) => v.id === toRename);
    if (!view) return;
    openRename(view);
    onRenameOpened?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [toRename, views]);

  const finishRename = async (validate: boolean) => {
    if (!renamed || finished.current) return;
    finished.current = true;
    const { id, name } = renamed;
    setRenamed(null);
    onRenameEnded?.(id, !validate);
    const trimmedName = name.trim();
    const view = views.find((v) => v.id === id);
    if (!validate || !trimmedName || !view || trimmedName === view.name || !onRename) return;
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
        style={{ position: "fixed", left: PAGE_GUTTER, bottom: PAGE_GUTTER, zIndex: 200 }}
      >
        {ordered.length > 0 && (
          <SegmentedControl
            key={order}
            value={value ?? ""}
            onChange={guardChange((id: string) => onChange(id))}
            data={ordered.map((view, index) => ({
              value: String(view.id),
              label: (
                <span
                  // No own position: the line sits against the cell.
                  {...tabProps(view.id, index, {
                    display: "inline-block",
                    // Hidden: greyed, only shown in interface editing.
                    ...(view.is_hidden ? { opacity: HIDDEN_OPACITY } : null),
                  })}
                  // A double-click renames, as on a tab.
                  onDoubleClick={() => openRename(view)}
                  onContextMenu={(e) => {
                    if (!withMenu(view)) return;
                    // The view's menu sits above its segment.
                    const segment =
                      e.currentTarget.closest(".mantine-SegmentedControl-control") ??
                      e.currentTarget;
                    setMenu({ view, position: menuAnchor(e, segment) });
                  }}
                >
                  {insertAt(index) && <Line side="left" />}
                  {index === ordered.length - 1 && insertAt(ordered.length) && (
                    <Line side="right" />
                  )}
                  {renamed?.id === view.id ? (
                    <AdjustedInput
                      value={renamed.name}
                      onChange={(e) => {
                        const name = e.currentTarget.value;
                        setRenamed((r) => (r ? { ...r, name } : r));
                      }}
                      // Keys stay with the field: otherwise, Tab
                      // would switch view and Enter would save twice.
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
                      // start dragging the view, and does not reopen it.
                      onPointerDown={(e) => e.stopPropagation()}
                      onClick={(e) => {
                        e.stopPropagation();
                        e.preventDefault();
                      }}
                      onFocus={(e) => e.currentTarget.select()}
                      autoFocus
                      aria-label={`Renommer ${view.name}`}
                    />
                  ) : provisional?.id === view.id ? (
                    provisional.name
                  ) : (
                    view.name
                  )}
                </span>
              ),
            }))}
            size="sm"
            // Without separator lines between views, without background and without inner
            // margin: only the open view's indicator shows, laid directly
            // on the page.
            withItemsBorders={false}
            styles={{
              root: { backgroundColor: "transparent", padding: 0 },
              // Mantine trims 4px off the radius of the indicator and cells, so
              // they fit in the frame's inner margin, removed
              // here: all take the frame's radius.
              indicator: { borderRadius: RADIUS },
              label: { borderRadius: RADIUS },
              control: { borderRadius: RADIUS },
              // Mantine positions the label's wrapper: the insertion
              // line would stick to it. Without it, it sits against the
              // cell, between two views; the cell keeps the label above
              // the indicator.
              innerLabel: { position: "static" },
            }}
          />
        )}
        {/* At the end of the last view: create one. The green of the other
            "add" gestures, a shade darker on hover. */}
        {onCreate && (
          <ActionIcon
            variant="transparent"
            size="sm"
            aria-label="Nouvelle vue"
            onClick={() => void onCreate()}
            onMouseEnter={() => setMoreHovered(true)}
            onMouseLeave={() => setMoreHovered(false)}
            style={{ color: plusHovered ? ADD_ACTION.hover : ADD_ACTION.color }}
          >
            <IconPlus size={16} />
          </ActionIcon>
        )}
      </Group>

      {menu && (
        <PointMenu position={menu.position} placement="top-start" onClose={() => setMenu(null)}>
          {onRename && owned(menu.view) && (
            <Menu.Item
              leftSection={<IconPencil size={16} />}
              onClick={() => openRename(menu.view)}
            >
              Renommer
            </Menu.Item>
          )}
          {onToggleHidden && (
            <Menu.Item
              leftSection={menu.view.is_hidden ? <IconEye size={16} /> : <IconEyeOff size={16} />}
              disabled={lastShown(menu.view)}
              onClick={() => void onToggleHidden(menu.view)}
            >
              {menu.view.is_hidden ? "Afficher" : "Masquer"}
            </Menu.Item>
          )}
          {onShare && owned(menu.view) && (
            <Menu.Item leftSection={<IconShare size={16} />} onClick={() => onShare(menu.view)}>
              Partager
            </Menu.Item>
          )}
          {onDelete && owned(menu.view) && (
            <>
              <Menu.Divider />
              <Menu.Item
                color={RED}
                leftSection={<IconTrash size={16} />}
                onClick={() => setToDelete(menu.view)}
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
          const view = toDelete;
          setToDelete(null);
          if (view && onDelete) void onDelete(view.id);
        }}
        title="Supprimer la vue"
        message={
          <>
            Voulez-vous vraiment supprimer « {toDelete?.name} » ? Ses tableaux, leurs projets,
            leurs listes de tâches et leurs widgets seront supprimés. Cette action est
            irréversible.
          </>
        }
      />
    </>
  );
}
