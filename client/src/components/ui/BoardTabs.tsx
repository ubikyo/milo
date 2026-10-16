import { ActionIcon, Menu, Popover, Tabs, Text } from "@mantine/core";
import {
  IconEye,
  IconEyeOff,
  IconPencil,
  IconMenu2,
  IconPlus,
  IconShare,
  IconTrash,
} from "@tabler/icons-react";
import { Fragment, useEffect, useLayoutEffect, useRef, useState } from "react";
import { ADD_ACTION, RED } from "../../themes/colors";
import DeleteConfirmModal from "./DeleteConfirmModal";
import ModeBar from "./ModeBar";
import AdjustedInput from "./AdjustedInput";
import PointMenu, { menuAnchor, type PointMenuPosition } from "./PointMenu";
import { InsertLine, useTabReorder } from "./useTabReorder";
import { tabStyle } from "../../themes/tabs";
import { useIsEditing } from "../../lib/editing";
import { MENU_DROP, SEPARATOR_COLOR } from "../../themes/menus";
import contextsClasses from "../../assets/styles/ContextsMenu.module.css";
import {
  PANEL_PADDING_LEFT,
  PANEL_PADDING_RIGHT,
  SUBVIEWS_PANEL_ATTRIBUTE,
  SUBVIEWS_TOGGLE_ATTRIBUTE,
} from "./SubviewsPanel";
import type { AccountSlot } from "./AccountControls";
import type { CSSProperties, ReactElement, ReactNode } from "react";
import type { BoardAccess, Subview, SubviewGroup } from "@milo/shared";

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

// The views, as tabs, at the top of the page: "deleteWarning" describes what
// the cascading deletion takes with it. The open board's contexts are no
// longer here: they follow the boards, at the bottom (BoardSwitch).
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
  /** "Partager": for the tabs the account owns. Without it, the menu does not offer it. */
  onShare?: (id: number) => void;
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
  /** The row's search (ModeBar): hidden when there is nothing to search. */
  withSearch?: boolean;
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
  /**
   * The "+" under the open tab, in interface editing: it opens or closes
   * its sub-views' inset. Without it, no "+".
   */
  onSubviews?: () => void;
  /** A tab's sub-views, in their groups: the list that opens under it. */
  subviewsOf?: (id: number) => SubviewGroup[];
  /**
   * A tab that leads nowhere outside interface editing: a click on it does
   * nothing, and its sub-views' list opens under it even when it is not the
   * open one.
   */
  withoutLink?: (id: number) => boolean;
  /** The open tab's open sub-view, if one is. */
  subviewId?: number | null;
  onOpenSubview?: (subview: Subview, tab: number) => void;
  /** A click on the open tab: back from its sub-view. */
  onReselect?: () => void;
  /**
   * The open tab's sub-views' inset, opened by its "+": it hangs under the
   * tab, over the view, as their list does.
   */
  subviewsPanel?: ReactNode;
}

/**
 * The sub-views' list and inset: menus of their own, apart from the open
 * tab — the old contexts list's look (ContextsMenu): its radius, shadow,
 * background, no border nor top corners, its padding.
 */
const ACCOUNT_MENU_LOOK = {
  shadow: "md",
  radius: "md",
  // No top corners, and no border.
  styles: { dropdown: { borderTopLeftRadius: 0, borderTopRightRadius: 0, border: "none" } },
} as const;
const ACCOUNT_DROPDOWN = {
  // The inset's padding (SubviewsPanel), on all four sides, as the account's
  // menu (AccountControls).
  p: PANEL_PADDING_RIGHT,
  // Its lines cross its side padding (menus.css).
  style: { "--milo-menu-px": `${PANEL_PADDING_RIGHT}px` } as CSSProperties,
} as const;



/** The sub-views' inset's width. */
const SUBVIEWS_PANEL_WIDTH = 250;

