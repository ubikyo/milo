import { ActionIcon, Menu, Tabs } from "@mantine/core";
import {
  IconCategory,
  IconCheck,
  IconEyeOff,
  IconHierarchy2,
  IconPencil,
  IconPlus,
  IconTrash,
} from "@tabler/icons-react";
import { Fragment, useEffect, useRef, useState } from "react";
import { ADD_ACTION, RED } from "../../themes/colors";
import DeleteConfirmModal from "./DeleteConfirmModal";
import InheritConfirmModal from "./InheritConfirmModal";
import ModeBar from "./ModeBar";
import ContextsMenu from "./ContextsMenu";
import AdjustedInput from "./AdjustedInput";
import PointMenu, { menuAnchor, type PointMenuPosition } from "./PointMenu";
import { InsertLine, useTabReorder } from "./useTabReorder";
import { tabStyle } from "../../themes/tabs";
import type { AccountSlot } from "./AccountControls";
import type { ReactNode, SyntheticEvent } from "react";

/** What happens in the contexts list does not bubble up to the tab. */
const keep = (e: SyntheticEvent) => e.stopPropagation();

/** A tab: a mode's boards only share an identifier and a name. */
interface Tab {
  id: number;
  name: string;
  /** The modes whose tabs are closed to others: Accès, Projet and Tâche. */
  is_private?: number;
  /** The Accès mode, whose every category has its own structure: "Hérité" for the account. */
  inherited?: boolean;
  /** Its contexts: without them, nothing to copy. */
  contexts?: readonly unknown[];
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
   * Make the targeted tab private or visible to all again. Without it, the
   * menu does not offer it.
   */
  onTogglePrivate?: (id: number) => void | Promise<void>;
  /** Copy the tab's contexts to another. Without it, the menu does not offer it. */
  onCopyContexts?: (id: number) => void;
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
  /**
   * "Hérité": the targeted tab shows the shared structure — sections and
   * widgets —, or the account's own copy. "of" says so for a tab
   * (in Projet and Tâche, the same for all: the sections are shared there).
   * Unchecking it is confirmed. Without it, the menu does not offer it.
   */
  inheritance?: {
    of: (tab: Tab) => boolean;
    onToggle: (id: number) => void | Promise<void>;
  };
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
}

