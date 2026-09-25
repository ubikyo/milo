import {
  Button,
  Group,
  Modal,
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
  IconBuildingWarehouse,
  IconDeviceDesktop,
  IconMoon,
  IconSun,
  IconUsers,
} from "@tabler/icons-react";
import { useCallback, useEffect, useState } from "react";
import { api } from "../../api";
import { modalHeaderStyles } from "../../themes/modals";
import { DEFAULT_MODE, MODES } from "../../lib/modes";
import { tabStyle } from "../../themes/tabs";
import ErrorAlert from "../ui/ErrorAlert.jsx";
import LookupManager from "../ui/LookupManager.jsx";
import UsersTab from "./UsersTab.jsx";

const SCHEME_OPTIONS = [
  { value: "auto", label: "System", icon: IconDeviceDesktop },
  { value: "light", label: "Clair", icon: IconSun },
  { value: "dark", label: "Sombre", icon: IconMoon },
];

// Les options d'un Select ne portent que du texte : l'icône est retrouvée par
// la valeur, pour la liste déroulante comme pour le champ fermé.
const schemeIcon = (value) => SCHEME_OPTIONS.find((o) => o.value === value)?.icon;

// Largeur du libellé : les champs de l'onglet s'alignent sur la même colonne.
const LABEL_WIDTH = 120;

// Le libellé est posé à gauche du champ, et non au-dessus comme les libellés
// de Mantine : les réglages de l'onglet partagent le même alignement.
function GeneralTab({ user, onUserUpdated }) {
  const { colorScheme, setColorScheme } = useMantineColorScheme();
  const SchemeIcon = schemeIcon(colorScheme ?? "auto");

  // Le mode d'ouverture appartient au compte : il part au serveur dès le choix
  // fait. Le champ répond tout de suite et revient en arrière si le serveur
  // refuse.
  const [mode, setMode] = useState(user?.default_mode || DEFAULT_MODE);
  const [error, setError] = useState(null);

  const changeMode = async (value) => {
    if (!value || value === mode) return;
    const precedent = mode;
    setMode(value);
    setError(null);
    try {
      const enregistre = await api.updateMe({ default_mode: value });
      onUserUpdated?.(enregistre);
    } catch (e) {
      setMode(precedent);
      setError(e.message);
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
          data={MODES}
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
          leftSection={<SchemeIcon size={16} />}
          renderOption={({ option }) => {
            const Icon = schemeIcon(option.value);
            return (
              <Group gap={6} wrap="nowrap">
                <Icon size={16} />
                <span>{option.label}</span>
              </Group>
            );
          }}
          // « System » suit le thème du système : c'est la valeur par défaut,
          // posée dans le thème (main.jsx) et mémorisée par Mantine ensuite.
          value={colorScheme ?? "auto"}
          onChange={(value) => value && setColorScheme(value)}
          allowDeselect={false}
          w={200}
        />
      </Group>
    </Stack>
  );
}

const TABS = [
  { value: "general", label: "Général", icon: IconAdjustments },
  { value: "companies", label: "Sociétés", icon: IconBuilding },
  { value: "buildings", label: "Bâtiments", icon: IconBuildingWarehouse },
  { value: "users", label: "Utilisateurs", icon: IconUsers },
];

const MODAL_HEADER = modalHeaderStyles(40);

function BuildingsTab({ companies }) {
  const [companyId, setCompanyId] = useState(null);
  const [buildings, setBuildings] = useState([]);

  // La société sélectionnée peut disparaître (suppression depuis l'autre onglet).
  const selected = companies.some((c) => String(c.id) === companyId)
    ? companyId
    : companies[0]
      ? String(companies[0].id)
      : null;

  const reload = useCallback(async () => {
    if (!selected) return setBuildings([]);
    setBuildings(await api.getBuildings(selected));
  }, [selected]);

  useEffect(() => {
    reload();
  }, [reload]);

  if (companies.length === 0) {
    return (
      <Text size="sm" c="dimmed">
        Créez d'abord une société pour pouvoir y associer des bâtiments.
      </Text>
    );
  }

  return (
    <>
      <Select
        label="Société"
        data={companies.map((c) => ({ value: String(c.id), label: c.name }))}
        value={selected}
        onChange={(value) => setCompanyId(value)}
        allowDeselect={false}
      />
      <LookupManager
        items={buildings}
        onCreate={async (name) => {
          await api.createBuilding(Number(selected), name);
          await reload();
        }}
        onUpdate={async (id, name) => {
          await api.updateBuilding(id, name);
          await reload();
        }}
        onDelete={async (id) => {
          await api.deleteBuilding(id);
          await reload();
        }}
        addTitle="Nouveau bâtiment"
        maxRows={10}
        emptyIcon={IconBuildingWarehouse}
        emptyText="Aucun bâtiment pour cette société"
        entityLabel="le bâtiment"
      />
    </>
  );
}

export default function SettingsModal({
  opened,
  onClose,
  companies,
  currentUser,
  onUserUpdated,
  onDataChanged,
}) {
  const [activeTab, setActiveTab] = useState("general");

  const withRefresh =
    (fn) =>
    async (...args) => {
      await fn(...args);
      await onDataChanged();
    };

  const panel = (value, children) => (
    <Tabs.Panel
      value={value}
      pl="xl"
      style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}
    >
      <Stack gap="md" style={{ flex: 1, minHeight: 0 }}>
        <Title order={4}>{TABS.find((t) => t.value === value).label}</Title>
        {children}
      </Stack>
    </Tabs.Panel>
  );

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title="Réglages"
      size={700}
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

        {panel("buildings", <BuildingsTab companies={companies} />)}

        {panel("users", <UsersTab currentUser={currentUser} />)}
      </Tabs>

      <Group justify="flex-end" mt={40}>
        <Button variant="default" onClick={onClose}>
          Fermer
        </Button>
      </Group>
    </Modal>
  );
}
