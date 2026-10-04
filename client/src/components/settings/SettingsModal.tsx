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
  IconCode,
  IconDatabaseExport,
  IconDeviceLaptop,
  IconBrandWindows,
  IconHeadset,
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
import DeveloperTab from "./DeveloperTab";
import NotificationsTab from "./NotificationsTab";
import SupportTab from "./SupportTab";
import AssetsTab from "./AssetsTab";
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
  // Le Paramétrage et la gestion des workspaces : pour toute l'application.
  { value: "administration", label: "Administration", icon: IconShieldLock },
  { value: "entra", label: "Entra", icon: IconBrandWindows },
  { value: "notifications", label: "Notifications", icon: IconBell },
  { value: "developer", label: "Développeur", icon: IconCode },
  // Les réglages propres à un mode : le Support, les Assets.
  { value: "support", label: "Support", icon: IconHeadset },
  { value: "assets", label: "Assets", icon: IconDeviceLaptop },
  // La sauvegarde tout en bas : elle porte toute la base, pas un réglage.
  { value: "backup", label: "Sauvegarde", icon: IconDatabaseExport },
];

/**
 * Les onglets qui supposent Entra : les accès des workspaces et
 * l'administration se donnent à des utilisateurs et des groupes de
 * l'annuaire.
 */
const WITH_ENTRA = new Set(["workspaces", "administration"]);

/** Les onglets que le compte « admin » ne voit pas. */
const WITHOUT_ADMIN = new Set(["developer", "support", "assets"]);


/** Entra est configuré : l'application renseignée (identifiant, annuaire, secret). */
const entraConfigured = (r: EntraSettings) =>
  Boolean(r.client_id && r.tenant && r.has_secret);

const MODAL_HEADER = modalHeaderStyles(40);

/**
 * La barre de défilement d'un panneau, déportée sur la bordure droite de la
 * fenêtre et sur toute sa hauteur. Même principe que la liste des projets
 * (ProjectsPage), à ceci près qu'elle se cale sur la fenêtre et non sur
 * l'écran : c'est « content » qui porte le repère (position: relative).
 *
 * Laissée à sa place, elle serait à cheval sur le retrait de 40 px du panneau
 * et sauterait d'un onglet à l'autre selon ce que chacun contient. Le panneau
 * garde donc toute sa largeur — la barre est hors du flux — et le contenu ne
 * se décale pas quand elle apparaît.
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
   * Le compte « admin » ne voit que le Paramétrage : la fenêtre ne se ferme
   * pas, son bouton déconnecte, et l'enregistrement la laisse ouverte.
   */
  standalone?: boolean;
  /**
   * Le droit « Modifier » du Paramétrage. Sans lui, la fenêtre se consulte :
   * pas d'enregistrement, pas de sauvegarde — l'archive porte toute la base.
   */
  canEdit: boolean;
  /** Debug (onglet Développeur) : la sélection et le menu du navigateur reviennent. */
  debug: boolean;
  onDebugChange: (debug: boolean) => void;
  /**
   * Le compte : son Paramétrage (« Voir »), son workspace, et la gestion des
   * workspaces, qui ouvre leur onglet et les accès de chacun.
   */
  user: PublicUser;
  /** Le compte relu, après un changement des workspaces : le sélecteur les propose. */
  onUserChange?: (user: PublicUser) => void;
}

