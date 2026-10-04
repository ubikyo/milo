import { Button, Group, Modal, Text } from "@mantine/core";
import type { ReactNode } from "react";
import { RED } from "../../themes/colors";
import { MODAL_PADDING, modalHeaderStyles } from "../../themes/modals";
import CloseButton from "./BoutonFermer";

interface DeleteConfirmModalProps {
  opened: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: ReactNode;
  message: ReactNode;
  confirmLabel?: string;
  /** « Fermer » par défaut ; à changer quand l'action elle-même s'appelle ainsi. */
  cancelLabel?: string;
  confirmColor?: string;
  /**
   * Ouverte depuis une liste déroulante restée ouverte (un Popover, au-dessus
   * des fenêtres par défaut) : il lui faut passer devant.
   */
  zIndex?: number;
}

export default function DeleteConfirmModal({
  opened,
  onClose,
  onConfirm,
  title,
  message,
  confirmLabel = "Supprimer",
  cancelLabel = "Fermer",
  confirmColor = RED,
  zIndex,
}: DeleteConfirmModalProps) {
  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title={title}
      centered
      zIndex={zIndex}
      padding={MODAL_PADDING}
      withCloseButton={false}
      styles={modalHeaderStyles(MODAL_PADDING)}
    >
      {/* Espace sous le texte égal au padding haut de la fenêtre. */}
      <Text size="sm" mb={MODAL_PADDING}>
        {message}
      </Text>
      <Group justify="flex-end">
        <CloseButton onClick={onClose}>
          {cancelLabel}
        </CloseButton>
        <Button color={confirmColor} onClick={onConfirm}>
          {confirmLabel}
        </Button>
      </Group>
    </Modal>
  );
}
