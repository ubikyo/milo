import { ActionIcon, Avatar, Group, Menu, Select, Text, Tooltip } from "@mantine/core";
import { IconLogout, IconPlus, IconSettings } from "@tabler/icons-react";
import Logo from "./Logo.jsx";

const STATUS_OPTIONS = [
  { value: "all", label: "Tous" },
  { value: "in_progress", label: "En cours" },
  { value: "done", label: "Terminé" },
];

export default function Header({
  companies,
  companyFilter,
  onCompanyFilterChange,
  buildings,
  buildingFilter,
  onBuildingFilterChange,
  categories,
  categoryFilter,
  onCategoryFilterChange,
  statusFilter,
  onStatusFilterChange,
  onAddProject,
  onOpenSettings,
  showFilters = true,
  user,
  onLogout,
}) {
  const companyOptions = [
    { value: "all", label: "Toutes les sociétés" },
    ...companies.map((c) => ({ value: String(c.id), label: c.name })),
  ];

  // Quand une société est choisie, on ne propose que ses bâtiments.
  const visibleBuildings =
    companyFilter === "all" ? buildings : buildings.filter((b) => String(b.company_id) === companyFilter);

  const buildingOptions = [
    { value: "all", label: "Tous les bâtiments" },
    ...visibleBuildings.map((b) => ({
      value: String(b.id),
      label: companyFilter === "all" ? `${b.name} — ${b.company_name}` : b.name,
    })),
  ];

  const categoryOptions = [
    { value: "all", label: "Toutes" },
    ...categories.map((c) => ({ value: String(c.id), label: c.name })),
  ];

  return (
    <Group
      justify="space-between"
      px="xl"
      py="md"
      style={{ borderBottom: "1px solid var(--mantine-color-default-border)" }}
    >
      <Logo variant={2} h={40} />

      <Group>
        {/* Décalage aligné sur la hauteur des libellés de Select */}
        {showFilters && (
          <>
            <Select
              label="Société"
              data={companyOptions}
              value={companyFilter}
              onChange={(value) => onCompanyFilterChange(value ?? "all")}
              allowDeselect={false}
              w={200}
            />
            <Select
              label="Bâtiment"
              data={buildingOptions}
              value={buildingFilter}
              onChange={(value) => onBuildingFilterChange(value ?? "all")}
              allowDeselect={false}
              w={200}
            />
            <Select
              label="Catégorie"
              data={categoryOptions}
              value={categoryFilter}
              onChange={(value) => onCategoryFilterChange(value ?? "all")}
              allowDeselect={false}
              w={180}
            />
            <Select
              label="Statut"
              data={STATUS_OPTIONS}
              value={statusFilter}
              onChange={(value) => onStatusFilterChange(value ?? "all")}
              allowDeselect={false}
              w={180}
            />
          </>
        )}
        <Tooltip label="Ajouter un projet">
          <ActionIcon
            variant="filled"
            size="lg"
            color="teal"
            mt={showFilters ? 24 : 0}
            aria-label="Ajouter un projet"
            onClick={onAddProject}
          >
            <IconPlus size={18} />
          </ActionIcon>
        </Tooltip>
        <Menu position="bottom-end" withinPortal>
          <Menu.Target>
            <Tooltip label={user?.name}>
              <ActionIcon variant="subtle" size="lg" mt={showFilters ? 24 : 0} aria-label="Compte">
                <Avatar size={28} radius="xl" color="teal">
                  {(user?.name || "?").slice(0, 1).toUpperCase()}
                </Avatar>
              </ActionIcon>
            </Tooltip>
          </Menu.Target>
          <Menu.Dropdown>
            <Menu.Label>
              <Text size="xs" fw={500}>
                {user?.name}
              </Text>
              <Text size="xs" c="dimmed">
                {user?.email}
              </Text>
            </Menu.Label>
            <Menu.Divider />
            <Menu.Item leftSection={<IconLogout size={16} />} onClick={onLogout}>
              Déconnexion
            </Menu.Item>
          </Menu.Dropdown>
        </Menu>
        <Tooltip label="Paramétrage">
          <ActionIcon
            variant="default"
            size="lg"
            mt={showFilters ? 24 : 0}
            aria-label="Paramétrage"
            onClick={onOpenSettings}
          >
            <IconSettings size={18} />
          </ActionIcon>
        </Tooltip>
      </Group>
    </Group>
  );
}
