import { Button, Group, Modal, Text } from "@mantine/core";

export default function DeleteConfirmModal({
  opened,
  onClose,
  onConfirm,
  title,
  message,
  confirmLabel = "Supprimer",
}) {
  return (
    <Modal opened={opened} onClose={onClose} title={title} centered>
      <Text size="sm" mb="lg">
        {message}
      </Text>
      <Group justify="flex-end">
        <Button variant="default" onClick={onClose}>
          Annuler
        </Button>
        <Button color="red" onClick={onConfirm}>
          {confirmLabel}
        </Button>
      </Group>
    </Modal>
  );
}
