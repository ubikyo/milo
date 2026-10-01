import { Modal, SimpleGrid, Text, UnstyledButton } from "@mantine/core";
import { WIDGETS } from "../../widgets";
import type { AccessWidget } from "../../widgets";
import type { ComponentType } from "react";

// Ce qu'une section peut recevoir, en carrés : une icône, un mot. La liste
// vient du registre des widgets — cette boîte ne connaît aucun d'eux en
// particulier, et n'a donc pas à changer quand il s'en ajoute un. Par défaut
// ceux du mode Accès ; les panneaux des statistiques y passent les leurs.
interface ChoixDeWidget {
  type: string;
  label: string;
  icon: ComponentType<{ size?: number }>;
}

interface WidgetPickerModalProps<P extends ChoixDeWidget> {
  opened: boolean;
  onClose: () => void;
  onChoose: (widget: P) => void;
  widgets?: P[];
  title?: string;
}

export default function WidgetPickerModal<P extends ChoixDeWidget = AccessWidget>({
  opened,
  onClose,
  onChoose,
  widgets = WIDGETS as unknown as P[],
  title = "Ajouter un widget",
}: WidgetPickerModalProps<P>) {
  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title={title}
      centered
      padding={30}
    >
      <SimpleGrid cols={3} spacing="md">
        {widgets.map((widget) => (
          <UnstyledButton
            key={widget.type}
            onClick={() => onChoose(widget)}
            style={{
              // Carré : la tuile se règle sur sa largeur de colonne.
              aspectRatio: "1",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
              padding: 8,
              textAlign: "center",
              border: "1px solid var(--mantine-color-default-border)",
              borderRadius: "var(--mantine-radius-md)",
            }}
          >
            <widget.icon size={24} />
            <Text size="xs">{widget.label}</Text>
          </UnstyledButton>
        ))}
      </SimpleGrid>
    </Modal>
  );
}
