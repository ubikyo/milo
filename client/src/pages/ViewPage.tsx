import { Stack } from "@mantine/core";
import { IconLayoutBottombar, IconLayoutColumns } from "@tabler/icons-react";
import type { ReactNode } from "react";
import type { BoardData } from "../widgets";
import { AssetsListContext, type AssetsListHandle } from "../components/assets/AssetsList";
import { TaskBoardContext, type TaskBoardProps } from "../components/board/TaskBoard";
import { ProjectsListContext, type ProjectsList } from "../components/project/ProjectTable";
import SupportActions from "../components/support/SupportActions";
import { SupportListContext, useSupportList } from "../components/support/SupportRequestsList";
import type { AccountSlot } from "../components/ui/AccountControls";
import BoardPanel from "../components/ui/BoardPanel";
import BoardTabs from "../components/ui/BoardTabs";
import EmptyPanel from "../components/ui/EmptyPanel";
import type {
  Board,
  BoardWidget,
  IndicatorSection,
  PublicUser,
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
  onCreateTask?: (request: SupportRequest) => void;
  onRequestsChanged: () => void | Promise<void>;
  followedIds: number[];
  onToggleFollow: (request: SupportRequest) => void;
}

interface ViewPageProps {
  /**
   * The account sees no view: the prompt takes the place of the boards, with
   * "onCreateView" if it may create one.
   */
  noView?: boolean;
  onCreateView?: () => void;
  /** The view's boards; "null" until they are read. */
  boards: Board[] | null;
  boardId: string | null;
  onBoardChange: (id: string | null) => void;
  /** Each tab's menu and the "+": what the account can do with them. */
  onAddBoard?: () => void;
  onRenameBoard?: (id: number, name: string) => void | Promise<void>;
  onDeleteBoard?: (id: number) => void | Promise<void>;
  onReorderBoards?: (ids: number[]) => void | Promise<void>;
  onToggleBoardHidden?: (id: number, hidden: boolean) => void | Promise<void>;
  /** The board just created: its name goes straight into entry. */
  toRename: number | null;
  onRenameOpened: () => void;
  onRenameEnded?: (id: number, abandoned: boolean) => void;
  /** The empty view's "Créer un tableau": available outside interface editing too. */
  onCreateFirstBoard?: () => void;
  onCopyContexts?: (id: number) => void;
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
  assets: AssetsListHandle;
  /** "Créer une tâche" and "Créer une demande", on right-click on a link. */
  onCreateTaskFromLink?: (widget: BoardWidget) => void;
  onCreateSupportFromLink?: (widget: BoardWidget) => void;
  loading: boolean;
  /** The company — the open board's filter — and the account, at the end of the row. */
  account: AccountSlot;
}

/**
 * A view: its boards as tabs, and under them the open board's
 * sections. Widgets there read the board's data — its projects, its
 * task lists, the requests and workstations of its company —, which the
 * application reads and which this page brings within their reach.
 */
export default function ViewPage({
  noView = false,
  onCreateView,
  boards,
  boardId,
  onBoardChange,
  onAddBoard,
  onRenameBoard,
  onDeleteBoard,
  onReorderBoards,
  onToggleBoardHidden,
  toRename,
  onRenameOpened,
  onRenameEnded,
  onCreateFirstBoard,
  onCopyContexts,
  sections,
  widgets,
  onWidgetsChanged,
  locked,
  onUnlock,
  data,
  projects,
  tasks,
  support,
  assets,
  onCreateTaskFromLink,
  onCreateSupportFromLink,
  loading,
  account,
}: ViewPageProps) {
  // The requests list keeps its state here — sort, filters, checked boxes —
  // so that the row's "Actions" menu applies to what has been checked.
  const list = useSupportList(support.requests, "all");
  const { context, setContext, selection, setChecked } = list;
  // The "Actions" menu only appears where a requests list is placed.
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
      loading || !boards ? null : (
        <EmptyPanel
          icon={IconLayoutColumns}
          message="Aucun tableau"
          actionLabel="Créer un tableau"
          onAction={onCreateFirstBoard}
        />
      );
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
            }}
          >
            <AssetsListContext.Provider value={assets}>
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
            </AssetsListContext.Provider>
          </SupportListContext.Provider>
        </TaskBoardContext.Provider>
      </ProjectsListContext.Provider>
    );
  }

  return (
    <Stack gap={0} style={{ flex: 1, minHeight: 0 }}>
      <BoardTabs
        boards={boards ?? []}
        value={boardId}
        onChange={onBoardChange}
        onAdd={onAddBoard}
        onRename={onRenameBoard}
        onDelete={onDeleteBoard}
        onReorder={onReorderBoards}
        onToggleHidden={onToggleBoardHidden}
        onCopyContexts={onCopyContexts}
        deleteWarning="Ses projets, ses listes de tâches et ses widgets seront supprimés."
        toRename={toRename}
        onRenameOpened={onRenameOpened}
        onRenameEnded={onRenameEnded}
        account={account}
        actions={
          withRequests ? (
            <SupportActions
              context={context}
              onContextClose={() => setContext(null)}
              selected={selection}
              users={support.users}
              onEdit={support.onOpenRequest}
              onCreateTask={support.onCreateTask}
              followedIds={support.followedIds}
              onToggleFollow={support.onToggleFollow}
              onRefresh={support.onRequestsChanged}
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
