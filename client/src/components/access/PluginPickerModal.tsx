import { Modal, SimpleGrid, Text, UnstyledButton } from "@mantine/core";
import { PLUGINS } from "../../plugins";
import type { AccessPlugin } from "../../plugins";

// Ce qu'une section peut recevoir, en carrés : une icône, un mot. La liste
// vient du registre des greffons — cette boîte ne connaît aucun d'eux en
// particulier, et n'a donc pas à changer quand il s'en ajoute un.
interface PluginPickerModalProps {
  opened: boolean;
  onClose: () => void;
  onChoose: (plugin: AccessPlugin) => void;
}

export default function PluginPickerModal({
  opened,
  onClose,
  onChoose,
}: PluginPickerModalProps) {
  return (
    <Modal opened={opened} onClose={onClose} title="Ajouter un élément" centered>
      <SimpleGrid cols={3} spacing="md">
        {PLUGINS.map((plugin) => (
          <UnstyledButton
            key={plugin.type}
            onClick={() => onChoose(plugin)}
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
            <plugin.icon size={24} />
            <Text size="xs">{plugin.label}</Text>
          </UnstyledButton>
        ))}
      </SimpleGrid>
    </Modal>
  );
}
