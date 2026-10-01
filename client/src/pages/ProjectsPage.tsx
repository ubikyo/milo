import { Stack } from "@mantine/core";
import { IconFolders } from "@tabler/icons-react";
import ProjectIndicatorsPanel from "../components/project/ProjectIndicatorsPanel";
import { ProjetsListeContext } from "../components/project/ProjectTable";
import BoardTabs from "../components/ui/BoardTabs";
import EmptyPanel from "../components/ui/EmptyPanel";
import type { AccountSlot } from "../components/ui/AccountControls";
import type { IndicatorSection, Project, ProjectBoard, ProjectIndicator } from "@milo/shared";
import type { ProjectFiltersProps } from "../components/project/ProjectTable";
import type { ProjectAction } from "../components/project/MoveOrCopyProjectModal";

// Le mode Projet : les tableaux de projets en onglets et, sous eux, des
// sections qui portent les widgets — la liste des projets du tableau ouvert,
// et les indicateurs —, comme aux modes Support et Assets. La disposition est
// commune à tous les tableaux. Les données et les tiroirs restent à
// l'application (App.tsx), cette page ne fait que les mettre en scène.
//
// « filters » regroupe ce dont la liste a besoin pour ses entonnoirs de
// colonnes : la page n'y touche pas, elle le transmet.
interface ProjectsPageProps {
  boards: ProjectBoard[] | null;
  boardId: string | null;
  onBoardChange: (id: string | null) => void;
  onAddBoard: () => void;
  onEditBoard: (id: number) => void;
  /** Renommer un onglet sur place, au double clic sur son nom. */
  onRenameBoard: (id: number, name: string) => void | Promise<void>;
  onDeleteBoard: (id: number) => void | Promise<void>;
  /** Le nouvel ordre des onglets, glissés dans la rangée. */
  onReorderBoards: (ids: number[]) => void | Promise<void>;
  projects: Project[] | null;
  /** Ce dont la liste a besoin pour ses entonnoirs : la page ne fait que le transmettre. */
  filters: ProjectFiltersProps;
  onRowClick: (project: Project) => void;
  onMoveProject: (project: Project, mode: ProjectAction) => void;
  onDuplicateProject: (project: Project) => void;
  onDeleteProject: (project: Project) => void;
  onCreateTask: (project: Project) => void;
  onAddProject: () => void;
  /** Les projets suivis, et de quoi suivre ou cesser de suivre l'un d'eux. */
  followedIds: number[];
  onToggleFollow: (project: Project) => void;
  loading: boolean;
  /** La société et le compte, posés au bout de la rangée d'onglets. */
  account: AccountSlot;
  /**
   * Les sections de l'écran et leurs widgets, communs à tous les tableaux.
   * « null » tant qu'elles ne sont pas lues.
   */
  indicatorSections: IndicatorSection[] | null;
  indicators: ProjectIndicator[];
  onIndicatorsChanged: () => void | Promise<void>;
  /** Le verrou des sections : ni ajout ni déplacement. */
  indicatorsLocked: boolean;
  onToggleIndicatorsLock: () => void | Promise<void>;
}

export default function ProjectsPage({
  boards,
  boardId,
  onBoardChange,
  onAddBoard,
  onEditBoard,
  onRenameBoard,
  onDeleteBoard,
  onReorderBoards,
  projects,
  filters,
  onRowClick,
  onMoveProject,
  onDuplicateProject,
  onDeleteProject,
  onCreateTask,
  onAddProject,
  followedIds,
  onToggleFollow,
  account,
  loading,
  indicatorSections,
  indicators,
  onIndicatorsChanged,
  indicatorsLocked,
  onToggleIndicatorsLock,
}: ProjectsPageProps) {
  // Sans tableau, l'invite prend la place des sections — mais sous la rangée,
  // qui reste : c'est elle qui porte la société et le compte, et on doit
  // pouvoir s'en servir même quand le mode est vide.
  const sansTableau =
    !boards || boards.length === 0 ? (
      loading || !boards ? null : (
        <EmptyPanel
          icon={IconFolders}
          message="Aucun tableau de projets"
          actionLabel="Nouveau tableau"
          onAction={onAddBoard}
        />
      )
    ) : null;

  return (
    <Stack gap={0} style={{ flex: 1, minHeight: 0 }}>
      <BoardTabs
        boards={boards ?? []}
        value={boardId}
        onChange={onBoardChange}
        onAdd={onAddBoard}
        onEdit={onEditBoard}
        onRename={onRenameBoard}
        onDelete={onDeleteBoard}
        onReorder={onReorderBoards}
        deleteWarning="Ses catégories, ses projets et leurs commentaires seront supprimés."
        sectionsLock={{ locked: indicatorsLocked, onToggle: onToggleIndicatorsLock }}
        account={account}
      />
      {sansTableau ?? (
        // Les sections et leurs widgets. La liste des projets en est un : elle
        // lit ici les projets du tableau ouvert, ses filtres, et ce qu'on en
        // fait.
        <ProjetsListeContext.Provider
          value={{
            projects,
            loading,
            onRowClick,
            onMoveProject,
            onDuplicateProject,
            onDeleteProject,
            onCreateTask,
            onAddProject,
            followedIds,
            onToggleFollow,
            ...filters,
          }}
        >
          <ProjectIndicatorsPanel
            sections={indicatorSections}
            indicators={indicators}
            projects={projects ?? []}
            onChanged={onIndicatorsChanged}
            locked={indicatorsLocked}
            userId={account.user.id}
          />
        </ProjetsListeContext.Provider>
      )}
    </Stack>
  );
}