/** How far below the row's bottom edge the "+" is centered. */
const PLUS_OFFSET = 10;

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
  onShare,
  onDelete,
  onToggleHidden,
  onReorder,
  deleteWarning,
  deleteTitle = "Supprimer le tableau",
  account,
  withSearch,
  actions,
  toRename,
  onRenameOpened,
  onRenameEnded,
  onSubviews,
  subviewsOf,
  withoutLink,
  subviewId = null,
  onOpenSubview,
  onReselect,
  subviewsPanel,
}: BoardTabsProps) {
  // The open context menu, and the tab it targets.
  const [menu, setMenu] = useState<{ tab: Tab; position: PointMenuPosition } | null>(null);
  // The tab whose deletion is being confirmed.
  const [toDelete, setToDelete] = useState<Tab | null>(null);
  const [plusHovered, setMoreHovered] = useState(false);
  const [subviewsPlusHovered, setSubviewsPlusHovered] = useState(false);
  // The gap that sets the sub-views' list under the row's rule.
  const [listGap, setListGap] = useState(0);
  // In interface editing, a "+" under the open tab (onSubviews). The row's
  // scroller clips what overflows it: the "+" are drawn over the page, at the
  // tabs' measured positions, and follow them as the row scrolls or the
  // window resizes.
  const withPlus = Boolean(onSubviews);
  const barRef = useRef<HTMLDivElement>(null);
  const tabRefs = useRef(new Map<number, HTMLElement>());
  const [pluses, setPluses] = useState<
    { id: number; left: number; top: number; tabLeft: number; rowBottom: number }[]
  >([]);
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
  const isEditing = useIsEditing();
  // A tab that leads nowhere is not opened by a click, outside editing.
  const linkless = (id: number) => !isEditing && Boolean(withoutLink?.(id));
  const guardedChange = guardChange(onChange);
  const changeTab = (id: string | null) => {
    if (id !== null && linkless(Number(id))) return;
    guardedChange(id);
  };

  useLayoutEffect(() => {
    const bar = barRef.current;
    if (!withPlus || !bar) {
      setPluses([]);
      return;
    }
    const measure = () => {
      const origin = bar.getBoundingClientRect();
      // The "+" sit across the row's bottom edge, where its background meets
      // the page's.
      const row = bar.querySelector(".mantine-Tabs-list")?.getBoundingClientRect();
      if (!row) return;
      const next: typeof pluses = [];
      tabRefs.current.forEach((el, id) => {
        // Only the open tab has one.
        if (String(id) !== value) return;
        const rect = el.getBoundingClientRect();
        const center = rect.left + rect.width / 2;
        // A tab scrolled out of the row has no "+".
        const view = el.closest(".mantine-Scroller-container")?.getBoundingClientRect();
        if (view && (center < view.left || center > view.right)) return;
        next.push({
          id,
          left: center - origin.left,
          top: row.bottom - origin.top + PLUS_OFFSET,
          tabLeft: rect.left - origin.left,
          rowBottom: row.bottom - origin.top,
        });
      });
      setPluses(next);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(bar);
    tabRefs.current.forEach((el) => observer.observe(el));
    bar.addEventListener("scroll", measure, true);
    return () => {
      observer.disconnect();
      bar.removeEventListener("scroll", measure, true);
    };
  }, [withPlus, tabs, value, renamed, provisional]);

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
  const shareable = (tab: Tab) => Boolean(onShare) && owned(tab);
  // A menu with nothing in it does not open: this is the case for someone who only
  // reads.
  const usefulMenu = (tab: Tab) =>
    editable(tab) ||
    deletable(tab) ||
    shareable(tab) ||
    Boolean(onToggleHidden);
  // The last tab shown stays: it cannot be hidden.
  const lastShown = (tab: Tab) => !tab.is_hidden && boards.filter((b) => !b.is_hidden).length <= 1;

  // The open tab's sub-views open under it, on hover — those of a tab that
  // leads nowhere, even when it is not open: their groups' names, and each
  // group's sub-views. The list, as the inset, opens just under the row's
  // rule, a menu of its own.
  // Not in interface editing: the sub-views are arranged there, in their
  // inset.
  const withSubviewMenu = (board: Tab, tab: ReactElement) => {
    const open = value === String(board.id);
    const subviews = subviewsOf?.(board.id) ?? [];
    const count = subviews.reduce((n, g) => n + g.subviews.length, 0);
    return (open || linkless(board.id)) && count > 0 && onOpenSubview && !isEditing ? (
      <Menu
        trigger="hover"
        position="bottom-start"
        offset={listGap}
        // As wide as the inset that arranges them, in interface editing.
        width={SUBVIEWS_PANEL_WIDTH}
        openDelay={100}
        closeDelay={150}
        onOpen={() => {
          // Minus one pixel, the menu's top would sit on the rule's line.
          const tabRect = tabRefs.current.get(board.id)?.getBoundingClientRect();
          const row = barRef.current?.querySelector(".mantine-Tabs-list")?.getBoundingClientRect();
          if (tabRect && row) setListGap(row.bottom - tabRect.bottom - 1 + MENU_DROP);
        }}
        {...ACCOUNT_MENU_LOOK}
        classNames={{ item: contextsClasses.menuItem }}
      >
        <Menu.Target>{tab}</Menu.Target>
        <Menu.Dropdown {...ACCOUNT_DROPDOWN}>
          {subviews
            .filter((g) => g.subviews.length > 0)
            .map((group, rank) => (
              <Fragment key={group.id ?? "root"}>
                {/* Those without a group come first, under no name; each
                    group under its own, a line above it, as the contexts'
                    groups (ContextsMenu). */}
                {rank > 0 && <Menu.Divider my={4} style={{ borderColor: SEPARATOR_COLOR }} />}
                {group.id !== null && (
                  <Text size="xs" c="dimmed" fw={600} px={14} pt={4} pb={2} truncate>
                    {group.name}
                  </Text>
                )}
                {group.subviews.map((subview) => (
                  <Menu.Item
                    key={subview.id}
                    onClick={() => onOpenSubview(subview, board.id)}
                    fw={open && subview.id === subviewId ? 600 : undefined}
                  >
                    {subview.name}
                  </Menu.Item>
                ))}
              </Fragment>
            ))}
        </Menu.Dropdown>
      </Menu>
    ) : (
      tab
    );
  };

  return (
    <>
      <div ref={barRef} style={{ position: "relative" }}>
        <ModeBar
          value={value}
          onChange={changeTab}
          account={account}
          actions={actions}
          withSearch={withSearch}
        >
          {tabs.map((board, index) => (
            <Fragment key={board.id}>
              {insertAt(index) && <InsertLine />}
              {withSubviewMenu(
                board,
                <Tabs.Tab
                  value={String(board.id)}
                  ref={(el) => {
                    if (el) tabRefs.current.set(board.id, el);
                    else tabRefs.current.delete(board.id);
                  }}
                  {...tabProps(board.id, index, {
                    ...tabStyle(value === String(board.id)),
                    // The open tab's background (theme editor).
                    ...(value === String(board.id) && {
                      backgroundColor: "var(--milo-view-tab-active)",
                      // Its side open on the board, the same.
                      "--milo-tab-active-joint": "var(--milo-view-tab-active)",
                    }),
                  })}
                  onContextMenu={(e) => {
                    // The tab's menu hangs under it, like a row's.
                    if (usefulMenu(board)) setMenu({ tab: board, position: menuAnchor(e) });
                  }}
                  onDoubleClick={() => openRename(board)}
                  onClick={() =>
                    value === String(board.id) && !linkless(board.id) && onReselect?.()
                  }
                >
                  {/* The name — or its field, which aligns to the top of its line
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
                  </span>
                </Tabs.Tab>,
              )}
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
        {/* The inset hangs from the open tab's left edge, on the row's
            rule, as the sub-views' list does: anchored to a point there,
            since the tab itself already carries that list. */}
        {subviewsPanel && pluses[0] && (
          <Popover
            opened
            position="bottom-start"
            // Minus one pixel, its top would sit on the rule's line.
            offset={MENU_DROP - 1}
            width={SUBVIEWS_PANEL_WIDTH}
            closeOnClickOutside={false}
            closeOnEscape={false}
            {...ACCOUNT_MENU_LOOK}
          >
            <Popover.Target>
              <div
                style={{
                  position: "absolute",
                  left: pluses[0].tabLeft,
                  top: pluses[0].rowBottom,
                  width: 0,
                  height: 0,
                }}
              />
            </Popover.Target>
            <Popover.Dropdown
              {...{ [SUBVIEWS_PANEL_ATTRIBUTE]: "" }}
              {...ACCOUNT_DROPDOWN}
              pl={PANEL_PADDING_LEFT}
              pr={PANEL_PADDING_RIGHT}
            >
              {subviewsPanel}
            </Popover.Dropdown>
          </Popover>
        )}
        {pluses.map((plus) => (
          <ActionIcon
            key={plus.id}
            variant="transparent"
            size="sm"
            aria-label="Ajouter"
            onClick={onSubviews}
            {...{ [SUBVIEWS_TOGGLE_ATTRIBUTE]: "" }}
            onMouseEnter={() => setSubviewsPlusHovered(true)}
            onMouseLeave={() => setSubviewsPlusHovered(false)}
            style={{
              position: "absolute",
              left: plus.left,
              top: plus.top,
              transform: "translate(-50%, -50%)",
              color: subviewsPlusHovered ? ADD_ACTION.hover : ADD_ACTION.color,
              // Above the open tab, whose background reaches down to the page.
              zIndex: 5,
            }}
          >
            <IconMenu2 size={16} />
          </ActionIcon>
        ))}
      </div>

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
          {shareable(menu.tab) && (
            <Menu.Item
              leftSection={<IconShare size={16} />}
              onClick={() => onShare?.(menu.tab.id)}
            >
              Partager
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
