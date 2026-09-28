import { Stack } from "@mantine/core";
import { IconLayoutColumns } from "@tabler/icons-react";
import TaskBoard from "../components/board/TaskBoard.jsx";
import BoardTabs from "../components/ui/BoardTabs.jsx";
import EmptyPanel from "../components/ui/EmptyPanel.jsx";

// Le mode Tâche : les tableaux de la société courante en onglets, et le
// contenu du tableau ouvert. Les données et les tiroirs restent à l'application
// (App.jsx), cette page ne fait que les mettre en scène.
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
}) {
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
        />
      )}
    </Stack>
  );
}
