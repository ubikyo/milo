import {
  Button,
  Group,
  Modal,
  ScrollArea,
  Select,
  Stack,
  Tabs,
  Text,
  Title,
  useMantineColorScheme,
} from "@mantine/core";
import {
  IconAdjustments,
  IconBuilding,
  IconDatabaseExport,
  IconDeviceDesktop,
  IconMail,
  IconMoon,
  IconSun,
  IconUsers,
} from "@tabler/icons-react";
import { useRef, useState } from "react";
import { api } from "../../api";
import { modalHeaderStyles } from "../../themes/modals";
import { DEFAULT_MODE, MODES } from "@milo/shared";
import { tabStyle } from "../../themes/tabs";
import BackupTab from "./BackupTab";
import ErrorAlert from "../ui/ErrorAlert";
import LookupManager from "../ui/LookupManager";
import MailTab from "./MailTab";
import UsersTab from "./UsersTab";
import { messageErreur } from "../../lib/errors";
import type { Company, Mode, PublicUser } from "@milo/shared";
import type { ComponentType, ReactNode } from "react";

type Scheme = "auto" | "light" | "dark";

interface SchemeOption {
  value: Scheme;
  label: string;
  icon: ComponentType<{ size?: number }>;
}

const SCHEME_OPTIONS: SchemeOption[] = [
  { value: "auto", label: "System", icon: IconDeviceDesktop },
  { value: "light", label: "Clair", icon: IconSun },
  { value: "dark", label: "Sombre", icon: IconMoon },
];

// Les options d'un Select ne portent que du texte : l'icône est retrouvée par
// la valeur, pour la liste déroulante comme pour le champ fermé.
/**
 * L'icône d'un thème. Déclarée au niveau du module : affectée à une variable
 * dans le corps d'un composant, React y verrait un nouveau type de composant à
 * chaque rendu et remonterait son sous-arbre à chaque fois.
 */
function SchemeIcon({ value, size = 16 }: { value: string; size?: number }) {
  const Icon = SCHEME_OPTIONS.find((o) => o.value === value)?.icon ?? IconDeviceDesktop;
  return <Icon size={size} />;
}

// Largeur du libellé : les champs de l'onglet s'alignent sur la même colonne.
const LABEL_WIDTH = 120;

// Le libellé est posé à gauche du champ, et non au-dessus comme les libellés
// de Mantine : les réglages de l'onglet partagent le même alignement.
interface GeneralTabProps {
  user: PublicUser | null;
  onUserUpdated?: (user: PublicUser) => void;
}

function GeneralTab({ user, onUserUpdated }: GeneralTabProps) {
  const { colorScheme, setColorScheme } = useMantineColorScheme();

  // Le mode d'ouverture appartient au compte : il part au serveur dès le choix
  // fait. Le champ répond tout de suite et revient en arrière si le serveur
  // refuse.
  const [mode, setMode] = useState<Mode>(user?.default_mode ?? DEFAULT_MODE);
  const [error, setError] = useState<string | null>(null);

  const changeMode = async (value: string | null) => {
    if (!value || value === mode) return;
    const precedent = mode;
    const suivant = value as Mode;
    setMode(suivant);
    setError(null);
    try {
      const enregistre = await api.updateMe({ default_mode: suivant });
      onUserUpdated?.(enregistre);
    } catch (e) {
      setMode(precedent);
      setError(messageErreur(e));
    }
  };

  return (
    <Stack gap="md">
      {error && <ErrorAlert onClose={() => setError(null)}>{error}</ErrorAlert>}

      <Group gap="md" wrap="nowrap" align="center">
        <Text size="sm" fw={500} w={LABEL_WIDTH}>
          Mode par défaut
        </Text>
        <Select
          aria-label="Mode par défaut"
          data={MODES.map((m) => ({ value: m.value, label: m.label }))}
          value={mode}
          onChange={changeMode}
          allowDeselect={false}
          w={200}
        />
      </Group>

      <Group gap="md" wrap="nowrap" align="center">
        <Text size="sm" fw={500} w={LABEL_WIDTH}>
          Thème
        </Text>
        <Select
          aria-label="Thème"
          data={SCHEME_OPTIONS.map(({ value, label }) => ({ value, label }))}
          leftSection={<SchemeIcon value={colorScheme ?? "auto"} />}
          renderOption={({ option }) => (
            <Group gap={6} wrap="nowrap">
              <SchemeIcon value={option.value} />
              <span>{option.label}</span>
            </Group>
          )}
          // « System » suit le thème du système : c'est la valeur par défaut,
          // posée dans le thème (main.jsx) et mémorisée par Mantine ensuite.
          value={colorScheme ?? "auto"}
          onChange={(value) => value && setColorScheme(value as Scheme)}
          allowDeselect={false}
          w={200}
        />
      </Group>
    </Stack>
  );
}

