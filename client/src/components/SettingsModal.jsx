import {
  Button,
  Group,
  Modal,
  Select,
  SegmentedControl,
  Stack,
  Tabs,
  Text,
  Title,
  useMantineColorScheme,
} from "@mantine/core";
import {
  IconBuilding,
  IconBuildingWarehouse,
  IconDeviceDesktop,
  IconMoon,
  IconPalette,
  IconSun,
  IconTag,
  IconUsers,
} from "@tabler/icons-react";
import { useCallback, useEffect, useState } from "react";
import { api } from "../api";
import LookupManager from "./LookupManager.jsx";
import UsersTab from "./UsersTab.jsx";

// Blanc sur fond sombre, quasi-noir sur fond clair : le contraste maximum dans
// les deux thèmes.
const STRONG_TEXT = "light-dark(var(--mantine-color-black), var(--mantine-color-white))";
const ACTIVE_TAB = "light-dark(var(--mantine-color-teal-7), var(--mantine-color-teal-4))";

const SCHEME_OPTIONS = [
  {
    value: "auto",
    label: (
      <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <IconDeviceDesktop size={16} /> System
      </span>
    ),
  },
  {
    value: "light",
    label: (
      <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <IconSun size={16} /> Clair
      </span>
    ),
  },
  {
    value: "dark",
    label: (
      <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <IconMoon size={16} /> Sombre
      </span>
    ),
  },
];

function AppearanceTab() {
  const { colorScheme, setColorScheme } = useMantineColorScheme();

  return <SegmentedControl value={colorScheme} onChange={setColorScheme} data={SCHEME_OPTIONS} fullWidth />;
}

const TABS = [
  { value: "appearance", label: "Apparence", icon: IconPalette },
  { value: "companies", label: "Société", icon: IconBuilding },
  { value: "buildings", label: "Bâtiment", icon: IconBuildingWarehouse },
  { value: "categories", label: "Catégorie", icon: IconTag },
  { value: "users", label: "Utilisateur", icon: IconUsers },
];

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
        addPlaceholder="Nom du bâtiment"
        emptyText="Aucun bâtiment pour cette société."
        entityLabel="le bâtiment"
      />
    </>
  );
}

export default function SettingsModal({
  opened,
  onClose,
  companies,
  categories,
  currentUser,
  onDataChanged,
}) {
  const [activeTab, setActiveTab] = useState("appearance");

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
      title={
        <Text fw={700} fz={26} style={{ color: STRONG_TEXT }}>
          Paramétrage
        </Text>
      }
      size={700}
      padding={40}
      withCloseButton={false}
      styles={{
        content: {
          height: 700,
          maxHeight: "90vh",
          display: "flex",
          flexDirection: "column",
          // Repère pour la barre de défilement déportée (voir LookupManager)
          position: "relative",
        },
        body: { flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" },
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
              style={
                activeTab === value
                  ? { color: ACTIVE_TAB, borderColor: ACTIVE_TAB, fontWeight: 600 }
                  : undefined
              }
            >
              {label}
            </Tabs.Tab>
          ))}
        </Tabs.List>

        {panel("appearance", <AppearanceTab />)}

        {panel(
          "companies",
          <LookupManager
            items={companies}
            onCreate={withRefresh(api.createCompany)}
            onUpdate={withRefresh(api.updateCompany)}
            onDelete={withRefresh(api.deleteCompany)}
            addPlaceholder="Nom de la société"
            emptyText="Aucune société pour le moment."
            entityLabel="la société"
          />,
        )}

        {panel("buildings", <BuildingsTab companies={companies} />)}

        {panel(
          "categories",
          <LookupManager
            items={categories}
            onCreate={withRefresh(api.createCategory)}
            onUpdate={withRefresh(api.updateCategory)}
            onDelete={withRefresh(api.deleteCategory)}
            addPlaceholder="Nom de la catégorie"
            emptyText="Aucune catégorie pour le moment."
            entityLabel="la catégorie"
          />,
        )}
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
