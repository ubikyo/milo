import {
  Box,
  Button,
  Checkbox,
  Group,
  Modal,
  ScrollArea,
  Stack,
  Tabs,
  Text,
  Title,
} from "@mantine/core";
import {
  IconApi,
  IconDatabaseExport,
  IconBrandWindows,
  IconLayoutNavbar,
  IconMail,
  IconPrinter,
  IconShieldLock,
  IconStack2,
  IconTopologyStar3,
} from "@tabler/icons-react";
import { notifications } from "@mantine/notifications";
import { useCallback, useEffect, useRef, useState } from "react";
import type { AdminPermissions, EntraStatus, PublicUser, Workspace } from "@milo/shared";
import { api } from "../../api";
import { errorMessage, notifyError } from "../../lib/errors";
import {
  SETTINGS_HEIGHT_MAX,
  SETTINGS_SCROLLBAR_STYLES,
  SETTINGS_WINDOW_HEIGHT,
  SETTINGS_WINDOW_WIDTH,
  modalHeaderStyles,
} from "../../themes/modals";
import { tabStyle } from "../../themes/tabs";
import { themeWindow } from "../../lib/themeWindow";
import { THEME_TAB_ATTRIBUTE } from "../theme/ThemeHighlight";
import classes from "../../assets/styles/SettingsModal.module.css";
import BackupTab from "./BackupTab";
import EntraTab from "./EntraTab";
import type { EntraCheckControls, EntraCheckPhase } from "./EntraTab";
import TemplatesTab from "./TemplatesTab";
import DisplayTab from "./DisplayTab";
import PrintersTab from "./PrintersTab";
import ProxiesTab from "./ProxiesTab";
import WorkspacesTab from "./WorkspacesTab";
import SettingsIntro from "./SettingsIntro";
import AdministrationTab from "./AdministrationTab";
import ApiTab from "./ApiTab";
import type { ComponentType, ReactNode } from "react";
import CloseButton from "../ui/CloseButton";
import Footer from "../ui/Footer";

const TABS: {
  value: string;
  label: string;
  icon: ComponentType<{ size?: number }>;
  /** Under the title. */
  description?: string;
}[] = [
  // At the very top: everything else depends on it.
  { value: "entra", label: "Entra", icon: IconBrandWindows },
  // The administration's rights: for the whole application.
  { value: "administration", label: "Administration", icon: IconShieldLock },
  { value: "workspaces", label: "Workspaces", icon: IconStack2 },
  {
    value: "templates",
    label: "Modèles",
    icon: IconMail,
    description:
      "Les modèles d’e-mail ci-dessous, au format MJML, sont communs à l’ensemble de l’application. Chaque widget dispose également de modèles spécifiques, modifiables depuis son interface de configuration.",
  },
  {
    value: "proxy",
    label: "Proxys",
    icon: IconTopologyStar3,
    description:
      "Les proxys Milo s’installent sur le réseau d’un site pour permettre à Milo, hébergé sur Internet, d’en joindre les périphériques — les imprimantes pour commencer. Chaque proxy se connecte à Milo en HTTPS avec son token, à coller dans /etc/milo.proxy.conf.",
  },
  {
    value: "printing",
    label: "Impression",
    icon: IconPrinter,
    description:
      "La liste ci-dessous définit les imprimantes Zebra connectées au réseau Ethernet et les formats d’étiquettes associés. Chacune est jointe directement par Milo, ou au travers d’un proxy.",
  },
  {
    value: "display",
    label: "Affichage",
    icon: IconLayoutNavbar,
    description: "Principaux paramètres d’affichage de l’application.",
  },
  {
    value: "api",
    label: "API",
    icon: IconApi,
    description:
      "Les tokens API permettent à des clients externes (agents connectés via MCP, scripts, etc.) d’accéder à Milo. Chaque token agit comme un compte de service dont les droits sont limités aux workspaces autorisés, sans accès aux paramètres d’administration.",
  },
  // The backup at the very bottom: it covers the whole database, not a setting.
  { value: "backup", label: "Sauvegarde", icon: IconDatabaseExport },
];

