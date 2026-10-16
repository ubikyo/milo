import { Stack } from "@mantine/core";
import { IconLayoutBottombar, IconLayoutColumns } from "@tabler/icons-react";
import { useRef, type ReactNode } from "react";
import type { BoardData } from "../widgets";
import {
  ManagedDeviceAssetsListContext,
  type ManagedDeviceAssetsListHandle,
} from "../components/managed-device-assets/ManagedDeviceAssetsList";
import { TaskBoardContext, type TaskBoardProps } from "../components/board/TaskBoard";
import { ProjectsListContext, type ProjectsList } from "../components/project/ProjectTable";
import SupportActions, { type BulkAction } from "../components/support/SupportActions";
import { SupportListContext, useSupportList } from "../components/support/SupportRequestsList";
import type { AccountSlot } from "../components/ui/AccountControls";
import BoardPanel from "../components/ui/BoardPanel";
import BoardTabs from "../components/ui/BoardTabs";
import SubviewsPanel from "../components/ui/SubviewsPanel";
import EmptyPanel from "../components/ui/EmptyPanel";
import { UsersContext } from "../lib/users";
import type {
  Board,
  BoardAccess,
  BoardWidget,
  IndicatorSection,
  PublicUser,
  Subview,
  SubviewGroup,
  SupportRequest,
} from "@milo/shared";

/** What the requests list and its "Actions" menu ask of the application. */
export interface BoardSupport {
  /** "null" until the board's requests are read. */
  requests: SupportRequest[] | null;
  loading: boolean;
  users: PublicUser[];
  onOpenRequest: (request: SupportRequest) => void;
  onAddRequest?: (listKey: string) => void;
  onRequestsChanged: () => void | Promise<void>;
  followedIds: number[];
  onToggleFollow: (request: SupportRequest) => void;
}

/** The views, as tabs at the top of the page, and what the account can do with them. */
export interface ViewTabs {
  views: { id: number; name: string; access: BoardAccess; is_hidden: boolean }[];
  /** The open view, as a string. */
  value: string | null;
  onChange: (id: string) => void;
  /** Each tab's menu and the "+": what the account can do with them. */
  onAdd?: () => void;
  onRename?: (id: number, name: string) => void | Promise<void>;
  onShare?: (id: number) => void;
  onDelete?: (id: number) => void | Promise<void>;
  onReorder?: (ids: number[]) => void | Promise<void>;
  onToggleHidden?: (id: number, hidden: boolean) => void | Promise<void>;
  /** The view just created: its name goes straight into entry. */
  toRename: number | null;
  onRenameOpened: () => void;
  onRenameEnded?: (id: number, abandoned: boolean) => void;
  /** The "+" under the open view's tab: it opens or closes its sub-views' inset. */
  onSubviews?: () => void;
  /** The inset is open: the open view's sub-views are edited under its tab. */
  subviewsOpen?: boolean;
  /** A click elsewhere in the interface closes it. */
  onSubviewsClose?: () => void;
  /** The sub-views once saved in the inset. */
  onSubviewsSaved?: (groups: SubviewGroup[]) => void;
  /** "Désactiver vue parente" of the open view, as its inset shows and changes it. */
  parentDisabled?: boolean;
  onParentDisabledChange?: (disabled: boolean) => void;
  /** Each view's sub-views, the open one, and what opens one — in its view. */
  subviewsOf?: (id: number) => SubviewGroup[];
  /** A view whose tab leads nowhere: only its sub-views do (BoardTabs). */
  withoutLink?: (id: number) => boolean;
  subviewId?: number | null;
  onOpenSubview?: (subview: Subview, view: number) => void;
  /** A click on the open view's tab: back from its sub-view. */
  onReselect?: () => void;
}

interface ViewPageProps {
  /** The views, at the top of the page. */
  viewTabs: ViewTabs;
  /**
   * The open view, or board, was just created and its name is being typed:
   * its empty screen ("Aucun tableau", "Aucune section") waits for it.
   */
  namingView?: boolean;
  namingBoard?: boolean;
  /**
   * The account sees no view: the prompt takes the place of the boards, with
   * "onCreateView" if it may create one.
   */
  noView?: boolean;
  onCreateView?: () => void;
  /** The view's boards; "null" until they are read. */
  boards: Board[] | null;
  boardId: string | null;
  /** The empty view's "Créer un tableau": available outside interface editing too. */
  onCreateFirstBoard?: () => void;
  /** The open board's sections; "null" until they are read. */
  sections: IndicatorSection[] | null;
  widgets: BoardWidget[];
  onWidgetsChanged: () => void | Promise<void>;
  /** The open board, frozen: outside interface editing, or for lack of rights. */
  locked: boolean;
  /** Switch to interface editing; absent when frozen for lack of rights. */
  onUnlock?: () => void | Promise<void>;
  /** The board's data, filtered by it, for its widgets. */
  data: BoardData;
  projects: ProjectsList;
  tasks: TaskBoardProps;
  support: BoardSupport;
  managedDeviceAssets: ManagedDeviceAssetsListHandle;
  /** "Créer une tâche" and "Créer une demande", on right-click on a link. */
  onCreateTaskFromLink?: (widget: BoardWidget) => void;
  onCreateSupportFromLink?: (widget: BoardWidget) => void;
  loading: boolean;
  /** The company — the open board's filter — and the account, at the end of the row. */
  account: AccountSlot;
}

/**
 * The views as tabs, and under them the open board's sections — the
 * view's boards are chosen at the bottom of the page (BoardSwitch). Widgets there read the board's data — its projects, its
 * task lists, the requests and workstations of its company —, which the
 * application reads and which this page brings within their reach.
 */
