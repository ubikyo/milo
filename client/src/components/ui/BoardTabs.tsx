import { ActionIcon, Menu, Tabs } from "@mantine/core";
import {
  IconEye,
  IconEyeOff,
  IconPencil,
  IconPlus,
  IconTrash,
} from "@tabler/icons-react";
import { Fragment, useEffect, useRef, useState } from "react";
import { ADD_ACTION, RED } from "../../themes/colors";
import DeleteConfirmModal from "./DeleteConfirmModal";
import ModeBar from "./ModeBar";
import ContextsMenu from "./ContextsMenu";
import AdjustedInput from "./AdjustedInput";
import PointMenu, { menuAnchor, type PointMenuPosition } from "./PointMenu";
import { InsertLine, useTabReorder } from "./useTabReorder";
import { tabStyle } from "../../themes/tabs";
import type { AccountSlot } from "./AccountControls";
import type { ReactNode, SyntheticEvent } from "react";
import type { BoardAccess } from "@milo/shared";

/** What happens in the contexts list does not bubble up to the tab. */
const keep = (e: SyntheticEvent) => e.stopPropagation();

/** A tab: a mode's boards only share an identifier and a name. */
interface Tab {
  id: number;
  name: string;
  /**
   * What the account may do with it: a "read" share renames nothing, and
   * only its owner deletes it. Without it, everything the props offer.
   */
  access?: BoardAccess;
  /** Hidden by the account: greyed, only shown in interface editing. */
  is_hidden?: boolean;
}

// A mode's boards, as tabs. Used for the Task mode, the Project mode and the
// Accès mode: only "deleteWarning" changes, it describes what the cascading
// deletion takes with it.
//
// Each tab is edited and deleted from its context menu, on
// right-click; a double click on its name renames it in place; the "+" at the end of
// the row adds one.
//
// The row itself — the logo on the left, the company and the account on the right —
// belongs to ModeBar: it is the same in all modes, including those
// that have no boards.
interface BoardTabsProps {
  boards: Tab[];
  value: string | null;
  onChange: (value: string | null) => void;
  /** Add a tab. Without it — without the right to add —, no "+". */
  onAdd?: () => void;
  /**
   * The tab targeted by the right-click, which is not necessarily the open tab.
   * Without it, "Renommer" renames the tab in place.
   */
  onEdit?: (id: number) => void;
  /**
   * Rename the tab in place, on double click. Without it, the double click does
   * nothing more than a click.
   */
  onRename?: (id: number, name: string) => void | Promise<void>;
  /** Without it — without the right to delete —, the menu does not offer it. */
  onDelete?: (id: number) => void | Promise<void>;
  /**
   * "Masquer" or "Afficher", for the account: any tab, its own or shared.
   * The last one shown cannot be hidden. Without it, the menu does not offer it.
   */
  onToggleHidden?: (id: number, hidden: boolean) => void | Promise<void>;
  /**
   * The tabs' order, once the tab is dropped. It applies to everyone
   * and not only to the browser that changed it: it is the mode that is
   * ordered, not one's view of it. Without it, the tabs cannot be dragged.
   */
  onReorder?: (ids: number[]) => void | Promise<void>;
  /** What the cascading deletion takes with it, told to the user. */
  deleteWarning?: ReactNode;
  /** The confirmation's title: not all tabs are boards. */
  deleteTitle?: string;
  /** The company and the account, which ModeBar places at the end of the row. */
  account: AccountSlot;
  /** The open board's "Actions" menu, placed between the company and the account. */
  actions?: ReactNode;
  /**
   * The tab to switch to name entry as soon as it appears — the one just
   * created. "onRenameOpened" says it is done.
   */
  toRename?: number | null;
  onRenameOpened?: () => void;
  /** Name entry is over: validated — even unchanged —, or abandoned with Escape. */
  onRenameEnded?: (id: number, abandoned: boolean) => void;
}

/** A hidden tab, in interface editing: greyed. */
const HIDDEN_OPACITY = 0.4;

/** Can the account change this tab — rename it, its contexts? Not under a "read" share. */
const changeable = (tab: Tab) => tab.access !== "read";

/** Is the tab the account's own — or does it not say? Deleting it is the owner's. */
const owned = (tab: Tab) => tab.access === undefined || tab.access === "owner";

