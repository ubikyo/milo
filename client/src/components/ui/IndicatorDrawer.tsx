import { Drawer, Stack, Tabs } from "@mantine/core";
import { IconSettings } from "@tabler/icons-react";
import { useEffect, useState } from "react";
import { ChampNom } from "../../indicators/commun";
import { messageErreur } from "../../lib/errors";
import { tabStyle } from "../../themes/tabs";
import { TIROIR_LARGEUR } from "../access/AccessBlockDrawer";
import DeleteConfirmModal from "./DeleteConfirmModal";
import DrawerFooter from "./DrawerFooter";
import ErrorAlert from "./ErrorAlert";
import type { Indicateur, IndicatorWidgetBase, IndicatorsApi } from "./IndicatorsPanel";
import type { Id } from "@milo/shared";

// Le tiroir d'un indicateur d'un panneau des statistiques — Support ou
// Assets. Sa coquille est celle des éléments du mode Accès (AccessBlockDrawer) ;
// ses champs appartiennent au widget. Un indicateur neuf n'existe qu'une
// fois enregistré : renoncer ne laisse rien derrière soi.
interface IndicatorDrawerProps<Type extends string, P extends IndicatorWidgetBase<Type>> {
  opened: boolean;
  onClose: () => void;
  /** L'indicateur modifié, ou « null » pour en créer un du widget « creating ». */
  indicator: Indicateur<Type> | null;
  creating: P | null;
  /** La section qui reçoit l'indicateur créé. */
  sectionId: Id | null;
  widgetOf: (type: Type) => P | undefined;
  api: IndicatorsApi<Type>;
  onSaved: () => void | Promise<void>;
}

export default function IndicatorDrawer<Type extends string, P extends IndicatorWidgetBase<Type>>({
  opened,
  onClose,
  indicator,
  creating,
  sectionId,
  widgetOf,
  api,
  onSaved,
}: IndicatorDrawerProps<Type, P>) {
  const [config, setConfig] = useState<Record<string, unknown>>({});
  const [error, setError] = useState<string | null>(null);
  const [confirmDeleteOpened, setConfirmDeleteOpened] = useState(false);
  const [saving, setSaving] = useState(false);

  const widget = indicator ? widgetOf(indicator.type) : creating;

  useEffect(() => {
    if (!opened) return;
    setConfig(indicator?.config ?? creating?.defaultConfig ?? {});
    setError(null);
    setSaving(false);
  }, [opened, indicator, creating]);

  // « Sauvegarder » : le seul geste qui écrit. Un widget inconnu n'a rien à
  // enregistrer : le tiroir se contente de se refermer.
  const sauvegarder = async () => {
    if (!widget) return onClose();
    setError(null);
    setSaving(true);
    try {
      if (indicator) await api.update(indicator.id, { config });
      else if (sectionId !== null) {
        await api.create({ section_id: sectionId, type: widget.type, config });
      }
      await onSaved();
    } catch (e) {
      setError(messageErreur(e));
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    setConfirmDeleteOpened(false);
    if (!indicator) return;
    try {
      await api.remove(indicator.id);
      await onSaved();
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
        size={TIROIR_LARGEUR}
        padding={40}
        withCloseButton={false}
        styles={{
          content: { display: "flex", flexDirection: "column" },
          body: { flex: 1, display: "flex", flexDirection: "column", overflowY: "auto" },
        }}
      >
        <Tabs
          defaultValue="settings"
          style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}
          styles={{ panel: { paddingTop: 20 } }}
        >
          <Tabs.List mb="md">
            <Tabs.Tab
              value="settings"
              leftSection={<IconSettings size={16} />}
              style={tabStyle(true)}
            >
              {widget?.label ?? "Paramètres"}
            </Tabs.Tab>
          </Tabs.List>

          <Tabs.Panel value="settings">
            <Stack gap="xl">
              {error && <ErrorAlert onClose={() => setError(null)}>{error}</ErrorAlert>}
              {widget &&
                (widget.Config ? (
                  <widget.Config config={config} onChange={setConfig} />
                ) : (
                  <ChampNom config={config} onChange={setConfig} defaut={widget.label} />
                ))}
            </Stack>
          </Tabs.Panel>
        </Tabs>

        <DrawerFooter
          onSave={sauvegarder}
          onClose={onClose}
          onDelete={indicator ? () => setConfirmDeleteOpened(true) : undefined}
          saving={saving}
        />
      </Drawer>

      <DeleteConfirmModal
        opened={confirmDeleteOpened}
        onClose={() => setConfirmDeleteOpened(false)}
        onConfirm={remove}
        title="Supprimer l'indicateur"
        message={<>Voulez-vous vraiment supprimer cet indicateur ? Cette action est irréversible.</>}
      />
    </>
  );
}
