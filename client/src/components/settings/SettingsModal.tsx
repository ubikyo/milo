import {
  Button,
  Group,
  Modal,
  ScrollArea,
  Stack,
  Tabs,
  Text,
  Title,
} from "@mantine/core";
import {
  IconBell,
  IconDatabaseExport,
  IconBrandWindows,
  IconLayoutNavbar,
  IconShieldLock,
  IconStack2,
} from "@tabler/icons-react";
import { useCallback, useEffect, useRef, useState } from "react";
import type { EntraSettings, PublicUser, Workspace } from "@milo/shared";
import { api } from "../../api";
import { errorMessage, notifyError } from "../../lib/errors";
import {
  SETTINGS_HEIGHT_MAX,
  SETTINGS_HEIGHT,
  SETTINGS_WIDTH,
  SETTINGS_PADDING,
  modalHeaderStyles,
} from "../../themes/modals";
import { tabStyle } from "../../themes/tabs";
import BackupTab from "./BackupTab";
import EntraTab from "./EntraTab";
import NotificationsTab from "./NotificationsTab";
import DisplayTab from "./DisplayTab";
import WorkspacesTab from "./WorkspacesTab";
import AdministrationTab from "./AdministrationTab";
import type { ComponentType, ReactNode } from "react";
import CloseButton from "../ui/CloseButton";

const TABS: {
  value: string;
  label: string;
  icon: ComponentType<{ size?: number }>;
}[] = [
  { value: "workspaces", label: "Workspaces", icon: IconStack2 },
  // Settings ("Paramétrage") and workspace management: for the whole application.
  { value: "administration", label: "Administration", icon: IconShieldLock },
  { value: "entra", label: "Entra", icon: IconBrandWindows },
  { value: "notifications", label: "Notifications", icon: IconBell },
  { value: "display", label: "Affichage", icon: IconLayoutNavbar },
  // The backup at the very bottom: it covers the whole database, not a setting.
  { value: "backup", label: "Sauvegarde", icon: IconDatabaseExport },
];

/**
 * The tabs that require Entra: workspace access and the administration are
 * granted to directory users and groups.
 */
const WITH_ENTRA = new Set(["workspaces", "administration"]);


/** Entra is configured: the application is registered (ID, directory, secret). */
const entraConfigured = (r: EntraSettings) =>
  Boolean(r.client_id && r.tenant && r.has_secret);

const MODAL_HEADER = modalHeaderStyles(40);

/**
 * A panel's scrollbar, moved to the modal's right border and spanning its
 * full height. Same principle as the projects list (ProjectTable), except
 * that it anchors to the modal and not to the screen: it is "content" that
 * carries the reference (position: relative).
 *
 * Left in place, it would straddle the panel's 40 px padding and jump from
 * one tab to another depending on what each contains. The panel therefore
 * keeps its full width — the bar is out of the flow — and the content does
 * not shift when it appears.
 */
const SCROLLBAR_STYLES = {
  root: { position: "static" as const },
  scrollbar: {
    position: "absolute" as const,
    top: 0,
    bottom: 0,
    right: 0,
    left: "auto",
    height: "auto",
    width: "var(--scrollarea-scrollbar-size)",
  },
};

interface SettingsModalProps {
  opened: boolean;
  onClose: () => void;
  /**
   * The "admin" account only sees Settings: the modal cannot be closed,
   * its button signs out, and saving leaves it open.
   */
  standalone?: boolean;
  /**
   * The "Modifier" right on Settings. Without it, the modal is read-only:
   * no saving, no backup — the archive covers the whole database.
   */
  canEdit: boolean;
  /**
   * The account: its Settings ("Voir"), its workspace, and workspace
   * management, which opens their tab and each one's access.
   */
  user: PublicUser;
  /** The account re-read, after a workspace change: the selector offers them. */
  onUserChange?: (user: PublicUser) => void;
}

