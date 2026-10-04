import { Stack } from "@mantine/core";
import { IconLayoutColumns } from "@tabler/icons-react";
import type { ReactNode } from "react";
import type { BoardData } from "../board-widgets";
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

/** Ce que la liste des demandes et son menu « Actions » demandent à l'application. */
export interface BoardSupport {
  /** « null » tant que les demandes du tableau ne sont pas lues. */
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
  /** Les tableaux de la vue ; « null » tant qu'ils ne sont pas lus. */
  boards: Board[] | null;
  boardId: string | null;
  onBoardChange: (id: string | null) => void;
  /** Le menu de chaque onglet et le « + » : ce que le compte peut en faire. */
  onAddBoard?: () => void;
  onRenameBoard?: (id: number, name: string) => void | Promise<void>;
  onDeleteBoard?: (id: number) => void | Promise<void>;
  onReorderBoards?: (ids: number[]) => void | Promise<void>;
  onTogglePrivateBoard?: (id: number) => void | Promise<void>;
  onToggleBoardInherited?: (id: number) => void | Promise<void>;
  /** Le tableau qu'on vient de créer : son nom passe aussitôt en saisie. */
  toRename: number | null;
  onRenameOpened: () => void;
  onCopyContexts?: (id: number) => void;
  /** Les sections du tableau ouvert ; « null » tant qu'elles ne sont pas lues. */
  sections: IndicatorSection[] | null;
  widgets: BoardWidget[];
  onWidgetsChanged: () => void | Promise<void>;
  /** Le tableau ouvert, figé : hors modification de l'interface, ou faute de droit. */
  locked: boolean;
  /** Passer en modification de l'interface ; absent quand il est figé faute de droit. */
  onUnlock?: () => void | Promise<void>;
  /** Les données du tableau, filtrées par lui, pour ses widgets. */
  data: BoardData;
  projects: ProjectsList;
  tasks: TaskBoardProps;
  support: BoardSupport;
  assets: AssetsListHandle;
  /** « Créer une tâche » et « Créer une demande », au clic droit sur un lien. */
  onCreateTaskFromLink?: (widget: BoardWidget) => void;
  onCreateSupportFromLink?: (widget: BoardWidget) => void;
  loading: boolean;
  /** La société — le filtre du tableau ouvert — et le compte, au bout de la rangée. */
  account: AccountSlot;
}

/**
 * Une vue : ses tableaux en onglets, et sous eux les sections du tableau
 * ouvert. Les widgets y lisent les données du tableau — ses projets, ses
 * listes de tâches, les demandes et les postes de sa société —, que
 * l'application lit et que cette page leur met à portée.
 */
export default function ViewPage({
  boards,
  boardId,
  onBoardChange,
  onAddBoard,
  onRenameBoard,
  onDeleteBoard,
  onReorderBoards,
  onTogglePrivateBoard,
  onToggleBoardInherited,
  toRename,
  onRenameOpened,
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
  // La liste des demandes garde son état ici — tri, filtres, cases cochées —
  // pour que le menu « Actions » de la rangée porte sur ce qu'on a coché.
  const list = useSupportList(support.requests, "all");
  const { context, setContext, selection, setChecked } = list;
  // Le menu « Actions » ne paraît que là où une liste de demandes est posée.
  const withRequests = widgets.some((w) => w.type === "support.list");

  const openBoard = boards?.find((b) => String(b.id) === boardId);

  // Sans tableau, l'invite prend la place du contenu — mais sous la rangée,
  // qui reste : c'est elle qui porte le compte. Rien pendant une lecture :
  // l'écran vide attend d'être une certitude.
  let content: ReactNode = null;
  if (!boards || boards.length === 0) {
    content =
      loading || !boards ? null : (
        <EmptyPanel
          icon={IconLayoutColumns}
          message="Aucun tableau dans cette vue"
          actionLabel="Nouveau tableau"
          onAction={onAddBoard}
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
                // Un autre tableau : un autre panneau, sans rien emporter du
                // précédent — ni glisser en cours, ni tiroir ouvert.
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
        onTogglePrivate={onTogglePrivateBoard}
        onCopyContexts={onCopyContexts}
        inheritance={
          onToggleBoardInherited && {
            of: (tab) => tab.inherited !== false,
            onToggle: onToggleBoardInherited,
          }
        }
        deleteWarning="Ses projets, ses listes de tâches et ses widgets seront supprimés."
        toRename={toRename}
        onRenameOpened={onRenameOpened}
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