export default function BoardTabs({
  boards,
  value,
  onChange,
  onAdd,
  onEdit,
  onRename,
  onDelete,
  onToggleHidden,
  onReorder,
  deleteWarning,
  deleteTitle = "Supprimer le tableau",
  account,
  actions,
  toRename,
  onRenameOpened,
  onRenameEnded,
}: BoardTabsProps) {
  const { contexts } = account;
  // The open context menu, and the tab it targets.
  const [menu, setMenu] = useState<{ tab: Tab; position: PointMenuPosition } | null>(null);
  // The tab whose deletion is being confirmed.
  const [toDelete, setToDelete] = useState<Tab | null>(null);
  const [plusHovered, setMoreHovered] = useState(false);
  // The tab being renamed and the name typed into it.
  const [renamed, setRenamed] = useState<{ id: number; name: string } | null>(null);
  // The validated name, shown while the server responds and the row
  // comes back re-read: without it, the old name would briefly reappear.
  const [provisional, setProvisional] = useState<{ id: number; name: string } | null>(null);
  // True once the input is concluded: Enter followed by loss of focus must not
  // save twice.
  const finished = useRef(false);

  // Tab drag and drop: see useTabReorder.
  const {
    ordered: tabs,
    tabProps,
    guardChange,
    insertAt,
  } = useTabReorder(boards, (board) => board.id, onReorder);
  const changeTab = guardChange(onChange);

  const openRename = (tab: Tab) => {
    if (!onRename || !changeable(tab)) return;
    finished.current = false;
    setRenamed({ id: tab.id, name: tab.name });
  };

  // The tab just created switches to name entry as soon as it appears
  // in the re-read row.
  useEffect(() => {
    if (toRename == null) return;
    const tab = boards.find((b) => b.id === toRename);
    if (!tab) return;
    openRename(tab);
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
    const tab = boards.find((b) => b.id === id);
    if (!validate || !trimmedName || !tab || trimmedName === tab.name || !onRename) return;
    setProvisional({ id, name: trimmedName });
    try {
      await onRename(id, trimmedName);
    } finally {
      setProvisional(null);
    }
  };

  const remove = async () => {
    const tab = toDelete;
    setToDelete(null);
    if (tab && onDelete) await onDelete(tab.id);
  };

  // "Renommer" only applies if the tab can be edited: without a drawer or
  // renaming, it would do nothing. A "read" share changes nothing; only its
  // owner deletes a tab.
  const editable = (tab: Tab) => Boolean(onEdit || onRename) && changeable(tab);
  const deletable = (tab: Tab) => Boolean(onDelete) && owned(tab);
  // A menu with nothing in it does not open: this is the case for someone who only
  // reads.
  const usefulMenu = (tab: Tab) =>
    editable(tab) ||
    deletable(tab) ||
    Boolean(onToggleHidden);
  // The last tab shown stays: it cannot be hidden.
  const lastShown = (tab: Tab) => !tab.is_hidden && boards.filter((b) => !b.is_hidden).length <= 1;

  return (
    <>
      <ModeBar value={value} onChange={changeTab} account={account} actions={actions}>
        {tabs.map((board, index) => (
          <Fragment key={board.id}>
            {insertAt(index) && <InsertLine />}
            <Tabs.Tab
              value={String(board.id)}
              {...tabProps(board.id, index, {
                ...tabStyle(value === String(board.id)),
                // The open tab's background (Paramétrage > Thèmes) — unless
                // the contexts list, open under it, gives it its own.
                ...(value === String(board.id) && {
                  backgroundColor: "var(--contexts-tab-bg, var(--milo-view-tab-active))",
                  // Its side open on the board, the same.
                  "--milo-tab-active-joint": "var(--contexts-tab-bg, var(--milo-view-tab-active))",
                }),
              })}
              onContextMenu={(e) => {
                // The tab's menu hangs under it, like a row's.
                if (usefulMenu(board)) setMenu({ tab: board, position: menuAnchor(e) });
              }}
              onDoubleClick={() => openRename(board)}
            >
              {/* The name — or its field — and the contexts, aligned on the
                  text baseline: the contexts' label is smaller,
                  and the field aligns to the top of its line
                  (AdjustedInput). */}
              <span
                style={{
                  display: "inline-flex",
                  alignItems: "baseline",
                  // Hidden: greyed, only shown in interface editing. The
                  // content only: the open tab's background, which covers
                  // the row's line, stays opaque.
                  ...(board.is_hidden ? { opacity: HIDDEN_OPACITY } : null),
                }}
              >
                {renamed?.id === board.id ? (
                  <AdjustedInput
                    value={renamed.name}
                    onChange={(e) => {
                      const name = e.currentTarget.value;
                      setRenamed((r) => (r ? { ...r, name } : r));
                    }}
                    // Keys stay with the field: otherwise, the arrows
                    // would switch tabs and Enter would save twice.
                    onKeyDown={(e) => {
                      e.stopPropagation();
                      if (e.key === "Enter") {
                        e.preventDefault();
                        finishRename(true);
                      }
                      if (e.key === "Escape") {
                        e.preventDefault();
                        finishRename(false);
                      }
                    }}
                    onBlur={() => finishRename(true)}
                    // Pressing in the field places the cursor: it does not start
                    // dragging the tab, and the click does not reopen it.
                    onPointerDown={(e) => e.stopPropagation()}
                    onClick={(e) => e.stopPropagation()}
                    onDoubleClick={(e) => e.stopPropagation()}
                    onFocus={(e) => e.currentTarget.select()}
                    autoFocus
                    aria-label={`Renommer ${board.name}`}
                  />
                ) : provisional?.id === board.id ? (
                  provisional.name
                ) : (
                  board.name
                )}
                {/* The open board's contexts, to the right of its name — without
                    contexts, and outside the choice of its group, the list
                    has nothing to offer. What happens in it stays with the
                    list: otherwise,
                    the tab would drag, rename on double click, or
                    open its menu. */}
                {value === String(board.id) &&
                  contexts &&
                  (contexts.items.length > 0 || contexts.onChangeGroup) && (
                    <span
                      style={{ display: "inline-flex", marginLeft: 12 }}
                      // Stopped here, the press does not reach what closes
                      // the tab's menu either: we close it ourselves.
                      onPointerDown={(e) => {
                        setMenu(null);
                        keep(e);
                      }}
                      onMouseDown={keep}
                      onClick={keep}
                      onDoubleClick={keep}
                      // Stopped here, the right-click no longer reaches what silences the
                    // browser menu (App): it silences it itself.
                    onContextMenu={(e) => {
                      e.preventDefault();
                      keep(e);
                    }}
                      onKeyDown={keep}
                      onDragStart={keep}
                      onDragOver={keep}
                      onDrop={keep}
                    >
                      <ContextsMenu {...contexts} inTab />
                    </span>
                  )}
              </span>
            </Tabs.Tab>
          </Fragment>
        ))}
        {insertAt(tabs.length) && <InsertLine />}

        {/* At the end of the last tab: add one. The green of the other
            "add" actions, a darker tone on hover (AddButton). */}
        {onAdd && (
          <ActionIcon
            variant="transparent"
            size="sm"
            aria-label="Ajouter"
            onClick={onAdd}
            onMouseEnter={() => setMoreHovered(true)}
            onMouseLeave={() => setMoreHovered(false)}
            ml={4}
            style={{
              alignSelf: "center",
              color: plusHovered ? ADD_ACTION.hover : ADD_ACTION.color,
            }}
          >
            <IconPlus size={16} />
          </ActionIcon>
        )}
      </ModeBar>

      {menu && (
        <PointMenu position={menu.position} onClose={() => setMenu(null)}>
          {editable(menu.tab) && (
            <Menu.Item
              leftSection={<IconPencil size={16} />}
              onClick={() =>
                onEdit ? onEdit(menu.tab.id) : openRename(menu.tab)
              }
            >
              Renommer
            </Menu.Item>
          )}
          {onToggleHidden && (
            <Menu.Item
              leftSection={menu.tab.is_hidden ? <IconEye size={16} /> : <IconEyeOff size={16} />}
              disabled={lastShown(menu.tab)}
              onClick={() => void onToggleHidden(menu.tab.id, !menu.tab.is_hidden)}
            >
              {menu.tab.is_hidden ? "Afficher" : "Masquer"}
            </Menu.Item>
          )}
          {deletable(menu.tab) && (
            <>
              <Menu.Divider />
              <Menu.Item
                color={RED}
                leftSection={<IconTrash size={16} />}
                onClick={() => setToDelete(menu.tab)}
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
        onConfirm={remove}
        title={deleteTitle}
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