export default function SettingsModal({
  opened,
  onClose,
  standalone = false,
  canEdit,
  user,
  onUserChange,
}: SettingsModalProps) {
  // "Voir" on workspaces opens their tab; without it, the modal opens on
  // Entra.
  const management = user.workspace_rights.view;
  const [activeTab, setActiveTab] = useState<string | null>(management ? "workspaces" : "entra");
  // All workspaces, for whoever manages them: their tab, and the choice of
  // the one whose access is being set.
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  // The account re-read: its workspaces — those of the selector — and its
  // rights follow the workspaces, their access and the administration.
  const reloadAccount = useCallback(async () => {
    try {
      if (onUserChange) onUserChange(await api.me());
    } catch (e) {
      notifyError(errorMessage(e));
    }
  }, [onUserChange]);
  const reloadWorkspaces = useCallback(async () => {
    try {
      setWorkspaces(await api.getWorkspaces());
    } catch (e) {
      notifyError(errorMessage(e));
    }
    await reloadAccount();
  }, [reloadAccount]);
  useEffect(() => {
    if (opened && management) void api.getWorkspaces().then(setWorkspaces, () => undefined);
  }, [opened, management]);
  // As long as Entra is not configured, only its settings and the backup
  // are shown. The Entra tab informs the modal on each read and each
  // save; "null" as long as it has not said anything.
  const [entraReady, setEntraReady] = useState<boolean | null>(null);
  // Whoever manages workspaces without seeing Settings only gets their tab;
  // they sign in through Microsoft: Entra is necessarily configured.
  const visible = (tab: string) =>
    (tab === "workspaces" ? management : true) &&
    (user.settings.view || tab === "workspaces") &&
    !(!canEdit && tab === "backup") &&
    (entraReady === true || !WITH_ENTRA.has(tab) || !user.settings.view);

  // Stable: the Entra tab uses it when reading the settings.
  const followEntra = useCallback((settings: EntraSettings) => {
    const ready = entraConfigured(settings);
    setEntraReady(ready);
    // The open tab just disappeared: switch to Entra.
    if (!ready) setActiveTab((t) => (t && WITH_ENTRA.has(t) ? "entra" : t));
  }, []);
  /**
   * Only the Entra and Administration tabs have pending settings: the other
   * tabs save each action. "Enregistrer" calls the function each of them
   * deposits here; "Fermer" saves nothing.
   */
  const saveEntra = useRef<(() => Promise<boolean>) | null>(null);
  const saveAdministration = useRef<(() => Promise<boolean>) | null>(null);
  const [registration, setSaving] = useState(false);

  // Saves then closes; a server refusal keeps the modal open, with its
  // message in the relevant tab.
  const save = async () => {
    setSaving(true);
    try {
      if ((await saveEntra.current?.()) === false) {
        setActiveTab("entra");
        return;
      }
      if ((await saveAdministration.current?.()) === false) {
        setActiveTab("administration");
        return;
      }
    } finally {
      setSaving(false);
    }
    if (!standalone) onClose();
  };

  // The Entra panel's header carries its "Actions" menu, to the right of
  // the title: the tab renders it there through a portal.
  const [entraActions, setEntraActions] = useState<HTMLDivElement | null>(null);

  const panel = (
    value: string,
    children: ReactNode,
    actionsRef?: (el: HTMLDivElement | null) => void,
  ) =>
    visible(value) && (
      <Tabs.Panel
        value={value}
        pl="xl"
        style={{
          flex: 1,
          minHeight: 0,
          display: "flex",
          flexDirection: "column",
        }}
      >
        <Stack gap="md" style={{ flex: 1, minHeight: 0 }}>
          <Group justify="space-between" align="center" wrap="nowrap">
            <Title order={4}>
              {TABS.find((t) => t.value === value)?.label}
            </Title>
            {/* Without a height, the menu centered on the row: taller than the
              title, it would enlarge the header and shift the panel relative
              to the other tabs. */}
            {actionsRef && (
              <div
                ref={actionsRef}
                style={{ height: 0, display: "flex", alignItems: "center" }}
              />
            )}
          </Group>
          {/* "auto": the bar only appears if the tab overflows. */}
          <ScrollArea
            type="auto"
            scrollbarSize={2}
            styles={SCROLLBAR_STYLES}
            style={{ flex: 1, minHeight: 0 }}
          >
            {children}
          </ScrollArea>
        </Stack>
      </Tabs.Panel>
    );

  return (
    <Modal
      opened={opened}
      // Escape and the backdrop go through here: like "Fermer", without
      // saving. For the "admin" account, the modal is the whole screen:
      // it can only be closed by signing out.
      onClose={onClose}
      closeOnEscape={!standalone}
      closeOnClickOutside={!standalone}
      title="Paramétrage"
      // In the middle of the screen, like the other modals.
      centered
      size={SETTINGS_WIDTH}
      padding={SETTINGS_PADDING}
      withCloseButton={false}
      styles={{
        ...MODAL_HEADER,
        content: {
          height: SETTINGS_HEIGHT,
          maxHeight: SETTINGS_HEIGHT_MAX,
          display: "flex",
          flexDirection: "column",
          // Anchor for the moved scrollbar (see ListItems)
          position: "relative",
        },
        // The common header's top padding, plus the body's layout.
        body: {
          ...MODAL_HEADER.body,
          flex: 1,
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        },
      }}
    >
      <Tabs
        value={activeTab}
        onChange={setActiveTab}
        orientation="vertical"
        // Hidden tabs stay mounted and active: in "activity" mode
        // (the default), their effects stop, and the messaging tab could
        // no longer deposit its save function.
        keepMountedMode="display-none"
        style={{ flex: 1, minHeight: 0 }}
      >
        <Tabs.List style={{ width: 170, flexShrink: 0 }}>
          {TABS.filter((t) => visible(t.value)).map(
            ({ value, label, icon: Icon }) => (
              <Tabs.Tab
                key={value}
                value={value}
                leftSection={<Icon size={16} />}
                style={tabStyle(activeTab === value)}
              >
                {label}
              </Tabs.Tab>
            ),
          )}
        </Tabs.List>

        {panel(
          "workspaces",
          <WorkspacesTab
            rights={user.workspace_rights}
            workspaces={workspaces}
            onChanged={reloadWorkspaces}
            onAccessChanged={() => void reloadAccount()}
          />,
        )}

        {panel(
          "administration",
          <AdministrationTab
            workspaceRights={user.workspace_rights}
            saveRef={saveAdministration}
            onChange={() => void reloadAccount()}
          />,
        )}

        {panel(
          "entra",
          <EntraTab
            saveRef={saveEntra}
            actionsTarget={entraActions}
            onSettings={followEntra}
          />,
          setEntraActions,
        )}

        {panel("backup", <BackupTab />)}

        {panel("notifications", <NotificationsTab canEdit={canEdit} />)}

        {panel("display", <DisplayTab canEdit={canEdit} />)}
      </Tabs>

      <Group justify="flex-end" mt={40}>
        {!canEdit && user.settings.view && (
          <Text size="sm" c="dimmed" mr="auto">
            Consultation seule : votre rôle ne permet pas de modifier le
            Paramétrage.
          </Text>
        )}
        <CloseButton onClick={onClose}>
          {standalone ? "Déconnexion" : "Fermer"}
        </CloseButton>
        {canEdit && (
          <Button color="teal" onClick={save} loading={registration}>
            Enregistrer
          </Button>
        )}
      </Group>
    </Modal>
  );
}
