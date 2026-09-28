import { Button, Group, Modal, Select, Stack, Text } from "@mantine/core";
import { useEffect, useState } from "react";
import { api } from "../../api";
import { modalHeaderStyles } from "../../themes/modals";
import ErrorAlert from "../ui/ErrorAlert.jsx";

// Déplacement d'un projet vers un autre tableau. Les catégories étant propres
// à chaque tableau, le projet en change aussi : on demande donc celle qui
// l'accueille dans le tableau visé.
export default function MoveProjectModal({ opened, onClose, project, boards, onMoved }) {
  const [boardId, setBoardId] = useState(null);
  // « null » tant que les catégories du tableau visé ne sont pas lues.
  const [categories, setCategories] = useState(null);
  const [categoryId, setCategoryId] = useState(null);
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!opened) return;
    setBoardId(null);
    setCategories(null);
    setCategoryId(null);
    setError(null);
  }, [opened, project]);

  // Les catégories du tableau visé, dès qu'il est choisi.
  useEffect(() => {
    if (!boardId) {
      setCategories(null);
      setCategoryId(null);
      return undefined;
    }

    let abandonne = false;
    setCategories(null);
    setCategoryId(null);
    api
      .getCategories(boardId)
      .then((liste) => {
        if (abandonne) return;
        setCategories(liste);
        setCategoryId(liste[0] ? String(liste[0].id) : null);
      })
      .catch((e) => !abandonne && setError(e.message));

    return () => {
      abandonne = true;
    };
  }, [boardId]);

  // Le tableau qui porte déjà le projet n'est pas une destination.
  const boardOptions = boards
    .filter((board) => board.id !== project?.board_id)
    .map((board) => ({ value: String(board.id), label: board.name }));

  const move = async () => {
    if (!boardId || !categoryId) return;
    setSaving(true);
    setError(null);
    try {
      await api.updateProject(project.id, {
        board_id: Number(boardId),
        category_id: Number(categoryId),
      });
      await onMoved();
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
      title="Déplacer le projet"
      centered
      padding={32}
      withCloseButton={false}
      styles={modalHeaderStyles(32)}
    >
      <Stack gap="md">
        {error && <ErrorAlert onClose={() => setError(null)}>{error}</ErrorAlert>}

        {boardOptions.length === 0 ? (
          <Text size="sm" c="dimmed">
            Il n'existe aucun autre tableau où déplacer ce projet.
          </Text>
        ) : (
          <>
            <Select
              label="Tableau de destination"
              placeholder="Choisir un tableau"
              data={boardOptions}
              value={boardId}
              onChange={setBoardId}
              allowDeselect={false}
            />

            {/* Un projet porte toujours une catégorie, et celles du tableau
                d'arrivée ne sont pas celles du tableau de départ. Le tableau
                qui n'en a aucune le dit dans le champ : le déplacement reste
                alors impossible. */}
            <Select
              label="Catégorie dans ce tableau"
              placeholder={
                !boardId
                  ? "Choisissez d'abord un tableau"
                  : categories?.length === 0
                    ? "Aucune catégorie dans ce tableau"
                    : "Choisir une catégorie"
              }
              data={(categories ?? []).map((c) => ({ value: String(c.id), label: c.name }))}
              value={categoryId}
              onChange={setCategoryId}
              allowDeselect={false}
              disabled={!boardId || categories === null}
              required
            />
          </>
        )}
      </Stack>

      <Group justify="flex-end" mt={32}>
        <Button variant="default" onClick={onClose}>
          Fermer
        </Button>
        <Button color="teal" onClick={move} loading={saving} disabled={!boardId || !categoryId}>
          Déplacer
        </Button>
      </Group>
    </Modal>
  );
}
