import { Button, Group, Modal, Select, Stack, Text, TextInput } from "@mantine/core";
import { useEffect, useState } from "react";
import { api } from "../../api";
import { modalHeaderStyles } from "../../themes/modals";
import type { Category, Project, ProjectBoard } from "@milo/shared";
import { errorMessage, notifyError } from "../../lib/errors";
import CloseButton from "../ui/CloseButton";

// Move or copy a project to a board. Both gestures ask the same
// question — which one? — and the same dialog answers it, as for a list
// (MoveOrCopyListModal).
//
// Categories being specific to each board, the project changes its own too:
// we therefore ask which one hosts it in the target board.
//
// What sets them apart: moving takes the project elsewhere, so its own board
// is not a destination and its name does not change. Copying leaves it where
// it is: the current board becomes a destination again — this is the most common
// case, duplicating a project in place — and the copy is named, since two projects
// with the same name in the same board could no longer be told apart.
export type ProjectAction = "move" | "copy";

interface MoveOrCopyProjectModalProps {
  opened: boolean;
  onClose: () => void;
  /** "move" by default. */
  mode?: ProjectAction;
  /**
   * The targeted project. Its id, board, name and category
   * are enough: the list's board gives a whole one, the drawer only
   * these.
   */
  project: Pick<Project, "id" | "board_id" | "name" | "category_id"> | null;
  boards: ProjectBoard[];
  onMoved: () => void | Promise<void>;
}

/** "Mon projet" -> "Mon projet (copie)". */
const copyName = (name: string): string => `${name} (copie)`;

export default function MoveOrCopyProjectModal({
  opened,
  onClose,
  mode = "move",
  project,
  boards,
  onMoved,
}: MoveOrCopyProjectModalProps) {
  const [boardId, setBoardId] = useState<string | null>(null);
  // "null" until the target board's categories are read.
  const [categories, setCategories] = useState<Category[] | null>(null);
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);

  const copy = mode === "copy";

  // On open: for a copy, the project's board — duplicating in place
  // is the common case — and a ready-made name.
  useEffect(() => {
    if (!opened) return;
    setBoardId(copy && project ? String(project.board_id) : null);
    setCategories(null);
    setCategoryId(null);
    setName(project ? copyName(project.name) : "");
  }, [opened, project, copy]);

  // The target board's categories, as soon as it is chosen.
  useEffect(() => {
    if (!boardId) {
      setCategories(null);
      setCategoryId(null);
      return undefined;
    }

    let abandoned = false;
    setCategories(null);
    setCategoryId(null);
    api
      .getCategories(boardId)
      .then((list) => {
        if (abandoned) return;
        setCategories(list);
        // In its own board, the project keeps its category; elsewhere, the
        // first one offered, which can be changed.
        const own = list.find((c) => c.id === project?.category_id);
        const chosen = Number(boardId) === project?.board_id ? own : undefined;
        setCategoryId(String((chosen ?? list[0])?.id ?? "") || null);
      })
      .catch((e: unknown) => {
        if (!abandoned) notifyError(errorMessage(e));
      });

    return () => {
      abandoned = true;
    };
  }, [boardId, project]);

  // Moving excludes the board that already holds the project; copying accepts it.
  const boardOptions = boards
    .filter((board) => copy || board.id !== project?.board_id)
    .map((board) => ({ value: String(board.id), label: board.name }));

  const validate = async () => {
    if (!boardId || !categoryId || !project) return;
    setSaving(true);
    try {
      if (copy) {
        await api.copyProject(project.id, {
          board_id: Number(boardId),
          category_id: Number(categoryId),
          name: name.trim(),
        });
      } else {
        await api.updateProject(project.id, {
          board_id: Number(boardId),
          category_id: Number(categoryId),
        });
      }
      await onMoved();
    } catch (e) {
      notifyError(errorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title={copy ? "Copier le projet" : "Déplacer le projet"}
      centered
      padding={32}
      withCloseButton={false}
      styles={modalHeaderStyles(32)}
    >
      <Stack gap="md">

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

            {/* A project always has a category, and those of the destination board
                are not those of the source board. A board with none
                says so in the field: moving then remains
                impossible. */}
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

            {/* The copy is named: placed in the original board, it would
                otherwise carry the name of the project it comes from. */}
            {copy && (
              <TextInput
                label="Nom de la copie"
                placeholder="Nom de la copie"
                value={name}
                onChange={(e) => setName(e.currentTarget.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") validate();
                }}
                required
              />
            )}
          </>
        )}
      </Stack>

      <Group justify="flex-end" mt={32}>
        <CloseButton onClick={onClose} />
        <Button
          color="teal"
          onClick={validate}
          loading={saving}
          disabled={!boardId || !categoryId || (copy && !name.trim())}
        >
          {copy ? "Copier" : "Déplacer"}
        </Button>
      </Group>
    </Modal>
  );
}