export default function BoardTabs({
  boards,
  value,
  onChange,
  onAdd,
  onEdit,
  onRename,
  onDelete,
  onTogglePrivate,
  onCopyContexts,
  onReorder,
  deleteWarning,
  deleteTitle = "Supprimer le tableau",
  inheritance,
  account,
  actions,
  toRename,
  onRenameOpened,
}: BoardTabsProps) {
  const { contexts } = account;
  // The open context menu, and the tab it targets.
  const [menu, setMenu] = useState<{ tab: Tab; position: PointMenuPosition } | null>(null);
  // The tab whose deletion is being confirmed.
  const [toDelete, setToDelete] = useState<Tab | null>(null);
  // The private tab about to be opened to all: this action is confirmed.
  const [toOpen, setToOpen] = useState<Tab | null>(null);
  // The tab whose "Hérité" is about to be toggled, and the state being left:
  // this action is confirmed both ways. The state stays set on
  // close: the message does not change while the modal fades out.
  const [toToggle, setToSwitch] = useState<{
    tab: Tab | null;
    inherits: boolean;
  }>({ tab: null, inherits: true });
  const closeToggle = () => setToSwitch((b) => ({ ...b, tab: null }));
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
    if (!onRename) return;
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
  // renaming, it would do nothing.
  const editable = Boolean(onEdit || onRename);
  // A menu with nothing in it does not open: this is the case for someone who only
  // reads.
  const usefulMenu =
    editable ||
    Boolean(
      onDelete ||
        onCopyContexts ||
        onTogglePrivate ||
        inheritance,
    );

  // Copy the targeted tab's contexts: only if it has at least one.
  const copyContexts = Boolean(onCopyContexts) && (menu?.tab.contexts?.length ?? 0) > 0;

  return (
    <>
      <ModeBar value={value} onChange={changeTab} account={account} actions={actions}>
        {tabs.map((board, index) => (
          <Fragment key={board.id}>
            {insertAt(index) && <InsertLine />}
            <Tabs.Tab
              value={String(board.id)}
              {...tabProps(board.id, index, tabStyle(value === String(board.id)))}
              onContextMenu={(e) => {
                // The tab's menu hangs under it, like a row's.
                if (usefulMenu) setMenu({ tab: board, position: menuAnchor(e) });
              }}
              onDoubleClick={() => openRename(board)}
            >
              {/* The name — or its field — and the contexts, aligned on the
                  text baseline: the contexts' label is smaller,
                  and the field aligns to the top of its line
                  (AdjustedInput). */}
              <span style={{ display: "inline-flex", alignItems: "baseline" }}>
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
                    contexts and without the ability to add any, the list has nothing to
                    offer. What happens in it stays with the list: otherwise,
                    the tab would drag, rename on double click, or
                    open its menu. */}
                {value === String(board.id) &&
                  contexts &&
                  (contexts.items.length > 0 || contexts.management) && (
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
                    // browser menu (App): it silences it itself — except in
                    // Debug, where that menu comes back.
                    onContextMenu={(e) => {
                      if (!document.documentElement.hasAttribute("data-milo-debug")) {
                        e.preventDefault();
                      }
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
          {editable && (
            <Menu.Item
              leftSection={<IconPencil size={16} />}
              onClick={() =>
                onEdit ? onEdit(menu.tab.id) : openRename(menu.tab)
              }
            >
              Renommer
            </Menu.Item>
          )}
          {/* What the tab carries, carried over to another: apart from the rest. */}
          {copyContexts && <Menu.Divider />}
          {/* A board without contexts has none to copy. */}
          {copyContexts && onCopyContexts && (
            <Menu.Item
              leftSection={<IconCategory size={16} />}
              onClick={() => onCopyContexts(menu.tab.id)}
            >
              Copier les contextes
            </Menu.Item>
          )}

          {/* The tab's settings, each checked when active. */}
          {(onTogglePrivate || inheritance) && (
            <>
              <Menu.Divider />
              <Menu.Label>Interface</Menu.Label>
            </>
          )}
          {onTogglePrivate && (
            <Menu.Item
              leftSection={<IconEyeOff size={16} />}
              rightSection={menu.tab.is_private ? <IconCheck size={14} /> : null}
              // Making it private is immediate; opening it to all is confirmed.
              onClick={() =>
                menu.tab.is_private
                  ? setToOpen(menu.tab)
                  : onTogglePrivate(menu.tab.id)
              }
            >
              Privée
            </Menu.Item>
          )}
          {inheritance &&
            (() => {
              // A private tab belongs only to its author: there is nothing to
              // share, nor therefore to inherit.
              const isPrivate = Boolean(menu.tab.is_private);
              const inherits = !isPrivate && inheritance.of(menu.tab);
              return (
                <Menu.Item
                  leftSection={<IconHierarchy2 size={16} />}
                  rightSection={inherits ? <IconCheck size={14} /> : null}
                  disabled={isPrivate}
                  onClick={() => setToSwitch({ tab: menu.tab, inherits })}
                >
                  Héritée
                </Menu.Item>
              );
            })()}
          {onDelete && (
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

      <InheritConfirmModal
        opened={toToggle.tab !== null}
        inherited={toToggle.inherits}
        onClose={closeToggle}
        onConfirm={() => {
          const tab = toToggle.tab;
          closeToggle();
          if (tab && inheritance) void inheritance.onToggle(tab.id);
        }}
      />

      <DeleteConfirmModal
        opened={toOpen !== null}
        onClose={() => setToOpen(null)}
        onConfirm={() => {
          const tab = toOpen;
          setToOpen(null);
          if (tab && onTogglePrivate) void onTogglePrivate(tab.id);
        }}
        title="Retirer « Privée »"
        message={
          <>
            « {toOpen?.name} » ne sera plus privé : tous ceux qui ont accès à ce mode
            pourront le voir.
          </>
        }
        confirmLabel="Valider"
        cancelLabel="Annuler"
        confirmColor="teal"
      />

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
