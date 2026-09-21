import { Button, Group, Modal, Text } from "@mantine/core";
import { RED } from "../colors";

// Padding de la fenêtre : le double du « md » de Mantine (16px).
const MODAL_PADDING = 32;

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
      styles={{
        // Texte blanc sur l'entête rouge, dans les deux thèmes.
        title: { fontWeight: 700, color: "#FFFFFF" },
        // Entête rouge : on réutilise le rouge déjà employé pour les erreurs.
        header: { backgroundColor: RED },
        // Mantine supprime le padding haut du corps quand il y a un entête :
        // on le rétablit pour qu'il corresponde aux côtés.
        body: { paddingTop: MODAL_PADDING },
      }}
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