export default function SettingsModal({
  opened,
  onClose,
  standalone = false,
  canEdit,
  debug,
  onDebugChange,
  user,
  onUserChange,
}: SettingsModalProps) {
  const management = user.manage_workspaces;
  // Sans la gestion des workspaces, leur onglet n'est pas là : on ouvre sur
  // Entra.
  const [activeTab, setActiveTab] = useState<string | null>(management ? "workspaces" : "entra");
  // Tous les workspaces, pour qui les gère : leur onglet, et le choix de
  // celui dont on règle les accès.
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  // Le compte relu : ses workspaces — ceux du sélecteur — et ses droits
  // suivent les workspaces, leurs accès et l'administration.
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
  // Tant qu'Entra n'est pas configuré, seuls ses réglages et la sauvegarde
  // se montrent. L'onglet Entra en informe la fenêtre à chaque lecture et à
  // chaque enregistrement ; « null » tant qu'il n'a rien dit.
  const [entraReady, setEntraReady] = useState<boolean | null>(null);
  // Le Support et les Assets touchent au travail des modes, et l'onglet
  // Développeur à celui des personnes : pas au paramétrage de l'application.
  // Le compte « admin » ne les voit pas (SANS_ADMIN).
  // Qui gère les workspaces sans voir le Paramétrage n'a que leur onglet ;
  // il se connecte par Microsoft : Entra est forcément configuré.
  const visible = (tab: string) =>
    (tab === "workspaces" ? management : true) &&
    (user.settings.view || tab === "workspaces") &&
    !(standalone && WITHOUT_ADMIN.has(tab)) &&
    !(!canEdit && tab === "backup") &&
    (entraReady === true || !WITH_ENTRA.has(tab) || !user.settings.view);

  // Stable : l'onglet Entra s'en sert dans sa lecture des réglages.
  const followEntra = useCallback((settings: EntraSettings) => {
    const ready = entraConfigured(settings);
    setEntraReady(ready);
    // L'onglet ouvert vient de disparaître : on passe sur Entra.
    if (!ready) setActiveTab((t) => (t && WITH_ENTRA.has(t) ? "entra" : t));
  }, []);
  /**
   * Seul l'onglet Entra a des réglages en attente : les autres onglets
   * enregistrent chaque geste. « Enregistrer » appelle la fonction que
   * l'onglet dépose ici ; « Fermer » n'enregistre rien.
   */
  const saveEntra = useRef<(() => Promise<boolean>) | null>(null);
  const [registration, setSaving] = useState(false);

  // Enregistre puis referme ; un refus du serveur garde la fenêtre ouverte,
  // avec son message dans l'onglet concerné.
  const save = async () => {
    setSaving(true);
    try {
      if ((await saveEntra.current?.()) === false) {
        setActiveTab("entra");
        return;
      }
    } finally {
      setSaving(false);
    }
    if (!standalone) onClose();
  };

  // L'entête du panneau Entra porte son menu « Actions », à droite du
  // titre : l'onglet l'y rend par un portail.
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
            {/* Sans hauteur, le menu centré sur la ligne : plus haut que le
              titre, il agrandirait l'entête et décalerait le panneau par
              rapport aux autres onglets. */}
            {actionsRef && (
              <div
                ref={actionsRef}
                style={{ height: 0, display: "flex", alignItems: "center" }}
              />
            )}
          </Group>
          {/* « auto » : la barre ne paraît que si l'onglet déborde. */}
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
      // Échap et l'arrière-plan passent par là : comme « Fermer », sans
      // enregistrer. Pour le compte « admin », la fenêtre est tout l'écran :
      // elle ne se ferme que par la déconnexion.
      onClose={onClose}
      closeOnEscape={!standalone}
      closeOnClickOutside={!standalone}
      title="Paramétrage"
      // Au milieu de l'écran, comme les autres fenêtres.
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
          // Repère pour la barre de défilement déportée (voir ListItems)
          position: "relative",
        },
        // Le retrait haut de l'entête commun, plus la mise en page du corps.
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
        // Les onglets masqués restent montés et actifs : en mode « activity »
        // (celui par défaut), leurs effets s'arrêtent, et la messagerie ne
        // pourrait plus déposer sa fonction d'enregistrement.
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
            workspaces={workspaces}
            onChanged={reloadWorkspaces}
            onAccessChanged={() => void reloadAccount()}
          />,
        )}

        {panel(
          "administration",
          <AdministrationTab
            canManageWorkspaces={management}
            onChange={() => void reloadAccount()}
          />,
        )}

        {panel("support", <SupportTab canEdit={canEdit} />)}

        {panel("assets", <AssetsTab />)}

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

        {panel(
          "developer",
          <DeveloperTab debug={debug} onDebugChange={onDebugChange} canEdit={canEdit} />,
        )}
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
