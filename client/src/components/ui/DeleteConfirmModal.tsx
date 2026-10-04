import { Button, Group, Modal, Text } from "@mantine/core";
import type { ReactNode } from "react";
import { RED } from "../../themes/colors";
import { MODAL_PADDING, modalHeaderStyles } from "../../themes/modals";
import CloseButton from "./CloseButton";

interface DeleteConfirmModalProps {
  opened: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: ReactNode;
  message: ReactNode;
  confirmLabel?: string;
  /** "Fermer" by default; change it when the action itself is named so. */
  cancelLabel?: string;
  confirmColor?: string;
  /**
   * Opened from a dropdown list that stays open (a Popover, above the default
   * windows): it needs to go in front.
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
      {/* Space under the text equal to the window's top padding. */}
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
