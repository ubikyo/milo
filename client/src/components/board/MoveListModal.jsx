import { Button, Group, Modal, Select, Stack, Text } from "@mantine/core";
import { useEffect, useState } from "react";
import { api } from "../../api";
import { modalHeaderStyles } from "../../themes/modals";
import ErrorAlert from "../ui/ErrorAlert.jsx";

// Déplacement d'une liste vers un autre tableau. Elle emporte ses cartes et se
// range à la fin du tableau d'accueil.
export default function MoveListModal({ opened, onClose, list, boards, onMoved }) {
  const [boardId, setBoardId] = useState(null);
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!opened) return;
    setBoardId(null);
    setError(null);
  }, [opened, list]);

  // Le tableau qui porte déjà la liste n'est pas une destination.
  const boardOptions = (boards ?? [])
    .filter((board) => board.id !== list?.board_id)
    .map((board) => ({ value: String(board.id), label: board.name }));

  const move = async () => {
    if (!boardId) return;
    setSaving(true);
    setError(null);
    try {
      await api.updateTaskList(list.id, { board_id: Number(boardId) });
      await onMoved();
      onClose();
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title="Déplacer la liste"
      centered
      padding={32}
      withCloseButton={false}
      styles={modalHeaderStyles(32)}
    >
      <Stack gap="md">
        {error && <ErrorAlert onClose={() => setError(null)}>{error}</ErrorAlert>}

        {boardOptions.length === 0 ? (
          <Text size="sm" c="dimmed">
            Il n'existe aucun autre tableau où déplacer cette liste.
          </Text>
        ) : (
          <Select
            label="Tableau de destination"
            placeholder="Choisir un tableau"
            data={boardOptions}
            value={boardId}
            onChange={setBoardId}
            allowDeselect={false}
          />
        )}
      </Stack>

      <Group justify="flex-end" mt={32}>
        <Button variant="default" onClick={onClose}>
          Fermer
        </Button>
        <Button color="teal" onClick={move} loading={saving} disabled={!boardId}>
          Déplacer
        </Button>
      </Group>
    </Modal>
  );
}
