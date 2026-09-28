import { Button, Drawer, Group, Stack, Tabs } from "@mantine/core";
import { IconSettings, IconTrash } from "@tabler/icons-react";
import { useEffect, useState } from "react";
import { api } from "../../api";
import { pluginDe } from "../../plugins";
import { RED } from "../../themes/colors";
import { tabStyle } from "../../themes/tabs";
import DeleteConfirmModal from "../ui/DeleteConfirmModal";
import ErrorAlert from "../ui/ErrorAlert";
import { messageErreur } from "../../lib/errors";
import type { AccessBlock } from "@milo/shared";

// Le tiroir d'un élément de section. Sa coquille est commune à tous les
// greffons — la rangée d'onglets, l'enregistrement en refermant, la
// suppression en bas — et son contenu appartient au greffon : c'est lui qui
// pose ses champs, et lui seul sait ce que sa configuration veut dire.
interface AccessBlockDrawerProps {
  opened: boolean;
  onClose: () => void;
  /** L'élément visé, ou « null » quand le tiroir est fermé. */
  block: AccessBlock | null;
  onSaved: () => void | Promise<void>;
  onDeleted: () => void | Promise<void>;
}

export default function AccessBlockDrawer({
  opened,
  onClose,
  block,
  onSaved,
  onDeleted,
}: AccessBlockDrawerProps) {
  const [config, setConfig] = useState<Record<string, unknown>>({});
  const [error, setError] = useState<string | null>(null);
  const [confirmDeleteOpened, setConfirmDeleteOpened] = useState(false);

  useEffect(() => {
    if (!opened) return;
    setConfig(block?.config ?? {});
    setError(null);
  }, [opened, block]);

  const plugin = block ? pluginDe(block.type) : undefined;

  // Comme les autres tiroirs : on referme en cliquant au dehors, et c'est à ce
  // moment que l'élément part au serveur. Un greffon inconnu — rangé par une
  // version qui en connaissait un de plus — n'a rien à enregistrer : le tiroir
  // se contente alors de se refermer.
  const fermer = async () => {
    if (!block || !plugin) return onClose();
    setError(null);
    try {
      await api.updateAccessBlock(block.id, { config });
      await onSaved();
    } catch (e) {
      setError(messageErreur(e));
    }
  };

  const remove = async () => {
    setConfirmDeleteOpened(false);
    if (!block) return;
    try {
      await api.deleteAccessBlock(block.id);
      await onDeleted();
    } catch (e) {
      setError(messageErreur(e));
    }
  };

  return (
    <>
      <Drawer
        opened={opened}
        onClose={fermer}
        position="right"
        size={560}
        padding={40}
        withCloseButton={false}
        styles={{
          content: { display: "flex", flexDirection: "column" },
          body: {
            flex: 1,
            display: "flex",
            flexDirection: "column",
            overflowY: "auto",
          },
        }}
      >
        <Tabs
          defaultValue="settings"
          style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}
          styles={{ panel: { paddingTop: 20 } }}
        >
          <Tabs.List mb="md">
            {/* L'onglet porte le nom du greffon : c'est ce qu'on est en train
                de régler, et le tiroir se présente comme les autres. */}
            <Tabs.Tab
              value="settings"
              leftSection={<IconSettings size={16} />}
              style={tabStyle(true)}
            >
              {plugin?.label ?? "Paramètres"}
            </Tabs.Tab>
          </Tabs.List>

          <Tabs.Panel value="settings">
            <Stack gap="xl">
              {error && <ErrorAlert onClose={() => setError(null)}>{error}</ErrorAlert>}
              {plugin && <plugin.Config config={config} onChange={setConfig} />}
            </Stack>
          </Tabs.Panel>
        </Tabs>

        {block && (
          <Stack gap="sm" mt="auto" pt={40}>
            <Group wrap="nowrap">
              <Button
                color={RED}
                variant="subtle"
                leftSection={<IconTrash size={16} />}
                onClick={() => setConfirmDeleteOpened(true)}
              >
                Supprimer
              </Button>
            </Group>
          </Stack>
        )}
      </Drawer>

      <DeleteConfirmModal
        opened={confirmDeleteOpened}
        onClose={() => setConfirmDeleteOpened(false)}
        onConfirm={remove}
        title="Supprimer l'élément"
        message={<>Voulez-vous vraiment supprimer cet élément ? Cette action est irréversible.</>}
      />
    </>
  );
}