/** The tabs the "admin" account sees: it only sets up the application. */
const STANDALONE_TABS = new Set(["entra", "administration", "backup"]);

/**
 * The others' tabs, and the administration's right each one requires — on
 * top of "Gestion du paramétrage", which opens the Settings. Impression,
 * Affichage and API need nothing more. Neither is the "admin" account's
 * (STANDALONE_TABS): it only sets up the application.
 */
const TAB_RIGHTS: Record<string, (a: AdminPermissions) => boolean> = {
  workspaces: (a) => a.workspaces.includes("view"),
  administration: (a) => a.administration.includes("view"),
  templates: (a) => a.templates.includes("access"),
  printing: () => true,
  proxy: () => true,
  display: () => true,
  api: () => true,
};

/**
 * The tabs that require Entra connected: the administration is granted to
 * directory users and groups, and the backup only makes sense once the
 * application is set up.
 */
const WITH_ENTRA = new Set(["administration", "backup"]);

/**
 * The window's left inset ("Fenêtre" > "Padding"): the tabs' column takes it
 * in, its background reaching the edge (tabs.css), and it stands for
 * Mantine's single inset (--mb-padding).
 */
const PADDING_LEFT = "var(--milo-settings-window-padding-left)";

const MODAL_HEADER = {
  ...modalHeaderStyles(PADDING_LEFT),
  // Its header's inset, set apart ("Entête").
  header: {
    ...modalHeaderStyles(PADDING_LEFT).header,
    padding: "var(--milo-settings-header-padding)",
    paddingInlineEnd: "var(--milo-settings-header-padding-right)",
    // Mantine's 60 px at least: its height is only the padding's and the title's.
    minHeight: 0,
  },
  // Its inset, all windows' ("Fenêtre" > "Padding").
  body: { padding: "var(--milo-settings-window-padding)" },
};


/** The tabs' labels' width, set in the themes ("Onglets"). */
const TABS_WIDTH = "var(--milo-settings-tab-width)";

/** The window widens as much as the tabs do, from their 170 px. */
const WIDTH = SETTINGS_WINDOW_WIDTH;


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
  /** The tab it opens on, if visible: the first visible one otherwise. */
  initialTab?: string;
  /**
   * Entra is known to be connected — the first setup just checked it: the
   * tabs that need it show at once, without waiting for the Entra tab's check.
   */
  entraConnected?: boolean;
}

