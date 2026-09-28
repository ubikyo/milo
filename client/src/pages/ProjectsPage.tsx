import { ScrollArea, Stack } from "@mantine/core";
import { IconFolders } from "@tabler/icons-react";
import ProjectTable from "../components/project/ProjectTable";
import BoardTabs from "../components/ui/BoardTabs";
import EmptyPanel from "../components/ui/EmptyPanel";
import type { Project, ProjectBoard } from "@milo/shared";
import type { ProjectFiltersProps } from "../components/project/ProjectTable";

// Le mode Projet : les tableaux de projets en onglets, et les projets du
// tableau ouvert. Les données et les tiroirs restent à l'application
// (App.jsx), cette page ne fait que les mettre en scène.
//
// « filters » regroupe ce dont le tableau a besoin pour ses entonnoirs de
// colonnes : la page n'y touche pas, elle le transmet.
interface ProjectsPageProps {
  boards: ProjectBoard[] | null;
  boardId: string | null;
  onBoardChange: (id: string | null) => void;
  onAddBoard: () => void;
  onEditBoard: () => void;
  onDeleteBoard: () => void | Promise<void>;
  projects: Project[] | null;
  /** Ce dont le tableau a besoin pour ses entonnoirs : la page ne fait que le transmettre. */
  filters: ProjectFiltersProps;
  onRowClick: (project: Project) => void;
  onMoveProject: (project: Project) => void;
  onDeleteProject: (project: Project) => void;
  onAddProject: () => void;
  loading: boolean;
}

export default function ProjectsPage({
  boards,
  boardId,
  onBoardChange,
  onAddBoard,
  onEditBoard,
  onDeleteBoard,
  projects,
  filters,
  onRowClick,
  onMoveProject,
  onDeleteProject,
  onAddProject,
  loading,
}: ProjectsPageProps) {
  if (!boards) return null;
  if (boards.length === 0) {
    return loading ? null : (
      <EmptyPanel
        icon={IconFolders}
        message="Aucun tableau de projets"
        actionLabel="Nouveau tableau"
        onAction={onAddBoard}
      />
    );
  }

  // Les projets du tableau ne sont pas encore connus : les onglets seuls.
  const table = projects && (
    <ProjectTable
      projects={projects}
      loading={loading}
      onRowClick={onRowClick}
      onMoveProject={onMoveProject}
      onDeleteProject={onDeleteProject}
      onAddProject={onAddProject}
      {...filters}
    />
  );

  const contenu =
    // Sans projet, le tableau se réduit à son état vide : hors zone de
    // défilement, il occupe toute la hauteur et s'y centre.
    !projects || projects.length === 0 ? (
      table
    ) : (
      <ScrollArea
        style={{ flex: 1, minHeight: 0 }}
        type="always"
        scrollbarSize={2}
        styles={{
          // Même principe que dans les réglages : la barre pilote la liste
          // mais se cale sur le bord droit de la fenêtre, sur toute sa hauteur.
          root: { position: "static" },
          scrollbar: {
            position: "fixed",
            top: 0,
            bottom: 0,
            right: 0,
            left: "auto",
            height: "auto",
            width: "var(--scrollarea-scrollbar-size)",
          },
        }}
      >
        {table}
      </ScrollArea>
    );

  return (
    <Stack gap={0} style={{ flex: 1, minHeight: 0 }}>
      <BoardTabs
        boards={boards}
        value={boardId}
        onChange={onBoardChange}
        onAdd={onAddBoard}
        onEdit={onEditBoard}
        onDelete={onDeleteBoard}
        deleteWarning="Ses catégories, ses projets et leurs commentaires seront supprimés."
      />
      {contenu}
    </Stack>
  );
}
