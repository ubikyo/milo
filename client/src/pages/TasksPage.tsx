import { Stack } from "@mantine/core";
import { IconLayoutColumns } from "@tabler/icons-react";
import { TableauDesTachesContext } from "../components/board/TaskBoard";
import TaskIndicatorsPanel from "../components/board/TaskIndicatorsPanel";
import BoardTabs from "../components/ui/BoardTabs";
import EmptyPanel from "../components/ui/EmptyPanel";
import type { AccountSlot } from "../components/ui/AccountControls";
import type {
  Board,
  FollowKind,
  Follows,
  Id,
  IndicatorSection,
  Label,
  PublicUser,
  TaskIndicator,
  TaskList,
} from "@milo/shared";

// Le mode Tâche : les tableaux de la société courante en onglets et, sous eux,
// des sections qui portent les widgets — les listes du tableau ouvert, et les
// indicateurs —, comme aux modes Support et Assets. La disposition est
// commune à tous les tableaux. Les données et les tiroirs restent à
// l'application (App.tsx), cette page ne fait que les mettre en scène.
interface TasksPageProps {
  /** « null » tant que les tableaux ne sont pas lus ; « [] » quand il n'y en a pas. */
  boards: Board[] | null;
  boardId: string | null;
  onBoardChange: (id: string | null) => void;
  onAddBoard: () => void;
  onTogglePrivateBoard: (id: number) => void | Promise<void>;
  /** Ouvre la copie des étiquettes de l'onglet visé vers un autre tableau. */
  onCopyLabels: (id: number) => void;
  onToggleCardNumbers: (id: number) => void | Promise<void>;
  /** Renommer un onglet sur place, au double clic sur son nom. */
  onRenameBoard: (id: number, name: string) => void | Promise<void>;
  onDeleteBoard: (id: number) => void | Promise<void>;
  /** Le nouvel ordre des onglets, glissés dans la rangée. */
  onReorderBoards: (ids: number[]) => void | Promise<void>;
  /** Verrouiller ou déverrouiller un tableau depuis le menu de son onglet. */
  onToggleBoardLock: (id: number) => void | Promise<void>;
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
  /** La société et le compte, posés au bout de la rangée d'onglets. */
  account: AccountSlot;
  /**
   * Les sections de l'écran et leurs widgets, communs à tous les tableaux.
   * « null » tant qu'elles ne sont pas lues.
   */
  indicatorSections: IndicatorSection[] | null;
  indicators: TaskIndicator[];
  onIndicatorsChanged: () => void | Promise<void>;
  /** Le verrou des sections : ni ajout ni déplacement. */
  indicatorsLocked: boolean;
  onToggleIndicatorsLock: () => void | Promise<void>;
}

export default function TasksPage({
  boards,
  boardId,
  onBoardChange,
  onAddBoard,
  onTogglePrivateBoard,
  onCopyLabels,
  onToggleCardNumbers,
  onRenameBoard,
  onDeleteBoard,
  onReorderBoards,
  onToggleBoardLock,
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
  account,
  indicatorSections,
  indicators,
  onIndicatorsChanged,
  indicatorsLocked,
  onToggleIndicatorsLock,
}: TasksPageProps) {
  // Sans tableau, l'invite prend la place du contenu — mais sous la rangée,
  // qui reste : c'est elle qui porte la société et le compte, et on doit
  // pouvoir s'en servir même quand l'entité n'a aucun tableau. Rien pendant
  // une lecture : l'écran vide attend d'être une certitude.
  const sansTableau =
    !boards || boards.length === 0 ? (
      loading || !boards ? null : (
        <EmptyPanel
          icon={IconLayoutColumns}
          message="Aucun tableau pour cette entité"
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
        onTogglePrivate={onTogglePrivateBoard}
        onToggleCardNumbers={onToggleCardNumbers}
        onCopyLabels={onCopyLabels}
        onRename={onRenameBoard}
        onDelete={onDeleteBoard}
        onReorder={onReorderBoards}
        onToggleLock={onToggleBoardLock}
        deleteWarning="Ses listes et leurs cartes seront supprimées."
        sectionsLock={{ locked: indicatorsLocked, onToggle: onToggleIndicatorsLock }}
        account={account}
      />
      {sansTableau}

      {/* Les sections et leurs widgets. Les listes du tableau en sont un :
          elles lisent ici le tableau ouvert et ce qu'on en fait. Les onglets
          restent visibles pendant la lecture des listes, seul le tableau
          attend. */}
      {boards && boards.length > 0 && lists && (
        <TableauDesTachesContext.Provider
          value={{
            boardId,
            boards,
            lists,
            loading,
            onListsChanged,
            labels,
            users,
            onLabelsChanged,
            follows,
            onToggleFollow,
            carteAOuvrir,
            onCarteOuverte,
          }}
        >
          <TaskIndicatorsPanel
            sections={indicatorSections}
            indicators={indicators}
            lists={lists}
            onChanged={onIndicatorsChanged}
            locked={indicatorsLocked}
            userId={account.user.id}
          />
        </TableauDesTachesContext.Provider>
      )}
    </Stack>
  );
}