export default function SettingsModal({
  opened,
  onClose,
  standalone = false,
  canEdit,
  user,
  onUserChange,
  initialTab,
  entraConnected: knownConnected,
}: SettingsModalProps) {
  const management = user.workspace_rights.view;
  const [activeTab, setActiveTab] = useState<string | null>(null);
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
  // As long as Entra is not connected, only its settings are shown. The
  // Entra tab informs the modal of each connection check; "null" as long
  // as it has not said anything.
  const [entraConnected, setEntraConnected] = useState<boolean | null>(
    knownConnected ? true : null,
  );
  // Entra and the backup are the "admin" account's alone; the others sign in
  // through Microsoft: Entra is necessarily connected. Their tabs follow
  // their administration.
  const visible = (tab: string) =>
    standalone
      ? STANDALONE_TABS.has(tab) &&
        !(!canEdit && tab === "backup") &&
        (entraConnected === true || !WITH_ENTRA.has(tab))
      : user.settings.view && Boolean(TAB_RIGHTS[tab]?.(user.administration));
  // On each opening: the requested tab if it is visible, the first otherwise.
  const firstTab = TABS.find((t) => visible(t.value))?.value ?? null;
  useEffect(() => {
    if (opened) setActiveTab(initialTab && visible(initialTab) ? initialTab : firstTab);
    // Only on opening: the tab chosen afterwards stays.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opened]);
  // The "admin" account's requested tab may wait for Entra's connection
  // (WITH_ENTRA): it is opened once Entra is known to be connected.
  useEffect(() => {
    if (opened && standalone && entraConnected && initialTab && visible(initialTab)) {
      setActiveTab(initialTab);
    }
    // Only when the connection becomes known: the tab chosen afterwards stays.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entraConnected]);

  // Stable: the Entra tab calls it on each connection check.
  const followEntra = useCallback((status: EntraStatus | null) => {
    // While checking, the tabs stay as they are.
    if (!status) return;
    const connected = status.state === "connected";
    setEntraConnected(connected);
    // The open tab just disappeared: switch to Entra.
    if (!connected) setActiveTab((t) => (t && WITH_ENTRA.has(t) ? "entra" : t));
  }, []);
  /**
   * Only the Entra and Administration tabs have pending settings: the other
   * tabs save each action. "Enregistrer" calls the function each of them
   * deposits here; "Fermer" saves nothing.
   */
  const saveEntra = useRef<(() => Promise<boolean>) | null>(null);
  // Disconnected, the "admin" account's buttons give way to the connection
  // check, which the Entra tab runs.
  const entraCheck = useRef<EntraCheckControls | null>(null);
  const [checkPhase, setCheckPhase] = useState<EntraCheckPhase>("form");
  // "Se connecter" waits for a valid redirect address (Entra tab).
  const [redirectReady, setRedirectReady] = useState(false);
  // Nothing is saved, nor connected, while an Entra field is empty.
  const [entraComplete, setEntraComplete] = useState(true);
  const connecting = standalone && entraConnected === false;
  // Connected, nothing is saved without a sending address (Entra tab).
  const [sender, setSender] = useState<string | null>(null);
  const senderMissing = standalone && entraConnected === true && sender === "";
  const saveAdministration = useRef<(() => Promise<boolean>) | null>(null);
  const [registration, setSaving] = useState(false);
  // The Administration tab's "Envoyer une confirmation par e-Mail": checked on each opening.
  const [invite, setInvite] = useState(true);
  useEffect(() => {
    if (opened) setInvite(true);
  }, [opened]);

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
    notifications.show({ color: "teal", message: "Paramétrage enregistré." });
    if (!standalone) onClose();
  };

  // The Entra panel's header carries its "Actions" menu, to the right of
  // the title: the tab renders it there through a portal.
  const [entraActions, setEntraActions] = useState<HTMLDivElement | null>(null);

  const panel = (
    value: string,
    children: ReactNode,
    actionsRef?: (el: HTMLDivElement | null) => void,
  ) => {
    const tab = TABS.find((t) => t.value === value);
    const description = tab?.description;
    return visible(value) && (
      <Tabs.Panel
        value={value}
        style={{
          flex: 1,
          minHeight: 0,
          display: "flex",
          flexDirection: "column",
        }}
      >
        {/* Spaced by margins rather than a gap: the one under the
            description is the themes' ("Description" > "Marge basse"). */}
        <Stack gap={0} style={{ flex: 1, minHeight: 0 }}>
          <Group
            justify="space-between"
            align="center"
            wrap="nowrap"
            mb="var(--milo-settings-title-margin-bottom)"
          >
            <Title
              order={4}
              c="var(--milo-settings-title-text)"
              size="var(--milo-settings-title-size)"
              fw="var(--milo-settings-title-weight)"
            >
              {tab?.label}
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
          {description && (
            <SettingsIntro mt={-8}>{description}</SettingsIntro>
          )}
          {/* "auto": the bar only appears if the tab overflows. */}
          <ScrollArea
            type="auto"
            scrollbarSize="var(--milo-settings-scrollbar-width)"
            styles={SETTINGS_SCROLLBAR_STYLES}
            classNames={{ scrollbar: classes.scrollbar }}
            style={{ flex: 1, minHeight: 0 }}
          >
            {children}
          </ScrollArea>
        </Stack>
      </Tabs.Panel>
    );
  };

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
      size={WIDTH}
      padding={PADDING_LEFT}
      withCloseButton={false}
      // Its colors and sizes are its own (theme editor): its rules give them
      // to the windows' header and tabs.
      classNames={{ content: classes.window }}
      attributes={themeWindow("settings")}
      styles={{
        ...MODAL_HEADER,
        content: {
          backgroundColor: "var(--milo-settings-bg)",
          // The windows' ("Fenêtre" > "Hauteur") — its own when checked
          // beside it: its content's ("auto"), or set. The "admin"
          // account's is fixed: 800px.
          height: standalone ? 800 : SETTINGS_WINDOW_HEIGHT,
          maxHeight: SETTINGS_HEIGHT_MAX,
          display: "flex",
          flexDirection: "column",
          // Anchor for the moved scrollbar
          position: "relative",
        },
        // Its four-side inset, plus the body's layout.
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
        {/* The tabs' width, plus the window's inset their background takes
            in (tabs.css). */}
        <Tabs.List style={{ width: `calc(${TABS_WIDTH} + ${PADDING_LEFT})`, flexShrink: 0 }}>
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

        {/* The panels, then the buttons under them: the tabs' column runs
            down to the window's bottom (tabs.css). */}
        {/* Its padding, set in the themes ("Onglets" > "Padding du contenu"). */}
        <Box
          p="var(--milo-settings-panel-padding)"
          style={{ flex: 1, minWidth: 0, minHeight: 0, display: "flex", flexDirection: "column" }}
        >
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
              rights={user.administration}
              invite={invite}
              saveRef={saveAdministration}
              onChange={() => void reloadAccount()}
            />,
          )}

          {panel(
            "entra",
            <EntraTab
              saveRef={saveEntra}
              actionsTarget={entraActions}
              onStatus={followEntra}
              onSender={setSender}
              checkRef={entraCheck}
              onPhase={setCheckPhase}
              onRedirectReady={setRedirectReady}
              onComplete={setEntraComplete}
            />,
            setEntraActions,
          )}

          {panel("backup", <BackupTab />)}

          {panel("api", <ApiTab canEdit={canEdit} workspaces={user.workspaces} />)}

          {panel("templates", <TemplatesTab canEdit={canEdit} />)}

          {panel("printing", <PrintersTab canEdit={canEdit} />)}

          {panel("proxy", <ProxiesTab canEdit={canEdit} />)}

          {panel(
            "display",
            <DisplayTab
              canEdit={canEdit}
              canEditThemes={canEdit && user.administration.themes.includes("access")}
            />,
          )}

          <Footer>
            {!canEdit && user.settings.view && (
              <Text size="sm" c="dimmed" mr="auto">
                Consultation seule : votre rôle ne permet pas de modifier le
                Paramétrage.
              </Text>
            )}
            {/* Whoever is just added to the administration receives the "Nouvel
                administrateur" e-mail — each user of a group. Kept in the
                page, hidden, on the other tabs: the theme editor finds it
                there, and opens its tab (THEME_TAB_ATTRIBUTE). */}
            {canEdit && user.administration.administration.includes("create") && (
              <Checkbox
                label="Envoyer une confirmation par e-Mail"
                checked={invite}
                onChange={(e) => setInvite(e.currentTarget.checked)}
                color="teal"
                mr="auto"
                display={activeTab === "administration" ? undefined : "none"}
                wrapperProps={{ [THEME_TAB_ATTRIBUTE]: "administration" }}
              />
            )}
            {connecting ? (
              <>
                {checkPhase === "failed" && (
                  <CloseButton onClick={() => entraCheck.current?.back()}>Retour</CloseButton>
                )}
                {checkPhase === "passed" ? (
                  <Button color="teal" onClick={() => entraCheck.current?.next()}>
                    Suivant
                  </Button>
                ) : redirectReady ? (
                  <Button
                    color="teal"
                    onClick={() => entraCheck.current?.connect()}
                    loading={checkPhase === "checking"}
                    disabled={!entraComplete}
                  >
                    Se connecter
                  </Button>
                ) : null}
              </>
            ) : (
              <>
                <CloseButton onClick={onClose}>
                  {standalone ? "Se déconnecter" : "Fermer"}
                </CloseButton>
                {canEdit && (
                  <Button
                    color="teal"
                    onClick={save}
                    loading={registration}
                    disabled={senderMissing || !entraComplete}
                  >
                    Enregistrer
                  </Button>
                )}
              </>
            )}
          </Footer>
        </Box>
      </Tabs>
    </Modal>
  );
}
