import { Drawer, Group, Stack, Tabs } from "@mantine/core";
import { IconSettings } from "@tabler/icons-react";
import { createContext, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { NameField } from "../../widgets/support/common";
import { errorMessage, notifyError } from "../../lib/errors";
import { LabelGroupDraftsContext } from "../../lib/label-groups";
import { tabStyle } from "../../themes/tabs";
import DeleteConfirmModal from "./DeleteConfirmModal";
import DrawerFooter from "./DrawerFooter";
import DrawerScrollArea, {
  DRAWER_PADDING,
  DRAWER_PANEL_STYLE,
  DRAWER_STYLES,
  DRAWER_TABS_STYLES,
} from "./DrawerScroll";
import type { Indicator, IndicatorWidgetBase, IndicatorsApi } from "./IndicatorsPanel";
import { widgetReference } from "@milo/shared";
import type { Id, LabelGroup, LabelsBase } from "@milo/shared";
import { ReferenceTag } from "./ReferenceTag";
import type { IndicatorConfigProps } from "../../widgets/support/types";
import { rememberDeletion } from "../../lib/undo";

/**
 * The location of a widget's "Actions" menu, at the end of the drawer's tab row
 * — where the other screens put theirs (ModeBar). The widget's fields carry
 * their menu there (createPortal); null until it is mounted.
 */
export const DrawerActionsContext = createContext<HTMLElement | null>(null);

/**
 * What a drawer field saves itself, on click of "Sauvegarder". It may return a
 * change to the configuration, applied before it is saved: the ids of the
 * label groups it has just created (remapGroups).
 */
export type Registration = () => Promise<void | ConfigChange>;
type ConfigChange = (config: Record<string, unknown>) => Record<string, unknown>;

/**
 * Registers what a field saves on click of "Sauvegarder" — the board's
 * categories or labels, which are not the widget's configuration. Returns a way
 * to unregister it. Null outside the drawer.
 */
export const DrawerRegistrationsContext = createContext<
  ((registration: Registration) => () => void) | null
>(null);

/** The drawer's width, when the widget asks for no other (drawerSize). */
export const DRAWER_WIDTH = 560;

// The drawer of an indicator in a statistics panel — Support or Assets. Its
// shell is that of Access mode's items (AccessBlockDrawer); its fields belong
// to the widget. A new indicator only exists once saved: giving up leaves
// nothing behind.
interface IndicatorDrawerProps<Type extends string, P extends IndicatorWidgetBase<Type>> {
  opened: boolean;
  onClose: () => void;
  /** The indicator being edited, or "null" to create one of the "creating" widget. */
  indicator: Indicator<Type> | null;
  creating: P | null;
  /** The section that receives the created indicator. */
  sectionId: Id | null;
  widgetOf: (type: Type) => P | undefined;
  api: IndicatorsApi<Type>;
  onSaved: () => void | Promise<void>;
  /** The types around the widget in its section: its usual margins depend on them. */
  neighbors?: IndicatorConfigProps["neighbors"];
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
  neighbors,
}: IndicatorDrawerProps<Type, P>) {
  const [config, setConfig] = useState<Record<string, unknown>>({});
  const [confirmDeleteOpened, setConfirmDeleteOpened] = useState(false);
  const [saving, setSaving] = useState(false);
  const [actions, setActions] = useState<HTMLDivElement | null>(null);
  const registrations = useRef(new Set<Registration>());
  /** The label groups being edited, by kind: the group choices follow them. */
  const [labelDrafts, setLabelDrafts] = useState<Partial<Record<LabelsBase, LabelGroup[]>>>({});
  const publishLabelDraft = useCallback((base: LabelsBase, groups: LabelGroup[] | null) =>
    setLabelDrafts((before) => {
      const next = { ...before };
      if (groups) next[base] = groups;
      else delete next[base];
      return next;
    }), []);
  const labelGroupDrafts = useMemo(
    () => ({ drafts: labelDrafts, publish: publishLabelDraft }),
    [labelDrafts, publishLabelDraft],
  );
  const register = useCallback((registration: Registration) => {
    registrations.current.add(registration);
    return () => {
      registrations.current.delete(registration);
    };
  }, []);

  const widget = indicator ? widgetOf(indicator.type) : creating;
  // The identifier of a widget that owns its key — the lists, the calendar,
  // the mail —, once saved.
  const reference = indicator ? widgetReference(indicator.type, indicator.config) : "";

  useEffect(() => {
    if (!opened) return;
    setConfig(indicator?.config ?? creating?.defaultConfig ?? {});
    setSaving(false);
  }, [opened, indicator, creating]);

  // "Sauvegarder": the only action that writes. An unknown widget has nothing
  // to save: the drawer just closes.
  const persist = async () => {
    if (!widget) return onClose();
    setSaving(true);
    try {
      // What the fields save themselves comes first: an error stops everything,
      // the configuration included.
      let saved = config;
      for (const save of registrations.current) {
        const change = await save();
        if (change) saved = change(saved);
      }
      if (saved !== config) setConfig(saved);
      if (indicator) await api.update(indicator.id, { config: saved });
      else if (sectionId !== null) {
        await api.create({ section_id: sectionId, type: widget.type, config: saved });
      }
      await onSaved();
    } catch (e) {
      notifyError(errorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    setConfirmDeleteOpened(false);
    if (!indicator) return;
    try {
      rememberDeletion(await api.remove(indicator.id), "Widget supprimé", { reload: onSaved });
      await onSaved();
    } catch (e) {
      notifyError(errorMessage(e));
    }
  };

  return (
    <>
      <Drawer
        opened={opened}
        onClose={onClose}
        position="right"
        size={widget?.drawerSize ?? DRAWER_WIDTH}
        padding={DRAWER_PADDING}
        withCloseButton={false}
        // Only the open tab's panel scrolls: the tabs and the bottom buttons
        // stay in place, as in the other drawers (DrawerScroll).
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
            {/* At the end of the row: the widget's "Actions" menu, then its identifier. */}
            <Group gap={8} wrap="nowrap" style={{ marginLeft: "auto", alignSelf: "center" }}>
              <div ref={setActions} />
              {reference && <ReferenceTag reference={reference} template="#WWWW" neutral copyable />}
            </Group>
          </Tabs.List>

          <Tabs.Panel value="settings" style={DRAWER_PANEL_STYLE}>
            <DrawerScrollArea>
              <Stack gap="xl">
                {widget &&
                  (widget.Config ? (
                    <DrawerActionsContext.Provider value={actions}>
                      <DrawerRegistrationsContext.Provider value={register}>
                        <LabelGroupDraftsContext.Provider value={labelGroupDrafts}>
                          <widget.Config config={config} onChange={setConfig} neighbors={neighbors} />
                        </LabelGroupDraftsContext.Provider>
                      </DrawerRegistrationsContext.Provider>
                    </DrawerActionsContext.Provider>
                  ) : (
                    <NameField config={config} onChange={setConfig} defaultValue={widget.label} />
                  ))}
                {/* The "Apparence" block, common to all widgets
                    (board-widgets). */}
                {widget?.Appearance && (
                  <widget.Appearance config={config} onChange={setConfig} neighbors={neighbors} />
                )}
              </Stack>
            </DrawerScrollArea>
          </Tabs.Panel>
        </Tabs>

        <DrawerFooter
          onSave={persist}
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
