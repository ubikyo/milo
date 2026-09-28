import { Stack } from "@mantine/core";
import { IconLayoutColumns } from "@tabler/icons-react";
import TaskBoard from "../components/board/TaskBoard";
import BoardTabs from "../components/ui/BoardTabs";
import EmptyPanel from "../components/ui/EmptyPanel";
import type { Board, FollowKind, Follows, Id, Label, PublicUser, TaskList } from "@milo/shared";

// Le mode Tâche : les tableaux de la société courante en onglets, et le
// contenu du tableau ouvert. Les données et les tiroirs restent à l'application
// (App.jsx), cette page ne fait que les mettre en scène.
interface TasksPageProps {
  /** « null » tant que les tableaux ne sont pas lus ; « [] » quand il n'y en a pas. */
  boards: Board[] | null;
  boardId: string | null;
  onBoardChange: (id: string | null) => void;
  onAddBoard: () => void;
  onEditBoard: () => void;
  onDeleteBoard: () => void | Promise<void>;
  lists: TaskList[] | null;
  onListsChanged: () => void | Promise<void>;
  labels: Label[];
  users: PublicUser[];
  onLabelsChanged: (patch?: { id: number; data: Partial<Label> }) => void | Promise<void>;
  loading: boolean;
  /** Ce que la personne suit, et de quoi le changer depuis les menus. */
  follows: Follows;
  onToggleFollow: (kind: FollowKind, id: Id) => void | Promise<void>;
  /** Carte à ouvrir, désignée par l'adresse ou par une notification. */
  carteAOuvrir: Id | null;
  /** La carte dont le tiroir est ouvert, ou « null » : l'adresse la suit. */
  onCarteOuverte: (id: Id | null) => void;
}

export default function TasksPage({
  boards,
  boardId,
  onBoardChange,
  onAddBoard,
  onEditBoard,
  onDeleteBoard,
  lists,
  onListsChanged,
  labels,
  users,
  onLabelsChanged,
  loading,
  follows,
  onToggleFollow,
  carteAOuvrir,
  onCarteOuverte,
}: TasksPageProps) {
  // Rien à montrer tant que les tableaux ne sont pas connus, ni pendant une
  // lecture : l'écran vide attend d'être une certitude.
  if (!boards) return null;
  if (boards.length === 0) {
    return loading ? null : (
      <EmptyPanel
        icon={IconLayoutColumns}
        message="Aucun tableau pour cette entité"
        actionLabel="Nouveau tableau"
        onAction={onAddBoard}
      />
    );
  }

  return (
    <Stack gap={0} style={{ flex: 1, minHeight: 0 }}>
      <BoardTabs
        boards={boards}
        value={boardId}
        onChange={onBoardChange}
        onAdd={onAddBoard}
        onEdit={onEditBoard}
        onDelete={onDeleteBoard}
        deleteWarning="Ses listes et leurs cartes seront supprimées."
      />
      {/* Remonté à chaque tableau : une saisie ou un glisser en cours ne
          traverse pas le changement d'onglet. Les onglets restent visibles
          pendant la lecture des listes, seul le tableau attend. */}
      {lists && (
        <TaskBoard
          key={boardId}
          boardId={boardId}
          boards={boards}
          lists={lists}
          loading={loading}
          onListsChanged={onListsChanged}
          labels={labels}
          users={users}
          onLabelsChanged={onLabelsChanged}
          follows={follows}
          onToggleFollow={onToggleFollow}
          carteAOuvrir={carteAOuvrir}
          onCarteOuverte={onCarteOuverte}
        />
      )}
    </Stack>
  );
}
