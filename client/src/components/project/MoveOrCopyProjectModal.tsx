import { Button, Cascader, Modal, Select, Stack, Text, TextInput } from "@mantine/core";
import { useEffect, useMemo, useState } from "react";
import { api } from "../../api";
import { modalHeaderStyles } from "../../themes/modals";
import type { Category, Project, ProjectBoard, SourceWidget } from "@milo/shared";
import { categoryNodes } from "../../lib/categories";
import { errorMessage, notifyError } from "../../lib/errors";
import { TREE_CASCADER, locationTreeData, treePath } from "../ui/EditableTree";
import CloseButton from "../ui/CloseButton";
import Footer from "../ui/Footer";
import { themeWindow } from "../../lib/themeWindow";

// Move or copy a project to a board's "Projets" widget. Both gestures ask the
// same question — which one? — and the same dialog answers it, as for a list
// (MoveOrCopyListModal).
//
// Categories being specific to each widget, the project changes its own too:
// we therefore ask which one hosts it in the target widget.
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
  project: Pick<Project, "id" | "board_id" | "list_key" | "name" | "category_id"> | null;
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
  // The "Projets" widgets one sees, and the one chosen in the target board.
  const [widgets, setWidgets] = useState<SourceWidget[]>([]);
  const [listKey, setListKey] = useState<string | null>(null);
  // "null" until the target widget's categories are read.
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
    let abandoned = false;
    api
      .getSourceWidgets("project.list")
      .then((read) => !abandoned && setWidgets(read))
      .catch((e: unknown) => !abandoned && notifyError(errorMessage(e)));
    return () => {
      abandoned = true;
    };
  }, [opened, project, copy]);

  // Moving leaves the project's own widget: it is no destination. Copying
  // accepts it — duplicating in place is the common case.
  const targets = useMemo(
    () =>
      widgets.filter(
        (w) => copy || !(w.board_id === project?.board_id && w.key === project?.list_key),
      ),
    [widgets, copy, project],
  );
  const boardWidgets = useMemo(
    () => targets.filter((w) => String(w.board_id) === boardId),
    [targets, boardId],
  );

  // The target board's widget: the project's own when it is there, the first
  // otherwise.
  useEffect(() => {
    const own = boardWidgets.find(
      (w) => w.board_id === project?.board_id && w.key === project?.list_key,
    );
    setListKey((own ?? boardWidgets[0])?.key ?? null);
  }, [boardWidgets, project]);

  // The target widget's categories, as soon as it is chosen.
  useEffect(() => {
    if (!boardId || !listKey) {
      setCategories(null);
      setCategoryId(null);
      return undefined;
    }

    let abandoned = false;
    setCategories(null);
    setCategoryId(null);
    api
      .getCategories({ board: Number(boardId), list: listKey })
      .then((list) => {
        if (abandoned) return;
        setCategories(list);
        // In its own widget, the project keeps its category; elsewhere, the
        // first one offered, which can be changed.
        const own = list.find((c) => c.id === project?.category_id);
        setCategoryId((own ? String(own.id) : categoryNodes(list)[0]?.id) ?? null);
      })
      .catch((e: unknown) => {
        if (!abandoned) notifyError(errorMessage(e));
      });

    return () => {
      abandoned = true;
    };
  }, [boardId, listKey, project]);

  // The destination's tree, to pick the category in, level after level.
  const nodes = useMemo(() => categoryNodes(categories ?? []), [categories]);
  const categoryData = useMemo(() => locationTreeData(nodes), [nodes]);

  // The boards with a widget to go to.
  const boardOptions = boards
    .filter((board) => targets.some((w) => w.board_id === board.id))
    .map((board) => ({ value: String(board.id), label: board.name }));
  const widgetOptions = boardWidgets.map((w) => ({ value: w.key, label: w.reference }));

  const validate = async () => {
    if (!boardId || !listKey || !categoryId || !project) return;
    setSaving(true);
    try {
      if (copy) {
        await api.copyProject(project.id, {
          board_id: Number(boardId),
          list_key: listKey,
          category_id: Number(categoryId),
          name: name.trim(),
        });
      } else {
        await api.updateProject(project.id, {
          board_id: Number(boardId),
          list_key: listKey,
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
      attributes={themeWindow("move-project")}
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
            Il n'existe aucun autre widget « Projets » où déplacer ce projet.
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

            {/* A board may carry several "Projets" widgets: each has its
                projects, its categories and its labels. */}
            {widgetOptions.length > 1 && (
              <Select
                label="Widget de destination"
                data={widgetOptions}
                value={listKey}
                onChange={setListKey}
                allowDeselect={false}
              />
            )}

            {/* A project always has a category, and those of the destination
                widget are not those of the source widget. A widget with none
                says so in the field: moving then remains impossible. */}
            <Cascader
              label="Catégorie dans ce widget"
              placeholder={
                !boardId
                  ? "Choisissez d'abord un tableau"
                  : categories?.length === 0
                    ? "Aucune catégorie dans ce widget"
                    : "Choisir une catégorie"
              }
              data={categoryData}
              value={categoryId ? treePath(nodes, categoryId) : null}
              onChange={(path) => {
                const chosen = path?.at(-1);
                if (chosen) setCategoryId(chosen);
              }}
              nothingFoundMessage="Aucune catégorie"
              {...TREE_CASCADER}
              searchable
              disabled={!boardId || !listKey || categories === null}
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

      <Footer>
        <CloseButton onClick={onClose} />
        <Button
          color="teal"
          onClick={validate}
          loading={saving}
          disabled={!boardId || !listKey || !categoryId || (copy && !name.trim())}
        >
          {copy ? "Copier" : "Déplacer"}
        </Button>
      </Footer>
    </Modal>
  );
}