export default function ViewPage({
  viewTabs,
  noView = false,
  namingView = false,
  namingBoard = false,
  onCreateView,
  boards,
  boardId,
  onCreateFirstBoard,
  sections,
  widgets,
  onWidgetsChanged,
  locked,
  onUnlock,
  data,
  projects,
  tasks,
  support,
  managedDeviceAssets,
  onCreateTaskFromLink,
  onCreateSupportFromLink,
  loading,
  account,
}: ViewPageProps) {
  // The requests lists keep their checked boxes here, so that "Actions
  // multiples" applies to what has been checked; sort and filters are each
  // widget's own.
  const list = useSupportList(support.requests, "all");
  const { context, setContext, selection, setChecked } = list;
  // "Actions multiples", under the list, runs in "SupportActions", where its
  // confirmations live.
  const bulk = useRef<(action: BulkAction) => void>(null);
  // The request actions only exist where a requests list is placed.
  const withRequests = widgets.some((w) => w.type === "support.list");

  const openBoard = boards?.find((b) => String(b.id) === boardId);

  // Without a board, the prompt takes the place of the content — but under the row,
  // which stays: it is what carries the account. Nothing during a read:
  // the empty screen waits to be a certainty.
  let content: ReactNode = null;
  if (noView) {
    content = (
      <EmptyPanel
        icon={IconLayoutBottombar}
        message="Aucune vue"
        actionLabel="Créer une vue"
        onAction={onCreateView}
      />
    );
  } else if (!boards || boards.length === 0) {
    content =
      loading || !boards || namingView ? null : (
        <EmptyPanel
          icon={IconLayoutColumns}
          message="Aucun tableau"
          actionLabel="Créer un tableau"
          onAction={onCreateFirstBoard}
        />
      );
  } else if (openBoard && namingBoard) {
    // Nothing yet: the new board shows once named.
    content = null;
  } else if (openBoard) {
    content = (
      <ProjectsListContext.Provider value={projects}>
        <TaskBoardContext.Provider value={tasks}>
          <SupportListContext.Provider
            value={{
              ...list,
              loading: support.loading,
              onOpenRequest: support.onOpenRequest,
              onAddRequest: support.onAddRequest,
              onBulkAction: (action) => bulk.current?.(action),
            }}
          >
            <ManagedDeviceAssetsListContext.Provider value={managedDeviceAssets}>
              <UsersContext.Provider value={support.users}>
                <BoardPanel
                  // Another board: another panel, carrying nothing over from the
                  // previous one — neither a drag in progress, nor an open drawer.
                  key={openBoard.id}
                  boardId={openBoard.id}
                  sections={sections}
                  widgets={widgets}
                  data={data}
                  onChanged={onWidgetsChanged}
                  locked={locked}
                  onUnlock={onUnlock}
                  onCreateTask={onCreateTaskFromLink}
                  onCreateSupportRequest={onCreateSupportFromLink}
                />
              </UsersContext.Provider>
            </ManagedDeviceAssetsListContext.Provider>
          </SupportListContext.Provider>
        </TaskBoardContext.Provider>
      </ProjectsListContext.Provider>
    );
  }

  return (
    <Stack gap={0} style={{ flex: 1, minHeight: 0 }}>
      <BoardTabs
        boards={viewTabs.views}
        value={viewTabs.value}
        onChange={(id) => id && viewTabs.onChange(id)}
        onAdd={viewTabs.onAdd}
        onRename={viewTabs.onRename}
        onShare={viewTabs.onShare}
        onDelete={viewTabs.onDelete}
        onReorder={viewTabs.onReorder}
        onToggleHidden={viewTabs.onToggleHidden}
        deleteTitle="Supprimer la vue"
        deleteWarning="Ses tableaux, leurs projets, leurs listes de tâches et leurs widgets seront supprimés."
        toRename={viewTabs.toRename}
        onRenameOpened={viewTabs.onRenameOpened}
        onRenameEnded={viewTabs.onRenameEnded}
        onSubviews={viewTabs.onSubviews}
        subviewsOf={viewTabs.subviewsOf}
        withoutLink={viewTabs.withoutLink}
        subviewId={viewTabs.subviewId}
        onOpenSubview={viewTabs.onOpenSubview}
        onReselect={viewTabs.onReselect}
        subviewsPanel={
          viewTabs.subviewsOpen && viewTabs.value && viewTabs.onSubviewsSaved ? (
            <SubviewsPanel
              key={viewTabs.value}
              viewId={viewTabs.value}
              onSaved={viewTabs.onSubviewsSaved}
              parentDisabled={viewTabs.parentDisabled ?? false}
              onParentDisabledChange={viewTabs.onParentDisabledChange}
              onClose={viewTabs.onSubviewsClose ?? (() => {})}
            />
          ) : undefined
        }
        account={account}
        // Nothing to search without a view or a board — once that is certain.
        withSearch={!(noView || (!loading && boards?.length === 0))}
        actions={
          withRequests ? (
            <SupportActions
              context={context}
              onContextClose={() => setContext(null)}
              selected={selection}
              users={support.users}
              onEdit={support.onOpenRequest}
              followedIds={support.followedIds}
              onToggleFollow={support.onToggleFollow}
              bulkRef={bulk}
              onDone={async () => {
                setChecked(new Set());
                await support.onRequestsChanged();
              }}
            />
          ) : undefined
        }
      />
      {content}
    </Stack>
  );
}
