import { Drawer, Stack, Tabs } from "@mantine/core";
import { IconSettings } from "@tabler/icons-react";
import { useEffect, useState } from "react";
import { api } from "../../api";
import { widgetDe } from "../../widgets";
import { ChampsMarges, voisinsDe } from "../../widgets/marges";
import { tabStyle } from "../../themes/tabs";
import DeleteConfirmModal from "../ui/DeleteConfirmModal";
import DrawerFooter from "../ui/DrawerFooter";
import ErrorAlert from "../ui/ErrorAlert";
import { messageErreur } from "../../lib/errors";
import type { AccessBlock } from "@milo/shared";

/** La largeur du tiroir, quand le widget n'en demande pas d'autre (drawerSize). */
export const TIROIR_LARGEUR = 560;

// Le tiroir d'un élément de section. Sa coquille est commune à tous les
// widgets — la rangée d'onglets, l'enregistrement en refermant, la
// suppression en bas — et son contenu appartient au widget : c'est lui qui
// pose ses champs, et lui seul sait ce que sa configuration veut dire.
interface AccessBlockDrawerProps {
  opened: boolean;
  onClose: () => void;
  /** L'élément visé, ou « null » quand le tiroir est fermé. */
  block: AccessBlock | null;
  /** Les éléments de la page : les voisins de l'élément fixent ses marges par défaut. */
  blocks: AccessBlock[];
  onSaved: () => void | Promise<void>;
  onDeleted: () => void | Promise<void>;
}

export default function AccessBlockDrawer({
  opened,
  onClose,
  block,
  blocks,
  onSaved,
  onDeleted,
}: AccessBlockDrawerProps) {
  const [config, setConfig] = useState<Record<string, unknown>>({});
  const [error, setError] = useState<string | null>(null);
  const [confirmDeleteOpened, setConfirmDeleteOpened] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!opened) return;
    setConfig(block?.config ?? {});
    setError(null);
    setSaving(false);
  }, [opened, block]);

  const widget = block ? widgetDe(block.type) : undefined;

  // « Sauvegarder » : le seul geste qui écrit. Un widget inconnu — rangé par
  // une version qui en connaissait un de plus — n'a rien à enregistrer : le
  // tiroir se contente alors de se refermer.
  const sauvegarder = async () => {
    if (!block || !widget) return onClose();
    setError(null);
    setSaving(true);
    try {
      await api.updateAccessBlock(block.id, { config });
      await onSaved();
    } catch (e) {
      setError(messageErreur(e));
    } finally {
      setSaving(false);
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
        onClose={onClose}
        position="right"
        size={widget?.drawerSize ?? TIROIR_LARGEUR}
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
            {/* L'onglet porte le nom du widget : c'est ce qu'on est en train
                de régler, et le tiroir se présente comme les autres. */}
            <Tabs.Tab
              value="settings"
              leftSection={<IconSettings size={16} />}
              style={tabStyle(true)}
            >
              {widget?.label ?? "Paramètres"}
            </Tabs.Tab>
          </Tabs.List>

          {/* Entrée enregistre depuis n'importe quel champ d'une ligne du
              widget : c'est le pied du tiroir qui l'écoute (DrawerFooter). */}
          <Tabs.Panel value="settings">
            <Stack gap="xl">
              {error && <ErrorAlert onClose={() => setError(null)}>{error}</ErrorAlert>}
              {widget && <widget.Config config={config} onChange={setConfig} />}
              {/* Communes à tous les widgets. Le tiroir ne s'ouvre que la
                  catégorie déverrouillée : les voisins sont ceux qu'elle
                  montre alors. */}
              {widget && block && (
                <ChampsMarges
                  widget={widget}
                  config={config}
                  onChange={setConfig}
                  voisins={voisinsDe(blocks, block, widgetDe, false)}
                />
              )}
            </Stack>
          </Tabs.Panel>
        </Tabs>

        <DrawerFooter
          onSave={sauvegarder}
          onClose={onClose}
          onDelete={block ? () => setConfirmDeleteOpened(true) : undefined}
          saving={saving}
        />
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
