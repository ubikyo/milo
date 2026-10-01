import { Group, Modal } from "@mantine/core";
import { IconTag } from "@tabler/icons-react";
import { useCallback, useEffect, useState } from "react";
import { api } from "../../api";
import { MODAL_PADDING, modalHeaderStyles } from "../../themes/modals";
import BoutonFermer from "../ui/BoutonFermer";
import LookupManager from "../ui/LookupManager";
import type { Category, ProjectBoard } from "@milo/shared";

interface ProjectCategoriesModalProps {
  /** Le tableau dont on gère les catégories ; « null » ferme la fenêtre. */
  board: ProjectBoard | null;
  onClose: () => void;
  /** Relire ce que l'application affiche après chaque geste. */
  onChanged: () => void | Promise<void>;
}

/**
 * Les catégories d'un tableau de projets, ouvertes depuis le menu de son
 * onglet. La même liste que les sociétés : chaque geste part au serveur
 * aussitôt, il n'y a rien à enregistrer.
 */
export default function ProjectCategoriesModal({
  board,
  onClose,
  onChanged,
}: ProjectCategoriesModalProps) {
  const [categories, setCategories] = useState<Category[]>([]);
  const boardId = board?.id ?? null;

  const reload = useCallback(async () => {
    setCategories(boardId ? await api.getCategories(String(boardId)) : []);
  }, [boardId]);

  useEffect(() => {
    reload();
  }, [reload]);

  /** Un appel à l'API, suivi de la relecture de la liste et de l'application. */
  const puisRelire =
    <Args extends unknown[]>(fn: (...args: Args) => Promise<unknown>) =>
    async (...args: Args) => {
      await fn(...args);
      await reload();
      await onChanged();
    };

  return (
    <Modal
      opened={board !== null}
      onClose={onClose}
      title={`Catégories — ${board?.name ?? ""}`}
      centered
      size="lg"
      padding={MODAL_PADDING}
      withCloseButton={false}
      styles={modalHeaderStyles(MODAL_PADDING)}
    >
      {boardId !== null && (
        <LookupManager
          items={categories}
          onCreate={puisRelire((nom: string) => api.createCategory(boardId, nom))}
          onUpdate={puisRelire((id: number, nom: string) => api.updateCategory(id, nom))}
          onDelete={puisRelire(api.deleteCategory)}
          addTitle="Nouvelle catégorie"
          maxRows={8}
          minRows={8}
          emptyIcon={IconTag}
          emptyText="Aucune catégorie pour ce tableau"
          entityLabel="la catégorie"
        />
      )}
      <Group justify="flex-end" mt={MODAL_PADDING}>
        <BoutonFermer onClick={onClose} />
      </Group>
    </Modal>
  );
}
