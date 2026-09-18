import { Button, Group, Modal, Text } from "@mantine/core";

export default function DeleteConfirmModal({ opened, onClose, onConfirm, projectName }) {
  return (
    <Modal opened={opened} onClose={onClose} title="Supprimer le projet" centered>
      <Text size="sm" mb="lg">
        Voulez-vous vraiment supprimer{projectName ? ` « ${projectName} »` : " ce projet"} ? Cette action est
        irréversible.
      </Text>
      <Group justify="flex-end">
        <Button variant="default" onClick={onClose}>
          Annuler
        </Button>
        <Button color="red" onClick={onConfirm}>
          Supprimer
        </Button>
      </Group>
    </Modal>
  );
}
