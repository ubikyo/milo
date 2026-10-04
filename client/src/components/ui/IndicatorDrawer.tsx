import { Drawer, Stack, Tabs } from "@mantine/core";
import { IconSettings } from "@tabler/icons-react";
import { createContext, useCallback, useEffect, useRef, useState } from "react";
import { ChampNom } from "../../indicators/commun";
import { messageErreur, notifierErreur } from "../../lib/errors";
import { tabStyle } from "../../themes/tabs";
import DeleteConfirmModal from "./DeleteConfirmModal";
import DrawerFooter from "./DrawerFooter";
import DrawerScrollArea, {
  DRAWER_PADDING,
  DRAWER_PANEL_STYLE,
  DRAWER_STYLES,
  DRAWER_TABS_STYLES,
} from "./DrawerScroll";
import type { Indicateur, IndicatorWidgetBase, IndicatorsApi } from "./IndicatorsPanel";
import type { Id } from "@milo/shared";

/**
 * L'emplacement du menu « Actions » d'un widget, au bout de la rangée
 * d'onglets du tiroir — là où les autres écrans posent le leur (ModeBar). Les
 * champs du widget y portent leur menu (createPortal) ; nul tant qu'il n'est
 * pas monté.
 */
export const ActionsDuTiroirContext = createContext<HTMLElement | null>(null);

/** Ce qu'un champ du tiroir enregistre lui-même, au clic sur « Sauvegarder ». */
export type Enregistrement = () => Promise<void>;

/**
 * Inscrit ce qu'un champ enregistre au clic sur « Sauvegarder » — les
 * catégories ou les étiquettes du tableau, qui ne sont pas la configuration
 * du widget. Rend de quoi le désinscrire. Nul hors du tiroir.
 */
export const EnregistrementsDuTiroirContext = createContext<
  ((enregistrement: Enregistrement) => () => void) | null
>(null);

/** La largeur du tiroir, quand le widget n'en demande pas d'autre (drawerSize). */
export const TIROIR_LARGEUR = 560;

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
  const [confirmDeleteOpened, setConfirmDeleteOpened] = useState(false);
  const [saving, setSaving] = useState(false);
  const [actions, setActions] = useState<HTMLDivElement | null>(null);
  const enregistrements = useRef(new Set<Enregistrement>());
  const inscrire = useCallback((enregistrement: Enregistrement) => {
    enregistrements.current.add(enregistrement);
    return () => {
      enregistrements.current.delete(enregistrement);
    };
  }, []);

  const widget = indicator ? widgetOf(indicator.type) : creating;

  useEffect(() => {
    if (!opened) return;
    setConfig(indicator?.config ?? creating?.defaultConfig ?? {});
    setSaving(false);
  }, [opened, indicator, creating]);

  // « Sauvegarder » : le seul geste qui écrit. Un widget inconnu n'a rien à
  // enregistrer : le tiroir se contente de se refermer.
  const sauvegarder = async () => {
    if (!widget) return onClose();
    setSaving(true);
    try {
      // Ce que les champs enregistrent eux-mêmes d'abord : une erreur arrête
      // tout, la configuration comprise.
      for (const enregistrer of enregistrements.current) await enregistrer();
      if (indicator) await api.update(indicator.id, { config });
      else if (sectionId !== null) {
        await api.create({ section_id: sectionId, type: widget.type, config });
      }
      await onSaved();
    } catch (e) {
      notifierErreur(messageErreur(e));
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
      notifierErreur(messageErreur(e));
    }
  };

  return (
    <>
      <Drawer
        opened={opened}
        onClose={onClose}
        position="right"
        size={widget?.drawerSize ?? TIROIR_LARGEUR}
        padding={DRAWER_PADDING}
        withCloseButton={false}
        // Seul le panneau de l'onglet défile : les onglets et les boutons du
        // bas restent en place, comme dans les autres tiroirs (DrawerScroll).
        styles={DRAWER_STYLES}
      >
        <Tabs defaultValue="settings" style={DRAWER_PANEL_STYLE} styles={DRAWER_TABS_STYLES}>
          <Tabs.List mb="md">
            <Tabs.Tab
              value="settings"
              leftSection={<IconSettings size={16} />}
              style={tabStyle(true)}
            >
              {widget?.label ?? "Paramètres"}
            </Tabs.Tab>
            <div ref={setActions} style={{ marginLeft: "auto", alignSelf: "center" }} />
          </Tabs.List>

          <Tabs.Panel value="settings" style={DRAWER_PANEL_STYLE}>
            <DrawerScrollArea>
              <Stack gap="xl">
                {widget &&
                  (widget.Config ? (
                    <ActionsDuTiroirContext.Provider value={actions}>
                      <EnregistrementsDuTiroirContext.Provider value={inscrire}>
                        <widget.Config config={config} onChange={setConfig} />
                      </EnregistrementsDuTiroirContext.Provider>
                    </ActionsDuTiroirContext.Provider>
                  ) : (
                    <ChampNom config={config} onChange={setConfig} defaut={widget.label} />
                  ))}
                {/* Le bloc « Apparence », commun à tous les widgets
                    (board-widgets). */}
                {widget?.Apparence && <widget.Apparence config={config} onChange={setConfig} />}
              </Stack>
            </DrawerScrollArea>
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
        title="Supprimer le widget"
        message={<>Voulez-vous vraiment supprimer ce widget ? Cette action est irréversible.</>}
      />
    </>
  );
}
