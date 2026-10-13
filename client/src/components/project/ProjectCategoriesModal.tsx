import { Button, Modal, Stack } from "@mantine/core";
import { useState } from "react";
import type { Category, ListRef } from "@milo/shared";
import { api } from "../../api";
import { saveCategoryTree } from "../../lib/categories";
import { errorMessage, notifyError } from "../../lib/errors";
import { themeWindow } from "../../lib/themeWindow";
import { MODAL_PADDING, modalHeaderStyles } from "../../themes/modals";
import CloseButton from "../ui/CloseButton";
import EditableTree from "../ui/EditableTree";
import Footer from "../ui/Footer";
import { CATEGORY_WORDS, useCategoryDraft } from "./ProjectCategoriesFields";

// The "Projets" widget's categories, opened from a project's details: the same
// tree as in the widget's drawer (ProjectCategoriesFields) — add, rename,
// move, delete —, without leaving the project being typed. Nothing is sent
// before "Enregistrer"; "Fermer" leaves everything as before.

const MODAL_WIDTH = 560;

interface ProjectCategoriesModalProps {
  opened: boolean;
  onClose: () => void;
  /** The project's widget, whose categories these are. */
  list: ListRef | null;
  /** Once saved: the widget's categories, as the server now holds them. */
  onSaved: (categories: Category[]) => void;
}

export default function ProjectCategoriesModal({
  opened,
  onClose,
  list,
  onSaved,
}: ProjectCategoriesModalProps) {
  return (
    <Modal
      attributes={themeWindow("project-categories")}
      opened={opened && list !== null}
      onClose={onClose}
      title="Catégories"
      centered
      size={MODAL_WIDTH}
      padding={MODAL_PADDING}
      withCloseButton={false}
      styles={modalHeaderStyles(MODAL_PADDING)}
    >
      {/* Mounted with the window: each opening starts over from the server. */}
      {list && <CategoriesEditor list={list} onClose={onClose} onSaved={onSaved} />}
    </Modal>
  );
}

function CategoriesEditor({
  list,
  onClose,
  onSaved,
}: {
  list: ListRef;
  onClose: () => void;
  onSaved: (categories: Category[]) => void;
}) {
  const { originals, nodes, change, reload } = useCategoryDraft(list);
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    try {
      await saveCategoryTree(list, originals, nodes);
      onSaved(await api.getCategories(list));
      onClose();
    } catch (e) {
      notifyError(errorMessage(e));
      // What went through is saved: the tree restarts from the server.
      await reload();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Stack gap="md">
      {/* The window's title already names the tree: nothing above it. */}
      <EditableTree
        nodes={nodes}
        onChange={change}
        words={CATEGORY_WORDS}
      />
      <Footer parentGap="var(--mantine-spacing-md)">
        <CloseButton onClick={onClose} />
        <Button color="teal" onClick={() => void save()} loading={saving}>
          Enregistrer
        </Button>
      </Footer>
    </Stack>
  );
}