const TABS: { value: string; label: string; icon: ComponentType<{ size?: number }> }[] = [
  { value: "general", label: "Général", icon: IconAdjustments },
  { value: "companies", label: "Sociétés", icon: IconBuilding },
  { value: "users", label: "Utilisateurs", icon: IconUsers },
  { value: "mail", label: "Messagerie", icon: IconMail },
  { value: "backup", label: "Sauvegarde", icon: IconDatabaseExport },
];

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
  companies: Company[];
  currentUser: PublicUser | null;
  onUserUpdated: (user: PublicUser) => void;
  onDataChanged: () => void | Promise<void>;
}

export default function SettingsModal({
  opened,
  onClose,
  companies,
  currentUser,
  onUserUpdated,
  onDataChanged,
}: SettingsModalProps) {
  const [activeTab, setActiveTab] = useState<string | null>("general");

  /**
   * L'onglet Messagerie n'a pas de bouton d'enregistrement : c'est « Fermer »
   * qui enregistre. L'onglet dépose ici sa fonction, et elle rend faux si le
   * serveur a refusé — la fenêtre reste alors ouverte, avec le message.
   */
  const enregistrerMessagerie = useRef<(() => Promise<boolean>) | null>(null);
  const [fermeture, setFermeture] = useState(false);

  const fermer = async () => {
    setFermeture(true);
    try {
      if ((await enregistrerMessagerie.current?.()) === false) return;
    } finally {
      setFermeture(false);
    }
    onClose();
  };

  /** Un appel à l'API, suivi du rechargement de ce que l'application affiche. */
  const withRefresh =
    <Args extends unknown[]>(fn: (...args: Args) => Promise<unknown>) =>
    async (...args: Args) => {
      await fn(...args);
      await onDataChanged();
    };

  const panel = (value: string, children: ReactNode) => (
    <Tabs.Panel
      value={value}
      pl="xl"
      style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}
    >
      <Stack gap="md" style={{ flex: 1, minHeight: 0 }}>
        <Title order={4}>{TABS.find((t) => t.value === value)?.label}</Title>
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
      // Échap et l'arrière-plan passent par là : ils enregistrent donc aussi.
      onClose={fermer}
      title="Réglages"
      size={800}
      padding={40}
      withCloseButton={false}
      styles={{
        ...MODAL_HEADER,
        content: {
          height: 725,
          maxHeight: "90vh",
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
        style={{ flex: 1, minHeight: 0 }}
      >
        <Tabs.List style={{ width: 170, flexShrink: 0 }}>
          {TABS.map(({ value, label, icon: Icon }) => (
            <Tabs.Tab
              key={value}
              value={value}
              leftSection={<Icon size={16} />}
              style={tabStyle(activeTab === value)}
            >
              {label}
            </Tabs.Tab>
          ))}
        </Tabs.List>

        {panel(
          "general",
          <GeneralTab user={currentUser} onUserUpdated={onUserUpdated} />,
        )}

        {panel(
          "companies",
          <LookupManager
            items={companies}
            onCreate={withRefresh(api.createCompany)}
            onUpdate={withRefresh(api.updateCompany)}
            onDelete={withRefresh(api.deleteCompany)}
            addTitle="Nouvelle société"
            maxRows={10}
            emptyIcon={IconBuilding}
            emptyText="Aucune société pour le moment"
            entityLabel="la société"
          />,
        )}

        {panel("users", <UsersTab currentUser={currentUser} />)}

        {panel("mail", <MailTab saveRef={enregistrerMessagerie} />)}

        {panel("backup", <BackupTab />)}
      </Tabs>

      <Group justify="flex-end" mt={40}>
        <Button variant="default" onClick={fermer} loading={fermeture}>
          Fermer
        </Button>
      </Group>
    </Modal>
  );
}
