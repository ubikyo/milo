import { Button, Group, Modal, Text } from "@mantine/core";
import { RED } from "../../themes/colors";
import { MODAL_PADDING, modalHeaderStyles } from "../../themes/modals";

export default function DeleteConfirmModal({
  opened,
  onClose,
  onConfirm,
  title,
  message,
  confirmLabel = "Supprimer",
}) {
  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title={title}
      centered
      padding={MODAL_PADDING}
      withCloseButton={false}
      styles={modalHeaderStyles(MODAL_PADDING)}
    >
      {/* Espace sous le texte égal au padding haut de la fenêtre. */}
      <Text size="sm" mb={MODAL_PADDING}>
        {message}
      </Text>
      <Group justify="flex-end">
        <Button variant="default" onClick={onClose}>
          Fermer
        </Button>
        <Button color={RED} onClick={onConfirm}>
          {confirmLabel}
        </Button>
      </Group>
    </Modal>
  );
}
